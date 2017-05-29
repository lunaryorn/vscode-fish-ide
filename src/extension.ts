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

import * as vscode from "vscode";
import { ExtensionContext } from "vscode";

/**
 * Activate this extension.
 *
 * Installs a formatter for fish files using fish_indent.
 *
 * @param _context The context for this extension
 */
export function activate(_context: ExtensionContext) {
    vscode.window.showInputBox("Hello fish!");
    return;
}
