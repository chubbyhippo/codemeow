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
import { MeowCommand } from './command';
import * as Sel from './selections';
import { lineCount, lineEnd, lineStart } from './text';

const KEYS = 'asdfghjkl';

const TIMEOUT_MS = 250;

export const commands: Map<string, MeowCommand> = new Map([
  ['avy-goto-char-timer', (ctx: Ctx) => startCharTimer(ctx)],
  ['avy-goto-line', (ctx: Ctx) => startGotoLine(ctx)],
]);

interface Leaf {
  kind: 'leaf';
  offset: number;
}
interface Branch {
  kind: 'branch';
  children: Array<[string, AvyNode]>;
}
type AvyNode = Leaf | Branch;

export function subdiv(n: number, b: number): number[] {
  const p = Math.floor(Math.log(n) / Math.log(b) + 1e-6) - 1;
  let x1 = 1;
  for (let i = 0; i < p; i++) x1 *= b;
  const x2 = b * x1;
  const delta = n - x2;
  const n2 = Math.floor(delta / (x2 - x1));
  const n1 = b - n2 - 1;
  return [
    ...Array<number>(n1).fill(x1),
    n - n1 * x1 - n2 * x2,
    ...Array<number>(n2).fill(x2),
  ];
}

function tree(candidates: number[], keys: string = KEYS): Branch {
  if (candidates.length < keys.length) {
    return {
      kind: 'branch',
      children: candidates.map((offset, i) => [
        keys[i],
        { kind: 'leaf', offset },
      ]),
    };
  }
  let rest = candidates;
  const children: Array<[string, AvyNode]> = [];
  subdiv(candidates.length, keys.length).forEach((size, i) => {
    const taken = rest.slice(0, size);
    rest = rest.slice(size);
    children.push([
      keys[i],
      size === 1 ? { kind: 'leaf', offset: taken[0] } : tree(taken, keys),
    ]);
  });
  return { kind: 'branch', children };
}

function labels(node: Branch): Array<[number, string]> {
  const out: Array<[number, string]> = [];
  const walk = (n: AvyNode, path: string): void => {
    if (n.kind === 'leaf') out.push([n.offset, path]);
    else n.children.forEach(([k, child]) => walk(child, path + k));
  };
  walk(node, '');
  return out;
}

export class AvySession {
  phase: 'collecting' | 'selecting' = 'collecting';
  input = '';
  node: Branch | null = null;
  timer: ReturnType<typeof setTimeout> | null = null;

  constructor(readonly gotoLine: boolean) {}
}

function startCharTimer(ctx: Ctx): void {
  cancel(ctx);
  ctx.st.avy = new AvySession(false);
}

function startGotoLine(ctx: Ctx): void {
  cancel(ctx);
  const session = new AvySession(true);
  ctx.st.avy = session;
  const text = ctx.port.getText();
  const { first, last } = visibleLines(ctx);
  const candidates: number[] = [];
  for (let ln = first; ln <= last; ln++) candidates.push(lineStart(text, ln));
  toSelecting(ctx, session, candidates);
}

export async function key(ctx: Ctx, c: string): Promise<void> {
  const session = ctx.st.avy;
  if (!session) return;
  if (session.phase === 'collecting') collect(ctx, session, c);
  else await select(ctx, session, c);
}

function collect(ctx: Ctx, session: AvySession, c: string): void {
  session.input += c;
  if (session.timer !== null) clearTimeout(session.timer);
  session.timer = setTimeout(() => void finishInput(ctx), TIMEOUT_MS);
  const len = session.input.length;
  ctx.ui.showAvyMatches(
    matches(ctx, session.input).map((start) => ({ start, end: start + len })),
  );
}

export function finishInput(ctx: Ctx): void {
  const session = ctx.st.avy;
  if (!session || session.phase !== 'collecting') return;
  if (session.timer !== null) clearTimeout(session.timer);
  session.timer = null;
  const candidates = matches(ctx, session.input);
  if (candidates.length === 0) {
    cancel(ctx);
    ctx.ui.hint('zero candidates');
  } else if (candidates.length === 1) {
    cancel(ctx);
    jump(ctx, candidates[0]);
  } else {
    toSelecting(ctx, session, candidates);
  }
}

function toSelecting(
  ctx: Ctx,
  session: AvySession,
  candidates: number[],
): void {
  ctx.ui.clearAvy();
  session.phase = 'selecting';
  session.node = tree(candidates);
  ctx.ui.showAvyLabels(labels(session.node));
}

async function select(ctx: Ctx, session: AvySession, c: string): Promise<void> {
  if (session.gotoLine && c >= '0' && c <= '9') {
    cancel(ctx);
    const input = await ctx.ui.input('Goto line:', c);
    if (input === undefined) return;
    const n = parseInt(input.trim(), 10);
    if (isNaN(n)) return;
    const text = ctx.port.getText();
    const ln = Math.min(Math.max(n - 1, 0), lineCount(text) - 1);
    jump(ctx, lineStart(text, ln));
    return;
  }
  const node = session.node;
  if (!node) return;
  const child = node.children.find(([k]) => k === c)?.[1];
  if (child === undefined) {
    ctx.ui.hint(`No such candidate: ${c}`);
  } else if (child.kind === 'leaf') {
    cancel(ctx);
    jump(ctx, child.offset);
  } else {
    session.node = child;
    ctx.ui.showAvyLabels(labels(child));
  }
}

function jump(ctx: Ctx, offset: number): void {
  const sel = ctx.port.getSelections()[0];
  if (sel.anchor !== sel.active) {
    ctx.port.setSelections([{ anchor: Sel.mark(ctx), active: offset }]);
  } else {
    ctx.port.setSelections([{ anchor: offset, active: offset }]);
  }
}

export function cancel(ctx: Ctx): void {
  const session = ctx.st.avy;
  if (session) {
    if (session.timer !== null) clearTimeout(session.timer);
    session.timer = null;
    ctx.ui.clearAvy();
  }
  ctx.st.avy = null;
}

function visibleLines(ctx: Ctx): { first: number; last: number } {
  const total = lineCount(ctx.port.getText());
  const visible = ctx.port.visibleLineRange();
  if (!visible) return { first: 0, last: total - 1 };
  return {
    first: Math.min(Math.max(visible.first, 0), total - 1),
    last: Math.min(Math.max(visible.last, 0), total - 1),
  };
}

function matches(ctx: Ctx, input: string): number[] {
  if (input.length === 0) return [];
  const text = ctx.port.getText();
  const { first, last } = visibleLines(ctx);
  const from = lineStart(text, first);
  const to = lineEnd(text, last);
  const haystack = text.toLowerCase();
  const needle = input.toLowerCase();
  const out: number[] = [];
  let i = from;
  while (i <= to - needle.length) {
    if (haystack.startsWith(needle, i)) {
      out.push(i);
      i += needle.length;
    } else {
      i++;
    }
  }
  return out;
}
