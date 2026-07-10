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

// Plain-text scanning shared by the command modules and the expand hints.

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ------------------------------------------------------------------- lines

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

/** Offset of the line's newline (or end of text) — eol is not included. */
export function lineEnd(text: string, line: number): number {
  const s = lineStart(text, line);
  const nl = text.indexOf('\n', s);
  return nl < 0 ? text.length : nl;
}

/** Empty or whitespace-only line — THE paragraph/join boundary, shared so
 *  structures (join) and things (paragraph) cannot disagree on blankness. */
export function isBlankLine(text: string, line: number): boolean {
  return text.slice(lineStart(text, line), lineEnd(text, line)).trim() === '';
}

// ------------------------------------------------------------- char classes

export function isWordChar(c: string): boolean {
  return /[\p{L}\p{N}]/u.test(c);
}

export function isSymbolChar(c: string): boolean {
  return isWordChar(c) || c === '_' || c === '$';
}

/** The char class a word or symbol motion scans by. */
export function charPred(symbol: boolean): (c: string) => boolean {
  return symbol ? isSymbolChar : isWordChar;
}

// ------------------------------------------------------------- char scans

export function indexOfChar(text: string, c: string, from: number): number {
  for (let i = Math.max(from, 0); i < text.length; i++)
    if (text[i] === c) return i;
  return -1;
}

export function lastIndexOfChar(text: string, c: string, from: number): number {
  for (let i = Math.min(from, text.length - 1); i >= 0; i--)
    if (text[i] === c) return i;
  return -1;
}

/**
 * Selection target after the nth occurrence of [ch] from [caret] — the scan
 * behind meow-find (selects THROUGH the char) and meow-till (stops short of
 * it), shared by the find/till commands and their digit expand. -1 when there
 * is no nth occurrence.
 */
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

// ---------------------------------------------------------- words / symbols

/** Word/symbol scanning shared by commands and hints. */
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

  /** meow--fix-thing-selection-mark (meow 1.5.0): the mark of a fresh
   *  next/back-thing selection snaps to the selected thing's own bounds,
   *  so the separators between the old point and the thing stay outside —
   *  e e e steps bare word by bare word (batch-probed). Forward
   *  (mark < pos): max(mark, start of the thing ending at pos); backward:
   *  min(mark, end of the thing starting at pos). Expand chains ignore
   *  this (the anchor comes from the region ends). */
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
        // between words: take the next word, like forward-thing
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
