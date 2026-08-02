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

import { Ctx, SelRange, TextEdit } from './port';
import { MeowState, SelType } from './state';
import { escapeRegExp, lineEnd, lineOfOffset, lineStart } from './text';
import { MeowCommand } from './command';
import * as Sel from './selections';
import * as Edits from './edits';

const MAX_GRAB_SYNC_MATCHES = 500;

export const commands: Map<string, MeowCommand> = new Map([
  ['meow-grab', (ctx: Ctx) => grab(ctx)],
  ['meow-sync-grab', (ctx: Ctx) => sync(ctx)],
  ['meow-swap-grab', (ctx: Ctx) => swap(ctx)],
]);

function clear(ctx: Ctx): void {
  ctx.state.grab = null;
  ctx.ui.setGrabHighlight(null);
}

function set(ctx: Ctx, start: number, end: number): void {
  ctx.state.grab = { start, end };
  ctx.ui.setGrabHighlight(end > start ? { start, end } : null);
}

export function adjustForEdits(state: MeowState, edits: TextEdit[]): void {
  const grabbed = state.grab;
  if (!grabbed) return;
  for (const edit of [...edits].sort(
    (left, right) => right.start - left.start,
  )) {
    const delta = edit.text.length - (edit.end - edit.start);
    if (grabbed.start >= edit.end) {
      grabbed.start += delta;
      grabbed.end += delta;
    } else {
      if (grabbed.end >= edit.end) grabbed.end += delta;
      else if (grabbed.end > edit.start) grabbed.end = edit.start;
      if (grabbed.start > edit.start) grabbed.start = edit.start;
    }
  }
  if (grabbed.end < grabbed.start) grabbed.end = grabbed.start;
}

function grab(ctx: Ctx): void {
  clear(ctx);
  const sel = Sel.primary(ctx);
  if (Sel.hasSelection(sel)) {
    set(ctx, Sel.selStart(sel), Sel.selEnd(sel));
  }
  Sel.cancel(ctx);
}

function sync(ctx: Ctx): void {
  const sel = Sel.primary(ctx);
  if (!Sel.hasSelection(sel)) {
    ctx.ui.hint('meow-sync-grab needs a selection');
    return;
  }
  clear(ctx);
  set(ctx, Sel.selStart(sel), Sel.selEnd(sel));
  Sel.cancel(ctx);
}

async function swap(ctx: Ctx): Promise<void> {
  if (Edits.blockedReadOnly(ctx)) return;
  const { port, state } = ctx;
  const grabbed = state.grab;
  const sel = Sel.primary(ctx);
  if (!grabbed) {
    ctx.ui.hint('No grab');
    return;
  }
  if (!Sel.hasSelection(sel)) {
    ctx.ui.hint('meow-swap-grab needs a selection');
    return;
  }
  const grabStart = grabbed.start;
  const grabEnd = grabbed.end;
  const selStart = Sel.selStart(sel);
  const selEnd = Sel.selEnd(sel);
  const overlaps =
    Math.max(grabStart, selStart) < Math.min(grabEnd, selEnd) &&
    !(grabStart === selStart && grabEnd === selEnd);
  if (overlaps) {
    ctx.ui.hint('Selection overlaps the grab');
    return;
  }
  const text = port.getText();
  const grabText = text.slice(grabStart, grabEnd);
  const selText = text.slice(selStart, selEnd);
  state.grab = null;
  await port.edit([
    { start: selStart, end: selEnd, text: grabText },
    { start: grabStart, end: grabEnd, text: selText },
  ]);
  if (grabStart <= selStart) {
    const delta = selText.length - (grabEnd - grabStart);
    set(ctx, grabStart, grabStart + selText.length);
    const caret = selStart + delta + grabText.length;
    port.setSelections([{ anchor: caret, active: caret }]);
  } else {
    const delta = grabText.length - (selEnd - selStart);
    set(ctx, grabStart + delta, grabStart + delta + selText.length);
    const caret = selStart + grabText.length;
    port.setSelections([{ anchor: caret, active: caret }]);
  }
  state.selType = SelType.NONE;
}

export function pop(ctx: Ctx): boolean {
  const grabbed = ctx.state.grab;
  if (!grabbed) return false;
  const { start, end } = grabbed;
  clear(ctx);
  Sel.select(ctx, SelType.TRANSIENT, start, end, false);
  return true;
}

export function beacon(ctx: Ctx): void {
  const { port, state } = ctx;
  const grabbed = state.grab;
  if (!grabbed || grabbed.end <= grabbed.start) return;
  const sel = Sel.primary(ctx);
  if (!Sel.hasSelection(sel)) return;
  const selStart = Sel.selStart(sel);
  const selEnd = Sel.selEnd(sel);
  if (selStart < grabbed.start || selEnd > grabbed.end || selEnd === selStart)
    return;
  const text = port.getText();
  const sels: SelRange[] = [];
  switch (state.selType) {
    case SelType.WORD:
    case SelType.SYMBOL:
    case SelType.VISIT:
    case SelType.FIND:
    case SelType.TILL:
    case SelType.CHAR: {
      const selText = text.slice(selStart, selEnd);
      if (selText.trim() === '') return;
      const bounded =
        state.selType === SelType.WORD || state.selType === SelType.SYMBOL;
      const re = new RegExp(
        bounded ? `\\b${escapeRegExp(selText)}\\b` : escapeRegExp(selText),
        'g',
      );
      const region = text.slice(grabbed.start, grabbed.end);
      let added = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(region)) !== null) {
        if (match[0].length === 0) {
          re.lastIndex++;
          continue;
        }
        const matchStart = grabbed.start + match.index;
        const matchEnd = matchStart + match[0].length;
        if (matchStart !== selStart) {
          sels.push({ anchor: matchStart, active: matchEnd });
          if (++added >= MAX_GRAB_SYNC_MATCHES) break;
        }
      }
      if (sels.length === 0) return;
      sels.unshift({ anchor: selStart, active: selEnd });
      break;
    }
    case SelType.LINE: {
      const first = lineOfOffset(text, grabbed.start);
      const last = lineOfOffset(text, Math.max(grabbed.end - 1, grabbed.start));
      if (last <= first) return;
      for (let line = first; line <= last; line++) {
        sels.push({
          anchor: lineStart(text, line),
          active: lineEnd(text, line),
        });
      }
      break;
    }
    default:
      return;
  }
  port.setSelections(sels);
}
