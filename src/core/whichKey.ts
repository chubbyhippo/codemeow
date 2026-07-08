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

import { Rc } from './rc';

/**
 * which-key: after a short delay on a pending prefix (keypad SPC sequences,
 * or the , . [ ] thing table), the adapter lists the available continuations
 * in a QuickPick menu whose input dispatches typed keys through the engine
 * (they never filter — chains must type through the menu unchanged).
 * Descriptions come from `desc` / `let g:WhichKeyDesc_*` entries; delay and
 * on/off from `set timeoutlen` / `set nowhich-key`. The row computation is
 * pure and lives here.
 */

export const THINGS: Array<[string, string]> = [
  ['r', 'round ( )'],
  ['s', 'square [ ]'],
  ['c', 'curly { }'],
  ['g', 'string'],
  ['e', 'symbol'],
  ['w', 'window'],
  ['b', 'buffer'],
  ['p', 'paragraph'],
  ['l', 'line'],
  ['v', 'visual line'],
  ['d', 'defun'],
  ['.', 'sentence'],
];

/** One row per next key continuing [buffer]: terminal label or group desc. */
export function keypadRows(buffer: string): Array<[string, string]> {
  const descs = Rc.keypadDescs();
  const rows = new Map<string, string>();
  for (const [seq, b] of Rc.keypad()) {
    if (!seq.startsWith(buffer) || seq === buffer) continue;
    const child = buffer + seq[buffer.length];
    const label =
      seq === child
        ? (descs.get(seq) ?? b.action ?? b.command ?? b.keys ?? '')
        : (descs.get(child) ?? '+more');
    if (!rows.has(child) || descs.has(child)) rows.set(child, label);
  }
  return [...rows.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([child, label]) => {
      const key = child[child.length - 1];
      return [key === ' ' ? 'SPC' : key, label];
    });
}
