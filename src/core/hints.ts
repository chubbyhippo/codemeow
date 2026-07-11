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
import { SelType } from './state';
import {
  charPred,
  lineCount,
  lineEnd,
  lineOfOffset,
  lineStart,
  nthCharTarget,
  Words,
} from './text';

export function expandHintPositions(ctx: Ctx, count = 10): number[] {
  const { port, st } = ctx;
  const text = port.getText();
  const sel = port.getSelections()[0];
  if (sel.anchor === sel.active) return [];
  const caret = sel.active;
  const backward = caret < sel.anchor;
  const out: number[] = [];
  switch (st.selType) {
    case SelType.WORD:
    case SelType.SYMBOL: {
      const pred = charPred(st.selType === SelType.SYMBOL);
      let i = caret;
      for (let k = 0; k < count; k++) {
        i = backward
          ? Words.prevStart(text, i, 1, pred)
          : Words.nextEnd(text, i, 1, pred);
        if (backward ? i <= 0 : i >= text.length) break;
        out.push(i);
      }
      break;
    }
    case SelType.LINE: {
      let ln = lineOfOffset(text, caret);
      for (let k = 0; k < count; k++) {
        ln += backward ? -1 : 1;
        if (ln < 0 || ln > lineCount(text) - 1) break;
        out.push(backward ? lineStart(text, ln) : lineEnd(text, ln));
      }
      break;
    }
    case SelType.FIND:
    case SelType.TILL: {
      const c = st.lastFind;
      if (c === null) return out;
      const till = st.selType === SelType.TILL;
      for (let k = 1; k <= count; k++) {
        const t = nthCharTarget(text, c, caret, k, backward, till);
        if (t < 0) break;
        out.push(t);
      }
      break;
    }
    default:
      break;
  }
  return [...new Set(out)];
}
