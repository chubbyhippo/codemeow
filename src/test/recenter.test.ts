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

import { strict as assert } from 'node:assert';
import { Chord } from '../core/chord';
import { Chords } from '../core/chords';
import { Rc } from '../core/rc';
import {
  nextRecenterPhase,
  RECENTER_COMMAND,
  recenterPosition,
} from '../core/view';
import { describe, freshSpec, it } from './helpers';

const BUFFER = 'one\ntwo\nthree<caret>\nfour\nfive\n';

describe('RecenterSpec', () => {
  it('given the recenter cycle then the positions follow Emacs recenter-positions', () => {
    assert.deepEqual([0, 1, 2, 3].map(recenterPosition), [
      'center',
      'top',
      'bottom',
      'center',
    ]);
  });

  it('given a different previous command then the recenter cycle starts over', () => {
    assert.equal(nextRecenterPhase(RECENTER_COMMAND, 0), 1);
    assert.equal(nextRecenterPhase(RECENTER_COMMAND, 2), 3);
    assert.equal(nextRecenterPhase('meow-left', 2), 0);
    assert.equal(nextRecenterPhase(null, 2), 0);
  });

  it('given repeated C-l then the view cycles center top bottom like Emacs', async () => {
    const s = freshSpec();
    s.given('a caret mid-buffer', BUFFER);
    await s.whenCommand(RECENTER_COMMAND);
    await s.whenCommand(RECENTER_COMMAND);
    await s.whenCommand(RECENTER_COMMAND);
    await s.whenCommand(RECENTER_COMMAND);
    assert.deepEqual(s.ui.revealed, ['center', 'top', 'bottom', 'center']);
  });

  it('given a motion between two C-l then the second one centers again', async () => {
    const s = freshSpec();
    s.given('a caret mid-buffer', BUFFER);
    await s.whenCommand(RECENTER_COMMAND);
    await s.whenKeys('h');
    await s.whenCommand(RECENTER_COMMAND);
    assert.deepEqual(s.ui.revealed, ['center', 'center']);
  });

  it('given the bundled rc then C-l runs recenter-top-bottom', () => {
    freshSpec();
    assert.equal(
      Chords.bindingFor(Chord.parse('C-l'))?.command,
      RECENTER_COMMAND,
    );
    assert.equal(Rc.chordBindings().get('C-l')?.command, RECENTER_COMMAND);
  });
});
