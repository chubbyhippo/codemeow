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
import {
  charPred,
  lineCount,
  lineEnd,
  lineOfOffset,
  lineStart,
  nthCharTarget,
  Words,
} from './text';

type Scan = {
  text: string;
  caret: number;
  backward: boolean;
  count: number;
};

function wordHints(scan: Scan, isWord: (char: string) => boolean): number[] {
  const { text, backward, count } = scan;
  const out: number[] = [];
  let offset = scan.caret;
  for (let step = 0; step < count; step++) {
    offset = backward
      ? Words.prevStart(text, offset, 1, isWord)
      : Words.nextEnd(text, offset, 1, isWord);
    if (backward ? offset <= 0 : offset >= text.length) break;
    out.push(offset);
  }
  return out;
}

function lineHints(scan: Scan): number[] {
  const { text, backward, count } = scan;
  const out: number[] = [];
  let line = lineOfOffset(text, scan.caret);
  for (let step = 0; step < count; step++) {
    line += backward ? -1 : 1;
    if (line < 0 || line > lineCount(text) - 1) break;
    out.push(backward ? lineStart(text, line) : lineEnd(text, line));
  }
  return out;
}

function findHints(scan: Scan, findChar: string, till: boolean): number[] {
  const { text, caret, backward, count } = scan;
  const out: number[] = [];
  for (let nth = 1; nth <= count; nth++) {
    const target = nthCharTarget(text, findChar, caret, nth, backward, till);
    if (target < 0) break;
    out.push(target);
  }
  return out;
}

function hintsFor(state: MeowState, scan: Scan): number[] {
  switch (state.selType) {
    case SelType.WORD:
    case SelType.SYMBOL:
      return wordHints(scan, charPred(state.selType === SelType.SYMBOL));
    case SelType.LINE:
      return lineHints(scan);
    case SelType.FIND:
    case SelType.TILL:
      return state.lastFind === null
        ? []
        : findHints(scan, state.lastFind, state.selType === SelType.TILL);
    default:
      return [];
  }
}

export function expandHintPositions(ctx: Ctx, count = 10): number[] {
  const { port, state } = ctx;
  const text = port.getText();
  const sel = port.getSelections()[0];
  if (sel.anchor === sel.active) return [];
  const caret = sel.active;
  const scan = { text, caret, backward: caret < sel.anchor, count };
  return [...new Set(hintsFor(state, scan))];
}
