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

import { MeowCommand } from './command';
import { Ctx, RevealAt } from './port';

export const RECENTER_COMMAND = 'recenter-top-bottom';

export const RECENTER_POSITIONS: RevealAt[] = ['center', 'top', 'bottom'];

export function recenterPosition(phase: number): RevealAt {
  return RECENTER_POSITIONS[phase % RECENTER_POSITIONS.length] ?? 'center';
}

export function nextRecenterPhase(
  previousCommand: string | null,
  phase: number,
): number {
  return previousCommand === RECENTER_COMMAND ? phase + 1 : 0;
}

export const commands: Map<string, MeowCommand> = new Map([
  [
    RECENTER_COMMAND,
    (ctx: Ctx) => {
      ctx.state.recenterPhase = nextRecenterPhase(
        ctx.state.lastCommand,
        ctx.state.recenterPhase,
      );
      ctx.state.lastCommand = RECENTER_COMMAND;
      return ctx.ui.revealCaret(recenterPosition(ctx.state.recenterPhase));
    },
  ],
]);
