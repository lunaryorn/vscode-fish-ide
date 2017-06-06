// Copyright (C) 2017 Sebastian Wiesner <swiesner@lunaryorn.com>
//
// This file is part of vscode-hlint.
//
// vscode-hlint is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// vscode-hlint is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with vscode-hlint.  If not, see <http://www.gnu.org/licenses/>.

import { execFile } from "child_process";
import { Observable, Observer } from "rxjs";

import * as vscode from "vscode";
import {
    Diagnostic,
    Disposable,
    DocumentFormattingEditProvider,
    DocumentRangeFormattingEditProvider,
    ExtensionContext,
    Range,
    TextDocument,
    TextEdit,
} from "vscode";

/**
 * Whether a given document is saved to disk and in Fish language.
 *
 * @param document The document to check
 * @return Whether the document is a Fish document saved to disk
 */
const isSavedFishDocument = (document: TextDocument): boolean =>
    !document.isDirty && 0 < vscode.languages.match({
        language: "fish",
        scheme: "file",
    }, document);

/**
 * A system error, i.e. an error that results from a syscall.
 */
interface ISystemError extends Error {
    readonly errno: string;
}

/**
 * Whether an error is a system error.
 *
 * @param error The error to check
 */
const isSystemError = (error: Error): error is ISystemError =>
    (error as ISystemError).errno !== undefined &&
    (typeof (error as ISystemError).errno) === "string";

/**
 * A process error.
 *
 * A process error occurs when the process exited with a non-zero exit code.
 */
interface IProcessError extends Error {
    /**
     * The exit code of the process.
     */
    readonly code: number;
}

/**
 * Whether an error is a process error.
 */
const isProcessError = (error: Error): error is IProcessError =>
    !isSystemError(error) &&
    (error as IProcessError).code !== undefined &&
    (error as IProcessError).code > 0;

/**
 * The result of a process.
 */
interface IProcessResult {
    /**
     * The integral exit code.
     */
    readonly exitCode: number;
    /**
     * The standard output.
     */
    readonly stdout: string;
    /**
     * The standard error.
     */
    readonly stderr: string;
}

/**
 * Run a command in the current workspace.
 *
 * @param command The command array
 * @param stdin An optional string to feed to standard input
 * @return The result of the process as observable
 */
const runInWorkspace =
    (command: string[], stdin?: string): Observable<IProcessResult> =>
        Observable.create((observer: Observer<IProcessResult>): void => {
            const cwd = vscode.workspace.rootPath || process.cwd();
            const child = execFile(command[0], command.slice(1), { cwd },
                (error, stdout, stderr) => {
                    if (error && !isProcessError(error)) {
                        // Throw system errors, but do not fail if the command
                        // fails with a non-zero exit code.
                        console.error("Command error", command, error);
                        observer.error(error);
                    } else {
                        const exitCode = error ? error.code : 0;
                        observer.next({ stdout, stderr, exitCode });
                        observer.complete();
                    }
                });
            if (stdin) {
                child.stdin.end(stdin);
            }
        });

/**
 * An event that can be subscribed to.
 */
type Event<T> = (handler: (document: T) => void) => Disposable;

/**
 * Observe a vscode event.
 *
 * @param event The event to observe
 * @return An observable which pushes every event
 */
const observeEvent = <T>(event: Event<T>): Observable<T> =>
    Observable.fromEventPattern(
        (handler) => event((d) => handler(d)),
        (_: any, subscription: Disposable) => subscription.dispose(),
        (d) => d as T,
    );

/**
 * Lint a document with fish -n.
 *
 * @param document The document to check
 * @return The resulting diagnostics
 */
const lintDocument = (document: TextDocument): Observable<Diagnostic[]> =>
    runInWorkspace(["fish", "-n", document.fileName])
        .map((result) => {
            const diagnostics: Diagnostic[] = [];
            const errorPattern = /^(.+) \(line (\d+)\): (.+)$/mg;
            let match = errorPattern.exec(result.stderr);
            while (match !== null) {
                // const fileName = match[1];
                const lineNumber = Number.parseInt(match[2]);
                const message = match[3];
                // TODO: Filter by filename
                const range = document.validateRange(new Range(
                    lineNumber - 1, 0, lineNumber - 1, Number.MAX_VALUE));
                const diagnostic = new Diagnostic(range, message);
                diagnostic.source = "fish";
                diagnostics.push(diagnostic);
                match = errorPattern.exec(result.stdout);
            }
            return diagnostics;
        });

/**
 * Start linting Fish documents.
 *
 * @param context The extension context
 */
const startLinting = (context: ExtensionContext): void => {
    const diagnostics = vscode.languages.createDiagnosticCollection("fish");
    context.subscriptions.push(diagnostics);

    const linting = Observable.from(vscode.workspace.textDocuments)
        .merge(observeEvent(vscode.workspace.onDidOpenTextDocument))
        .merge(observeEvent(vscode.workspace.onDidSaveTextDocument))
        .filter((document) => isSavedFishDocument(document))
        .groupBy((document) => document.uri)
        // Do not lint excessively
        .map((events) => events.debounceTime(200))
        .mergeAll()
        .map((document) =>
            lintDocument(document)
                .catch((error) => {
                    vscode.window.showErrorMessage(error.toString());
                    diagnostics.delete(document.uri);
                    return Observable.empty<Diagnostic[]>();
                })
                .map((results) => ({ document, results })))
        .mergeAll()
        .subscribe(({ document, results }) =>
            diagnostics.set(document.uri, results));
    context.subscriptions.push({ dispose: linting.unsubscribe });

    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument((document) =>
            diagnostics.delete(document.uri)));
};

/**
 * Get text edits to format a range in a document.
 *
 * @param document The document whose text to format
 * @param range The range within the document to format
 * @return An observable with the list of edits
 */
const getFormatRangeEdits =
    (document: TextDocument, range?: Range): Observable<TextEdit[]> => {
        const actualRange = document.validateRange(
            range || new Range(0, 0, Number.MAX_VALUE, Number.MAX_VALUE));
        return runInWorkspace(["fish_indent"], document.getText(actualRange))
            .catch((error): Observable<IProcessResult> => {
                vscode.window.showErrorMessage(
                    `Failed to run fish_indent: ${error}`);
                // Re-throw the error to make the promise fail
                throw error;
            })
            .filter((result) => result.exitCode === 0)
            .map((result) => [TextEdit.replace(actualRange, result.stdout)]);
    };

/**
 * A type for all formatting providers.
 */
type FormattingProviders =
    DocumentFormattingEditProvider &
    DocumentRangeFormattingEditProvider;

/**
 * Formatting providers for fish documents.
 */
const formattingProviders: FormattingProviders = {
    provideDocumentFormattingEdits: (document, _, token) =>
        getFormatRangeEdits(document)
            .filter(() => !token.isCancellationRequested)
            .defaultIfEmpty([])
            .toPromise(),
    provideDocumentRangeFormattingEdits: (document, range, _, token) =>
        getFormatRangeEdits(document, range)
            .filter(() => !token.isCancellationRequested)
            .defaultIfEmpty([])
            .toPromise(),
};

/**
 * Get the version of fish.
 *
 * @return An observable with the fish version string as single element
 * @throws An error if fish doesn't exist or if the version wasn't found
 */
const getFishVersion = (): Observable<string> =>
    runInWorkspace(["fish", "--version"])
        .map((result) => {
            const matches = result.stdout.match(/^fish, version (.+)$/m);
            if (matches && matches.length === 2) {
                return matches[1];
            } else {
                throw new Error(
                    `Failed to extract fish version from: ${result.stdout}`);
            }
        });

/**
 * Activate this extension.
 *
 * Install a formatter for fish files using fish_indent, and start linting fish
 * files for syntax errors.
 *
 * Initialization fails if Fish is not installed.
 *
 * @param context The context for this extension
 * @return A promise for the initialization
 */
export const activate = (context: ExtensionContext): Promise<any> =>
    getFishVersion().do((version) => {
        console.log("Found fish version", version);

        startLinting(context);

        context.subscriptions.push(
            vscode.languages.registerDocumentFormattingEditProvider(
                "fish", formattingProviders));
        context.subscriptions.push(
            vscode.languages.registerDocumentRangeFormattingEditProvider(
                "fish", formattingProviders));
    }).toPromise();
