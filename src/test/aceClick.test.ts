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
import * as AceClick from '../core/aceClick';
import { ordered } from '../core/aceWindow';
import { Rc } from '../core/rc';
import { describe, freshSpec, it } from './helpers';

describe('AceClickSpec', () => {
  it('given no targets then ace-click arms no session', () => {
    assert.equal(AceClick.plan(0), AceClick.Plan.NONE);
    assert.deepEqual(AceClick.labels(0), []);
  });

  it('given a single target then ace-click labels instead of auto-clicking', () => {
    assert.equal(AceClick.plan(1), AceClick.Plan.LABELS);
    assert.deepEqual(AceClick.labels(1), ['a']);
  });

  it('given twelve targets then ace-click labels follow the avy subdivision', () => {
    assert.deepEqual(AceClick.labels(12), [
      'a',
      's',
      'd',
      'f',
      'g',
      'h',
      'j',
      'k',
      'la',
      'ls',
      'ld',
      'lf',
    ]);
  });

  it('given screen geometry then hint labels follow the screen order', () => {
    const targets = ordered([
      { item: 'second row', x: 0, y: 10 },
      { item: 'rightmost', x: 100, y: 0 },
      { item: 'leftmost', x: 0, y: 0 },
    ]);
    assert.deepEqual(targets, ['leftmost', 'second row', 'rightmost']);
  });

  it('given a partial label then only the matching candidates stay', () => {
    const labels = AceClick.labels(12);
    assert.deepEqual(AceClick.matches(labels, 'l'), ['la', 'ls', 'ld', 'lf']);
    assert.deepEqual(AceClick.matches(labels, 'ls'), ['ls']);
    assert.deepEqual(AceClick.matches(labels, 'q'), []);
  });

  it('given the bundled rc then SPC SPC runs ace-click', () => {
    freshSpec();
    assert.equal(
      Rc.keypad().get(' ')?.action,
      'codemeow.aceClick',
      'SPC SPC must be the ace-click slot, as in ideameow and netmeow',
    );
  });
});
