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
import { Rc } from '../core/rc';
import { Resizes } from '../core/resize';
import { MeowMode } from '../core/state';
import { describe, freshSpec, it } from './helpers';

describe('AceResizeSpec', () => {
  it('given the bundled rc then SPC w r arms the resize session', () => {
    freshSpec();
    assert.equal(Rc.defaults().keypad.get('wr')?.action, 'codemeow.aceResize');
  });

  it('given the bundled rc then hjkl resize and = m balance or maximize', () => {
    freshSpec();
    const bound = Rc.resizeBindings();
    assert.equal(bound.get('l')?.action, 'workbench.action.increaseViewWidth');
    assert.equal(bound.get('h')?.action, 'workbench.action.decreaseViewWidth');
    assert.equal(bound.get('k')?.action, 'workbench.action.increaseViewHeight');
    assert.equal(bound.get('j')?.action, 'workbench.action.decreaseViewHeight');
    assert.equal(bound.get('=')?.action, 'workbench.action.evenEditorWidths');
    assert.equal(
      bound.get('m')?.action,
      'workbench.action.toggleMaximizeEditorGroup',
    );
    assert.deepEqual(Resizes.keys().sort(), ['=', 'h', 'j', 'k', 'l', 'm']);
  });

  it('given a resizemap line then it parses into a resize binding', () => {
    const s = freshSpec();
    s.givenRc('resizemap w <action>(x.wider)\nresizemap b meow-left');
    assert.equal(Rc.resizeBindings().get('w')?.action, 'x.wider');
    assert.equal(Rc.resizeBindings().get('b')?.command, 'meow-left');
  });

  it('given a multi-key resizemap or a missing target then errors are collected', () => {
    const c = Rc.parse(['resizemap hl <action>(x.y)', 'resizemap l']);
    assert.equal(c.resizes.size, 0);
    assert.equal(c.errors.length, 2);
    assert.ok(c.errors[0]?.includes('single printable key'));
    assert.ok(c.errors[1]?.includes('needs a key and a target'));
  });

  it('given a home resizemap ignore then the key leaves the session', () => {
    const s = freshSpec();
    s.givenRc('resizemap m ignore');
    assert.equal(Rc.resizeBindings().has('m'), false);
    assert.equal(Rc.resizeBindings().has('l'), true);
  });

  it('given a session key then it runs its target in any state, and an unbound one does not', async () => {
    const s = freshSpec();
    s.given('a buffer', 'hello<caret>');
    s.state.mode = MeowMode.INSERT;
    assert.equal(await Resizes.dispatch(s.ctx, 'l'), true);
    assert.deepEqual(s.ui.ran, ['workbench.action.increaseViewWidth']);
    assert.equal(await Resizes.dispatch(s.ctx, 'z'), false);
    assert.deepEqual(s.ui.ran, ['workbench.action.increaseViewWidth']);
  });
});
