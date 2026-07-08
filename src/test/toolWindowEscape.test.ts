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
import { beforeEach, describe, it } from 'node:test';
import { onEscape, reset, TIMEOUT_MS } from '../core/toolWindowEscape';

/**
 * Double-ESC in a tool window (ToolWindowEscape) — ideameow's
 * ToolWindowEscapeSpec, ported name for name. Platform-specific — no
 * meow/Emacs source of truth: pinned is the pairing state machine the
 * manifest's escape bindings feed. The re-emission of a lone first press
 * (sendSequence to the terminal, list.clear to lists) is adapter wiring,
 * outside the core.
 */
describe('ToolWindowEscapeSpec', () => {
  beforeEach(() => reset());

  it('the first escape in a tool window does not jump', () => {
    assert.equal(onEscape('terminal', 1_000), false);
  });

  it('a second escape in the same tool window within the timeout jumps', () => {
    onEscape('terminal', 1_000);
    assert.equal(onEscape('terminal', 1_000 + TIMEOUT_MS), true);
  });

  it('a jump consumes the pair so the next escape starts a new one', () => {
    onEscape('terminal', 1_000);
    assert.equal(onEscape('terminal', 1_100), true);
    assert.equal(onEscape('terminal', 1_200), false);
  });

  it('escapes slower than the timeout do not pair but re-arm', () => {
    onEscape('terminal', 1_000);
    assert.equal(onEscape('terminal', 1_001 + TIMEOUT_MS), false);
    assert.equal(onEscape('terminal', 1_200 + TIMEOUT_MS), true);
  });

  it('escapes in different tool windows do not pair', () => {
    onEscape('terminal', 1_000);
    assert.equal(onEscape('list', 1_100), false);
    assert.equal(onEscape('list', 1_200), true);
  });

  it('focus outside any tool window breaks the pair', () => {
    onEscape('terminal', 1_000);
    assert.equal(onEscape(null, 1_100), false);
    assert.equal(onEscape('terminal', 1_200), false);
  });
});
