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
 * Which editors get meow, by document scheme. File and untitled buffers (and
 * the SCM commit box — like IdeaVim's `ideavimsupport=dialog`) get NORMAL;
 * documents VS Code renders read-only get MOTION; inputs that need their own
 * keys keep native editing. VS Code does not expose an editor's read-only
 * flag, so this scheme list is the honest approximation.
 */

const MOTION_SCHEMES = new Set(['git', 'output', 'codemeow']);

const SKIP_SCHEMES = new Set([
  'comment', // review-comment inputs: effectively one-line dialogs
  'interactive', 'vscode-interactive-input', // notebook/REPL inputs
]);

export function attachMode(scheme: string): MeowMode | null {
  if (SKIP_SCHEMES.has(scheme)) return null;
  if (MOTION_SCHEMES.has(scheme)) return MeowMode.MOTION;
  return MeowMode.NORMAL;
}

export function isWritableScheme(scheme: string): boolean {
  return !MOTION_SCHEMES.has(scheme);
}
