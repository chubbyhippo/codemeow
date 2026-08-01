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

import assert from 'node:assert/strict';
import { beforeEach } from 'node:test';
import * as Engine from '../core/engine';
import { MeowMode } from '../core/state';
import { onEscape, reset, TIMEOUT_MS } from '../core/toolWindowEscape';
import { describe, freshSpec, it } from './helpers';

describe('ToolWindowEscapeSpec', () => {
  const navRc = [
    'map <leader>tn meow-next',
    'repeat nav . meow-next',
    'repeat nav , meow-prev',
  ].join('\n');

  beforeEach(() => reset());

  it('given a single escape in a tool window then it does not jump', () => {
    assert.equal(onEscape('terminal', 1_000), false);
  });

  it('given a second escape in the same tool window within the timeout then it jumps', () => {
    onEscape('terminal', 1_000);
    assert.equal(onEscape('terminal', 1_000 + TIMEOUT_MS), true);
  });

  it('given a completed jump then the next escape starts a new pair', () => {
    onEscape('terminal', 1_000);
    assert.equal(onEscape('terminal', 1_100), true);
    assert.equal(onEscape('terminal', 1_200), false);
  });

  it('given escapes slower than the timeout then they do not pair but re-arm', () => {
    onEscape('terminal', 1_000);
    assert.equal(onEscape('terminal', 1_001 + TIMEOUT_MS), false);
    assert.equal(onEscape('terminal', 1_200 + TIMEOUT_MS), true);
  });

  it('given escapes in different tool windows then they do not pair', () => {
    onEscape('terminal', 1_000);
    assert.equal(onEscape('list', 1_100), false);
    assert.equal(onEscape('list', 1_200), true);
  });

  it('given focus outside any tool window then the pair breaks', () => {
    onEscape('terminal', 1_000);
    assert.equal(onEscape(null, 1_100), false);
    assert.equal(onEscape('terminal', 1_200), false);
  });

  it("given KEYPAD then escape is meow's and exits the keypad", async () => {
    const s = freshSpec();
    s.given('keypad escape', '<caret>hello');
    await s.whenKeys(' ');
    s.thenMode(MeowMode.KEYPAD);
    assert.equal(s.pressEsc(), true);
    s.thenMode(MeowMode.NORMAL);
  });

  it("given an active selection then escape is meow's and clears it", async () => {
    const s = freshSpec();
    s.given('selection escape', '<caret>hello world');
    await s.whenKeys('w');
    assert.notEqual(s.selectedText(), undefined);
    assert.equal(s.pressEsc(), true);
    assert.equal(s.selectedText(), undefined);
  });

  it("given an armed repeat run then escape is meow's and ends it", async () => {
    const s = freshSpec();
    s.given('four lines', '<caret>one\ntwo\nthree\nfour');
    s.givenRc(navRc);
    await s.whenKeys(' tn');
    assert.notEqual(Engine.repeatMap, null);
    assert.equal(s.pressEsc(), true);
    assert.equal(Engine.repeatMap, null);
  });

  it("given NORMAL with nothing to cancel then escape is not meow's", () => {
    const s = freshSpec();
    s.given('idle escape', '<caret>hello');
    assert.equal(s.pressEsc(), false);
  });

  it("given INSERT then escape is meow's and returns to NORMAL", async () => {
    const s = freshSpec();
    s.given('insert escape', '<caret>hello');
    await s.whenKeys('i');
    s.thenMode(MeowMode.INSERT);
    assert.equal(s.pressEsc(), true);
    s.thenMode(MeowMode.NORMAL);
  });
});
