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
 * Run fish_indent in the current workspace.
 *
 * @param input The input for fish_indent
 * @return The output of fish_indent
 */
const indentFish = (input: string): Promise<string> => new Promise<string>(
    (resolve, reject) => {
        const cwd = vscode.workspace.rootPath || process.cwd();
        const fishIndent = execFile("fish_indent", { cwd },
            (error, stdout, stderr) => {
                if (error) {
                    // tslint:disable-next-line:max-line-length
                    reject(new Error(
                        `Failed to run fish_indent: ${error.message}, ${stderr}`));
                } else {
                    resolve(stdout);
                }
            });
        fishIndent.stdin.end(input);
    },
);

/**
 * Provide edits to format a fish document.
 *
 * @param document The document to format
 * @param _options Formatting options, currently unused
 * @param token A token to cancel the operation
 * @return A sequence of edits to format the current document
 */
const provideDocumentFormattingEdits =
    async (
        document: TextDocument,
        _options: FormattingOptions,
        token: CancellationToken,
    ) => {
        try {
            const formatted = await indentFish(document.getText());
            const rangeMax = document.validateRange(new Range(
                0, 0, Number.MAX_VALUE, Number.MAX_VALUE));
            const formattingEdit = TextEdit.replace(rangeMax, formatted);
            return token.isCancellationRequested ? [] : [formattingEdit];
        } catch (error) {
            vscode.window.showErrorMessage(
                `Failed to format document: ${error}`);
        }
    };

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
    vscode.window.showInputBox("Hello fish!");
    return;
}
