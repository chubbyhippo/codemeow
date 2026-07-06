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
import { lineCount, lineEnd, lineOfOffset, lineStart } from './text';
import { Things } from './things';
import { MeowCommand } from './command';
import * as Sel from './selections';

/**
 * Structural selections: the char-thing table behind `, . [ ]` (see Things),
 * bracket blocks (meow-block / meow-to-block), and the join region
 * (meow-join). The thing commands park a [Pending] key and let the dispatcher
 * hand the thing char to [thingSelect].
 */

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
  ctx.st.pending = p;
  ctx.ui.scheduleWhichKey('things', '');
}

/** The second half of the thing commands, once the thing char arrives. */
export async function thingSelect(ctx: Ctx, kind: Pending, ch: string): Promise<void> {
  const off = Sel.primary(ctx).active;
  const b = kind === Pending.BOUNDS
    ? await Things.bounds(ctx, ch, off)
    : await Things.inner(ctx, ch, off);
  if (!b) { ctx.ui.hint(`No thing '${ch}' here`); return; }
  switch (kind) {
    case Pending.INNER:
      Sel.select(ctx, SelType.TRANSIENT, b.start, b.end, false);
      break;
    case Pending.BOUNDS:
      // meow-thing-selection-directions: bounds select BACKWARD (caret at
      // the opening delimiter), inner forward — verified by probe
      Sel.select(ctx, SelType.TRANSIENT, b.end, b.start, false);
      break;
    case Pending.BEGIN:
      Sel.select(ctx, SelType.TRANSIENT, off, b.start, false);
      break;
    case Pending.END:
      Sel.select(ctx, SelType.TRANSIENT, off, b.end, false);
      break;
    default:
      break;
  }
}

// ------------------------------------------------------------------ blocks

interface PairRange { open: number; close: number }

/**
 * Smallest bracket pair strictly enclosing [s, e). Same-line quoted runs
 * are skipped — a text approximation of syntax-ppss.
 */
function enclosingPair(text: string, s: number, e: number): PairRange | null {
  const opens = '([{';
  const closes = ')]}';
  const stack: number[] = [];
  let best: PairRange | null = null;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < text.length && text[j] !== c && text[j] !== '\n') {
        if (text[j] === '\\') j++;
        j++;
      }
      if (j < text.length && text[j] === c) { i = j + 1; continue; }
    }
    if (opens.includes(c)) {
      stack.push(i);
    } else if (closes.includes(c)) {
      const kind = closes.indexOf(c);
      while (stack.length > 0) {
        const o = stack.pop()!;
        if (opens.indexOf(text[o]) === kind) {
          if (o < s && i + 1 >= e && (best === null || i - o < best.close - best.open)) {
            best = { open: o, close: i };
          }
          break;
        }
      }
    }
    i++;
  }
  return best;
}

/** meow-block: innermost pair INCLUDING delimiters; with an active block
 *  selection it expands to the parent. Backward (caret at the opening
 *  delimiter) when the region is reversed XOR a negative argument. */
function block(ctx: Ctx): void {
  const text = ctx.port.getText();
  const sel = Sel.primary(ctx);
  const active = ctx.st.selType === SelType.BLOCK && Sel.hasSelection(sel);
  const back = Sel.backwardP(ctx) !== (ctx.st.takeCount(1) < 0); // xor, like meow-block
  const s = active ? Math.min(sel.anchor, sel.active) : sel.active;
  const e = active ? Math.max(sel.anchor, sel.active) : sel.active;
  const p = enclosingPair(text, s, e);
  if (!p) { ctx.ui.hint('No enclosing block'); return; }
  if (back) Sel.select(ctx, SelType.BLOCK, p.close + 1, p.open, true);
  else Sel.select(ctx, SelType.BLOCK, p.open, p.close + 1, true);
}

/** meow-to-block: from point to the closing delimiter of the enclosing block
 *  (to the opening one when the block selection is reversed or the argument
 *  is negative). */
function toBlock(ctx: Ctx): void {
  const text = ctx.port.getText();
  const back = (ctx.st.selType === SelType.BLOCK && Sel.backwardP(ctx)) || ctx.st.takeCount(1) < 0;
  const caret = Sel.primary(ctx).active;
  const p = enclosingPair(text, caret, caret);
  if (!p) { ctx.ui.hint('No enclosing block'); return; }
  Sel.select(ctx, SelType.BLOCK, caret, back ? p.open : p.close + 1, true);
}

// -------------------------------------------------------------------- join

/** meow-join: select (expand . join) — end of the previous non-empty line
 *  through this line's indentation (forward variant with a negative arg);
 *  killing that selection is delete-indentation (see edits.joinKill). */
function join(ctx: Ctx): void {
  const text = ctx.port.getText();
  if (text.length === 0) return;
  const n = ctx.st.takeCount(1);
  const blank = (l: number) => text.slice(lineStart(text, l), lineEnd(text, l)).trim() === '';
  const ln = lineOfOffset(text, Sel.primary(ctx).active);
  if (n >= 0) {
    let pl = ln - 1;
    while (pl >= 0 && blank(pl)) pl--;
    if (pl < 0) return;
    const m = lineEnd(text, pl);
    let p = lineStart(text, ln);
    const eol = lineEnd(text, ln);
    while (p < eol && /\s/.test(text[p])) p++;
    Sel.select(ctx, SelType.JOIN, m, p, true);
  } else {
    const last = lineCount(text) - 1;
    let nl = ln + 1;
    while (nl <= last && blank(nl)) nl++;
    if (nl > last) return;
    const m = lineEnd(text, ln);
    let p = lineStart(text, nl);
    const eol = lineEnd(text, nl);
    while (p < eol && /\s/.test(text[p])) p++;
    Sel.select(ctx, SelType.JOIN, m, p, true);
  }
}
