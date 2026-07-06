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
import { charPred, clamp, escapeRegExp, lineCount, lineEnd, lineOfOffset, lineStart, nthCharTarget, Words } from './text';
import { MeowCommand } from './command';
import * as Sel from './selections';
import * as GrabMod from './grab';
import * as Search from './search';

/**
 * Cursor motion and the selections it creates: char/line movement with the
 * -expand variants, word/symbol motions, meow-line, goto-line, and find/till.
 * Every behavior here follows meow-command.el, not vim intuition — see the
 * [wordMotion] doc for the direction-normalization rule that makes `w` then
 * `b` extend instead of re-mark.
 */

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
  ['meow-next-symbol', (ctx: Ctx) => wordMotion(ctx, true, ctx.st.takeCount(1))],
  // meow-back-word = meow-next-thing with -N
  ['meow-back-word', (ctx: Ctx) => wordMotion(ctx, false, -ctx.st.takeCount(1))],
  ['meow-back-symbol', (ctx: Ctx) => wordMotion(ctx, true, -ctx.st.takeCount(1))],
  ['meow-mark-word', (ctx: Ctx) => markWord(ctx, false)],
  ['meow-mark-symbol', (ctx: Ctx) => markWord(ctx, true)],
  ['meow-line', (ctx: Ctx) => line(ctx)],
  ['meow-goto-line', (ctx: Ctx) => gotoLine(ctx)],
  ['meow-find', (ctx: Ctx) => { ctx.st.pending = Pending.FIND; }],
  ['meow-till', (ctx: Ctx) => { ctx.st.pending = Pending.TILL; }],
]);

const wordType = (symbol: boolean) => (symbol ? SelType.SYMBOL : SelType.WORD);

/** The commands whose chains keep Emacs' temporary-goal-column alive. */
const VERTICAL = new Set(['meow-next', 'meow-prev', 'meow-next-expand', 'meow-prev-expand']);

const charSelActive = (ctx: Ctx) =>
  ctx.st.selType === SelType.CHAR && Sel.hasSelection(Sel.primary(ctx));

/** meow-left/right run backward-char/forward-char: offsets, crossing newlines. */
function movedChar(len: number, sel: SelRange, dx: number, extend: boolean): SelRange {
  const active = clamp(sel.active + dx, 0, len);
  return { anchor: extend ? sel.anchor : active, active };
}

/** next-line/previous-line: goal column (primary caret), own column for the
 *  rest; past the first/last line the point goes to the buffer edge. */
function movedLine(text: string, sel: SelRange, dy: number, extend: boolean, goal: number | null): SelRange {
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

/** Set (or keep) the goal column, Emacs temporary-goal-column style: it only
 *  survives while the previous command was a vertical move too. */
function goalColumn(ctx: Ctx): number {
  const st = ctx.st;
  if (st.goalColumn === null || st.lastCommand === null || !VERTICAL.has(st.lastCommand)) {
    const text = ctx.port.getText();
    const p = Sel.primary(ctx).active;
    st.goalColumn = p - lineStart(text, lineOfOffset(text, p));
  }
  return st.goalColumn;
}

function moveChar(ctx: Ctx, dx: number): void {
  const extend = charSelActive(ctx);
  // meow-left/right cancel (clearing the history) only with an active region
  if (!extend && Sel.hasSelection(Sel.primary(ctx))) Sel.cancel(ctx);
  const len = ctx.port.getText().length;
  ctx.port.setSelections(ctx.port.getSelections().map((s) => movedChar(len, s, dx, extend)));
}

function moveLine(ctx: Ctx, dy: number): void {
  const extend = charSelActive(ctx);
  // meow-next/prev run meow--cancel-selection unconditionally for other types
  if (!extend) Sel.cancel(ctx);
  const goal = goalColumn(ctx);
  const text = ctx.port.getText();
  ctx.port.setSelections(ctx.port.getSelections().map(
    (s, i) => movedLine(text, s, dy, extend, i === 0 ? goal : null),
  ));
}

/** meow-left/right/next/prev-expand: (expand . char) selection through
 *  meow--select — so the history is recorded — then the char/line motion. */
function moveExpand(ctx: Ctx, dx: number, dy: number): void {
  const text = ctx.port.getText();
  const goal = dy !== 0 ? goalColumn(ctx) : null;
  const sels = ctx.port.getSelections();
  const before = sels[0].active;
  const moved = sels.map((s, i) => (
    dy === 0
      ? movedChar(text.length, s, dx, true)
      : movedLine(text, s, dy, true, i === 0 ? goal : null)
  ));
  ctx.port.setSelections(moved);
  Sel.recordSelect(ctx, SelType.CHAR, moved[0].anchor, moved[0].active, true, before);
  ctx.st.selType = SelType.CHAR;
  ctx.st.selExpand = true;
  GrabMod.beacon(ctx);
}

/**
 * meow-next-thing for word/symbol: when the current selection is the
 * matching (expand . type), the selection direction is normalized to the
 * motion FIRST (meow--direction-forward/-backward) — so after `w`, `e`
 * extends from the right end and `b` extends from the left end, anchored
 * at the opposite end (meow--make-selection keeps min/max of the original
 * region as the mark). Without a matching selection: fresh (select . type)
 * from point. No motion -> no selection change.
 */
function wordMotion(ctx: Ctx, symbol: boolean, n: number): void {
  if (n === 0) return;
  const text = ctx.port.getText();
  const type = wordType(symbol);
  const sel = Sel.primary(ctx);
  const lo = Math.min(sel.anchor, sel.active);
  const hi = Math.max(sel.anchor, sel.active);
  const extend = ctx.st.selExpand && ctx.st.selType === type && Sel.hasSelection(sel);
  const from = extend ? (n < 0 ? lo : hi) : sel.active;
  const anchor = extend ? (n < 0 ? hi : lo) : from;
  const target = n > 0
    ? Words.nextEnd(text, from, n, charPred(symbol))
    : Words.prevStart(text, from, -n, charPred(symbol));
  if (target === from) return;
  Sel.select(ctx, type, anchor, target, extend);
}

/** meow-mark-word/-symbol: select the thing at point as (expand . type)
 *  and push its bounded regexp to the search ring — why `n` works after `w`. */
function markWord(ctx: Ctx, symbol: boolean): void {
  const neg = ctx.st.takeCount(1) < 0;
  const text = ctx.port.getText();
  const b = Words.boundsAt(text, Sel.primary(ctx).active, charPred(symbol));
  if (!b) { ctx.ui.hint('No word here'); return; }
  const [s, e] = b;
  if (neg) Sel.select(ctx, wordType(symbol), e, s, true);
  else Sel.select(ctx, wordType(symbol), s, e, true);
  Search.push(ctx.st, `\\b${escapeRegExp(text.slice(s, e))}\\b`);
}

/** meow-line: [bol, eol) without the newline; repeats extend in the
 *  selection's direction, a negative argument reverses. */
function line(ctx: Ctx): void {
  const text = ctx.port.getText();
  if (text.length === 0) return;
  const n = ctx.st.takeCount(1);
  const lastLine = lineCount(text) - 1;
  // extension needs exactly (expand . line) — a digit-expanded (select . line)
  // selection re-selects the current line instead
  if (ctx.st.selType === SelType.LINE && ctx.st.selExpand && Sel.hasSelection(Sel.primary(ctx))) {
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
    Sel.select(ctx, SelType.LINE, lineEnd(text, ln), lineStart(text, startLn), true);
  } else {
    const endLn = Math.min(ln + n - 1, lastLine);
    Sel.select(ctx, SelType.LINE, lineStart(text, ln), lineEnd(text, endLn), true);
  }
}

/** meow-goto-line: select the target line (expand . line) and recenter. */
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

/** The second half of meow-find/meow-till, once the char arrives. */
export function findTill(ctx: Ctx, ch: string, till: boolean): void {
  const n = ctx.st.takeCount(1);
  const text = ctx.port.getText();
  const caret = Sel.primary(ctx).active;
  const target = nthCharTarget(text, ch, caret, Math.abs(n), n < 0, till);
  if (target < 0) { ctx.ui.hint(`char not found: ${ch}`); return; }
  Sel.select(ctx, till ? SelType.TILL : SelType.FIND, caret, target, false);
  ctx.st.lastFind = ch;
}
