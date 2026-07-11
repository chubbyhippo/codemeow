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
import { MeowState, SelType } from './state';
import { escapeRegExp } from './text';
import { MeowCommand } from './command';
import * as Sel from './selections';

const SEARCH_RING_LIMIT = 50;

export const commands: Map<string, MeowCommand> = new Map([
  ['meow-search', (ctx: Ctx) => search(ctx)],
  ['meow-visit', (ctx: Ctx) => visit(ctx)],
]);

export function push(st: MeowState, pattern: string): void {
  st.searchHistory = st.searchHistory.filter((p) => p !== pattern);
  st.searchHistory.push(pattern);
  while (st.searchHistory.length > SEARCH_RING_LIMIT) st.searchHistory.shift();
}

function fullyMatches(pattern: string, s: string): boolean {
  try {
    return new RegExp(`^(?:${pattern})$`).test(s);
  } catch {
    return false;
  }
}

interface Match {
  start: number;
  end: number;
}

function allMatches(text: string, pattern: string): Match[] {
  let re: RegExp;
  try {
    re = new RegExp(pattern, 'g');
  } catch {
    re = new RegExp(escapeRegExp(pattern), 'g');
  }
  const out: Match[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function search(ctx: Ctx): void {
  const st = ctx.st;
  const sel = Sel.primary(ctx);
  let pattern =
    st.searchHistory.length > 0
      ? st.searchHistory[st.searchHistory.length - 1]
      : null;
  if (Sel.hasSelection(sel)) {
    const selText = ctx.port
      .getText()
      .slice(
        Math.min(sel.anchor, sel.active),
        Math.max(sel.anchor, sel.active),
      );
    if (
      selText.length > 0 &&
      (pattern === null || !fullyMatches(pattern, selText))
    ) {
      pattern = escapeRegExp(selText);
      push(st, pattern);
    }
  }
  if (pattern === null) {
    ctx.ui.hint('No search pattern');
    return;
  }
  searchWith(ctx, pattern, st.takeCount(1) < 0 || Sel.backwardP(ctx));
}

async function visit(ctx: Ctx): Promise<void> {
  const backward = ctx.st.takeCount(1) < 0;
  const input = await ctx.ui.input('Visit (regexp):');
  if (input === undefined || input === '') return;
  let pattern = input;
  try {
    new RegExp(pattern);
  } catch {
    pattern = escapeRegExp(input);
  }
  push(ctx.st, pattern);
  searchWith(ctx, pattern, backward);
}

function searchWith(ctx: Ctx, pattern: string, backward: boolean): void {
  const text = ctx.port.getText();
  const caret = Sel.primary(ctx).active;
  const matches = allMatches(text, pattern);
  let m: Match | undefined;
  if (!backward) {
    m = matches.find((x) => x.start >= caret) ?? matches[0];
  } else {
    const before = matches.filter((x) => x.end <= caret);
    m =
      before.length > 0
        ? before[before.length - 1]
        : matches[matches.length - 1];
  }
  if (!m) {
    ctx.ui.hint(`No match: ${pattern}`);
    return;
  }
  if (!backward) Sel.select(ctx, SelType.VISIT, m.start, m.end, false);
  else Sel.select(ctx, SelType.VISIT, m.end, m.start, false);
}
