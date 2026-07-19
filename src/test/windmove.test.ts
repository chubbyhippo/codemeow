// Copyright (C) 2026 Chubby Hippo
// SPDX-License-Identifier: GPL-3.0-or-later
// (see LICENSE for the full GPL-3.0-or-later text)

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as Ace from '../core/aceWindow';
import { Rc } from '../core/rc';
import { noWindowMessage, plan } from '../core/windmove';
import { freshSpec } from './helpers';

describe('WindmoveSpec', () => {
  const sideBySide = { sideBySide: true };

  it('given window rectangles then ace-window orders them left to right then top down', () => {
    assert.deepEqual(
      Ace.ordered([
        { item: 'R', x: 40, y: 0 },
        { item: 'L2', x: 0, y: 12 },
        { item: 'L1', x: 0, y: 0 },
      ]),
      ['L1', 'L2', 'R'],
    );
  });

  it('given one two or many windows then ace-window plans self other or labels', () => {
    assert.equal(Ace.plan(1), Ace.Plan.None);
    assert.equal(Ace.plan(2), Ace.Plan.Other);
    assert.equal(Ace.plan(3), Ace.Plan.Labels);
    assert.equal(Ace.plan(9), Ace.Plan.Labels);
  });

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
    assert.equal(
      noWindowMessage('left'),
      'No window left from selected window',
    );
    assert.equal(
      noWindowMessage('down'),
      'No window down from selected window',
    );
  });

  it('given the manifest then shift+arrows dispatch windmove on meow editors', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
    ) as {
      contributes: {
        keybindings: Array<{ key: string; command: string; when: string }>;
      };
    };
    const bound = pkg.contributes.keybindings.filter((k) =>
      k.command.startsWith('codemeow.windmove'),
    );
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

  it('given the bundled rc then SPC w b balances the splits', () => {
    freshSpec();
    assert.equal(
      Rc.defaults().keypad.get('wb')?.action,
      'workbench.action.evenEditorWidths',
    );
  });
});
