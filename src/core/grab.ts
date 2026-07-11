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
  ctx.st.grab = null;
  ctx.ui.setGrabHighlight(null);
}

function set(ctx: Ctx, start: number, end: number): void {
  ctx.st.grab = { start, end };
  ctx.ui.setGrabHighlight(end > start ? { start, end } : null);
}

export function adjustForEdits(st: MeowState, edits: TextEdit[]): void {
  const g = st.grab;
  if (!g) return;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) {
    const delta = e.text.length - (e.end - e.start);
    if (g.start >= e.end) {
      g.start += delta;
      g.end += delta;
    } else {
      if (g.end >= e.end) g.end += delta;
      else if (g.end > e.start) g.end = e.start;
      if (g.start > e.start) g.start = e.start;
    }
  }
  if (g.end < g.start) g.end = g.start;
}

function grab(ctx: Ctx): void {
  clear(ctx);
  const sel = Sel.primary(ctx);
  if (Sel.hasSelection(sel)) {
    set(
      ctx,
      Math.min(sel.anchor, sel.active),
      Math.max(sel.anchor, sel.active),
    );
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
  set(ctx, Math.min(sel.anchor, sel.active), Math.max(sel.anchor, sel.active));
  Sel.cancel(ctx);
}

async function swap(ctx: Ctx): Promise<void> {
  if (Edits.blockedReadOnly(ctx)) return;
  const { port, st } = ctx;
  const g = st.grab;
  const sel = Sel.primary(ctx);
  if (!g) {
    ctx.ui.hint('No grab');
    return;
  }
  if (!Sel.hasSelection(sel)) {
    ctx.ui.hint('meow-swap-grab needs a selection');
    return;
  }
  const gs = g.start;
  const ge = g.end;
  const ss = Math.min(sel.anchor, sel.active);
  const se = Math.max(sel.anchor, sel.active);
  if (Math.max(gs, ss) < Math.min(ge, se) && !(gs === ss && ge === se)) {
    ctx.ui.hint('Selection overlaps the grab');
    return;
  }
  const text = port.getText();
  const grabText = text.slice(gs, ge);
  const selText = text.slice(ss, se);
  st.grab = null;
  await port.edit([
    { start: ss, end: se, text: grabText },
    { start: gs, end: ge, text: selText },
  ]);
  if (gs <= ss) {
    const delta = selText.length - (ge - gs);
    set(ctx, gs, gs + selText.length);
    const caret = ss + delta + grabText.length;
    port.setSelections([{ anchor: caret, active: caret }]);
  } else {
    const delta = grabText.length - (se - ss);
    set(ctx, gs + delta, gs + delta + selText.length);
    const caret = ss + grabText.length;
    port.setSelections([{ anchor: caret, active: caret }]);
  }
  st.selType = SelType.NONE;
}

export function pop(ctx: Ctx): boolean {
  const g = ctx.st.grab;
  if (!g) return false;
  const { start, end } = g;
  clear(ctx);
  Sel.select(ctx, SelType.TRANSIENT, start, end, false);
  return true;
}

export function beacon(ctx: Ctx): void {
  const { port, st } = ctx;
  const g = st.grab;
  if (!g || g.end <= g.start) return;
  const sel = Sel.primary(ctx);
  if (!Sel.hasSelection(sel)) return;
  const ss = Math.min(sel.anchor, sel.active);
  const se = Math.max(sel.anchor, sel.active);
  if (ss < g.start || se > g.end || se === ss) return;
  const text = port.getText();
  const sels: SelRange[] = [];
  switch (st.selType) {
    case SelType.WORD:
    case SelType.SYMBOL:
    case SelType.VISIT:
    case SelType.FIND:
    case SelType.TILL:
    case SelType.CHAR: {
      const selText = text.slice(ss, se);
      if (selText.trim() === '') return;
      const bounded =
        st.selType === SelType.WORD || st.selType === SelType.SYMBOL;
      const re = new RegExp(
        bounded ? `\\b${escapeRegExp(selText)}\\b` : escapeRegExp(selText),
        'g',
      );
      const region = text.slice(g.start, g.end);
      let added = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(region)) !== null) {
        if (m[0].length === 0) {
          re.lastIndex++;
          continue;
        }
        const s0 = g.start + m.index;
        const e0 = s0 + m[0].length;
        if (s0 !== ss) {
          sels.push({ anchor: s0, active: e0 });
          if (++added >= MAX_GRAB_SYNC_MATCHES) break;
        }
      }
      if (sels.length === 0) return;
      sels.unshift({ anchor: ss, active: se });
      break;
    }
    case SelType.LINE: {
      const first = lineOfOffset(text, g.start);
      const last = lineOfOffset(text, Math.max(g.end - 1, g.start));
      if (last <= first) return;
      for (let ln = first; ln <= last; ln++) {
        sels.push({ anchor: lineStart(text, ln), active: lineEnd(text, ln) });
      }
      break;
    }
    default:
      return;
  }
  port.setSelections(sels);
}
