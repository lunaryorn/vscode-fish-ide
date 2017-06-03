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
    CancellationToken,
    ExtensionContext,
    FormattingOptions,
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
 * Provide edits to format a fish document.
 *
 * @param document The document to format
 * @param _options Formatting options, currently unused
 * @param token A token to cancel the operation
 * @return A sequence of edits to format the current document
 */
const provideDocumentFormattingEdits =
    (
        document: TextDocument,
        _options: FormattingOptions,
        token: CancellationToken,
    ): Promise<TextEdit[]> =>
        runInWorkspace(["fish_indent"], document.getText())
            .catch((error) => {
                vscode.window.showErrorMessage(
                    `Failed to run fish_indent: ${error}`);
                return Observable.empty<IProcessResult>();
            })
            .filter((result) => result.exitCode === 0 &&
                (!token.isCancellationRequested))
            .map((result) => {
                const range = document.validateRange(new Range(
                    0, 0, Number.MAX_VALUE, Number.MAX_VALUE));
                return [TextEdit.replace(range, result.stdout)];
            })
            .defaultIfEmpty([])
            .toPromise();

/**
 * Activate this extension.
 *
 * Installs a formatter for fish files using fish_indent.
 *
 * @param _context The context for this extension
 */
export function activate(context: ExtensionContext) {
    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider(
            "fish", { provideDocumentFormattingEdits }));
    return;
}
