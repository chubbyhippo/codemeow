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

import * as Engine from './engine';
import { normalize } from './hostKey';
import { Ctx } from './port';
import { Binding, Rc } from './rc';

export const Hosts = {
  bindingFor(key: string): Binding | null {
    const host = normalize(key);
    if (host === null) return null;
    return Rc.hostBindings().get(host) ?? null;
  },

  async dispatch(ctx: Ctx, key: string): Promise<boolean> {
    const binding = Hosts.bindingFor(key);
    if (binding === null) return false;
    await Engine.runBinding(ctx, binding);
    return true;
  },
};
