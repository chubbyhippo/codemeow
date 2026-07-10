// Copyright (C) 2026 Chubby Hippo
// SPDX-License-Identifier: GPL-3.0-or-later
// (see LICENSE for the full GPL-3.0-or-later text)

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { freshSpec } from './helpers';
import { Rc } from '../core/rc';
import { keypadRows } from '../core/whichKey';
import { MeowMode } from '../core/state';

describe('RcSpec', () => {
  // ~/.codemeowrc parsing, nmap/mmap/map dispatch (including relayouting the
  // meow keys themselves), and which-key rows.

  // ------------------------------------------------------------------ parsing

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

  it('given a parameterized action then the whole serialized command is kept', () => {
    // VS Code ids are always bare (args travel as JSON, never inside the id) —
    // the commandId(param=value,...) form exists in the shared rc dialect
    // because some sibling ports' hosts serialize command parameters into the
    // id. An rc written for one meow port must keep parsing in the others:
    // the line binds as an action, never as a keys-replay.
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
    // bundled defaults stay beneath
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
      'set clipboard+=unnamedplus', // pasted from .ideavimrc: ignored
      'let mapleader=" "',
    ]);
    assert.equal(c.whichKey, false);
    assert.equal(c.whichKeyDelayMs, 400);
    assert.deepEqual(c.errors, []);
  });

  it('which-key settings layer user over bundled defaults', () => {
    const s = freshSpec();
    // empty user config: the bundled file's `set which-key` / timeoutlen=300
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
    // the layout block must define meow's full QWERTY layout (Q and S are the
    // deliberate avy overrides further down the file)
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
    // the keypad table lives in the file too — nothing is bound in code
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
    assert.ok(
      d.keypad.size > 150,
      `keypad table + ported leader groups (got ${d.keypad.size})`,
    );
  });

  it('given bad lines then errors are collected with line numbers', () => {
    const c = Rc.parse([
      'frobnicate everything', // unknown command
      'nmap <Space> ,b', // SPC is reserved
      'map <leader>1 <action>(X)', // keypad digits are reserved
      'nmap Q <CR>', // unsupported key token
      'mmap <leader>x ,b', // keypad entries are mode-independent
    ]);
    assert.equal(c.errors.length, 5);
    assert.ok(c.errors[0].startsWith('line 1'));
  });

  // ------------------------------------------------------------------ dispatch

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
    s.thenSelection('one two'); // Y -> user B -> whole buffer
  });

  it('given nnoremap then the RHS runs the bundled default instead', async () => {
    const s = freshSpec();
    s.given('two words', 'one two<caret>');
    s.givenRc('nmap B ,b\nnnoremap Z B');
    await s.whenKeys('Z');
    s.thenSelection('two'); // bundled-default B = back-symbol, not the user map
  });

  it('given a self-referencing map then recursion is depth-limited', async () => {
    const s = freshSpec();
    s.given('plain', '<caret>hello');
    s.givenRc('nmap Z Z');
    await s.whenKeys('Z'); // must terminate via the depth guard
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
    s.givenRc('map <leader>bb ,b'); // bundled-default SPC b b = MRU editors
    await s.whenKeys(' bb');
    s.thenSelection('one two');
  });

  it('given a layout rebinding then the key runs the meow command', async () => {
    const s = freshSpec();
    s.given('two words', 'on<caret>e two');
    s.givenRc('nmap n meow-mark-word'); // bundled-default n = meow-search
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
    // read-only documents stay in NORMAL these days (like Emacs read-only
    // buffers); the mmap table applies to the MOTION state proper
    const s = freshSpec();
    s.given('three lines', '<caret>one\ntwo\nthree');
    s.givenRc('mmap n meow-next');
    s.st.mode = MeowMode.MOTION;
    await s.whenKeys('n');
    assert.equal(s.caretLine(), 1);
    await s.whenKeys('j'); // the default motion keys stay underneath
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

  // ------------------------------------------------------------------ which-key

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

  /**
   * meow's suggested QWERTY layout (KEYBINDING_QWERTY in meow's README;
   * `<` and `>` are aliases for `[` and `]`) — the contract the bundled
   * .codemeowrc layout block must satisfy. Identical to ideameow's contract,
   * so the two plugins can never drift apart silently.
   */
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
