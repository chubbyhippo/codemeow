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

import { Ctx, SelRange, selections } from './port';
import { Pending, SelType } from './state';
import {
  Words,
  charPred,
  clamp,
  escapeRegExp,
  isBlank,
  lineCount,
  lineEnd,
  lineOfOffset,
  lineStart,
  nextParagraphEnd,
  nextSentenceEnd,
  nthCharTarget,
  prevParagraphStart,
  prevSentenceStart,
} from './text';
import { MeowCommand } from './command';
import * as Sel from './selections';
import * as Grab from './grab';
import * as Search from './search';

export const commands: Map<string, MeowCommand> = new Map([
  ['meow-left', (ctx: Ctx) => moveChar(ctx, -ctx.state.takeCount(1))],
  ['meow-right', (ctx: Ctx) => moveChar(ctx, ctx.state.takeCount(1))],
  ['meow-next', (ctx: Ctx) => moveLine(ctx, ctx.state.takeCount(1))],
  ['meow-prev', (ctx: Ctx) => moveLine(ctx, -ctx.state.takeCount(1))],
  [
    'meow-left-expand',
    (ctx: Ctx) => moveExpand(ctx, -ctx.state.takeCount(1), 0),
  ],
  [
    'meow-right-expand',
    (ctx: Ctx) => moveExpand(ctx, ctx.state.takeCount(1), 0),
  ],
  [
    'meow-next-expand',
    (ctx: Ctx) => moveExpand(ctx, 0, ctx.state.takeCount(1)),
  ],
  [
    'meow-prev-expand',
    (ctx: Ctx) => moveExpand(ctx, 0, -ctx.state.takeCount(1)),
  ],
  [
    'meow-next-word',
    (ctx: Ctx) => wordMotion(ctx, false, ctx.state.takeCount(1)),
  ],
  [
    'meow-next-symbol',
    (ctx: Ctx) => wordMotion(ctx, true, ctx.state.takeCount(1)),
  ],
  [
    'meow-back-word',
    (ctx: Ctx) => wordMotion(ctx, false, -ctx.state.takeCount(1)),
  ],
  [
    'meow-back-symbol',
    (ctx: Ctx) => wordMotion(ctx, true, -ctx.state.takeCount(1)),
  ],
  ['meow-mark-word', (ctx: Ctx) => markWord(ctx, false)],
  ['meow-mark-symbol', (ctx: Ctx) => markWord(ctx, true)],
  ['meow-line', (ctx: Ctx) => line(ctx)],
  ['meow-goto-line', (ctx: Ctx) => gotoLine(ctx)],
  [
    'meow-find',
    (ctx: Ctx) => {
      ctx.state.pending = Pending.FIND;
    },
  ],
  [
    'meow-till',
    (ctx: Ctx) => {
      ctx.state.pending = Pending.TILL;
    },
  ],
  ['forward-char', (ctx: Ctx) => charOrExpand(ctx, ctx.state.takeCount(1))],
  ['backward-char', (ctx: Ctx) => charOrExpand(ctx, -ctx.state.takeCount(1))],
  [
    'next-line',
    (ctx: Ctx) => {
      lineOrExpand(ctx, ctx.state.takeCount(1));
      ctx.state.lastCommand = 'next-line';
    },
  ],
  [
    'previous-line',
    (ctx: Ctx) => {
      lineOrExpand(ctx, -ctx.state.takeCount(1));
      ctx.state.lastCommand = 'previous-line';
    },
  ],
  [
    'move-beginning-of-line',
    (ctx: Ctx) => moveToOrExpand(ctx, SelType.CHAR, lineStartTarget),
  ],
  [
    'move-end-of-line',
    (ctx: Ctx) => moveToOrExpand(ctx, SelType.CHAR, lineEndTarget),
  ],
  [
    'back-to-indentation',
    (ctx: Ctx) => moveToOrExpand(ctx, SelType.CHAR, indentationTarget),
  ],
  ['forward-word', (ctx: Ctx) => wordOrExpand(ctx, ctx.state.takeCount(1))],
  ['backward-word', (ctx: Ctx) => wordOrExpand(ctx, -ctx.state.takeCount(1))],
  [
    'forward-sentence',
    (ctx: Ctx) => sentenceOrExpand(ctx, ctx.state.takeCount(1)),
  ],
  [
    'backward-sentence',
    (ctx: Ctx) => sentenceOrExpand(ctx, -ctx.state.takeCount(1)),
  ],
  ['beginning-of-buffer', (ctx: Ctx) => bufferBoundary(ctx, true)],
  ['end-of-buffer', (ctx: Ctx) => bufferBoundary(ctx, false)],
  [
    'forward-paragraph',
    (ctx: Ctx) => paragraphOrExpand(ctx, ctx.state.takeCount(1)),
  ],
  [
    'backward-paragraph',
    (ctx: Ctx) => paragraphOrExpand(ctx, -ctx.state.takeCount(1)),
  ],
]);

type OffsetTarget = (text: string, offset: number) => number;

const lineStartTarget: OffsetTarget = (text, off) =>
  lineStart(text, lineOfOffset(text, off));

const lineEndTarget: OffsetTarget = (text, off) =>
  lineEnd(text, lineOfOffset(text, off));

const indentationTarget: OffsetTarget = (text, off) => {
  const line = lineOfOffset(text, off);
  const end = lineEnd(text, line);
  let at = lineStart(text, line);
  while (at < end && isBlank(text.charAt(at))) at++;
  return at;
};

const wordType = (symbol: boolean) => (symbol ? SelType.SYMBOL : SelType.WORD);

const VERTICAL = new Set([
  'meow-next',
  'meow-prev',
  'meow-next-expand',
  'meow-prev-expand',
  'next-line',
  'previous-line',
]);

const charSelActive = (ctx: Ctx) =>
  ctx.state.selType === SelType.CHAR && Sel.hasSelection(Sel.primary(ctx));

function movedChar(
  len: number,
  sel: SelRange,
  dx: number,
  extend: boolean,
): SelRange {
  const active = clamp(sel.active + dx, 0, len);
  return { anchor: extend ? sel.anchor : active, active };
}

function movedLine(
  text: string,
  sel: SelRange,
  dy: number,
  extend: boolean,
  goal: number | null,
): SelRange {
  const caretLine = lineOfOffset(text, sel.active);
  const target = caretLine + dy;
  let active: number;
  if (target < 0) active = 0;
  else if (target > lineCount(text) - 1) active = text.length;
  else {
    const column = goal ?? sel.active - lineStart(text, caretLine);
    const bol = lineStart(text, target);
    active = bol + Math.min(column, lineEnd(text, target) - bol);
  }
  return { anchor: extend ? sel.anchor : active, active };
}

function goalColumn(ctx: Ctx): number {
  const state = ctx.state;
  if (
    state.goalColumn === null ||
    state.lastCommand === null ||
    !VERTICAL.has(state.lastCommand)
  ) {
    const text = ctx.port.getText();
    const caret = Sel.primary(ctx).active;
    state.goalColumn = caret - lineStart(text, lineOfOffset(text, caret));
  }
  return state.goalColumn;
}

function moveChar(ctx: Ctx, dx: number): void {
  const extend = charSelActive(ctx);
  if (!extend && Sel.hasSelection(Sel.primary(ctx))) Sel.cancel(ctx);
  const len = ctx.port.getText().length;
  ctx.port.setSelections(
    ctx.port.getSelections().map((s) => movedChar(len, s, dx, extend)),
  );
}

function moveLine(ctx: Ctx, dy: number): void {
  const extend = charSelActive(ctx);
  if (!extend) Sel.cancel(ctx);
  const goal = goalColumn(ctx);
  const text = ctx.port.getText();
  ctx.port.setSelections(
    ctx.port
      .getSelections()
      .map((s, i) => movedLine(text, s, dy, extend, i === 0 ? goal : null)),
  );
}

function recordExpansion(
  ctx: Ctx,
  type: SelType,
  primary: SelRange,
  before: number,
): void {
  Sel.recordSelect(ctx, type, primary.anchor, primary.active, true, before);
  ctx.state.selType = type;
  ctx.state.selExpand = true;
  Grab.beacon(ctx);
}

function moveExpand(ctx: Ctx, dx: number, dy: number): void {
  const text = ctx.port.getText();
  const goal = dy !== 0 ? goalColumn(ctx) : null;
  const sels = ctx.port.getSelections();
  const before = sels[0].active;
  const moved = selections(
    sels.map((s, i) =>
      dy === 0
        ? movedChar(text.length, s, dx, true)
        : movedLine(text, s, dy, true, i === 0 ? goal : null),
    ),
  );
  ctx.port.setSelections(moved);
  recordExpansion(ctx, SelType.CHAR, moved[0], before);
}

function charOrExpand(ctx: Ctx, dx: number): void {
  if (Sel.hasSelection(Sel.primary(ctx))) moveExpand(ctx, dx, 0);
  else moveChar(ctx, dx);
}

function lineOrExpand(ctx: Ctx, dy: number): void {
  if (Sel.hasSelection(Sel.primary(ctx))) moveExpand(ctx, 0, dy);
  else moveLine(ctx, dy);
}

function moveToOrExpand(ctx: Ctx, type: SelType, target: OffsetTarget): void {
  const text = ctx.port.getText();
  const extend = Sel.hasSelection(Sel.primary(ctx));
  const before = Sel.primary(ctx).active;
  const moved = selections(
    ctx.port.getSelections().map((s) => {
      const active = clamp(target(text, s.active), 0, text.length);
      return { anchor: extend ? s.anchor : active, active };
    }),
  );
  ctx.port.setSelections(moved);
  if (extend) recordExpansion(ctx, type, moved[0], before);
}

function wordOrExpand(ctx: Ctx, n: number): void {
  const pred = charPred(false);
  moveToOrExpand(ctx, SelType.WORD, (text, off) =>
    n >= 0
      ? Words.nextEnd(text, off, n, pred)
      : Words.prevStart(text, off, -n, pred),
  );
}

function sentenceOrExpand(ctx: Ctx, n: number): void {
  moveToOrExpand(ctx, SelType.CHAR, (text, off) =>
    n >= 0 ? nextSentenceEnd(text, off, n) : prevSentenceStart(text, off, -n),
  );
}

function paragraphOrExpand(ctx: Ctx, n: number): void {
  moveToOrExpand(ctx, SelType.CHAR, (text, off) =>
    n >= 0 ? nextParagraphEnd(text, off, n) : prevParagraphStart(text, off, -n),
  );
}

function bufferBoundary(ctx: Ctx, top: boolean): void {
  const counted = ctx.state.pendingCount !== 0 || ctx.state.negative;
  const count = ctx.state.takeCount(1);
  moveToOrExpand(ctx, SelType.CHAR, (text) => {
    const len = text.length;
    if (!counted) return top ? 0 : len;
    const tenth = Math.trunc((len * count) / 10);
    const raw = clamp(top ? tenth : len - tenth, 0, len);
    return nextLineStart(text, raw);
  });
}

function nextLineStart(text: string, offset: number): number {
  if (text.length === 0) return 0;
  const caretLine = lineOfOffset(text, clamp(offset, 0, text.length));
  return caretLine >= lineCount(text) - 1
    ? text.length
    : lineStart(text, caretLine + 1);
}

function wordMotion(ctx: Ctx, symbol: boolean, count: number): void {
  if (count === 0) return;
  const text = ctx.port.getText();
  const type = wordType(symbol);
  const sel = Sel.primary(ctx);
  const selStart = Sel.selStart(sel);
  const selEnd = Sel.selEnd(sel);
  if (!(Sel.hasSelection(sel) && ctx.state.selType === type)) Sel.cancel(ctx);
  const extend =
    ctx.state.selExpand && ctx.state.selType === type && Sel.hasSelection(sel);
  const from = extend ? (count < 0 ? selStart : selEnd) : sel.active;
  const target =
    count > 0
      ? Words.nextEnd(text, from, count, charPred(symbol))
      : Words.prevStart(text, from, -count, charPred(symbol));
  if (target === from) return;
  const anchor = extend
    ? count < 0
      ? selEnd
      : selStart
    : Words.fixSelectionMark(text, target, from, charPred(symbol));
  Sel.select(ctx, type, anchor, target, extend);
}

function markWord(ctx: Ctx, symbol: boolean): void {
  const reversed = ctx.state.takeCount(1) < 0;
  const text = ctx.port.getText();
  const bounds = Words.boundsAt(
    text,
    Sel.primary(ctx).active,
    charPred(symbol),
  );
  if (!bounds) {
    ctx.ui.hint('No word here');
    return;
  }
  const [start, end] = bounds;
  if (reversed) Sel.select(ctx, wordType(symbol), end, start, true);
  else Sel.select(ctx, wordType(symbol), start, end, true);
  const quoted = escapeRegExp(text.slice(start, end));
  Search.push(
    ctx.state,
    symbol ? `(?<![\\w$])${quoted}(?![\\w$])` : `\\b${quoted}\\b`,
  );
}

function line(ctx: Ctx): void {
  const text = ctx.port.getText();
  if (text.length === 0) return;
  const count = ctx.state.takeCount(1);
  const lastLine = lineCount(text) - 1;
  if (
    ctx.state.selType === SelType.LINE &&
    ctx.state.selExpand &&
    Sel.hasSelection(Sel.primary(ctx))
  ) {
    const caretLine = lineOfOffset(text, Sel.primary(ctx).active);
    if (Sel.backwardP(ctx)) {
      const target = Math.max(caretLine - Math.abs(count), 0);
      Sel.select(
        ctx,
        SelType.LINE,
        Sel.mark(ctx),
        lineStart(text, target),
        true,
      );
    } else {
      const target = Math.min(caretLine + Math.abs(count), lastLine);
      Sel.select(ctx, SelType.LINE, Sel.mark(ctx), lineEnd(text, target), true);
    }
    return;
  }
  const caretLine = lineOfOffset(text, Sel.primary(ctx).active);
  if (count < 0) {
    const firstLine = Math.max(caretLine + count + 1, 0);
    Sel.select(
      ctx,
      SelType.LINE,
      lineEnd(text, caretLine),
      lineStart(text, firstLine),
      true,
    );
  } else {
    const finalLine = Math.min(caretLine + count - 1, lastLine);
    Sel.select(
      ctx,
      SelType.LINE,
      lineStart(text, caretLine),
      lineEnd(text, finalLine),
      true,
    );
  }
}

async function gotoLine(ctx: Ctx): Promise<void> {
  const input = await ctx.ui.input('Goto line:');
  if (input === undefined) return;
  const text = ctx.port.getText();
  if (text.length === 0) return;
  const parsed = parseInt(input.trim(), 10);
  if (Number.isNaN(parsed)) return;
  const target = clamp(parsed - 1, 0, lineCount(text) - 1);
  Sel.select(
    ctx,
    SelType.LINE,
    lineStart(text, target),
    lineEnd(text, target),
    true,
  );
}

export function findTill(ctx: Ctx, char: string, till: boolean): void {
  const count = ctx.state.takeCount(1);
  const text = ctx.port.getText();
  const caret = Sel.primary(ctx).active;
  const target = nthCharTarget(
    text,
    char,
    caret,
    Math.abs(count),
    count < 0,
    till,
  );
  if (target < 0) {
    ctx.ui.hint(`char not found: ${char}`);
    return;
  }
  ctx.state.lastFind = char;
  Sel.select(ctx, till ? SelType.TILL : SelType.FIND, caret, target, false);
}
