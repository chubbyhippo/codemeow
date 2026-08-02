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
import {
  Words,
  charPred,
  isBlank,
  lineEnd,
  lineOfOffset,
  lineStart,
} from './text';
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
  ['open-line', (ctx: Ctx) => openLine(ctx)],
  ['delete-horizontal-space', (ctx: Ctx) => horizontalSpace(ctx, '')],
  ['just-one-space', (ctx: Ctx) => horizontalSpace(ctx, ' ')],
]);

type CaseOp = 'upcase' | 'downcase' | 'capitalize';

type CaretEdit = { edit: TextEdit | null; sel: SelRange };
type CaretCompute = (sel: SelRange) => CaretEdit;

async function editCarets(ctx: Ctx, compute: CaretCompute): Promise<void> {
  const sels = ctx.port.getSelections();
  const planned = sels
    .map((sel, index) => ({ sel, index, selStart: Sel.selStart(sel) }))
    .sort((a, b) => b.selStart - a.selStart)
    .map(({ sel, index }) => ({ index, computed: compute(sel) }));
  const edits = planned.flatMap(({ computed }) =>
    computed.edit === null ? [] : [computed.edit],
  );
  const newSels: SelRange[] = [...sels];
  let delta = 0;
  for (const { index, computed } of [...planned].reverse()) {
    newSels[index] = {
      anchor: computed.sel.anchor + delta,
      active: computed.sel.active + delta,
    };
    const { edit } = computed;
    if (edit) delta += edit.text.length - (edit.end - edit.start);
  }
  Grab.adjustForEdits(ctx.state, edits);
  if (edits.length > 0) await ctx.port.edit(edits);
  ctx.port.setSelections(newSels);
}

function insert(ctx: Ctx): void {
  ctx.port.setSelections(
    ctx.port.getSelections().map((sel) => {
      const start = Sel.selStart(sel);
      return { anchor: start, active: start };
    }),
  );
  ctx.state.selType = SelType.NONE;
  Sel.resetSelectionMemory(ctx.state);
  setMode(ctx, MeowMode.INSERT);
}

function append(ctx: Ctx): void {
  ctx.port.setSelections(
    ctx.port.getSelections().map((sel) => {
      const end = Sel.selEnd(sel);
      return { anchor: end, active: end };
    }),
  );
  ctx.state.selType = SelType.NONE;
  Sel.resetSelectionMemory(ctx.state);
  setMode(ctx, MeowMode.INSERT);
}

async function openBelow(ctx: Ctx): Promise<void> {
  if (blockedReadOnly(ctx)) return;
  Sel.collapse(ctx);
  const text = ctx.port.getText();
  const eol = lineEnd(text, lineOfOffset(text, Sel.primary(ctx).active));
  const edits = [{ start: eol, end: eol, text: '\n' }];
  Grab.adjustForEdits(ctx.state, edits);
  await ctx.port.edit(edits);
  ctx.port.setSelections([{ anchor: eol + 1, active: eol + 1 }]);
  setMode(ctx, MeowMode.INSERT);
}

async function openLine(ctx: Ctx): Promise<void> {
  if (blockedReadOnly(ctx)) return;
  Sel.collapse(ctx);
  const at = Sel.primary(ctx).active;
  const edits = [{ start: at, end: at, text: '\n' }];
  Grab.adjustForEdits(ctx.state, edits);
  await ctx.port.edit(edits);
  ctx.port.setSelections([{ anchor: at, active: at }]);
}

async function horizontalSpace(ctx: Ctx, replacement: string): Promise<void> {
  if (blockedReadOnly(ctx)) return;
  Sel.collapse(ctx);
  const text = ctx.port.getText();
  const at = Sel.primary(ctx).active;
  let from = at;
  while (from > 0 && isBlank(text.charAt(from - 1))) from--;
  let to = at;
  while (to < text.length && isBlank(text.charAt(to))) to++;
  if (from === to && replacement === '') return;
  const edits = [{ start: from, end: to, text: replacement }];
  Grab.adjustForEdits(ctx.state, edits);
  await ctx.port.edit(edits);
  const caret = from + replacement.length;
  ctx.port.setSelections([{ anchor: caret, active: caret }]);
}

async function openAbove(ctx: Ctx): Promise<void> {
  if (blockedReadOnly(ctx)) return;
  Sel.collapse(ctx);
  const text = ctx.port.getText();
  const bol = lineStart(text, lineOfOffset(text, Sel.primary(ctx).active));
  const edits = [{ start: bol, end: bol, text: '\n' }];
  Grab.adjustForEdits(ctx.state, edits);
  await ctx.port.edit(edits);
  ctx.port.setSelections([{ anchor: bol, active: bol }]);
  setMode(ctx, MeowMode.INSERT);
}

function deleteForwardEdit(text: string): CaretCompute {
  return (sel) => {
    const start = Sel.selStart(sel);
    const collapsed = { anchor: start, active: start };
    if (Sel.hasSelection(sel))
      return {
        edit: { start, end: Sel.selEnd(sel), text: '' },
        sel: collapsed,
      };
    if (start < text.length)
      return {
        edit: { start, end: start + 1, text: '' },
        sel: collapsed,
      };
    return { edit: null, sel: collapsed };
  };
}

async function change(ctx: Ctx): Promise<void> {
  if (!allowModify(ctx)) return;
  const text = ctx.port.getText();
  const prim = Sel.primary(ctx);
  if (!Sel.hasSelection(prim) && prim.active >= text.length) return;
  await editCarets(ctx, deleteForwardEdit(text));
  ctx.state.selType = SelType.NONE;
  setMode(ctx, MeowMode.INSERT);
}

async function del(ctx: Ctx): Promise<void> {
  if (blockedReadOnly(ctx)) return;
  const text = ctx.port.getText();
  await editCarets(ctx, deleteForwardEdit(text));
  ctx.state.selType = SelType.NONE;
}

async function backwardDelete(ctx: Ctx): Promise<void> {
  if (!allowModify(ctx)) return;
  await editCarets(ctx, (sel) => {
    const start = Sel.selStart(sel);
    if (Sel.hasSelection(sel))
      return {
        edit: { start, end: Sel.selEnd(sel), text: '' },
        sel: { anchor: start, active: start },
      };
    if (start > 0)
      return {
        edit: { start: start - 1, end: start, text: '' },
        sel: { anchor: start - 1, active: start - 1 },
      };
    return { edit: null, sel: { anchor: start, active: start } };
  });
  ctx.state.selType = SelType.NONE;
}

function killRange(
  ctx: Ctx,
  sel: SelRange,
  text: string,
): { start: number; end: number } {
  const start = Sel.selStart(sel);
  let end = Sel.selEnd(sel);
  if (
    ctx.state.selType === SelType.LINE &&
    sel.active >= sel.anchor &&
    end < text.length
  ) {
    if (text.charAt(end) === '\r') end++;
    if (end < text.length && text.charAt(end) === '\n') end++;
  }
  return { start, end };
}

function regionsInOrder(sels: SelRange[]): SelRange[] {
  return sels
    .filter((sel) => sel.anchor !== sel.active)
    .sort((left, right) => Sel.selStart(left) - Sel.selStart(right));
}

function joinedKillText(ctx: Ctx, text: string, regions: SelRange[]): string {
  return regions
    .map((sel) => {
      const killed = killRange(ctx, sel, text);
      return text.slice(killed.start, killed.end);
    })
    .join('\n');
}

async function kill(ctx: Ctx): Promise<void> {
  if (!allowModify(ctx)) return;
  const state = ctx.state;
  const text = ctx.port.getText();
  const prim = Sel.primary(ctx);
  if (state.selType === SelType.JOIN && Sel.hasSelection(prim)) {
    await joinKill(ctx);
    return;
  }
  if (Sel.hasSelection(prim)) {
    await ctx.clipboard.write(
      joinedKillText(ctx, text, regionsInOrder(ctx.port.getSelections())),
    );
    await editCarets(ctx, (sel) => {
      if (!Sel.hasSelection(sel)) return { edit: null, sel };
      const killed = killRange(ctx, sel, text);
      return {
        edit: { start: killed.start, end: killed.end, text: '' },
        sel: { anchor: killed.start, active: killed.start },
      };
    });
    state.selType = SelType.NONE;
    return;
  }
  if (text.length === 0) return;
  const caret = prim.active;
  const line = lineOfOffset(text, caret);
  const eol = lineEnd(text, line);
  const end = caret === eol ? lineStart(text, line + 1) : eol;
  if (end > caret) {
    await ctx.clipboard.write(text.slice(caret, end));
    const edits = [{ start: caret, end, text: '' }];
    Grab.adjustForEdits(state, edits);
    await ctx.port.edit(edits);
    ctx.port.setSelections([{ anchor: caret, active: caret }]);
  }
}

async function joinKill(ctx: Ctx): Promise<void> {
  const text = ctx.port.getText();
  const prim = Sel.primary(ctx);
  const start = Sel.selStart(prim);
  const end = Sel.selEnd(prim);
  const before = start > 0 ? text.charAt(start - 1) : '\n';
  const after = end < text.length ? text.charAt(end) : '\n';
  const space =
    before !== '\n' &&
    after !== '\n' &&
    !/\s/.test(before) &&
    !/\s/.test(after) &&
    !')]}.,;:'.includes(after) &&
    !'([{'.includes(before);
  const edits = [{ start, end, text: space ? ' ' : '' }];
  Grab.adjustForEdits(ctx.state, edits);
  await ctx.port.edit(edits);
  ctx.port.setSelections([{ anchor: start, active: start }]);
  ctx.state.selType = SelType.NONE;
  ctx.state.selExpand = false;
}

async function save(ctx: Ctx): Promise<void> {
  const text = ctx.port.getText();
  const sels = ctx.port.getSelections();
  const withSel = regionsInOrder(sels);
  if (withSel.length === 0) return;
  await ctx.clipboard.write(joinedKillText(ctx, text, withSel));
  ctx.port.setSelections(
    sels.map((sel) => {
      if (sel.anchor === sel.active) return sel;
      const saved = killRange(ctx, sel, text);
      const caret = sel.active >= sel.anchor ? saved.end : saved.start;
      return { anchor: caret, active: caret };
    }),
  );
  ctx.state.selType = SelType.NONE;
  ctx.state.selExpand = false;
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
  await editCarets(ctx, (sel) => {
    if (!Sel.hasSelection(sel)) return { edit: null, sel };
    const start = Sel.selStart(sel);
    const caret = start + clip.length;
    return {
      edit: { start, end: Sel.selEnd(sel), text: clip },
      sel: { anchor: caret, active: caret },
    };
  });
  ctx.state.selType = SelType.NONE;
}

function casified(slice: string, op: CaseOp): string {
  if (op === 'upcase') return slice.toUpperCase();
  if (op === 'downcase') return slice.toLowerCase();
  return capitalizedWords(slice);
}

function capitalizedWords(slice: string): string {
  const isWord = charPred(false);
  let out = '';
  let inWord = false;
  for (const char of slice) {
    if (isWord(char)) {
      out += inWord ? char.toLowerCase() : char.toUpperCase();
      inWord = true;
    } else {
      out += char;
      inWord = false;
    }
  }
  return out;
}

async function caseWord(ctx: Ctx, op: CaseOp): Promise<void> {
  if (blockedReadOnly(ctx)) return;
  const count = ctx.state.takeCount(1);
  if (count === 0) return;
  const hadSelection = Sel.hasSelection(Sel.primary(ctx));
  const text = ctx.port.getText();
  const isWord = charPred(false);
  await editCarets(ctx, (sel) => {
    const from = sel.active;
    const target =
      count > 0
        ? Words.nextEnd(text, from, count, isWord)
        : Words.prevStart(text, from, -count, isWord);
    const start = Math.min(from, target);
    const end = Math.max(from, target);
    if (start === end) return { edit: null, sel };
    const caret = count > 0 ? end : from;
    return {
      edit: { start, end, text: casified(text.slice(start, end), op) },
      sel: { anchor: caret, active: caret },
    };
  });
  if (hadSelection) Sel.collapse(ctx);
}

async function killWord(ctx: Ctx): Promise<void> {
  if (blockedReadOnly(ctx)) return;
  const count = ctx.state.takeCount(1);
  if (count === 0) return;
  const text = ctx.port.getText();
  const isWord = charPred(false);
  const rangeAt = (from: number): { start: number; end: number } => {
    const target =
      count > 0
        ? Words.nextEnd(text, from, count, isWord)
        : Words.prevStart(text, from, -count, isWord);
    return { start: Math.min(from, target), end: Math.max(from, target) };
  };
  const killed = ctx.port
    .getSelections()
    .map((sel) => rangeAt(sel.active))
    .filter((range) => range.start !== range.end)
    .sort((left, right) => left.start - right.start);
  if (killed.length === 0) return;
  await ctx.clipboard.write(
    killed.map((range) => text.slice(range.start, range.end)).join('\n'),
  );
  await editCarets(ctx, (sel) => {
    const range = rangeAt(sel.active);
    if (range.start === range.end)
      return { edit: null, sel: { anchor: sel.active, active: sel.active } };
    return {
      edit: { start: range.start, end: range.end, text: '' },
      sel: { anchor: range.start, active: range.start },
    };
  });
  ctx.state.selType = SelType.NONE;
  ctx.state.selExpand = false;
}

async function undo(ctx: Ctx): Promise<void> {
  if (Sel.hasSelection(Sel.primary(ctx))) Sel.cancel(ctx);
  await ctx.port.undo();
}

async function undoInSelection(ctx: Ctx): Promise<void> {
  if (Sel.hasSelection(Sel.primary(ctx))) await ctx.port.undo();
}
