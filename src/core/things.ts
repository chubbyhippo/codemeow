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

import { Ctx } from './port';
import {
  clamp,
  isBlankLine,
  isSymbolChar,
  lineCount,
  lineEnd,
  lineOfOffset,
  lineStart,
  SENTENCE_ENDERS,
} from './text';

interface Bounds {
  start: number;
  end: number;
}

export const Things = {
  inner(ctx: Ctx, ch: string, offset: number): Promise<Bounds | null> {
    return compute(ctx, ch, offset, true);
  },
  bounds(ctx: Ctx, ch: string, offset: number): Promise<Bounds | null> {
    return compute(ctx, ch, offset, false);
  },
};

async function compute(
  ctx: Ctx,
  ch: string,
  offset: number,
  inner: boolean,
): Promise<Bounds | null> {
  const text = ctx.port.getText();
  switch (ch) {
    case 'r':
      return pair(text, offset, '(', ')', inner);
    case 's':
      return pair(text, offset, '[', ']', inner);
    case 'c':
      return pair(text, offset, '{', '}', inner);
    case 'g':
      return stringThing(text, offset, inner);
    case 'e':
      return symbol(text, offset);
    case 'w':
      return window(ctx, text);
    case 'b':
      return { start: 0, end: text.length };
    case 'p':
      return paragraph(text, offset, inner);
    case 'l':
      return line(text, offset, inner);
    case 'v':
      return visualLine(text, offset);
    case 'd':
      return defun(ctx, text, offset);
    case '.':
      return sentence(text, offset, inner);
    default:
      return null;
  }
}

function pair(
  text: string,
  offset: number,
  open: string,
  close: string,
  inner: boolean,
): Bounds | null {
  let depth = 0;
  let start = -1;
  for (let i = offset - 1; i >= 0; i--) {
    const c = text[i];
    if (c === close) depth++;
    else if (c === open) {
      if (depth === 0) {
        start = i;
        break;
      }
      depth--;
    }
  }
  if (start < 0) return null;
  depth = 0;
  let end = -1;
  for (let j = offset; j < text.length; j++) {
    const c = text[j];
    if (c === open && j !== start) depth++;
    else if (c === close) {
      if (depth === 0) {
        end = j;
        break;
      }
      depth--;
    }
  }
  if (end < 0) return null;
  return inner ? { start: start + 1, end } : { start, end: end + 1 };
}

function stringThing(
  text: string,
  offset: number,
  inner: boolean,
): Bounds | null {
  const n = text.length;
  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') {
      const triple = i + 2 < n && text[i + 1] === c && text[i + 2] === c;
      const len = triple ? 3 : 1;
      const open = i;
      let j = i + len;
      let closeEnd = -1;
      while (j < n) {
        const d = text[j];
        if (!triple && d === '\n') break;
        if (d === '\\') {
          j += 2;
          continue;
        }
        const closes = triple
          ? j + 2 < n && text[j + 1] === c && text[j + 2] === c
          : true;
        if (d === c && closes) {
          closeEnd = j + len;
          break;
        }
        j++;
      }
      if (closeEnd < 0) {
        i = open + len;
        continue;
      }
      if (offset >= open && offset < closeEnd) {
        return inner
          ? { start: open + len, end: closeEnd - len }
          : { start: open, end: closeEnd };
      }
      i = closeEnd;
      continue;
    }
    i++;
  }
  return null;
}

function symbol(text: string, offset: number): Bounds | null {
  let o = offset;
  if (o >= text.length || !isSymbolChar(text[o])) {
    if (o > 0 && isSymbolChar(text[o - 1])) o--;
    else return null;
  }
  let s = o;
  let e = o;
  while (s > 0 && isSymbolChar(text[s - 1])) s--;
  while (e < text.length && isSymbolChar(text[e])) e++;
  return { start: s, end: e };
}

function window(ctx: Ctx, text: string): Bounds {
  const vis = ctx.port.visibleLineRange();
  const last = lineCount(text) - 1;
  const first = clamp(vis ? vis.first : 0, 0, Math.max(last, 0));
  const stop = clamp(vis ? vis.last : last, 0, Math.max(last, 0));
  return { start: lineStart(text, first), end: lineEnd(text, stop) };
}

function paragraph(
  text: string,
  offset: number,
  inner: boolean,
): Bounds | null {
  if (text.length === 0) return null;
  const count = lineCount(text);
  const blank = (l: number) => isBlankLine(text, l);
  const ln = lineOfOffset(text, clamp(offset, 0, text.length));
  if (blank(ln)) return null;
  let first = ln;
  let last = ln;
  while (first > 0 && !blank(first - 1)) first--;
  while (last < count - 1 && !blank(last + 1)) last++;
  const start = lineStart(text, first);
  if (inner) return { start, end: lineEnd(text, last) };
  let stop = last;
  while (stop < count - 1 && blank(stop + 1)) stop++;
  const end =
    stop < count - 1 ? lineStart(text, stop + 1) : lineEnd(text, stop);
  return { start, end };
}

function line(text: string, offset: number, inner: boolean): Bounds {
  const ln = lineOfOffset(text, clamp(offset, 0, text.length));
  const end = lineEnd(text, ln);
  return inner
    ? { start: lineStart(text, ln), end }
    : { start: lineStart(text, ln), end: Math.min(end + 1, text.length) };
}

function visualLine(text: string, offset: number): Bounds {
  return line(text, offset, true);
}

async function defun(
  ctx: Ctx,
  text: string,
  offset: number,
): Promise<Bounds | null> {
  const fromHost = await ctx.port.symbolRangeAt(offset);
  if (fromHost) return fromHost;
  let b = pair(text, offset, '{', '}', false);
  if (!b) return null;
  for (;;) {
    const outer = pair(text, b.start, '{', '}', false);
    if (!outer) break;
    b = outer;
  }
  return b;
}

function sentence(text: string, offset: number, inner: boolean): Bounds | null {
  if (text.length === 0) return null;
  let s = clamp(offset, 0, text.length - 1);
  while (s > 0) {
    const c = text[s - 1];
    if (
      SENTENCE_ENDERS.includes(c) ||
      (c === '\n' && s > 1 && text[s - 2] === '\n')
    )
      break;
    s--;
  }
  while (s < text.length && /\s/.test(text[s])) s++;
  let e = clamp(offset, 0, text.length);
  while (
    e < text.length &&
    !SENTENCE_ENDERS.includes(text[e]) &&
    !(text[e] === '\n' && e + 1 < text.length && text[e + 1] === '\n')
  )
    e++;
  if (e < text.length && SENTENCE_ENDERS.includes(text[e])) e++;
  if (e <= s) return null;
  if (inner) return { start: s, end: e };
  let be = e;
  while (be < text.length && text[be] === ' ') be++;
  return { start: s, end: be };
}
