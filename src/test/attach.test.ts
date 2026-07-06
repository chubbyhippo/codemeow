// Copyright (C) 2026 Chubby Hippo
// SPDX-License-Identifier: GPL-3.0-or-later
// (see LICENSE for the full GPL-3.0-or-later text)

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { attachMode } from '../core/attachPolicy';
import { MeowMode } from '../core/state';

describe('AttachSpec', () => {
  // Which documents get meow, by scheme — the VS Code analog of ideameow's
  // editor-kind checks (file editors, the commit box, read-only views).

  it('given a file document then meow attaches in NORMAL', () => {
    assert.equal(attachMode('file'), MeowMode.NORMAL);
  });

  it('given an untitled document then meow attaches in NORMAL', () => {
    assert.equal(attachMode('untitled'), MeowMode.NORMAL);
  });

  it('given the SCM commit box then meow attaches in NORMAL (ideavimsupport=dialog analog)', () => {
    assert.equal(attachMode('vscode-scm'), MeowMode.NORMAL);
  });

  it('given a git read-only view then meow attaches in MOTION', () => {
    assert.equal(attachMode('git'), MeowMode.MOTION);
  });

  it('given the output panel then meow attaches in MOTION', () => {
    assert.equal(attachMode('output'), MeowMode.MOTION);
  });

  it('given the codemeow cheatsheet then meow attaches in MOTION (j/k scroll it)', () => {
    assert.equal(attachMode('codemeow'), MeowMode.MOTION);
  });

  it('given review-comment and interactive inputs then meow stays away', () => {
    assert.equal(attachMode('comment'), null);
    assert.equal(attachMode('interactive'), null);
    assert.equal(attachMode('vscode-interactive-input'), null);
  });
});
