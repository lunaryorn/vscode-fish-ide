# VSCode fish-ide

[![Build Status](https://travis-ci.org/lunaryorn/vscode-fish-ide.svg?branch=master)](https://travis-ci.org/lunaryorn/vscode-fish-ide)

IDE features for [Fish][] scripts in [Visual Studio Code][code]:

* Format fish code with `fish_indent`
* SOON: Check fish code for syntax errors

[fish]: http://fishshell.com
[code]: https://code.visualstudio.com

## Prerequisites

Install [fish][] and make sure that `fish` and `fish_indent` are in `$PATH`.  Otherwise this extension will fail to activate.

## Usage

Format a fish document or a selection in a fish document with the [built-in formatting feature][1] of Visual Studio Code.

[1]: https://code.visualstudio.com/docs/editor/codebasics#_formatting

## License

Copyright © 2017  Sebastian Wiesner <swiesner@lunaryorn.com>

vscode-fish-ide is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

vscode-fish-ide is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with vscode-fish-ide.  If not, see <http://www.gnu.org/licenses/>.
