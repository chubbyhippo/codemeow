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
import * as fs from 'node:fs';
import * as path from 'node:path';
import { HOST_KEYS, normalize } from '../core/hostKey';
import { Hosts } from '../core/hosts';
import { Rc } from '../core/rc';
import { MeowMode } from '../core/state';
import { HOST_KEY_TABLE, hostKeybindings } from '../vscode/hostKeys';
import { describe, freshSpec, it } from './helpers';

describe('HostKeySpec', () => {
  it('given either spelling then a host key normalizes to one name', () => {
    assert.equal(normalize('M-;'), 'alt+;');
    assert.equal(normalize('alt+;'), 'alt+;');
    assert.equal(normalize('alt SEMICOLON'), 'alt+;');
    assert.equal(normalize('S-left'), 'shift+left');
    assert.equal(normalize('S-<left>'), 'shift+left');
    assert.equal(normalize('shift LEFT'), 'shift+left');
    assert.equal(normalize('shift+down'), 'shift+down');
  });

  it('given SPC then it is a host key that opens the keypad outside the editor', () => {
    freshSpec();
    assert.equal(normalize('SPC'), 'space');
    assert.equal(normalize('<space>'), 'space');
    assert.equal(normalize('space'), 'space');
    assert.equal(Rc.hostBindings().get('space')?.command, 'meow-keypad');
    const treeEntry = HOST_KEY_TABLE.find(({ host }) => host === 'space');
    assert.equal(treeEntry?.key, 'space');
    assert.ok(
      treeEntry?.when.includes('listFocus') &&
        treeEntry.when.includes('!inputFocus') &&
        treeEntry.when.includes('!editorTextFocus') &&
        treeEntry.when.includes('!terminalFocus'),
      'SPC must stay out of editors, text inputs and the terminal',
    );
  });

  it('given SPC in a tree then it enters the keypad from whatever state the editor was in', async () => {
    const s = freshSpec();
    s.given('a buffer', 'hello<caret>');
    s.st.mode = MeowMode.NORMAL;
    assert.equal(await Hosts.dispatch(s.ctx, 'SPC'), true);
    assert.equal(s.st.mode, MeowMode.KEYPAD);
    assert.equal(s.st.keypadPreviousState, MeowMode.NORMAL);
  });

  it('given a key that is not a host key then it is not accepted', () => {
    assert.equal(normalize('C-f'), null);
    assert.equal(normalize('shift+home'), null);
    assert.equal(normalize('escape'), null);
  });

  it('given a hostmap line then it parses into a host binding', () => {
    const s = freshSpec();
    s.givenRc('hostmap S-left <action>(x.left)\nhostmap M-; meow-keypad');
    assert.equal(Rc.hostBindings().get('shift+left')?.action, 'x.left');
    assert.equal(Rc.hostBindings().get('alt+;')?.command, 'meow-keypad');
  });

  it('given a bad host key or a missing target then errors are collected', () => {
    const c = Rc.parse(['hostmap C-f meow-keypad', 'hostmap S-left']);
    assert.equal(c.hosts.size, 0);
    assert.equal(c.errors.length, 2);
    assert.ok(c.errors[0]?.includes('not a host key'));
    assert.ok(c.errors[1]?.includes('needs a host key and a target'));
  });

  it('given a home hostmap ignore then the key is handed back to VS Code', () => {
    const s = freshSpec();
    s.givenRc('hostmap S-left ignore');
    assert.equal(Rc.hostBindings().has('shift+left'), false);
  });

  it('given INSERT then a host key still dispatches, unlike a chord', async () => {
    const s = freshSpec();
    s.given('a buffer', 'hello<caret>');
    s.givenRc('hostmap S-left <action>(x.left)');
    s.st.mode = MeowMode.INSERT;
    assert.equal(await Hosts.dispatch(s.ctx, 'S-left'), true);
    assert.deepEqual(s.ui.ran, ['x.left']);
  });

  it('given the keypad is already open then the keypad host key keeps the state it returns to', async () => {
    const s = freshSpec();
    s.given('a buffer', 'hello<caret>');
    s.st.mode = MeowMode.INSERT;
    await Hosts.dispatch(s.ctx, 'M-;');
    await Hosts.dispatch(s.ctx, 'M-;');
    assert.equal(s.st.mode, MeowMode.KEYPAD);
    assert.equal(s.st.keypadPreviousState, MeowMode.INSERT);
  });

  it('given an unmapped host key then it is handed back rather than swallowed', async () => {
    const s = freshSpec();
    s.given('a buffer', 'hello<caret>');
    s.givenRc('hostmap S-left ignore');
    assert.equal(await Hosts.dispatch(s.ctx, 'S-left'), false);
    assert.deepEqual(s.ui.ran, []);
  });

  it('given the bundled rc then the keypad key and the windmove arrows are host keys', () => {
    freshSpec();
    const bundled = Rc.hostBindings();
    assert.equal(bundled.get('alt+;')?.command, 'meow-keypad');
    assert.equal(bundled.get('shift+left')?.action, 'codemeow.windmoveLeft');
    assert.equal(bundled.get('shift+right')?.action, 'codemeow.windmoveRight');
    assert.equal(bundled.get('shift+up')?.action, 'codemeow.windmoveUp');
    assert.equal(bundled.get('shift+down')?.action, 'codemeow.windmoveDown');
  });

  it('given the manifest then every host key is intercepted and rc-gated', () => {
    freshSpec();
    assert.deepEqual(
      HOST_KEY_TABLE.map(({ host }) => host).sort(),
      [...HOST_KEYS].sort(),
      'the adapter table and the core host-key list must agree',
    );
    assert.deepEqual(
      [...Rc.hostBindings().keys()].sort(),
      [...HOST_KEYS].sort(),
      'the bundled hostmap block must bind every host key',
    );

    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
    ) as { contributes: { keybindings: Array<{ command: string }> } };
    const contributed = pkg.contributes.keybindings.filter(
      (k) => k.command === 'codemeow.hostKey',
    );
    assert.deepEqual(
      contributed,
      hostKeybindings(),
      'package.json must carry the generated host-key table',
    );
  });
});
