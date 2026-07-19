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

import { Ctx, SelRange } from './port';
import { Pending, SelType } from './state';
import {
  charPred,
  clamp,
  escapeRegExp,
  lineCount,
  lineEnd,
  lineOfOffset,
  lineStart,
  nextParagraphEnd,
  nextSentenceEnd,
  nthCharTarget,
  prevParagraphStart,
  prevSentenceStart,
  Words,
} from './text';
import { MeowCommand } from './command';
import * as Sel from './selections';
import * as Grab from './grab';
import * as Search from './search';

export const commands: Map<string, MeowCommand> = new Map([
  ['meow-left', (ctx: Ctx) => moveChar(ctx, -ctx.st.takeCount(1))],
  ['meow-right', (ctx: Ctx) => moveChar(ctx, ctx.st.takeCount(1))],
  ['meow-next', (ctx: Ctx) => moveLine(ctx, ctx.st.takeCount(1))],
  ['meow-prev', (ctx: Ctx) => moveLine(ctx, -ctx.st.takeCount(1))],
  ['meow-left-expand', (ctx: Ctx) => moveExpand(ctx, -ctx.st.takeCount(1), 0)],
  ['meow-right-expand', (ctx: Ctx) => moveExpand(ctx, ctx.st.takeCount(1), 0)],
  ['meow-next-expand', (ctx: Ctx) => moveExpand(ctx, 0, ctx.st.takeCount(1))],
  ['meow-prev-expand', (ctx: Ctx) => moveExpand(ctx, 0, -ctx.st.takeCount(1))],
  ['meow-next-word', (ctx: Ctx) => wordMotion(ctx, false, ctx.st.takeCount(1))],
  [
    'meow-next-symbol',
    (ctx: Ctx) => wordMotion(ctx, true, ctx.st.takeCount(1)),
  ],
  [
    'meow-back-word',
    (ctx: Ctx) => wordMotion(ctx, false, -ctx.st.takeCount(1)),
  ],
  [
    'meow-back-symbol',
    (ctx: Ctx) => wordMotion(ctx, true, -ctx.st.takeCount(1)),
  ],
  ['meow-mark-word', (ctx: Ctx) => markWord(ctx, false)],
  ['meow-mark-symbol', (ctx: Ctx) => markWord(ctx, true)],
  ['meow-line', (ctx: Ctx) => line(ctx)],
  ['meow-goto-line', (ctx: Ctx) => gotoLine(ctx)],
  [
    'meow-find',
    (ctx: Ctx) => {
      ctx.st.pending = Pending.FIND;
    },
  ],
  [
    'meow-till',
    (ctx: Ctx) => {
      ctx.st.pending = Pending.TILL;
    },
  ],
  ['forward-char', (ctx: Ctx) => charOrExpand(ctx, ctx.st.takeCount(1))],
  ['backward-char', (ctx: Ctx) => charOrExpand(ctx, -ctx.st.takeCount(1))],
  [
    'next-line',
    (ctx: Ctx) => {
      lineOrExpand(ctx, ctx.st.takeCount(1));
      ctx.st.lastCommand = 'next-line';
    },
  ],
  [
    'previous-line',
    (ctx: Ctx) => {
      lineOrExpand(ctx, -ctx.st.takeCount(1));
      ctx.st.lastCommand = 'previous-line';
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
  ['forward-word', (ctx: Ctx) => wordOrExpand(ctx, ctx.st.takeCount(1))],
  ['backward-word', (ctx: Ctx) => wordOrExpand(ctx, -ctx.st.takeCount(1))],
  [
    'forward-sentence',
    (ctx: Ctx) => sentenceOrExpand(ctx, ctx.st.takeCount(1)),
  ],
  [
    'backward-sentence',
    (ctx: Ctx) => sentenceOrExpand(ctx, -ctx.st.takeCount(1)),
  ],
  ['beginning-of-buffer', (ctx: Ctx) => bufferBoundary(ctx, true)],
  ['end-of-buffer', (ctx: Ctx) => bufferBoundary(ctx, false)],
  [
    'forward-paragraph',
    (ctx: Ctx) => paragraphOrExpand(ctx, ctx.st.takeCount(1)),
  ],
  [
    'backward-paragraph',
    (ctx: Ctx) => paragraphOrExpand(ctx, -ctx.st.takeCount(1)),
  ],
]);

type OffsetTarget = (text: string, offset: number) => number;

const lineStartTarget: OffsetTarget = (text, off) =>
  lineStart(text, lineOfOffset(text, off));

const lineEndTarget: OffsetTarget = (text, off) =>
  lineEnd(text, lineOfOffset(text, off));

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
  ctx.st.selType === SelType.CHAR && Sel.hasSelection(Sel.primary(ctx));

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
  const ln = lineOfOffset(text, sel.active);
  const target = ln + dy;
  let active: number;
  if (target < 0) active = 0;
  else if (target > lineCount(text) - 1) active = text.length;
  else {
    const col = goal ?? sel.active - lineStart(text, ln);
    const bol = lineStart(text, target);
    active = bol + Math.min(col, lineEnd(text, target) - bol);
  }
  return { anchor: extend ? sel.anchor : active, active };
}

function goalColumn(ctx: Ctx): number {
  const st = ctx.st;
  if (
    st.goalColumn === null ||
    st.lastCommand === null ||
    !VERTICAL.has(st.lastCommand)
  ) {
    const text = ctx.port.getText();
    const p = Sel.primary(ctx).active;
    st.goalColumn = p - lineStart(text, lineOfOffset(text, p));
  }
  return st.goalColumn;
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

function moveExpand(ctx: Ctx, dx: number, dy: number): void {
  const text = ctx.port.getText();
  const goal = dy !== 0 ? goalColumn(ctx) : null;
  const sels = ctx.port.getSelections();
  const before = sels[0].active;
  const moved = sels.map((s, i) =>
    dy === 0
      ? movedChar(text.length, s, dx, true)
      : movedLine(text, s, dy, true, i === 0 ? goal : null),
  );
  ctx.port.setSelections(moved);
  Sel.recordSelect(
    ctx,
    SelType.CHAR,
    moved[0].anchor,
    moved[0].active,
    true,
    before,
  );
  ctx.st.selType = SelType.CHAR;
  ctx.st.selExpand = true;
  Grab.beacon(ctx);
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
  const moved = ctx.port.getSelections().map((s) => {
    const active = clamp(target(text, s.active), 0, text.length);
    return { anchor: extend ? s.anchor : active, active };
  });
  ctx.port.setSelections(moved);
  if (extend) {
    Sel.recordSelect(ctx, type, moved[0].anchor, moved[0].active, true, before);
    ctx.st.selType = type;
    ctx.st.selExpand = true;
    Grab.beacon(ctx);
  }
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
  const counted = ctx.st.pendingCount !== 0 || ctx.st.negative;
  const n = ctx.st.takeCount(1);
  moveToOrExpand(ctx, SelType.CHAR, (text) => {
    const len = text.length;
    if (!counted) return top ? 0 : len;
    const tenth = Math.trunc((len * n) / 10);
    const raw = clamp(top ? tenth : len - tenth, 0, len);
    return nextLineStart(text, raw);
  });
}

function nextLineStart(text: string, offset: number): number {
  if (text.length === 0) return 0;
  const ln = lineOfOffset(text, clamp(offset, 0, text.length));
  return ln >= lineCount(text) - 1 ? text.length : lineStart(text, ln + 1);
}

function wordMotion(ctx: Ctx, symbol: boolean, n: number): void {
  if (n === 0) return;
  const text = ctx.port.getText();
  const type = wordType(symbol);
  const sel = Sel.primary(ctx);
  const lo = Math.min(sel.anchor, sel.active);
  const hi = Math.max(sel.anchor, sel.active);
  if (!(Sel.hasSelection(sel) && ctx.st.selType === type)) Sel.cancel(ctx);
  const extend =
    ctx.st.selExpand && ctx.st.selType === type && Sel.hasSelection(sel);
  const from = extend ? (n < 0 ? lo : hi) : sel.active;
  const target =
    n > 0
      ? Words.nextEnd(text, from, n, charPred(symbol))
      : Words.prevStart(text, from, -n, charPred(symbol));
  if (target === from) return;
  const anchor = extend
    ? n < 0
      ? hi
      : lo
    : Words.fixSelectionMark(text, target, from, charPred(symbol));
  Sel.select(ctx, type, anchor, target, extend);
}

function markWord(ctx: Ctx, symbol: boolean): void {
  const neg = ctx.st.takeCount(1) < 0;
  const text = ctx.port.getText();
  const b = Words.boundsAt(text, Sel.primary(ctx).active, charPred(symbol));
  if (!b) {
    ctx.ui.hint('No word here');
    return;
  }
  const [s, e] = b;
  if (neg) Sel.select(ctx, wordType(symbol), e, s, true);
  else Sel.select(ctx, wordType(symbol), s, e, true);
  Search.push(ctx.st, `\\b${escapeRegExp(text.slice(s, e))}\\b`);
}

function line(ctx: Ctx): void {
  const text = ctx.port.getText();
  if (text.length === 0) return;
  const n = ctx.st.takeCount(1);
  const lastLine = lineCount(text) - 1;
  if (
    ctx.st.selType === SelType.LINE &&
    ctx.st.selExpand &&
    Sel.hasSelection(Sel.primary(ctx))
  ) {
    const caretLn = lineOfOffset(text, Sel.primary(ctx).active);
    if (Sel.backwardP(ctx)) {
      const ln = Math.max(caretLn - Math.abs(n), 0);
      Sel.select(ctx, SelType.LINE, Sel.mark(ctx), lineStart(text, ln), true);
    } else {
      const ln = Math.min(caretLn + Math.abs(n), lastLine);
      Sel.select(ctx, SelType.LINE, Sel.mark(ctx), lineEnd(text, ln), true);
    }
    return;
  }
  const ln = lineOfOffset(text, Sel.primary(ctx).active);
  if (n < 0) {
    const startLn = Math.max(ln + n + 1, 0);
    Sel.select(
      ctx,
      SelType.LINE,
      lineEnd(text, ln),
      lineStart(text, startLn),
      true,
    );
  } else {
    const endLn = Math.min(ln + n - 1, lastLine);
    Sel.select(
      ctx,
      SelType.LINE,
      lineStart(text, ln),
      lineEnd(text, endLn),
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
  const ln = clamp(parsed - 1, 0, lineCount(text) - 1);
  Sel.select(ctx, SelType.LINE, lineStart(text, ln), lineEnd(text, ln), true);
}

export function findTill(ctx: Ctx, ch: string, till: boolean): void {
  const n = ctx.st.takeCount(1);
  const text = ctx.port.getText();
  const caret = Sel.primary(ctx).active;
  const target = nthCharTarget(text, ch, caret, Math.abs(n), n < 0, till);
  if (target < 0) {
    ctx.ui.hint(`char not found: ${ch}`);
    return;
  }
  ctx.st.lastFind = ch;
  Sel.select(ctx, till ? SelType.TILL : SelType.FIND, caret, target, false);
}
