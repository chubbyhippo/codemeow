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

export function push(state: MeowState, pattern: string): void {
  state.searchHistory = state.searchHistory.filter((p) => p !== pattern);
  state.searchHistory.push(pattern);
  while (state.searchHistory.length > SEARCH_RING_LIMIT)
    state.searchHistory.shift();
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
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    out.push({ start: match.index, end: match.index + match[0].length });
  }
  return out;
}

function search(ctx: Ctx): void {
  const state = ctx.state;
  const sel = Sel.primary(ctx);
  let pattern = state.searchHistory.at(-1) ?? null;
  if (Sel.hasSelection(sel)) {
    const selText = ctx.port
      .getText()
      .slice(Sel.selStart(sel), Sel.selEnd(sel));
    if (
      selText.length > 0 &&
      (pattern === null || !fullyMatches(pattern, selText))
    ) {
      pattern = escapeRegExp(selText);
      push(state, pattern);
    }
  }
  if (pattern === null) {
    ctx.ui.hint('No search pattern');
    return;
  }
  searchWith(ctx, pattern, state.takeCount(1) < 0 || Sel.backwardP(ctx));
}

async function visit(ctx: Ctx): Promise<void> {
  const backward = ctx.state.takeCount(1) < 0;
  const input = await ctx.ui.input('Visit (regexp):');
  if (input === undefined || input === '') return;
  let pattern = input;
  try {
    new RegExp(pattern);
  } catch {
    pattern = escapeRegExp(input);
  }
  push(ctx.state, pattern);
  searchWith(ctx, pattern, backward);
}

function searchWith(ctx: Ctx, pattern: string, backward: boolean): void {
  const text = ctx.port.getText();
  const caret = Sel.primary(ctx).active;
  const matches = allMatches(text, pattern);
  let found: Match | undefined;
  if (!backward) {
    found = matches.find((m) => m.start >= caret) ?? matches[0];
  } else {
    const before = matches.filter((m) => m.end <= caret);
    found = before.at(-1) ?? matches.at(-1);
  }
  if (!found) {
    ctx.ui.hint(`No match: ${pattern}`);
    return;
  }
  if (!backward) Sel.select(ctx, SelType.VISIT, found.start, found.end, false);
  else Sel.select(ctx, SelType.VISIT, found.end, found.start, false);
}
