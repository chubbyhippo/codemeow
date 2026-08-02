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
import { Pending, SelType } from './state';
import {
  isBlankLine,
  lineCount,
  lineEnd,
  lineOfOffset,
  lineStart,
} from './text';
import { Things } from './things';
import { MeowCommand } from './command';
import * as Sel from './selections';

export const commands: Map<string, MeowCommand> = new Map([
  ['meow-inner-of-thing', (ctx: Ctx) => pendThing(ctx, Pending.INNER)],
  ['meow-bounds-of-thing', (ctx: Ctx) => pendThing(ctx, Pending.BOUNDS)],
  ['meow-beginning-of-thing', (ctx: Ctx) => pendThing(ctx, Pending.BEGIN)],
  ['meow-end-of-thing', (ctx: Ctx) => pendThing(ctx, Pending.END)],
  ['meow-block', (ctx: Ctx) => block(ctx)],
  ['meow-to-block', (ctx: Ctx) => toBlock(ctx)],
  ['meow-join', (ctx: Ctx) => join(ctx)],
]);

function pendThing(ctx: Ctx, p: Pending): void {
  ctx.state.pending = p;
  ctx.ui.scheduleWhichKey('things', '');
}

export async function thingSelect(
  ctx: Ctx,
  kind: Pending,
  thingChar: string,
): Promise<void> {
  const caret = Sel.primary(ctx).active;
  const bounds =
    kind === Pending.BOUNDS
      ? await Things.bounds(ctx, thingChar, caret)
      : await Things.inner(ctx, thingChar, caret);
  if (!bounds) {
    ctx.ui.hint(`No thing '${thingChar}' here`);
    return;
  }
  switch (kind) {
    case Pending.INNER:
      Sel.select(ctx, SelType.TRANSIENT, bounds.start, bounds.end, false);
      break;
    case Pending.BOUNDS:
      Sel.select(ctx, SelType.TRANSIENT, bounds.end, bounds.start, false);
      break;
    case Pending.BEGIN:
      Sel.select(ctx, SelType.TRANSIENT, caret, bounds.start, false);
      break;
    case Pending.END:
      Sel.select(ctx, SelType.TRANSIENT, caret, bounds.end, false);
      break;
    default:
      break;
  }
}

interface PairRange {
  open: number;
  close: number;
}

function enclosingPair(
  text: string,
  selStart: number,
  selEnd: number,
): PairRange | null {
  const opens = '([{';
  const closes = ')]}';
  const openOffsets: number[] = [];
  let best: PairRange | null = null;
  let i = 0;
  while (i < text.length) {
    const char = text.charAt(i);
    if (char === '"' || char === "'" || char === '`') {
      let j = i + 1;
      while (
        j < text.length &&
        text.charAt(j) !== char &&
        text.charAt(j) !== '\n'
      ) {
        if (text.charAt(j) === '\\') j++;
        j++;
      }
      if (j < text.length && text.charAt(j) === char) {
        i = j + 1;
        continue;
      }
    }
    if (opens.includes(char)) {
      openOffsets.push(i);
    } else if (closes.includes(char)) {
      const bracketKind = closes.indexOf(char);
      for (
        let open = openOffsets.pop();
        open !== undefined;
        open = openOffsets.pop()
      ) {
        if (opens.indexOf(text.charAt(open)) === bracketKind) {
          if (
            open < selStart &&
            i + 1 >= selEnd &&
            (best === null || i - open < best.close - best.open)
          ) {
            best = { open, close: i };
          }
          break;
        }
      }
    }
    i++;
  }
  return best;
}

function block(ctx: Ctx): void {
  const text = ctx.port.getText();
  const sel = Sel.primary(ctx);
  const active = ctx.state.selType === SelType.BLOCK && Sel.hasSelection(sel);
  const back = Sel.backwardP(ctx) !== ctx.state.takeCount(1) < 0;
  const selStart = active ? Sel.selStart(sel) : sel.active;
  const selEnd = active ? Sel.selEnd(sel) : sel.active;
  const pair = enclosingPair(text, selStart, selEnd);
  if (!pair) {
    ctx.ui.hint('No enclosing block');
    return;
  }
  if (back) Sel.select(ctx, SelType.BLOCK, pair.close + 1, pair.open, true);
  else Sel.select(ctx, SelType.BLOCK, pair.open, pair.close + 1, true);
}

function toBlock(ctx: Ctx): void {
  const text = ctx.port.getText();
  const back =
    (ctx.state.selType === SelType.BLOCK && Sel.backwardP(ctx)) ||
    ctx.state.takeCount(1) < 0;
  const caret = Sel.primary(ctx).active;
  const pair = enclosingPair(text, caret, caret);
  if (!pair) {
    ctx.ui.hint('No enclosing block');
    return;
  }
  Sel.select(
    ctx,
    SelType.BLOCK,
    caret,
    back ? pair.open : pair.close + 1,
    true,
  );
}

function firstNonBlankOffset(text: string, line: number): number {
  let offset = lineStart(text, line);
  const eol = lineEnd(text, line);
  while (offset < eol && /\s/.test(text.charAt(offset))) offset++;
  return offset;
}

function join(ctx: Ctx): void {
  const text = ctx.port.getText();
  if (text.length === 0) return;
  const count = ctx.state.takeCount(1);
  const blank = (line: number) => isBlankLine(text, line);
  const caretLine = lineOfOffset(text, Sel.primary(ctx).active);
  if (count >= 0) {
    let prevLine = caretLine - 1;
    while (prevLine >= 0 && blank(prevLine)) prevLine--;
    if (prevLine < 0) return;
    Sel.select(
      ctx,
      SelType.JOIN,
      lineEnd(text, prevLine),
      firstNonBlankOffset(text, caretLine),
      true,
    );
  } else {
    const lastLine = lineCount(text) - 1;
    let nextLine = caretLine + 1;
    while (nextLine <= lastLine && blank(nextLine)) nextLine++;
    if (nextLine > lastLine) return;
    Sel.select(
      ctx,
      SelType.JOIN,
      lineEnd(text, caretLine),
      firstNonBlankOffset(text, nextLine),
      true,
    );
  }
}
