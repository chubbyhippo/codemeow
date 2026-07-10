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

import type { Config } from './rc';

/**
 * Snapshot of the last-LOADED ~/.codemeowrc, as a stable serialization of the
 * PARSED config — so comment and formatting edits never demand a reload. The
 * adapter's editor-title Reload button gates on this (ideameow's RcFileState;
 * IdeaVim's VimRcFileState hashes the parsed Script for the same reason).
 * Type-only import keeps this cycle-free: rc.ts calls in, nothing calls back.
 */

let state: string | null = null;

function serialize(c: Config): string {
  const byKey = ([a]: [string, unknown], [b]: [string, unknown]) =>
    a < b ? -1 : a > b ? 1 : 0;
  const maps = [c.normal, c.motion, c.keypad, c.keypadDesc].map((m) =>
    [...m.entries()].sort(byKey),
  );
  const repeat = [...c.repeat.entries()]
    .sort(byKey)
    .map(([g, members]) => [g, [...members.entries()].sort(byKey)]);
  return JSON.stringify([maps, repeat, c.whichKey, c.whichKeyDelayMs]);
}

export const RcState = {
  /** Called by Rc.setUserLines with whatever it just parsed. */
  saveParsed(c: Config): void {
    state = serialize(c);
  },

  loaded(): boolean {
    return state !== null;
  },

  /** Does this PARSED config match the user layer the engine is running? */
  equalTo(c: Config): boolean {
    return state !== null && serialize(c) === state;
  },

  resetForTest(): void {
    state = null;
  },
};
