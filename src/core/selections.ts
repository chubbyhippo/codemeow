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
import { MeowState, SavedSelection, SelType } from './state';
import {
  charPred,
  clamp,
  lineCount,
  lineEnd,
  lineOfOffset,
  lineStart,
  nthCharTarget,
  Words,
} from './text';
import { MeowCommand } from './command';
import * as GrabMod from './grab';
import { expandHintPositions } from './hints';

/**
 * The selection primitive, and the commands that act on the selection itself
 * (reverse, cancel, pop, digit expand). Every selecting command funnels
 * through [select], which mirrors meow's (expand|select . type) model and its
 * history: the previous selection (or a null placeholder recording where the
 * chain started) is pushed on every select, `z` pops entries back with their
 * type and direction, and meow--cancel-selection (movement, `g`, `i`, `a`,
 * grab…) clears the whole history. Verified against meow 1.5.0 by probe.
 */

export const commands: Map<string, MeowCommand> = new Map();
for (let n = 0; n <= 9; n++) {
  commands.set(`meow-expand-${n}`, (ctx) => expandOrCount(ctx, n));
}
commands.set('meow-reverse', (ctx) => reverse(ctx));
commands.set('meow-cancel-selection', (ctx) => cancelAll(ctx));
commands.set('meow-pop-selection', (ctx) => pop(ctx));

/** The types digit expand can grow; anything else makes digits a count. */
const EXPANDABLE = new Set([
  SelType.CHAR,
  SelType.WORD,
  SelType.SYMBOL,
  SelType.LINE,
  SelType.FIND,
  SelType.TILL,
]);

export function primary(ctx: Ctx): SelRange {
  return ctx.port.getSelections()[0];
}

export function hasSelection(sel: SelRange): boolean {
  return sel.anchor !== sel.active;
}

/** Is the selection reversed (caret at its start), meow--direction-backward-p. */
export function backwardP(ctx: Ctx): boolean {
  const sel = primary(ctx);
  return hasSelection(sel) && sel.active < sel.anchor;
}

/** The anchor a same-direction re-selection keeps, meow's mark. */
export function mark(ctx: Ctx): number {
  const sel = primary(ctx);
  return hasSelection(sel) ? sel.anchor : sel.active;
}

function sameSaved(a: SavedSelection, b: SavedSelection): boolean {
  return (
    a.type === b.type &&
    a.expand === b.expand &&
    a.anchor === b.anchor &&
    a.active === b.active
  );
}

/** meow--select's history bookkeeping: push the previous meow--selection —
 *  or a null placeholder at [posBefore] when there was none — then remember
 *  the new one. */
export function recordSelect(
  ctx: Ctx,
  type: SelType,
  anchor: number,
  active: number,
  expand: boolean,
  posBefore?: number,
): void {
  const st = ctx.st;
  const prev: SavedSelection = st.lastSelection ?? {
    type: null,
    expand: false,
    anchor: posBefore ?? active,
    active: posBefore ?? active,
  };
  const head = st.selectionHistory[st.selectionHistory.length - 1];
  if (!head || !sameSaved(head, prev)) st.selectionHistory.push(prev);
  while (st.selectionHistory.length > 200) st.selectionHistory.shift();
  st.lastSelection = { type, expand, anchor, active };
}

export function select(
  ctx: Ctx,
  type: SelType,
  markOff: number,
  point: number,
  expand: boolean,
  push = true,
): void {
  const { port, st } = ctx;
  const len = port.getText().length;
  const m = clamp(markOff, 0, len);
  const p = clamp(point, 0, len);
  const sels = port.getSelections();
  if (push) recordSelect(ctx, type, m, p, expand, sels[0].active);
  else st.lastSelection = { type, expand, anchor: m, active: p };
  st.selType = type;
  st.selExpand = expand;
  const next = sels.slice();
  next[0] = { anchor: m, active: p };
  port.setSelections(next);
  GrabMod.beacon(ctx);
  ctx.ui.showExpandHints(expandHintPositions(ctx));
}

/** Forget the selection chain — the history-clearing half of
 *  meow--cancel-selection. */
export function resetSelectionMemory(st: MeowState): void {
  st.selectionHistory = [];
  st.lastSelection = null;
}

/** Collapse the primary selection WITHOUT touching the history — for edits
 *  that kill the region as a side effect (meow never cancels there). */
export function collapse(ctx: Ctx): void {
  const sels = ctx.port.getSelections().slice();
  sels[0] = { anchor: sels[0].active, active: sels[0].active };
  ctx.port.setSelections(sels);
  ctx.st.selType = SelType.NONE;
  ctx.st.selExpand = false;
}

/** meow--cancel-selection: collapse AND clear the selection history. */
export function cancel(ctx: Ctx): void {
  collapse(ctx);
  resetSelectionMemory(ctx.st);
}

export function cancelAll(ctx: Ctx): void {
  const sels = ctx.port.getSelections();
  if (sels.length > 1) ctx.port.setSelections([sels[0]]);
  cancel(ctx);
}

function reverse(ctx: Ctx): void {
  const sel = primary(ctx);
  if (!hasSelection(sel)) return;
  const sels = ctx.port.getSelections().slice();
  sels[0] = { anchor: sel.active, active: sel.anchor };
  ctx.port.setSelections(sels);
}

/** meow-pop-selection: with an active region, pop the history (a typed entry
 *  restores type AND direction; the null placeholder returns the caret to
 *  where the chain started and cancels); without one, pop the grab. */
function pop(ctx: Ctx): void {
  const st = ctx.st;
  if (hasSelection(primary(ctx))) {
    const entry = st.selectionHistory.pop();
    if (!entry) return; // meow is silent here
    if (entry.type === null) {
      const sels = ctx.port.getSelections().slice();
      sels[0] = { anchor: entry.active, active: entry.active };
      ctx.port.setSelections(sels);
      cancel(ctx);
      ctx.ui.hint('No previous selection');
    } else {
      select(ctx, entry.type, entry.anchor, entry.active, entry.expand, false);
    }
  } else if (!GrabMod.pop(ctx)) {
    ctx.ui.hint('No previous selection');
  }
}

/** meow-expand-N (0 = 10); without an expandable selection it falls back
 *  to meow-digit-argument (meow-selection-command-fallback). */
function expandOrCount(ctx: Ctx, n: number): void {
  const st = ctx.st;
  if (hasSelection(primary(ctx)) && EXPANDABLE.has(st.selType)) {
    expand(ctx, n === 0 ? 10 : n);
  } else {
    st.pendingCount = st.pendingCount * 10 + n;
  }
}

function expand(ctx: Ctx, n: number): void {
  const st = ctx.st;
  const text = ctx.port.getText();
  const back = backwardP(ctx);
  const caret = primary(ctx).active;
  let target: number;
  switch (st.selType) {
    case SelType.CHAR:
      target = caret + (back ? -n : n);
      break;
    case SelType.WORD:
    case SelType.SYMBOL: {
      const p = charPred(st.selType === SelType.SYMBOL);
      target = back
        ? Words.prevStart(text, caret, n, p)
        : Words.nextEnd(text, caret, n, p);
      break;
    }
    case SelType.LINE: {
      const ln = lineOfOffset(text, caret);
      target = back
        ? lineStart(text, Math.max(ln - n, 0))
        : lineEnd(text, Math.min(ln + n, lineCount(text) - 1));
      break;
    }
    case SelType.FIND:
    case SelType.TILL: {
      const ch = st.lastFind;
      if (ch === null) return;
      const t = nthCharTarget(
        text,
        ch,
        caret,
        n,
        back,
        st.selType === SelType.TILL,
      );
      if (t < 0) return;
      target = t;
      break;
    }
    default:
      return;
  }
  // meow-expand-selection-type defaults to 'select: the expanded selection is
  // demoted, so follow-up word motions re-mark and `x` re-selects its line
  select(ctx, st.selType, mark(ctx), target, false);
}
