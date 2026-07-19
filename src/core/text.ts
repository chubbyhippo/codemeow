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

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function lineOfOffset(text: string, offset: number): number {
  let ln = 0;
  const end = clamp(offset, 0, text.length);
  for (let i = 0; i < end; i++) if (text[i] === '\n') ln++;
  return ln;
}

export function lineCount(text: string): number {
  let n = 1;
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') n++;
  return n;
}

export function lineStart(text: string, line: number): number {
  if (line <= 0) return 0;
  let ln = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\n' && ++ln === line) return i + 1;
  }
  return text.length;
}

export function lineEnd(text: string, line: number): number {
  const s = lineStart(text, line);
  const nl = text.indexOf('\n', s);
  return nl < 0 ? text.length : nl;
}

export function isBlankLine(text: string, line: number): boolean {
  return text.slice(lineStart(text, line), lineEnd(text, line)).trim() === '';
}

function isWordChar(c: string): boolean {
  return /[\p{L}\p{N}]/u.test(c);
}

export function isSymbolChar(c: string): boolean {
  return isWordChar(c) || c === '_' || c === '$';
}

export function charPred(symbol: boolean): (c: string) => boolean {
  return symbol ? isSymbolChar : isWordChar;
}

function indexOfChar(text: string, c: string, from: number): number {
  for (let i = Math.max(from, 0); i < text.length; i++)
    if (text[i] === c) return i;
  return -1;
}

function lastIndexOfChar(text: string, c: string, from: number): number {
  for (let i = Math.min(from, text.length - 1); i >= 0; i--)
    if (text[i] === c) return i;
  return -1;
}

export function nthCharTarget(
  text: string,
  ch: string,
  caret: number,
  n: number,
  backward: boolean,
  till: boolean,
): number {
  let found = -1;
  let from = backward
    ? till
      ? caret - 2
      : caret - 1
    : till
      ? caret + 1
      : caret;
  for (let k = 0; k < n; k++) {
    found = backward
      ? lastIndexOfChar(text, ch, from)
      : indexOfChar(text, ch, from);
    if (found < 0) return -1;
    from = backward ? found - 1 : found + 1;
  }
  if (found < 0) return -1;
  if (backward) return till ? found + 1 : found;
  return till ? found : found + 1;
}

export const SENTENCE_ENDERS = '.!?';

export function nextSentenceEnd(text: string, from: number, n: number): number {
  let i = clamp(from, 0, text.length);
  for (let k = 0; k < n; k++) {
    while (i < text.length && !SENTENCE_ENDERS.includes(text[i])) i++;
    while (i < text.length && SENTENCE_ENDERS.includes(text[i])) i++;
    while (i < text.length && /\s/.test(text[i])) i++;
  }
  return i;
}

export function prevSentenceStart(
  text: string,
  from: number,
  n: number,
): number {
  const isGap = (c: string) => /\s/.test(c) || SENTENCE_ENDERS.includes(c);
  let i = clamp(from, 0, text.length);
  for (let k = 0; k < n; k++) {
    while (i > 0 && isGap(text[i - 1])) i--;
    while (i > 0 && !isGap(text[i - 1])) i--;
  }
  return i;
}

function lineStartAt(text: string, offset: number): number {
  let i = offset;
  while (i > 0 && text[i - 1] !== '\n') i--;
  return i;
}

function followingLineStart(text: string, bol: number): number {
  let i = bol;
  while (i < text.length && text[i] !== '\n') i++;
  return i < text.length ? i + 1 : i;
}

function blankLineAt(text: string, bol: number): boolean {
  let i = bol;
  while (i < text.length && text[i] !== '\n') {
    if (!/\s/.test(text[i])) return false;
    i++;
  }
  return true;
}

export function nextParagraphEnd(
  text: string,
  from: number,
  n: number,
): number {
  let pos = clamp(from, 0, text.length);
  for (let k = 0; k < n; k++) {
    let i = lineStartAt(text, pos);
    while (i < text.length && blankLineAt(text, i))
      i = followingLineStart(text, i);
    while (i < text.length && !blankLineAt(text, i))
      i = followingLineStart(text, i);
    pos = i;
  }
  return pos;
}

export function prevParagraphStart(
  text: string,
  from: number,
  n: number,
): number {
  let pos = clamp(from, 0, text.length);
  for (let k = 0; k < n; k++) {
    if (pos > 0) {
      const start = paragraphStartBefore(text, pos);
      pos = start < pos ? start : paragraphStartBefore(text, start - 1);
    }
  }
  return pos;
}

function paragraphStartBefore(text: string, offset: number): number {
  let i = lineStartAt(text, offset);
  while (i > 0 && blankLineAt(text, i)) i = lineStartAt(text, i - 1);
  while (i > 0 && !blankLineAt(text, lineStartAt(text, i - 1)))
    i = lineStartAt(text, i - 1);
  const prevLineEmpty =
    i > 0 && text[i - 1] === '\n' && (i === 1 || text[i - 2] === '\n');
  return prevLineEmpty ? i - 1 : i;
}

export const Words = {
  nextEnd(
    text: string,
    from: number,
    n: number,
    pred: (c: string) => boolean,
  ): number {
    let i = clamp(from, 0, text.length);
    for (let k = 0; k < n; k++) {
      while (i < text.length && !pred(text[i])) i++;
      while (i < text.length && pred(text[i])) i++;
    }
    return i;
  },

  prevStart(
    text: string,
    from: number,
    n: number,
    pred: (c: string) => boolean,
  ): number {
    let i = clamp(from, 0, text.length);
    for (let k = 0; k < n; k++) {
      while (i > 0 && !pred(text[i - 1])) i--;
      while (i > 0 && pred(text[i - 1])) i--;
    }
    return i;
  },

  fixSelectionMark(
    text: string,
    pos: number,
    mark: number,
    pred: (c: string) => boolean,
  ): number {
    const probe = clamp(
      mark > pos ? pos : pos - 1,
      0,
      Math.max(text.length - 1, 0),
    );
    const bounds = Words.boundsAt(text, probe, pred);
    if (!bounds) return mark;
    return mark > pos ? Math.min(mark, bounds[1]) : Math.max(mark, bounds[0]);
  },

  boundsAt(
    text: string,
    offset: number,
    pred: (c: string) => boolean,
  ): [number, number] | null {
    let o = offset;
    if (o >= text.length || !pred(text[o])) {
      if (o > 0 && pred(text[o - 1])) {
        o--;
      } else {
        let f = o;
        while (f < text.length && !pred(text[f])) f++;
        if (f >= text.length) return null;
        o = f;
      }
    }
    let s = o;
    let e = o;
    while (s > 0 && pred(text[s - 1])) s--;
    while (e < text.length && pred(text[e])) e++;
    return [s, e];
  },
};
