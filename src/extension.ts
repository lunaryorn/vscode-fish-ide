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
    DocumentFormattingEditProvider,
    DocumentRangeFormattingEditProvider,
    ExtensionContext,
    Range,
    TextDocument,
    TextEdit,
} from "vscode";

/**
 * A process error.
 *
 * A process error occurs when the process exited with a non-zero exit code.
 */
interface IProcessError extends Error {
    /**
     * The process ID.
     */
    readonly pid: number;
    /**
     * The exit code of the process.
     */
    readonly status: number;
}

/**
 * Whether an error is a process error.
 */
const isProcessError = (error: Error): error is IProcessError =>
    (error as IProcessError).pid !== undefined &&
    (error as IProcessError).pid > 0;

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
                        // Check whether the error object has a "pid" property
                        // which implies that exe
                        observer.error(error);
                    } else {
                        const exitCode = error ? error.status : 0;
                        observer.next({ stdout, stderr, exitCode });
                        observer.complete();
                    }
                });
            if (stdin) {
                child.stdin.end(stdin);
            }
        });

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
 * Installs a formatter for fish files using fish_indent.
 *
 * @param _context The context for this extension
 */
export const activate = (context: ExtensionContext): Promise<any> =>
    getFishVersion().do((version) => {
        console.log("Found fish version", version);
        context.subscriptions.push(
            vscode.languages.registerDocumentFormattingEditProvider(
                "fish", formattingProviders));
        context.subscriptions.push(
            vscode.languages.registerDocumentRangeFormattingEditProvider(
                "fish", formattingProviders));
    }).toPromise();
