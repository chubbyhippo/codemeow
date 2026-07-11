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
import * as Motions from './motions';
import * as Sel from './selections';
import * as Search from './search';
import * as Structures from './structures';
import * as Grab from './grab';
import * as Edits from './edits';
import * as Avy from './avy';
import * as Engine from './engine';

export const COMMANDS: Map<string, MeowCommand> = new Map([
  ...Motions.commands,
  ...Sel.commands,
  ...Search.commands,
  ...Structures.commands,
  ...Grab.commands,
  ...Edits.commands,
  ...Avy.commands,
  [
    'meow-negative-argument',
    (ctx: Ctx) => {
      ctx.st.negative = true;
    },
  ],
  [
    'negative-argument',
    (ctx: Ctx) => {
      ctx.st.negative = true;
    },
  ],
  ['meow-quit', (ctx: Ctx) => ctx.port.closeEditor()],
  ['meow-keypad', (ctx: Ctx) => Engine.enterKeypad(ctx)],
  ['repeat', (ctx: Ctx) => Engine.repeatLast(ctx)],
  ['ignore', () => {}],
]);
