// Copyright (C) 2026 Chubby Hippo
// SPDX-License-Identifier: GPL-3.0-or-later
// (see LICENSE for the full GPL-3.0-or-later text)

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Rc } from '../core/rc';
import { noWindowMessage, plan } from '../core/windmove';
import { freshSpec } from './helpers';

describe('WindmoveSpec', () => {
  // The window surface: windmove, the ideameow port's sibling. VS Code
  // exposes no window geometry to extensions, so window.el's caret-band
  // pick (pinned in ideameow's WindmoveSpec) has no analog here — what IS
  // pinned is the composed step decision (diff panes are windows: crossing
  // them before leaving the group), Emacs' user-error message verbatim
  // (batch-verified against Emacs 30.2), the manifest's Shift+arrow
  // bindings — (windmove-default-keybindings) — and the rc's SPC w map.

  const sideBySide = { sideBySide: true };

  it('given a side-by-side diff then left from the modified pane crosses to the original', () => {
    assert.equal(
      plan('left', { onOriginal: false, onModified: true, ...sideBySide }),
      'diffEditor.switchSide',
    );
  });

  it('given a side-by-side diff then right from the original pane crosses to the modified', () => {
    assert.equal(
      plan('right', { onOriginal: true, onModified: false, ...sideBySide }),
      'diffEditor.switchSide',
    );
  });

  it('given the outer pane then windmove leaves the diff toward the group', () => {
    // original is the leftmost window of the diff, modified the rightmost:
    // moving past them is a group move, like any other window edge
    assert.equal(
      plan('left', { onOriginal: true, onModified: false, ...sideBySide }),
      'workbench.action.focusLeftGroup',
    );
    assert.equal(
      plan('right', { onOriginal: false, onModified: true, ...sideBySide }),
      'workbench.action.focusRightGroup',
    );
  });

  it('given an inline diff then the panes are not windows', () => {
    const inline = { onOriginal: false, onModified: true, sideBySide: false };
    assert.equal(plan('left', inline), 'workbench.action.focusLeftGroup');
    assert.equal(plan('right', inline), 'workbench.action.focusRightGroup');
  });

  it('given up or down then it always moves between groups', () => {
    // the diff panes sit side by side; there is never a pane above/below
    const diff = { onOriginal: false, onModified: true, ...sideBySide };
    assert.equal(plan('up', diff), 'workbench.action.focusAboveGroup');
    assert.equal(plan('down', diff), 'workbench.action.focusBelowGroup');
  });

  it('given no diff then windmove is the directional group focus', () => {
    assert.equal(plan('left', null), 'workbench.action.focusLeftGroup');
    assert.equal(plan('right', null), 'workbench.action.focusRightGroup');
    assert.equal(plan('up', null), 'workbench.action.focusAboveGroup');
    assert.equal(plan('down', null), 'workbench.action.focusBelowGroup');
  });

  it('given no window in the direction then the message is Emacs verbatim', () => {
    // batch-verified: (windmove-do-window-select 'left) with one window
    assert.equal(noWindowMessage('left'), 'No window left from selected window');
    assert.equal(noWindowMessage('down'), 'No window down from selected window');
  });

  it('given the manifest then shift+arrows dispatch windmove on meow editors', () => {
    // (windmove-default-keybindings) == shift + left/right/up/down; gated
    // on codemeow.active so shift-selection survives everywhere meow does
    // not attach (the Emacs tradeoff applies only inside meow buffers)
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
    ) as { contributes: { keybindings: Array<{ key: string; command: string; when: string }> } };
    const bound = pkg.contributes.keybindings.filter((k) => k.command.startsWith('codemeow.windmove'));
    assert.deepEqual(
      bound,
      (['Left', 'Right', 'Up', 'Down'] as const).map((d) => ({
        key: `shift+${d.toLowerCase()}`,
        command: `codemeow.windmove${d}`,
        when: 'editorTextFocus && codemeow.active',
      })),
    );
  });

  it('given the bundled rc then SPC w hjkl dispatch windmove', () => {
    freshSpec();
    const d = Rc.defaults().keypad;
    assert.equal(d.get('wh')?.action, 'codemeow.windmoveLeft');
    assert.equal(d.get('wj')?.action, 'codemeow.windmoveDown');
    assert.equal(d.get('wk')?.action, 'codemeow.windmoveUp');
    assert.equal(d.get('wl')?.action, 'codemeow.windmoveRight');
  });
});
