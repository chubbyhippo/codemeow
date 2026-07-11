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

const LIST_MOTIONS = new Map([
  ['meow-next', 'list.focusDown'],
  ['meow-prev', 'list.focusUp'],
  ['meow-left', 'list.collapse'],
  ['meow-right', 'list.expand'],
]);

export function boundChars(): Set<string> {
  const chars = [...Rc.defaults().motion.keys(), ...Rc.cfg().motion.keys()];
  return new Set(
    chars.filter(
      (c) =>
        (Rc.cfg().motion.get(c) ?? Rc.defaults().motion.get(c))?.command !==
        'ignore',
    ),
  );
}

export async function dispatch(
  run: (commandId: string) => Promise<void> | void,
  c: string,
  noremap = false,
  depth = 0,
): Promise<void> {
  const b =
    (noremap ? undefined : Rc.cfg().motion.get(c)) ??
    Rc.defaults().motion.get(c);
  if (!b) return;
  if (b.command !== undefined) {
    const listCommand = LIST_MOTIONS.get(b.command);
    if (listCommand !== undefined) await run(listCommand);
    return;
  }
  if (b.action !== undefined) {
    await run(b.action);
    return;
  }
  if (b.keys === undefined) return;
  if (depth >= 8) return;
  for (const k of b.keys)
    await dispatch(run, k, noremap || !b.recursive, depth + 1);
}
