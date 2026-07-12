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
import { MeowMode, SelType } from './state';
import { setMode } from './port';
import { charPred, lineEnd, lineOfOffset, lineStart, Words } from './text';
import { MeowCommand } from './command';
import * as Sel from './selections';
import * as Grab from './grab';

function allowModify(ctx: Ctx): boolean {
  return ctx.port.isWritable();
}

export function blockedReadOnly(ctx: Ctx): boolean {
  if (allowModify(ctx)) return false;
  ctx.ui.hint('Buffer is read-only');
  return true;
}

export const commands: Map<string, MeowCommand> = new Map([
  ['meow-insert', (ctx: Ctx) => insert(ctx)],
  ['meow-append', (ctx: Ctx) => append(ctx)],
  ['meow-open-above', (ctx: Ctx) => openAbove(ctx)],
  ['meow-open-below', (ctx: Ctx) => openBelow(ctx)],
  ['meow-change', (ctx: Ctx) => change(ctx)],
  ['meow-delete', (ctx: Ctx) => del(ctx)],
  ['meow-backward-delete', (ctx: Ctx) => backwardDelete(ctx)],
  ['meow-kill', (ctx: Ctx) => kill(ctx)],
  ['meow-save', (ctx: Ctx) => save(ctx)],
  ['meow-yank', (ctx: Ctx) => yank(ctx)],
  ['meow-replace', (ctx: Ctx) => replace(ctx)],
  ['meow-undo', (ctx: Ctx) => undo(ctx)],
  ['meow-undo-in-selection', (ctx: Ctx) => undoInSelection(ctx)],
  ['upcase-word', (ctx: Ctx) => caseWord(ctx, 'upcase')],
  ['downcase-word', (ctx: Ctx) => caseWord(ctx, 'downcase')],
  ['capitalize-word', (ctx: Ctx) => caseWord(ctx, 'capitalize')],
  ['kill-word', (ctx: Ctx) => killWord(ctx)],
]);

type CaseOp = 'upcase' | 'downcase' | 'capitalize';

async function editCarets(
  ctx: Ctx,
  compute: (
    sel: SelRange,
    lo: number,
    hi: number,
  ) => { edit: TextEdit | null; sel: SelRange },
): Promise<void> {
  const sels = ctx.port.getSelections();
  const order = sels
    .map((sel, index) => ({ sel, index, lo: Math.min(sel.anchor, sel.active) }))
    .sort((a, b) => b.lo - a.lo);
  const edits: TextEdit[] = [];
  const results = new Array<{ edit: TextEdit | null; sel: SelRange }>(
    sels.length,
  );
  for (const item of order) {
    const hi = Math.max(item.sel.anchor, item.sel.active);
    const r = compute(item.sel, item.lo, hi);
    if (r.edit) edits.push(r.edit);
    results[item.index] = r;
  }
  const newSels = new Array<SelRange>(sels.length);
  let delta = 0;
  for (const item of [...order].reverse()) {
    const r = results[item.index];
    newSels[item.index] = {
      anchor: r.sel.anchor + delta,
      active: r.sel.active + delta,
    };
    if (r.edit) delta += r.edit.text.length - (r.edit.end - r.edit.start);
  }
  Grab.adjustForEdits(ctx.st, edits);
  if (edits.length > 0) await ctx.port.edit(edits);
  ctx.port.setSelections(newSels);
}

function insert(ctx: Ctx): void {
  ctx.port.setSelections(
    ctx.port.getSelections().map((s) => {
      const o = Math.min(s.anchor, s.active);
      return { anchor: o, active: o };
    }),
  );
  ctx.st.selType = SelType.NONE;
  Sel.resetSelectionMemory(ctx.st);
  setMode(ctx, MeowMode.INSERT);
}

function append(ctx: Ctx): void {
  ctx.port.setSelections(
    ctx.port.getSelections().map((s) => {
      const o = Math.max(s.anchor, s.active);
      return { anchor: o, active: o };
    }),
  );
  ctx.st.selType = SelType.NONE;
  Sel.resetSelectionMemory(ctx.st);
  setMode(ctx, MeowMode.INSERT);
}

async function openBelow(ctx: Ctx): Promise<void> {
  if (blockedReadOnly(ctx)) return;
  Sel.collapse(ctx);
  const text = ctx.port.getText();
  const eol = lineEnd(text, lineOfOffset(text, Sel.primary(ctx).active));
  const edits = [{ start: eol, end: eol, text: '\n' }];
  Grab.adjustForEdits(ctx.st, edits);
  await ctx.port.edit(edits);
  ctx.port.setSelections([{ anchor: eol + 1, active: eol + 1 }]);
  setMode(ctx, MeowMode.INSERT);
}

async function openAbove(ctx: Ctx): Promise<void> {
  if (blockedReadOnly(ctx)) return;
  Sel.collapse(ctx);
  const text = ctx.port.getText();
  const bol = lineStart(text, lineOfOffset(text, Sel.primary(ctx).active));
  const edits = [{ start: bol, end: bol, text: '\n' }];
  Grab.adjustForEdits(ctx.st, edits);
  await ctx.port.edit(edits);
  ctx.port.setSelections([{ anchor: bol, active: bol }]);
  setMode(ctx, MeowMode.INSERT);
}

async function change(ctx: Ctx): Promise<void> {
  if (!allowModify(ctx)) return;
  const text = ctx.port.getText();
  const prim = Sel.primary(ctx);
  if (!Sel.hasSelection(prim) && prim.active >= text.length) return;
  await editCarets(ctx, (_sel, lo, hi) => {
    if (lo !== hi)
      return {
        edit: { start: lo, end: hi, text: '' },
        sel: { anchor: lo, active: lo },
      };
    if (lo < text.length) {
      return {
        edit: { start: lo, end: lo + 1, text: '' },
        sel: { anchor: lo, active: lo },
      };
    }
    return { edit: null, sel: { anchor: lo, active: lo } };
  });
  ctx.st.selType = SelType.NONE;
  setMode(ctx, MeowMode.INSERT);
}

async function del(ctx: Ctx): Promise<void> {
  if (blockedReadOnly(ctx)) return;
  const text = ctx.port.getText();
  await editCarets(ctx, (_sel, lo, hi) => {
    if (lo !== hi)
      return {
        edit: { start: lo, end: hi, text: '' },
        sel: { anchor: lo, active: lo },
      };
    if (lo < text.length)
      return {
        edit: { start: lo, end: lo + 1, text: '' },
        sel: { anchor: lo, active: lo },
      };
    return { edit: null, sel: { anchor: lo, active: lo } };
  });
  ctx.st.selType = SelType.NONE;
}

async function backwardDelete(ctx: Ctx): Promise<void> {
  if (!allowModify(ctx)) return;
  await editCarets(ctx, (_sel, lo, hi) => {
    if (lo !== hi)
      return {
        edit: { start: lo, end: hi, text: '' },
        sel: { anchor: lo, active: lo },
      };
    if (lo > 0)
      return {
        edit: { start: lo - 1, end: lo, text: '' },
        sel: { anchor: lo - 1, active: lo - 1 },
      };
    return { edit: null, sel: { anchor: lo, active: lo } };
  });
  ctx.st.selType = SelType.NONE;
}

function killRange(
  ctx: Ctx,
  sel: SelRange,
  textLen: number,
): { lo: number; hi: number } {
  const lo = Math.min(sel.anchor, sel.active);
  let hi = Math.max(sel.anchor, sel.active);
  if (
    ctx.st.selType === SelType.LINE &&
    sel.active >= sel.anchor &&
    hi < textLen
  )
    hi++;
  return { lo, hi };
}

function regionsInOrder(sels: SelRange[]): SelRange[] {
  return sels
    .filter((s) => s.anchor !== s.active)
    .sort(
      (a, b) => Math.min(a.anchor, a.active) - Math.min(b.anchor, b.active),
    );
}

function joinedKillText(ctx: Ctx, text: string, regions: SelRange[]): string {
  return regions
    .map((s) => {
      const r = killRange(ctx, s, text.length);
      return text.slice(r.lo, r.hi);
    })
    .join('\n');
}

async function kill(ctx: Ctx): Promise<void> {
  if (!allowModify(ctx)) return;
  const st = ctx.st;
  const text = ctx.port.getText();
  const prim = Sel.primary(ctx);
  if (st.selType === SelType.JOIN && Sel.hasSelection(prim)) {
    await joinKill(ctx);
    return;
  }
  if (Sel.hasSelection(prim)) {
    await ctx.clipboard.write(
      joinedKillText(ctx, text, regionsInOrder(ctx.port.getSelections())),
    );
    await editCarets(ctx, (sel, lo, hi) => {
      if (lo === hi) return { edit: null, sel };
      const r = killRange(ctx, sel, text.length);
      return {
        edit: { start: r.lo, end: r.hi, text: '' },
        sel: { anchor: r.lo, active: r.lo },
      };
    });
    st.selType = SelType.NONE;
    return;
  }
  if (text.length === 0) return;
  const caret = prim.active;
  const eol = lineEnd(text, lineOfOffset(text, caret));
  const end = caret === eol ? Math.min(eol + 1, text.length) : eol;
  if (end > caret) {
    await ctx.clipboard.write(text.slice(caret, end));
    const edits = [{ start: caret, end, text: '' }];
    Grab.adjustForEdits(st, edits);
    await ctx.port.edit(edits);
    ctx.port.setSelections([{ anchor: caret, active: caret }]);
  }
}

async function joinKill(ctx: Ctx): Promise<void> {
  const text = ctx.port.getText();
  const prim = Sel.primary(ctx);
  const s = Math.min(prim.anchor, prim.active);
  const e = Math.max(prim.anchor, prim.active);
  const before = s > 0 ? text[s - 1] : '\n';
  const after = e < text.length ? text[e] : '\n';
  const space =
    before !== '\n' &&
    after !== '\n' &&
    !/\s/.test(before) &&
    !/\s/.test(after) &&
    !')]}.,;:'.includes(after) &&
    !'([{'.includes(before);
  const edits = [{ start: s, end: e, text: space ? ' ' : '' }];
  Grab.adjustForEdits(ctx.st, edits);
  await ctx.port.edit(edits);
  ctx.port.setSelections([{ anchor: s, active: s }]);
  ctx.st.selType = SelType.NONE;
  ctx.st.selExpand = false;
}

async function save(ctx: Ctx): Promise<void> {
  const text = ctx.port.getText();
  const sels = ctx.port.getSelections();
  const withSel = regionsInOrder(sels);
  if (withSel.length === 0) return;
  await ctx.clipboard.write(joinedKillText(ctx, text, withSel));
  ctx.port.setSelections(
    sels.map((s) => {
      if (s.anchor === s.active) return s;
      const r = killRange(ctx, s, text.length);
      const caret = s.active >= s.anchor ? r.hi : r.lo;
      return { anchor: caret, active: caret };
    }),
  );
  ctx.st.selType = SelType.NONE;
  ctx.st.selExpand = false;
}

async function yank(ctx: Ctx): Promise<void> {
  if (blockedReadOnly(ctx)) return;
  const clip = await ctx.clipboard.read();
  if (clip === undefined || clip === '') return;
  await editCarets(ctx, (sel) => ({
    edit: { start: sel.active, end: sel.active, text: clip },
    sel: { anchor: sel.active + clip.length, active: sel.active + clip.length },
  }));
}

async function replace(ctx: Ctx): Promise<void> {
  if (!allowModify(ctx)) return;
  if (!Sel.hasSelection(Sel.primary(ctx))) return;
  const raw = await ctx.clipboard.read();
  if (raw === undefined) return;
  const clip = raw.replace(/\n+$/, '');
  await editCarets(ctx, (sel, lo, hi) =>
    lo === hi
      ? { edit: null, sel }
      : {
          edit: { start: lo, end: hi, text: clip },
          sel: { anchor: lo + clip.length, active: lo + clip.length },
        },
  );
  ctx.st.selType = SelType.NONE;
}

function casified(slice: string, op: CaseOp): string {
  if (op === 'upcase') return slice.toUpperCase();
  if (op === 'downcase') return slice.toLowerCase();
  return capitalizedWords(slice);
}

function capitalizedWords(slice: string): string {
  const pred = charPred(false);
  let out = '';
  let inWord = false;
  for (const c of slice) {
    if (pred(c)) {
      out += inWord ? c.toLowerCase() : c.toUpperCase();
      inWord = true;
    } else {
      out += c;
      inWord = false;
    }
  }
  return out;
}

async function caseWord(ctx: Ctx, op: CaseOp): Promise<void> {
  if (blockedReadOnly(ctx)) return;
  const n = ctx.st.takeCount(1);
  if (n === 0) return;
  const hadSelection = Sel.hasSelection(Sel.primary(ctx));
  const text = ctx.port.getText();
  const pred = charPred(false);
  await editCarets(ctx, (sel) => {
    const from = sel.active;
    const target =
      n > 0
        ? Words.nextEnd(text, from, n, pred)
        : Words.prevStart(text, from, -n, pred);
    const s = Math.min(from, target);
    const e = Math.max(from, target);
    if (s === e) return { edit: null, sel };
    const caret = n > 0 ? e : from;
    return {
      edit: { start: s, end: e, text: casified(text.slice(s, e), op) },
      sel: { anchor: caret, active: caret },
    };
  });
  if (hadSelection) Sel.collapse(ctx);
}

async function killWord(ctx: Ctx): Promise<void> {
  if (blockedReadOnly(ctx)) return;
  const n = ctx.st.takeCount(1);
  if (n === 0) return;
  const text = ctx.port.getText();
  const pred = charPred(false);
  const rangeAt = (from: number): { lo: number; hi: number } => {
    const target =
      n > 0
        ? Words.nextEnd(text, from, n, pred)
        : Words.prevStart(text, from, -n, pred);
    return { lo: Math.min(from, target), hi: Math.max(from, target) };
  };
  const killed = ctx.port
    .getSelections()
    .map((sel) => rangeAt(sel.active))
    .filter((r) => r.lo !== r.hi)
    .sort((a, b) => a.lo - b.lo);
  if (killed.length === 0) return;
  await ctx.clipboard.write(
    killed.map((r) => text.slice(r.lo, r.hi)).join('\n'),
  );
  await editCarets(ctx, (sel) => {
    const r = rangeAt(sel.active);
    if (r.lo === r.hi)
      return { edit: null, sel: { anchor: sel.active, active: sel.active } };
    return {
      edit: { start: r.lo, end: r.hi, text: '' },
      sel: { anchor: r.lo, active: r.lo },
    };
  });
  ctx.st.selType = SelType.NONE;
  ctx.st.selExpand = false;
}

async function undo(ctx: Ctx): Promise<void> {
  if (Sel.hasSelection(Sel.primary(ctx))) Sel.cancel(ctx);
  await ctx.port.undo();
}

async function undoInSelection(ctx: Ctx): Promise<void> {
  if (Sel.hasSelection(Sel.primary(ctx))) await ctx.port.undo();
}
