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

interface ChordKey {
  spelling: string;
  key: string;
  ctx: string;
}

const CHORD_WHEN = 'editorTextFocus && codemeow.normal';

export const CHORD_KEYS: ChordKey[] = [
  { spelling: 'C-f', key: 'ctrl+f', ctx: 'ctrlF' },
  { spelling: 'C-b', key: 'ctrl+b', ctx: 'ctrlB' },
  { spelling: 'C-n', key: 'ctrl+n', ctx: 'ctrlN' },
  { spelling: 'C-p', key: 'ctrl+p', ctx: 'ctrlP' },
  { spelling: 'C-a', key: 'ctrl+a', ctx: 'ctrlA' },
  { spelling: 'C-e', key: 'ctrl+e', ctx: 'ctrlE' },
  { spelling: 'C-l', key: 'ctrl+l', ctx: 'ctrlL' },
  { spelling: 'M-f', key: 'alt+f', ctx: 'altF' },
  { spelling: 'M-b', key: 'alt+b', ctx: 'altB' },
  { spelling: 'M-a', key: 'alt+a', ctx: 'altA' },
  { spelling: 'M-e', key: 'alt+e', ctx: 'altE' },
  { spelling: 'M-<', key: 'alt+shift+,', ctx: 'altLess' },
  { spelling: 'M->', key: 'alt+shift+.', ctx: 'altGreater' },
  { spelling: 'M-{', key: 'alt+shift+[', ctx: 'altBraceLeft' },
  { spelling: 'M-}', key: 'alt+shift+]', ctx: 'altBraceRight' },
  { spelling: 'M-u', key: 'alt+u', ctx: 'altU' },
  { spelling: 'M-l', key: 'alt+l', ctx: 'altL' },
  { spelling: 'M-c', key: 'alt+c', ctx: 'altC' },
  { spelling: 'M-d', key: 'alt+d', ctx: 'altD' },
  { spelling: 'C-/', key: 'ctrl+/', ctx: 'ctrlSlash' },
  { spelling: 'C-_', key: 'ctrl+shift+-', ctx: 'ctrlUnderscore' },
  { spelling: 'C-d', key: 'ctrl+d', ctx: 'ctrlD' },
  { spelling: 'C-k', key: 'ctrl+k', ctx: 'ctrlK' },
  { spelling: 'C-w', key: 'ctrl+w', ctx: 'ctrlW' },
  { spelling: 'M-w', key: 'alt+w', ctx: 'altW' },
  { spelling: 'C-y', key: 'ctrl+y', ctx: 'ctrlY' },
  { spelling: 'C-g', key: 'ctrl+g', ctx: 'ctrlG' },
  { spelling: 'M-m', key: 'alt+m', ctx: 'altM' },
  { spelling: 'C-o', key: 'ctrl+o', ctx: 'ctrlO' },
  { spelling: 'M-\\', key: 'alt+\\', ctx: 'altBackslash' },
  { spelling: 'M-SPC', key: 'alt+space', ctx: 'altSpace' },
  { spelling: 'M-^', key: 'alt+shift+6', ctx: 'altCaret' },
  { spelling: 'C-s', key: 'ctrl+s', ctx: 'ctrlS' },
  { spelling: 'C-r', key: 'ctrl+r', ctx: 'ctrlR' },
  { spelling: 'C-;', key: 'ctrl+;', ctx: 'ctrlSemicolon' },
  { spelling: 'M-;', key: 'alt+;', ctx: 'altSemicolon' },
];

export function chordKeybindings(): Array<{
  key: string;
  command: string;
  args: string;
  when: string;
}> {
  return CHORD_KEYS.map(({ spelling, key, ctx }) => ({
    key,
    command: 'codemeow.chord',
    args: spelling,
    when: `${CHORD_WHEN} && codemeow.chord.${ctx}`,
  }));
}
