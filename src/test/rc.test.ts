// Copyright (C) 2026 Chubby Hippo
// SPDX-License-Identifier: GPL-3.0-or-later
// (see LICENSE for the full GPL-3.0-or-later text)

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { freshSpec } from './helpers';
import { Rc } from '../core/rc';
import { RcState } from '../core/rcState';
import { keypadRows } from '../core/whichKey';
import { MeowMode } from '../core/state';

describe('RcSpec', () => {
  it('given an action mapping then it parses into a normal override', () => {
    const c = Rc.parse(['nmap S <action>(extension.aceJump)']);
    assert.equal(c.normal.get('S')!.action, 'extension.aceJump');
    assert.deepEqual(c.errors, []);
  });

  it('given a key-sequence mapping then it parses as replay keys', () => {
    const c = Rc.parse(['nmap Z ,b']);
    assert.equal(c.normal.get('Z')!.keys, ',b');
    assert.equal(c.normal.get('Z')!.recursive, true);
  });

  it('given nnoremap then the binding is non-recursive', () => {
    const c = Rc.parse(['nnoremap Z ,b']);
    assert.equal(c.normal.get('Z')!.recursive, false);
  });

  it('given a meow command name then it parses into a command binding', () => {
    const c = Rc.parse([
      'nmap n meow-mark-word',
      'nmap d ignore',
      'nmap Z repeat',
    ]);
    assert.equal(c.normal.get('n')!.command, 'meow-mark-word');
    assert.equal(c.normal.get('d')!.command, 'ignore');
    assert.equal(c.normal.get('Z')!.command, 'repeat');
    assert.deepEqual(c.errors, []);
  });

  it('given mmap then the binding lands in the motion map', () => {
    const c = Rc.parse(['mmap n meow-next', 'mnoremap e k']);
    assert.equal(c.motion.get('n')!.command, 'meow-next');
    assert.equal(c.motion.get('e')!.keys, 'k');
    assert.equal(c.motion.get('e')!.recursive, false);
    assert.equal(c.normal.size, 0);
    assert.deepEqual(c.errors, []);
  });

  it('given an unknown meow command then an error is collected', () => {
    const c = Rc.parse(['nmap Z meow-frobnicate']);
    assert.equal(c.errors.length, 1);
    assert.ok(c.errors[0].includes('meow-frobnicate'));
  });

  it('given a cmap or cnoremap line then the rc loads it without error', () => {
    const c = Rc.parse([
      'cmap control F forward-char',
      'cnoremap alt D kill-word',
      'nmap Z ,b',
    ]);
    assert.deepEqual(c.errors, []);
    assert.equal(c.normal.get('Z')!.keys, ',b');
    assert.equal(c.normal.size, 1, 'cmap and cnoremap add no bindings');
  });

  it('given comment-only rc edits then the reload button reports no changes', () => {
    freshSpec();
    Rc.setUserLines(['nmap Z ,b']);
    assert.ok(RcState.equalTo(Rc.parse(['" just a comment', 'nmap Z ,b'])));
    assert.ok(!RcState.equalTo(Rc.parse(['nmap Q meow-goto-line'])));
  });

  it('given the manifest then the rc editor-title reload button is contributed', () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
    ) as {
      contributes: {
        menus: Record<string, { command: string; when: string }[]>;
      };
    };
    const item = manifest.contributes.menus['editor/title'].find(
      (m) => m.command === 'codemeow.reloadRc',
    );
    assert.ok(item, 'editor/title must carry the reload button');
    assert.ok(item.when.includes('resourceFilename == .codemeowrc'));
    assert.ok(item.when.includes('codemeow.rcChanged'));
  });

  it('given a parameterized action then the whole serialized command is kept', () => {
    const id =
      'com.example.showView(com.example.viewId=com.example.SomeView,com.example.focus=true)';
    const c = Rc.parse([`map <leader>bj <action>(${id})`]);
    assert.equal(c.keypad.get('bj')?.action, id);
    assert.deepEqual(c.errors, []);
  });

  it('given leader mappings and descriptions then the keypad table extends', () => {
    const s = freshSpec();
    s.givenRc(
      'map <leader>gd <action>(editor.action.revealDefinition)\ndesc <leader>g goto things',
    );
    assert.equal(
      Rc.cfg().keypad.get('gd')!.action,
      'editor.action.revealDefinition',
    );
    assert.equal(Rc.cfg().keypadDesc.get('g'), 'goto things');
    assert.equal(
      Rc.keypad().get('gd')!.action,
      'editor.action.revealDefinition',
    );
    assert.equal(
      Rc.keypad().get('bb')!.action,
      'workbench.action.showAllEditorsByMostRecentlyUsed',
    );
  });

  it('given the ideavimrc WhichKeyDesc let syntax then descriptions parse', () => {
    const c = Rc.parse([
      'let g:WhichKeyDesc_leader_x = "<leader>x C-x files/buffers"',
    ]);
    assert.equal(c.keypadDesc.get('x'), 'C-x files/buffers');
    assert.deepEqual(c.errors, []);
  });

  it('given set lines then which-key options apply and vim options are ignored', () => {
    const c = Rc.parse([
      'set nowhich-key',
      'set timeoutlen=400',
      'set clipboard+=unnamedplus',
      'let mapleader=" "',
    ]);
    assert.equal(c.whichKey, false);
    assert.equal(c.whichKeyDelayMs, 400);
    assert.deepEqual(c.errors, []);
  });

  it('which-key settings layer user over bundled defaults', () => {
    const s = freshSpec();
    assert.equal(Rc.whichKeyEnabled(), true);
    assert.equal(Rc.whichKeyDelayMs(), 300);
    s.givenRc('set nowhich-key\nset timeoutlen=150');
    assert.equal(Rc.whichKeyEnabled(), false);
    assert.equal(Rc.whichKeyDelayMs(), 150);
  });

  it('given a trailing comment then it is stripped from the line', () => {
    const c = Rc.parse([
      'nmap S <action>(extension.aceJump)   " jump anywhere',
      'map <leader>zz ,b            " select the buffer',
    ]);
    assert.equal(c.normal.get('S')!.action, 'extension.aceJump');
    assert.equal(c.keypad.get('zz')!.keys, ',b');
    assert.deepEqual(c.errors, []);
  });

  it('the bundled default codemeowrc defines the whole keymap', () => {
    freshSpec();
    const d = Rc.defaults();
    assert.deepEqual(d.errors, [], 'bundled default must parse clean');
    for (const [key, cmd] of QWERTY) {
      if (key === 'Q') continue;
      assert.equal(
        d.normal.get(key)?.command,
        cmd,
        `bundled layout line for '${key}'`,
      );
    }
    assert.equal(d.normal.get('Q')?.command, 'avy-goto-line');
    assert.equal(d.normal.get('S')?.command, 'avy-goto-char-timer');
    assert.equal(d.motion.get('j')?.command, 'meow-next');
    assert.equal(d.motion.get('k')?.command, 'meow-prev');
    assert.equal(
      d.keypad.get('bb')?.action,
      'workbench.action.showAllEditorsByMostRecentlyUsed',
    );
    assert.equal(
      d.keypad.get(' ')?.action,
      'workbench.action.quickOpenPreviousRecentlyUsedEditorInGroup',
    );
    assert.equal(d.keypad.get('cm')?.action, 'codemeow.editRc');
    assert.equal(d.keypad.get('cM')?.action, 'codemeow.reloadRc');
    assert.equal(d.keypad.get('id')?.action, 'codemeow.commandIds');
    assert.equal(d.keypad.get('m,')?.action, 'workbench.action.navigateBack');
    assert.ok(
      d.keypad.size > 150,
      `keypad table + ported leader groups (got ${d.keypad.size})`,
    );
  });

  it('given bad lines then errors are collected with line numbers', () => {
    const c = Rc.parse([
      'frobnicate everything',
      'nmap <Space> ,b',
      'map <leader>1 <action>(X)',
      'nmap Q <CR>',
      'mmap <leader>x ,b',
    ]);
    assert.equal(c.errors.length, 5);
    assert.ok(c.errors[0].startsWith('line 1'));
  });

  it('given an rc key-sequence override then the key replays through the engine', async () => {
    const s = freshSpec();
    s.given('two words', 'on<caret>e two');
    s.givenRc('nmap Z ,b');
    await s.whenKeys('Z');
    s.thenSelection('one two');
  });

  it('given a recursive map then the RHS expands user maps', async () => {
    const s = freshSpec();
    s.given('two words', 'one two<caret>');
    s.givenRc('nmap B ,b\nnmap Y B');
    await s.whenKeys('Y');
    s.thenSelection('one two');
  });

  it('given nnoremap then the RHS runs the bundled default instead', async () => {
    const s = freshSpec();
    s.given('two words', 'one two<caret>');
    s.givenRc('nmap B ,b\nnnoremap Z B');
    await s.whenKeys('Z');
    s.thenSelection('two');
  });

  it('given a self-referencing map then recursion is depth-limited', async () => {
    const s = freshSpec();
    s.given('plain', '<caret>hello');
    s.givenRc('nmap Z Z');
    await s.whenKeys('Z');
    s.thenText('hello');
  });

  it('given an rc keypad mapping with keys then SPC seq replays them', async () => {
    const s = freshSpec();
    s.given('two words', 'on<caret>e two');
    s.givenRc('map <leader>k ,b');
    await s.whenKeys(' k');
    s.thenSelection('one two');
    s.thenMode(MeowMode.NORMAL);
  });

  it('given an rc keypad mapping then it overrides the bundled entry', async () => {
    const s = freshSpec();
    s.given('two words', 'on<caret>e two');
    s.givenRc('map <leader>bb ,b');
    await s.whenKeys(' bb');
    s.thenSelection('one two');
  });

  it('given a layout rebinding then the key runs the meow command', async () => {
    const s = freshSpec();
    s.given('two words', 'on<caret>e two');
    s.givenRc('nmap n meow-mark-word');
    await s.whenKeys('n');
    s.thenSelection('one');
  });

  it('given ignore then the key is disabled', async () => {
    const s = freshSpec();
    s.given('chars', '<caret>abc');
    s.givenRc('nmap d ignore');
    await s.whenKeys('d');
    s.thenText('abc');
  });

  it('given a motion rebinding then MOTION-state editors use it', async () => {
    const s = freshSpec();
    s.given('three lines', '<caret>one\ntwo\nthree');
    s.givenRc('mmap n meow-next');
    s.st.mode = MeowMode.MOTION;
    await s.whenKeys('n');
    assert.equal(s.caretLine(), 1);
    await s.whenKeys('j');
    assert.equal(s.caretLine(), 2);
  });

  it('given repeat on another key then it repeats the last command', async () => {
    const s = freshSpec();
    s.given('chars', '<caret>abcdef');
    s.givenRc('nmap Z repeat');
    await s.whenKeys('d');
    s.thenText('bcdef');
    await s.whenKeys('Z');
    s.thenText('cdef');
  });

  it('given a mapped key when quote then the mapping repeats', async () => {
    const s = freshSpec();
    s.given('chars', '<caret>abcdef');
    s.givenRc('nmap Z d');
    await s.whenKeys('Z');
    s.thenText('bcdef');
    await s.whenKeys("'");
    s.thenText('cdef');
  });

  it('given keypad entries then which-key rows show terminals and groups', () => {
    const s = freshSpec();
    s.givenRc(
      'map <leader>zz <action>(workbench.action.quickOpen)\ndesc <leader>z my group',
    );
    const top = keypadRows('');
    assert.ok(top.some(([k, label]) => k === 'z' && label === 'my group'));
    const inner = keypadRows('z');
    assert.ok(
      inner.some(
        ([k, label]) => k === 'z' && label === 'workbench.action.quickOpen',
      ),
    );
  });

  it('given a terminal with a description then which-key prefers it', () => {
    const s = freshSpec();
    s.givenRc(
      'map <leader>zz <action>(workbench.action.quickOpen)\ndesc <leader>zz open a file',
    );
    assert.ok(
      keypadRows('z').some(
        ([k, label]) => k === 'z' && label === 'open a file',
      ),
    );
  });

  it('given the default table then the SPC SPC entry renders as SPC', () => {
    freshSpec();
    assert.ok(keypadRows('').some(([k]) => k === 'SPC'));
  });

  const QWERTY: Map<string, string> = new Map([
    ...Array.from(
      { length: 10 },
      (_, n) => [String(n), `meow-expand-${n}`] as [string, string],
    ),
    ['-', 'meow-negative-argument'],
    [';', 'meow-reverse'],
    [',', 'meow-inner-of-thing'],
    ['.', 'meow-bounds-of-thing'],
    ['[', 'meow-beginning-of-thing'],
    [']', 'meow-end-of-thing'],
    ['<', 'meow-beginning-of-thing'],
    ['>', 'meow-end-of-thing'],
    ['a', 'meow-append'],
    ['A', 'meow-open-below'],
    ['b', 'meow-back-word'],
    ['B', 'meow-back-symbol'],
    ['c', 'meow-change'],
    ['d', 'meow-delete'],
    ['D', 'meow-backward-delete'],
    ['e', 'meow-next-word'],
    ['E', 'meow-next-symbol'],
    ['f', 'meow-find'],
    ['g', 'meow-cancel-selection'],
    ['G', 'meow-grab'],
    ['h', 'meow-left'],
    ['H', 'meow-left-expand'],
    ['i', 'meow-insert'],
    ['I', 'meow-open-above'],
    ['j', 'meow-next'],
    ['J', 'meow-next-expand'],
    ['k', 'meow-prev'],
    ['K', 'meow-prev-expand'],
    ['l', 'meow-right'],
    ['L', 'meow-right-expand'],
    ['m', 'meow-join'],
    ['n', 'meow-search'],
    ['o', 'meow-block'],
    ['O', 'meow-to-block'],
    ['p', 'meow-yank'],
    ['q', 'meow-quit'],
    ['Q', 'meow-goto-line'],
    ['r', 'meow-replace'],
    ['R', 'meow-swap-grab'],
    ['s', 'meow-kill'],
    ['t', 'meow-till'],
    ['u', 'meow-undo'],
    ['U', 'meow-undo-in-selection'],
    ['v', 'meow-visit'],
    ['w', 'meow-mark-word'],
    ['W', 'meow-mark-symbol'],
    ['x', 'meow-line'],
    ['X', 'meow-goto-line'],
    ['y', 'meow-save'],
    ['Y', 'meow-sync-grab'],
    ['z', 'meow-pop-selection'],
    ["'", 'repeat'],
  ]);
});
