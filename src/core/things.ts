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
    const char = text.charAt(i);
    if (char === close) depth++;
    else if (char === open) {
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
    const char = text.charAt(j);
    if (char === open && j !== start) depth++;
    else if (char === close) {
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
  const length = text.length;
  let i = 0;
  while (i < length) {
    const quote = text.charAt(i);
    if (quote === '"' || quote === "'" || quote === '`') {
      const triple =
        i + 2 < length &&
        text.charAt(i + 1) === quote &&
        text.charAt(i + 2) === quote;
      const quoteLen = triple ? 3 : 1;
      const open = i;
      let j = i + quoteLen;
      let closeEnd = -1;
      while (j < length) {
        const char = text.charAt(j);
        if (!triple && char === '\n') break;
        if (char === '\\') {
          j += 2;
          continue;
        }
        const closes = triple
          ? j + 2 < length &&
            text.charAt(j + 1) === quote &&
            text.charAt(j + 2) === quote
          : true;
        if (char === quote && closes) {
          closeEnd = j + quoteLen;
          break;
        }
        j++;
      }
      if (closeEnd < 0) {
        i = open + quoteLen;
        continue;
      }
      if (offset >= open && offset < closeEnd) {
        return inner
          ? { start: open + quoteLen, end: closeEnd - quoteLen }
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
  let inSymbol = offset;
  if (inSymbol >= text.length || !isSymbolChar(text.charAt(inSymbol))) {
    if (inSymbol > 0 && isSymbolChar(text.charAt(inSymbol - 1))) inSymbol--;
    else return null;
  }
  let start = inSymbol;
  let end = inSymbol;
  while (start > 0 && isSymbolChar(text.charAt(start - 1))) start--;
  while (end < text.length && isSymbolChar(text.charAt(end))) end++;
  return { start, end };
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
  const blank = (line: number) => isBlankLine(text, line);
  const caretLine = lineOfOffset(text, clamp(offset, 0, text.length));
  if (blank(caretLine)) return null;
  let first = caretLine;
  let last = caretLine;
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
  const caretLine = lineOfOffset(text, clamp(offset, 0, text.length));
  const end = lineEnd(text, caretLine);
  return inner
    ? { start: lineStart(text, caretLine), end }
    : {
        start: lineStart(text, caretLine),
        end: lineStart(text, caretLine + 1),
      };
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
  let braces = pair(text, offset, '{', '}', false);
  if (!braces) return null;
  for (;;) {
    const outer = pair(text, braces.start, '{', '}', false);
    if (!outer) break;
    braces = outer;
  }
  return braces;
}

function sentence(text: string, offset: number, inner: boolean): Bounds | null {
  if (text.length === 0) return null;
  let start = clamp(offset, 0, text.length - 1);
  while (start > 0) {
    const char = text.charAt(start - 1);
    if (
      SENTENCE_ENDERS.includes(char) ||
      (char === '\n' && start > 1 && text.charAt(start - 2) === '\n')
    )
      break;
    start--;
  }
  while (start < text.length && /\s/.test(text.charAt(start))) start++;
  let end = clamp(offset, 0, text.length);
  while (
    end < text.length &&
    !SENTENCE_ENDERS.includes(text.charAt(end)) &&
    !(
      text.charAt(end) === '\n' &&
      end + 1 < text.length &&
      text.charAt(end + 1) === '\n'
    )
  )
    end++;
  if (end < text.length && SENTENCE_ENDERS.includes(text.charAt(end))) end++;
  if (end <= start) return null;
  if (inner) return { start, end };
  let withTrailingSpace = end;
  while (
    withTrailingSpace < text.length &&
    text.charAt(withTrailingSpace) === ' '
  )
    withTrailingSpace++;
  return { start, end: withTrailingSpace };
}
