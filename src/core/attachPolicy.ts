// Copyright (C) 2026 Chubby Hippo
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation, either version 3 of the License, or (at your option)
// any later version.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along
// with this program. If not, see <https://www.gnu.org/licenses/>.
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { MeowMode } from './state';

/**
 * Which editors get meow, by document scheme. Everything that attaches gets
 * NORMAL — like Emacs, where read-only buffers keep the full layout and the
 * modify commands gate themselves (meow--allow-modify-p, see edits): the
 * read-only schemes (a diff's git side, the output panel, the cheatsheet)
 * navigate, select and search with every meow key. Inputs that need their
 * own keys keep native editing. VS Code does not expose an editor's
 * read-only flag, so the scheme list is the honest approximation feeding
 * EditorPort.isWritable. MOTION exists for mmap setups but nothing attaches
 * to it by default.
 */

const READONLY_SCHEMES = new Set(['git', 'output', 'codemeow']);

const SKIP_SCHEMES = new Set([
  'comment', // review-comment inputs: effectively one-line dialogs
  'interactive', 'vscode-interactive-input', // notebook/REPL inputs
]);

export function attachMode(scheme: string): MeowMode | null {
  if (SKIP_SCHEMES.has(scheme)) return null;
  return MeowMode.NORMAL;
}

export function isWritableScheme(scheme: string): boolean {
  return !READONLY_SCHEMES.has(scheme);
}
