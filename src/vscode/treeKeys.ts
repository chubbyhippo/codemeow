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

interface TreeKey {
  ch: string;
  key: string;
  ctx: string;
}

const TREE_WHEN =
  'listFocus && !inputFocus && !treestickyScrollFocused && !treeFindOpen && !notebookEditorFocused';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';

const SHIFTED_DIGITS: Array<[string, string, string]> = [
  ['!', '1', 'exclam'],
  ['@', '2', 'at'],
  ['#', '3', 'hash'],
  ['$', '4', 'dollar'],
  ['%', '5', 'percent'],
  ['^', '6', 'caret'],
  ['&', '7', 'ampersand'],
  ['*', '8', 'asterisk'],
  ['(', '9', 'parenLeft'],
  [')', '0', 'parenRight'],
];

const PUNCTUATION: Array<[string, string, string, string, string]> = [
  ['`', '`', 'backquote', '~', 'tilde'],
  ['-', '-', 'minus', '_', 'underscore'],
  ['=', '=', 'equals', '+', 'plus'],
  ['[', '[', 'bracketLeft', '{', 'braceLeft'],
  [']', ']', 'bracketRight', '}', 'braceRight'],
  ['\\', '\\', 'backslash', '|', 'pipe'],
  [';', ';', 'semicolon', ':', 'colon'],
  ["'", "'", 'quote', '"', 'doubleQuote'],
  [',', ',', 'comma', '<', 'less'],
  ['.', '.', 'period', '>', 'greater'],
  ['/', '/', 'slash', '?', 'question'],
];

export const TREE_KEYS: TreeKey[] = [
  ...[...LETTERS].map((c) => ({ ch: c, key: c, ctx: c })),
  ...[...LETTERS].map((c) => ({
    ch: c.toUpperCase(),
    key: `shift+${c}`,
    ctx: c.toUpperCase(),
  })),
  ...[...DIGITS].map((c) => ({ ch: c, key: c, ctx: c })),
  ...SHIFTED_DIGITS.map(([ch, key, ctx]) => ({ ch, key: `shift+${key}`, ctx })),
  ...PUNCTUATION.flatMap(([ch, key, ctx, shifted, shiftedCtx]) => [
    { ch, key, ctx },
    { ch: shifted, key: `shift+${key}`, ctx: shiftedCtx },
  ]),
];

export function treeKeybindings(): Array<{
  key: string;
  command: string;
  args: string;
  when: string;
}> {
  return TREE_KEYS.map(({ ch, key, ctx }) => ({
    key,
    command: 'codemeow.tree',
    args: ch,
    when: `${TREE_WHEN} && codemeow.tree.${ctx}`,
  }));
}
