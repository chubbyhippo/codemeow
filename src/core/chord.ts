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

export interface Chord {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
}

const PLAIN_KEYS = new Map<string, string>([
  ['SPC', ' '],
  ['SPACE', ' '],
  ['TAB', '\t'],
  ['COMMA', ','],
  ['PERIOD', '.'],
  ['SLASH', '/'],
  ['SEMICOLON', ';'],
  ['QUOTE', "'"],
  ['OPEN_BRACKET', '['],
  ['CLOSE_BRACKET', ']'],
  ['BACK_SLASH', '\\'],
  ['MINUS', '-'],
  ['EQUALS', '='],
  ['BACK_QUOTE', '`'],
]);

const SHIFTED_KEYS = new Map<string, string>([
  ['COMMA', '<'],
  ['PERIOD', '>'],
  ['SLASH', '?'],
  ['SEMICOLON', ':'],
  ['QUOTE', '"'],
  ['OPEN_BRACKET', '{'],
  ['CLOSE_BRACKET', '}'],
  ['BACK_SLASH', '|'],
  ['MINUS', '_'],
  ['EQUALS', '+'],
  ['BACK_QUOTE', '~'],
  ['1', '!'],
  ['2', '@'],
  ['3', '#'],
  ['4', '$'],
  ['5', '%'],
  ['6', '^'],
  ['7', '&'],
  ['8', '*'],
  ['9', '('],
  ['0', ')'],
]);

const LOWER_LETTER_RE = /^[a-z]$/;
const UPPER_LETTER_RE = /^[A-Z]$/;

function keyNamed(token: string, shift: boolean): string | null {
  const name = token.toUpperCase();
  if (shift) {
    const shifted = SHIFTED_KEYS.get(name);
    if (shifted !== undefined) return shifted;
  }
  const plain = PLAIN_KEYS.get(name);
  if (plain !== undefined) return plain;
  return token.length === 1 ? token : null;
}

function parseHostSpelling(text: string): Chord | null {
  const tokens = text.split(/\s+/);
  let ctrl = false;
  let alt = false;
  let shift = false;
  for (const token of tokens.slice(0, -1)) {
    switch (token.toLowerCase()) {
      case 'control':
      case 'ctrl':
        ctrl = true;
        break;
      case 'alt':
      case 'meta':
        alt = true;
        break;
      case 'shift':
        shift = true;
        break;
      default:
        return null;
    }
  }
  const named = keyNamed(tokens[tokens.length - 1] ?? '', shift);
  if (named === null || (!ctrl && !alt)) return null;
  const shiftedLetter = shift && LOWER_LETTER_RE.test(named.toLowerCase());
  return { ctrl, alt, shift: shiftedLetter, key: named.toLowerCase() };
}

function parsePrefixSpelling(text: string): Chord | null {
  let rest = text;
  let ctrl = false;
  let alt = false;
  let shift = false;
  while (rest.length > 2 && rest.charAt(1) === '-') {
    switch (rest.charAt(0).toUpperCase()) {
      case 'C':
        ctrl = true;
        break;
      case 'M':
      case 'A':
        alt = true;
        break;
      case 'S':
        shift = true;
        break;
      default:
        return null;
    }
    rest = rest.slice(2);
  }
  const named = keyNamed(rest, shift);
  if (named === null || (!ctrl && !alt)) return null;
  if (UPPER_LETTER_RE.test(named)) {
    return { ctrl, alt, shift: true, key: named.toLowerCase() };
  }
  return { ctrl, alt, shift, key: named };
}

export const Chord = {
  parse(text: string): Chord | null {
    const rest = text.trim();
    if (rest === '') return null;
    return /\s/.test(rest)
      ? parseHostSpelling(rest)
      : parsePrefixSpelling(rest);
  },

  spelling(chord: Chord): string {
    const prefix =
      (chord.ctrl ? 'C-' : '') +
      (chord.alt ? 'M-' : '') +
      (chord.shift ? 'S-' : '');
    return prefix + chord.key;
  },

  keyOf(text: string): string | null {
    const chord = Chord.parse(text);
    return chord === null ? null : Chord.spelling(chord);
  },
};
