// Copyright (C) 2026 Chubby Hippo
// SPDX-License-Identifier: GPL-3.0-or-later
// (see LICENSE for the full GPL-3.0-or-later text)

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { freshSpec, Spec } from './helpers';
import { MeowMode } from '../core/state';
import * as Engine from '../core/engine';

describe('ModesKeypadSpec', () => {
  it('given INSERT when escape then back to NORMAL', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello');
    await s.whenKeys('i');
    s.thenMode(MeowMode.INSERT);
    s.pressEsc();
    s.thenMode(MeowMode.NORMAL);
  });

  it('given beacon cursors in NORMAL when escape then they collapse', async () => {
    const s = freshSpec();
    s.given('repeats', '<caret>foo bar foo');
    await s.whenKeys(',bG');
    s.givenCaretAt(0);
    await s.whenKeys('w');
    s.thenCaretCount(2);
    s.pressEsc();
    s.thenCaretCount(1);
    s.thenMode(MeowMode.NORMAL);
  });

  it('given a pending find when escape then the pending key is dropped', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello');
    await s.whenKeys('f');
    assert.notEqual(s.st.pending, null);
    s.pressEsc();
    assert.equal(s.st.pending, null);
    await s.whenKeys('l');
    s.thenCaretAt(1);
  });

  it('given nothing meow-related when escape then it reports unhandled', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello');
    assert.equal(
      s.pressEsc(),
      false,
      'the host may fall through to its own escape',
    );
  });

  it('given a read-only document then all motions work and the modify commands are inert', async () => {
    const s = freshSpec();
    s.given('two lines', '<caret>one\ntwo');
    s.givenReadOnly();
    await s.whenKeys('j');
    assert.equal(s.caretLine(), 1);
    await s.whenKeys('kw');
    s.thenSelection('one');
    await s.whenKeys('s');
    s.thenText('one\ntwo');
    s.thenSelection('one');
    await s.whenKeys('y');
    s.thenClipboard('one');
    await s.whenKeys('d');
    await s.whenKeys('p');
    s.thenText('one\ntwo');
    s.thenMode(MeowMode.NORMAL);
  });

  const fireKeypadAction = (s: Spec): void => Engine.enterKeypad(s.ctx);

  it('given INSERT when the keypad action fires then a keypad command returns to INSERT', async () => {
    const s = freshSpec();
    s.given('word', 'ab<caret>cd');
    s.givenRc('map <leader>zz meow-left');
    await s.whenKeys('i');
    s.thenMode(MeowMode.INSERT);
    fireKeypadAction(s);
    s.thenMode(MeowMode.KEYPAD);
    assert.deepEqual(
      s.ui.modes,
      [MeowMode.INSERT, MeowMode.KEYPAD],
      'the adapter swaps INSERT bar for the KEYPAD block cursor',
    );
    await s.whenKeys('zz');
    s.thenMode(MeowMode.INSERT);
    assert.deepEqual(
      s.ui.modes,
      [MeowMode.INSERT, MeowMode.KEYPAD, MeowMode.INSERT],
      "back to INSERT's bar cursor",
    );
    s.thenCaretAt(1);
  });

  it('given INSERT when the keypad action then escape then back to INSERT', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello');
    await s.whenKeys('i');
    fireKeypadAction(s);
    s.thenMode(MeowMode.KEYPAD);
    s.pressEsc();
    s.thenMode(MeowMode.INSERT);
  });

  it('given NORMAL when the keypad action fires then KEYPAD round-trips to NORMAL', () => {
    const s = freshSpec();
    s.given('word', '<caret>hello');
    fireKeypadAction(s);
    s.thenMode(MeowMode.KEYPAD);
    s.pressEsc();
    s.thenMode(MeowMode.NORMAL);
  });

  it('given SPC then KEYPAD opens and a digit becomes the count for the next command', async () => {
    const s = freshSpec();
    s.given('four lines', '<caret>a\nb\nc\nd');
    await s.whenKeys(' ');
    s.thenMode(MeowMode.KEYPAD);
    await s.whenKeys('3');
    s.thenMode(MeowMode.NORMAL);
    await s.whenKeys('j');
    assert.equal(s.caretLine(), 3);
  });

  it('given SPC x then the keypad keeps collecting the prefix', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello');
    await s.whenKeys(' x');
    s.thenMode(MeowMode.KEYPAD);
    assert.equal(s.st.keypad, 'x');
  });

  it('given an undefined keypad sequence then KEYPAD exits back to NORMAL', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello');
    await s.whenKeys(' x~');
    s.thenMode(MeowMode.NORMAL);
    s.thenText('hello');
  });

  it('given KEYPAD when escape then back to NORMAL without dispatch', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello');
    await s.whenKeys(' x');
    s.pressEsc();
    s.thenMode(MeowMode.NORMAL);
    s.thenText('hello');
  });

  it('given a keypad action entry then the host command runs', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello');
    await s.whenKeys(' xs');
    s.thenMode(MeowMode.NORMAL);
    assert.deepEqual(s.ui.ran, ['workbench.action.files.saveAll']);
  });

  it('given SPC i d then the command-id finder runs (the ideameow Track Action IDs sibling)', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello');
    await s.whenKeys(' id');
    s.thenMode(MeowMode.NORMAL);
    assert.deepEqual(s.ui.ran, ['codemeow.commandIds']);
  });

  it('given INSERT then the adapter is told to swap the cursor, and back on escape', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello');
    await s.whenKeys('i');
    assert.deepEqual(s.ui.modes, [MeowMode.INSERT]);
    s.pressEsc();
    assert.deepEqual(s.ui.modes, [MeowMode.INSERT, MeowMode.NORMAL]);
  });
});
