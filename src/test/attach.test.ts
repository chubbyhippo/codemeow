// Copyright (C) 2026 Chubby Hippo
// SPDX-License-Identifier: GPL-3.0-or-later
// (see LICENSE for the full GPL-3.0-or-later text)

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { attachMode, isWritableScheme } from '../core/attachPolicy';
import { MeowMode } from '../core/state';

describe('AttachSpec', () => {
  // Which documents get meow, by scheme. Read-only schemes attach in NORMAL
  // like Emacs
  // read-only buffers (the modify commands gate themselves; see
  // ModesKeypadSpec) — they just report non-writable through the port.

  it('given a file document then meow attaches in NORMAL', () => {
    assert.equal(attachMode('file'), MeowMode.NORMAL);
  });

  it('given an untitled document then meow attaches in NORMAL', () => {
    assert.equal(attachMode('untitled'), MeowMode.NORMAL);
  });

  it('given the SCM commit box then meow attaches in NORMAL (ideavimsupport=dialog analog)', () => {
    assert.equal(attachMode('vscode-scm'), MeowMode.NORMAL);
  });

  it('given a git read-only view (the diff revision side) then NORMAL, reported read-only', () => {
    assert.equal(attachMode('git'), MeowMode.NORMAL);
    assert.equal(isWritableScheme('git'), false);
  });

  it('given the output panel then NORMAL, reported read-only', () => {
    assert.equal(attachMode('output'), MeowMode.NORMAL);
    assert.equal(isWritableScheme('output'), false);
  });

  it('given the codemeow cheatsheet then NORMAL, reported read-only (j/k still scroll it)', () => {
    assert.equal(attachMode('codemeow'), MeowMode.NORMAL);
    assert.equal(isWritableScheme('codemeow'), false);
  });

  it('given review-comment and interactive inputs then meow stays away', () => {
    assert.equal(attachMode('comment'), null);
    assert.equal(attachMode('interactive'), null);
    assert.equal(attachMode('vscode-interactive-input'), null);
  });
});
