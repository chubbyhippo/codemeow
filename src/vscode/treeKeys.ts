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

/**
 * The tree-surface key universe: every printable US-layout char an rc `mmap`
 * line can bind, as one static keybinding contribution each. VS Code has no
 * runtime keybinding registration, so each keybinding is gated
 * on a `codemeow.tree.<name>` context key and the adapter turns exactly the
 * mmap-bound set on (extension.ts syncTreeKeys, re-run on rc reload). The
 * package.json keybindings block is generated from this table and pinned by
 * the TreeMeowSpec suite — the two cannot drift silently.
 *
 * No vscode import: the spec suite reads this table headlessly.
 */

interface TreeKey {
  /** The char an rc mmap line binds. */
  ch: string;
  /** The keybinding producing that char on a US layout. */
  key: string;
  /** Context-key suffix: `codemeow.tree.<ctx>` gates the binding. */
  ctx: string;
}

/**
 * The `when` shared by every tree keybinding. The first three terms mirror
 * VS Code's own arrow-key rules for lists (WorkbenchListFocusContextKey,
 * listService.ts — the odd `treestickyScrollFocused` casing is the
 * platform's): a focused workbench list/tree outside input boxes (the
 * Explorer's inline rename included). `!treeFindOpen` gives the find widget
 * priority — while it is open, typing into it always
 * wins — and notebooks are excluded because their cell list is not a tree
 * surface (cells keep native keys, like the attach policy's editor side).
 */
const TREE_WHEN =
  'listFocus && !inputFocus && !treestickyScrollFocused && !treeFindOpen && !notebookEditorFocused';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '0123456789';

/** Shifted digit row: char produced, base key, context-key name. */
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

/** Punctuation keys: char, key, name, then the shifted char and its name. */
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

/** All 94 printable US-layout chars (ASCII 33-126; SPC is the keypad key
 *  and unmappable in the rc). */
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

/** The contributes.keybindings entries package.json must carry, verbatim —
 *  pinned by the TreeMeowSpec suite. Each dispatches the pressed char to
 *  the codemeow.tree command (core/treeMeow resolves it via the mmap). */
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
