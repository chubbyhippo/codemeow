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
import { lineEnd, lineOfOffset, lineStart } from './text';
import { MeowCommand } from './command';
import * as Sel from './selections';
import * as GrabMod from './grab';

/**
 * Text-mutating commands: entering INSERT (insert/append/open above/below),
 * change, delete, kill with meow's kill-line and join fallbacks, save / yank /
 * replace against the clipboard kill-ring, and undo. Multi-cursor edits are
 * computed against the cursors in descending offset order so beacon editing
 * never invalidates the offsets still to come.
 */

/**
 * meow--allow-modify-p (meow-util.el): read-only buffers keep the full
 * NORMAL layout, but the text-changing commands are inert. meow gates
 * kill/change/backspace/replace into SILENT no-ops; delete/yank/open (and
 * swap-grab) instead fail with Emacs' "Buffer is read-only" error —
 * surfaced here as a hint.
 */
export function allowModify(ctx: Ctx): boolean {
  return ctx.port.isWritable();
}

/** @return true when the edit must be blocked — telling the user why. */
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
]);

/** One undo step over every cursor, highest offset first: [compute] receives
 *  a selection and returns its edit (or null) plus the cursor's new range.
 *  Descending order keeps every not-yet-processed offset valid. */
async function editCarets(
  ctx: Ctx,
  compute: (sel: SelRange, lo: number, hi: number) => { edit: TextEdit | null; sel: SelRange },
): Promise<void> {
  const sels = ctx.port.getSelections();
  const order = sels
    .map((sel, index) => ({ sel, index, lo: Math.min(sel.anchor, sel.active) }))
    .sort((a, b) => b.lo - a.lo);
  const edits: TextEdit[] = [];
  const newSels: SelRange[] = new Array(sels.length);
  for (const item of order) {
    const hi = Math.max(item.sel.anchor, item.sel.active);
    const r = compute(item.sel, item.lo, hi);
    if (r.edit) edits.push(r.edit);
    newSels[item.index] = r.sel;
  }
  GrabMod.adjustForEdits(ctx.st, edits);
  if (edits.length > 0) await ctx.port.edit(edits);
  ctx.port.setSelections(newSels);
}

function insert(ctx: Ctx): void {
  ctx.port.setSelections(ctx.port.getSelections().map((s) => {
    const o = Math.min(s.anchor, s.active);
    return { anchor: o, active: o };
  }));
  ctx.st.selType = SelType.NONE;
  Sel.resetSelectionMemory(ctx.st); // meow-insert runs meow--cancel-selection
  setMode(ctx, MeowMode.INSERT);
}

function append(ctx: Ctx): void {
  ctx.port.setSelections(ctx.port.getSelections().map((s) => {
    const o = Math.max(s.anchor, s.active);
    return { anchor: o, active: o };
  }));
  ctx.st.selType = SelType.NONE;
  Sel.resetSelectionMemory(ctx.st); // meow-append runs meow--cancel-selection
  setMode(ctx, MeowMode.INSERT);
}

/** Open a line below the caret's line and enter INSERT there. */
async function openBelow(ctx: Ctx): Promise<void> {
  if (blockedReadOnly(ctx)) return;
  Sel.collapse(ctx); // meow-open-below never cancels, the RET just deactivates
  const text = ctx.port.getText();
  const eol = lineEnd(text, lineOfOffset(text, Sel.primary(ctx).active));
  const edits = [{ start: eol, end: eol, text: '\n' }];
  GrabMod.adjustForEdits(ctx.st, edits);
  await ctx.port.edit(edits);
  ctx.port.setSelections([{ anchor: eol + 1, active: eol + 1 }]);
  setMode(ctx, MeowMode.INSERT);
}

/** Open a line above the caret's line and enter INSERT there. */
async function openAbove(ctx: Ctx): Promise<void> {
  if (blockedReadOnly(ctx)) return;
  Sel.collapse(ctx); // as in openBelow: no history clearing
  const text = ctx.port.getText();
  const bol = lineStart(text, lineOfOffset(text, Sel.primary(ctx).active));
  const edits = [{ start: bol, end: bol, text: '\n' }];
  GrabMod.adjustForEdits(ctx.st, edits);
  await ctx.port.edit(edits);
  ctx.port.setSelections([{ anchor: bol, active: bol }]);
  setMode(ctx, MeowMode.INSERT);
}

async function change(ctx: Ctx): Promise<void> {
  if (!allowModify(ctx)) return; // meow gates change silently
  const text = ctx.port.getText();
  const prim = Sel.primary(ctx);
  // fallback meow-change-char at point-max: nothing happens, not even INSERT
  if (!Sel.hasSelection(prim) && prim.active >= text.length) return;
  await editCarets(ctx, (sel, lo, hi) => {
    if (lo !== hi) return { edit: { start: lo, end: hi, text: '' }, sel: { anchor: lo, active: lo } };
    // fallback meow-change-char: delete-char takes ANY char, newlines included
    if (lo < text.length) {
      return { edit: { start: lo, end: lo + 1, text: '' }, sel: { anchor: lo, active: lo } };
    }
    return { edit: null, sel: { anchor: lo, active: lo } };
  });
  ctx.st.selType = SelType.NONE;
  setMode(ctx, MeowMode.INSERT);
}

async function del(ctx: Ctx): Promise<void> {
  if (blockedReadOnly(ctx)) return;
  const text = ctx.port.getText();
  await editCarets(ctx, (sel, lo, hi) => {
    if (lo !== hi) return { edit: { start: lo, end: hi, text: '' }, sel: { anchor: lo, active: lo } };
    if (lo < text.length) return { edit: { start: lo, end: lo + 1, text: '' }, sel: { anchor: lo, active: lo } };
    return { edit: null, sel: { anchor: lo, active: lo } };
  });
  ctx.st.selType = SelType.NONE;
}

async function backwardDelete(ctx: Ctx): Promise<void> {
  if (!allowModify(ctx)) return; // meow gates backspace silently
  await editCarets(ctx, (sel, lo, hi) => {
    if (lo !== hi) return { edit: { start: lo, end: hi, text: '' }, sel: { anchor: lo, active: lo } };
    if (lo > 0) return { edit: { start: lo - 1, end: lo, text: '' }, sel: { anchor: lo - 1, active: lo - 1 } };
    return { edit: null, sel: { anchor: lo, active: lo } };
  });
  ctx.st.selType = SelType.NONE;
}

/**
 * meow--prepare-region-for-kill (meow-util.el): the range one selection
 * contributes to a kill or save — a FORWARD line-type selection includes its
 * trailing newline. Backward selections and the last line kill as-is.
 * Probed against meow 1.5.0 itself (batch Emacs, 2026-07-06).
 */
function killRange(ctx: Ctx, sel: SelRange, textLen: number): { lo: number; hi: number } {
  const lo = Math.min(sel.anchor, sel.active);
  let hi = Math.max(sel.anchor, sel.active);
  if (ctx.st.selType === SelType.LINE && sel.active >= sel.anchor && hi < textLen) hi++;
  return { lo, hi };
}

async function kill(ctx: Ctx): Promise<void> {
  if (!allowModify(ctx)) return; // meow gates kill silently
  const st = ctx.st;
  const text = ctx.port.getText();
  const prim = Sel.primary(ctx);
  if (st.selType === SelType.JOIN && Sel.hasSelection(prim)) { await joinKill(ctx); return; }
  if (Sel.hasSelection(prim)) {
    // cut: the kill-ring is the clipboard; multi-cursor kills join with \n
    const sels = ctx.port.getSelections()
      .filter((s) => s.anchor !== s.active)
      .sort((a, b) => Math.min(a.anchor, a.active) - Math.min(b.anchor, b.active));
    const killed = sels
      .map((s) => { const r = killRange(ctx, s, text.length); return text.slice(r.lo, r.hi); })
      .join('\n');
    await ctx.clipboard.write(killed);
    await editCarets(ctx, (sel, lo, hi) => {
      if (lo === hi) return { edit: null, sel };
      const r = killRange(ctx, sel, text.length);
      return { edit: { start: r.lo, end: r.hi, text: '' }, sel: { anchor: r.lo, active: r.lo } };
    });
    st.selType = SelType.NONE;
    return;
  }
  // fallback meow-C-k: kill to end of line, or the newline when at eol
  if (text.length === 0) return;
  const caret = prim.active;
  const eol = lineEnd(text, lineOfOffset(text, caret));
  const end = caret === eol ? Math.min(eol + 1, text.length) : eol;
  if (end > caret) {
    await ctx.clipboard.write(text.slice(caret, end));
    const edits = [{ start: caret, end, text: '' }];
    GrabMod.adjustForEdits(st, edits);
    await ctx.port.edit(edits);
    ctx.port.setSelections([{ anchor: caret, active: caret }]);
  }
}

/** Killing a join selection = delete-indentation: single space, none at
 *  line edges or against brackets (Emacs' fixup-whitespace). */
async function joinKill(ctx: Ctx): Promise<void> {
  const text = ctx.port.getText();
  const prim = Sel.primary(ctx);
  const s = Math.min(prim.anchor, prim.active);
  const e = Math.max(prim.anchor, prim.active);
  const before = s > 0 ? text[s - 1] : '\n';
  const after = e < text.length ? text[e] : '\n';
  const space =
    before !== '\n' && after !== '\n' &&
    !/\s/.test(before) && !/\s/.test(after) &&
    !')]}.,;:'.includes(after) && !'([{'.includes(before);
  const edits = [{ start: s, end: e, text: space ? ' ' : '' }];
  GrabMod.adjustForEdits(ctx.st, edits);
  await ctx.port.edit(edits);
  ctx.port.setSelections([{ anchor: s, active: s }]);
  ctx.st.selType = SelType.NONE;
  ctx.st.selExpand = false;
}

/** meow-save: copy — with kill-ring-save's mark deactivation: the selection
 *  is cancelled afterwards and every cursor stays at its point (past the
 *  newline for a forward line selection). */
async function save(ctx: Ctx): Promise<void> {
  const text = ctx.port.getText();
  const sels = ctx.port.getSelections();
  const withSel = sels
    .filter((s) => s.anchor !== s.active)
    .sort((a, b) => Math.min(a.anchor, a.active) - Math.min(b.anchor, b.active));
  if (withSel.length === 0) return;
  const copied = withSel
    .map((s) => { const r = killRange(ctx, s, text.length); return text.slice(r.lo, r.hi); })
    .join('\n');
  await ctx.clipboard.write(copied);
  ctx.port.setSelections(sels.map((s) => {
    if (s.anchor === s.active) return s;
    const r = killRange(ctx, s, text.length);
    const caret = s.active >= s.anchor ? r.hi : r.lo;
    return { anchor: caret, active: caret };
  }));
  ctx.st.selType = SelType.NONE;
  ctx.st.selExpand = false;
}

/** meow-yank: insert the clipboard at every cursor, cursor lands after it. */
async function yank(ctx: Ctx): Promise<void> {
  if (blockedReadOnly(ctx)) return;
  const clip = await ctx.clipboard.read();
  if (clip === undefined || clip === '') return;
  await editCarets(ctx, (sel) => ({
    edit: { start: sel.active, end: sel.active, text: clip },
    sel: { anchor: sel.active + clip.length, active: sel.active + clip.length },
  }));
}

/** meow-replace: selection := clipboard; the clipboard stays intact. */
async function replace(ctx: Ctx): Promise<void> {
  if (!allowModify(ctx)) return; // meow gates replace silently
  if (!Sel.hasSelection(Sel.primary(ctx))) return;
  const raw = await ctx.clipboard.read();
  if (raw === undefined) return;
  const clip = raw.replace(/\n+$/, '');
  await editCarets(ctx, (sel, lo, hi) => (
    lo === hi
      ? { edit: null, sel }
      : { edit: { start: lo, end: hi, text: clip }, sel: { anchor: lo + clip.length, active: lo + clip.length } }
  ));
  ctx.st.selType = SelType.NONE;
}

/** meow-undo cancels the selection (with its history) BEFORE undoing —
 *  but only when a region is active. */
async function undo(ctx: Ctx): Promise<void> {
  if (Sel.hasSelection(Sel.primary(ctx))) Sel.cancel(ctx);
  await ctx.port.undo();
}

/** meow-undo-in-selection only acts with an active region; the region-scoped
 *  undo itself has no host analog, so it is a plain undo (see README). */
async function undoInSelection(ctx: Ctx): Promise<void> {
  if (Sel.hasSelection(Sel.primary(ctx))) await ctx.port.undo();
}
