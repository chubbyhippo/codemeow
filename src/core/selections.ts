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
import * as Grab from './grab';
import { expandHintPositions } from './hints';

const SELECTION_HISTORY_LIMIT = 200;
const EXPAND_ZERO_COUNT = 10;

export const commands: Map<string, MeowCommand> = new Map();
for (let digit = 0; digit <= 9; digit++) {
  commands.set(`meow-expand-${digit}`, (ctx) => expandOrCount(ctx, digit));
}
commands.set('meow-reverse', (ctx) => reverse(ctx));
commands.set('meow-cancel-selection', (ctx) => cancelAll(ctx));
commands.set('meow-pop-selection', (ctx) => pop(ctx));

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

export function selStart(sel: SelRange): number {
  return Math.min(sel.anchor, sel.active);
}

export function selEnd(sel: SelRange): number {
  return Math.max(sel.anchor, sel.active);
}

export function backwardP(ctx: Ctx): boolean {
  const sel = primary(ctx);
  return hasSelection(sel) && sel.active < sel.anchor;
}

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

export function recordSelect(
  ctx: Ctx,
  type: SelType,
  anchor: number,
  active: number,
  expand: boolean,
  posBefore?: number,
): void {
  const state = ctx.state;
  const prev: SavedSelection = state.lastSelection ?? {
    type: null,
    expand: false,
    anchor: posBefore ?? active,
    active: posBefore ?? active,
  };
  const head = state.selectionHistory[state.selectionHistory.length - 1];
  if (!head || !sameSaved(head, prev)) state.selectionHistory.push(prev);
  while (state.selectionHistory.length > SELECTION_HISTORY_LIMIT)
    state.selectionHistory.shift();
  state.lastSelection = { type, expand, anchor, active };
}

export function select(
  ctx: Ctx,
  type: SelType,
  markOff: number,
  point: number,
  expand: boolean,
  push = true,
): void {
  const { port, state: state } = ctx;
  const len = port.getText().length;
  const mark = clamp(markOff, 0, len);
  const caret = clamp(point, 0, len);
  const sels = port.getSelections();
  if (push) recordSelect(ctx, type, mark, caret, expand, sels[0].active);
  else state.lastSelection = { type, expand, anchor: mark, active: caret };
  state.selType = type;
  state.selExpand = expand;
  const next = sels.slice();
  next[0] = { anchor: mark, active: caret };
  port.setSelections(next);
  Grab.beacon(ctx);
  ctx.ui.showExpandHints(expandHintPositions(ctx));
}

export function resetSelectionMemory(state: MeowState): void {
  state.selectionHistory = [];
  state.lastSelection = null;
}

export function collapse(ctx: Ctx): void {
  const current = ctx.port.getSelections();
  const caret = current[0].active;
  const sels: SelRange[] = [...current];
  sels[0] = { anchor: caret, active: caret };
  ctx.port.setSelections(sels);
  ctx.state.selType = SelType.NONE;
  ctx.state.selExpand = false;
}

export function cancel(ctx: Ctx): void {
  collapse(ctx);
  resetSelectionMemory(ctx.state);
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

function pop(ctx: Ctx): void {
  const state = ctx.state;
  if (hasSelection(primary(ctx))) {
    const entry = state.selectionHistory.pop();
    if (!entry) return;
    if (entry.type === null) {
      const sels = ctx.port.getSelections().slice();
      sels[0] = { anchor: entry.active, active: entry.active };
      ctx.port.setSelections(sels);
      cancel(ctx);
      ctx.ui.hint('No previous selection');
    } else {
      select(ctx, entry.type, entry.anchor, entry.active, entry.expand, false);
    }
  } else if (!Grab.pop(ctx)) {
    ctx.ui.hint('No previous selection');
  }
}

function expandOrCount(ctx: Ctx, digit: number): void {
  const state = ctx.state;
  if (hasSelection(primary(ctx)) && EXPANDABLE.has(state.selType)) {
    expand(ctx, digit === 0 ? EXPAND_ZERO_COUNT : digit);
  } else {
    state.pendingCount = state.pendingCount * 10 + digit;
  }
}

function expandTarget(
  state: MeowState,
  text: string,
  caret: number,
  back: boolean,
  count: number,
): number | null {
  switch (state.selType) {
    case SelType.CHAR:
      return caret + (back ? -count : count);
    case SelType.WORD:
    case SelType.SYMBOL: {
      const isWord = charPred(state.selType === SelType.SYMBOL);
      return back
        ? Words.prevStart(text, caret, count, isWord)
        : Words.nextEnd(text, caret, count, isWord);
    }
    case SelType.LINE: {
      const caretLine = lineOfOffset(text, caret);
      return back
        ? lineStart(text, Math.max(caretLine - count, 0))
        : lineEnd(text, Math.min(caretLine + count, lineCount(text) - 1));
    }
    case SelType.FIND:
    case SelType.TILL: {
      const findChar = state.lastFind;
      if (findChar === null) return null;
      const found = nthCharTarget(
        text,
        findChar,
        caret,
        count,
        back,
        state.selType === SelType.TILL,
      );
      return found < 0 ? null : found;
    }
    default:
      return null;
  }
}

function expand(ctx: Ctx, count: number): void {
  const state = ctx.state;
  const target = expandTarget(
    state,
    ctx.port.getText(),
    primary(ctx).active,
    backwardP(ctx),
    count,
  );
  if (target === null) return;
  select(ctx, state.selType, mark(ctx), target, false);
}
