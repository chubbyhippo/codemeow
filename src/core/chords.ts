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

import { Chord } from './chord';
import * as Engine from './engine';
import { Ctx } from './port';
import { Binding, Rc } from './rc';
import { MeowMode } from './state';

export function takesChords(mode: MeowMode): boolean {
  return mode === MeowMode.NORMAL || mode === MeowMode.MOTION;
}

export const Chords = {
  bindingFor(chord: Chord | null): Binding | null {
    if (chord === null) return null;
    return Rc.chordBindings().get(Chord.spelling(chord)) ?? null;
  },

  claims(mode: MeowMode, chord: Chord | null): boolean {
    return takesChords(mode) && Chords.bindingFor(chord) !== null;
  },

  async dispatch(ctx: Ctx, chord: Chord | null): Promise<boolean> {
    if (!Chords.claims(ctx.st.mode, chord)) return false;
    const binding = Chords.bindingFor(chord);
    if (binding === null) return false;
    await Engine.runBinding(ctx, binding);
    return true;
  },
};
