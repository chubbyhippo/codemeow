// Copyright (C) 2026 Chubby Hippo
// SPDX-License-Identifier: GPL-3.0-or-later
// (see LICENSE for the full GPL-3.0-or-later text)

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { freshSpec } from './helpers';
import { SelType } from '../core/state';

describe('MovementSpec', () => {
  it('given a caret when l then it moves right without selecting', async () => {
    const s = freshSpec();
    s.given('plain text', '<caret>hello');
    await s.whenKeys('l');
    s.thenCaretAt(1);
    s.thenNoSelection();
  });

  it('given a caret when h then it moves left', async () => {
    const s = freshSpec();
    s.given('plain text', 'he<caret>llo');
    await s.whenKeys('h');
    s.thenCaretAt(1);
    s.thenNoSelection();
  });

  it('given two lines when j then caret moves to next line', async () => {
    const s = freshSpec();
    s.given('two lines', '<caret>one\ntwo');
    await s.whenKeys('j');
    assert.equal(s.caretLine(), 1);
  });

  it('given a count when 2 l then caret moves two chars (digit argument)', async () => {
    const s = freshSpec();
    s.given('plain text', '<caret>hello');
    await s.whenKeys('2l');
    s.thenCaretAt(2);
    s.thenNoSelection();
  });

  it('given four lines when 3 j then caret moves three lines down', async () => {
    const s = freshSpec();
    s.given('four lines', '<caret>a\nb\nc\nd');
    await s.whenKeys('3j');
    assert.equal(s.caretLine(), 3);
  });

  it('given negative argument when - 2 j then caret moves two lines up', async () => {
    const s = freshSpec();
    s.given('four lines', 'a\nb\nc\n<caret>d');
    await s.whenKeys('-2j');
    assert.equal(s.caretLine(), 1);
  });

  it('given no selection when H then a char selection is created leftwards', async () => {
    const s = freshSpec();
    s.given('plain text', 'hel<caret>lo');
    await s.whenKeys('H');
    s.thenSelection('l');
    s.thenSelType(SelType.CHAR);
    s.thenCaretAtSelectionStart();
  });

  it('given a char selection when h then the selection survives and extends (meow keeps char selections)', async () => {
    const s = freshSpec();
    s.given('plain text', 'hel<caret>lo');
    await s.whenKeys('Hh');
    s.thenSelection('el');
    s.thenSelType(SelType.CHAR);
  });

  it('given a word selection when h then the selection is cancelled (only char selections survive)', async () => {
    const s = freshSpec();
    s.given('plain text', '<caret>hello world');
    await s.whenKeys('w');
    s.thenSelection('hello');
    await s.whenKeys('h');
    s.thenNoSelection();
  });

  it('given L J then char selection extends right and down', async () => {
    const s = freshSpec();
    s.given('two lines', '<caret>ab\ncd');
    await s.whenKeys('LJ');
    s.thenSelType(SelType.CHAR);
    assert.notEqual(s.selectedText(), undefined);
    s.thenCaretAtSelectionEnd();
  });

  it('given an undefined key in NORMAL then it is swallowed and types nothing', async () => {
    const s = freshSpec();
    s.given('plain text', '<caret>hello');
    await s.whenKeys('#%');
    s.thenText('hello');
  });

  it('given the caret at bol when h then it crosses to the previous line end', async () => {
    const s = freshSpec();
    s.given('two lines', 'abc\n<caret>def');
    await s.whenKeys('h');
    s.thenCaretAt(3);
    s.thenNoSelection();
  });

  it('given the caret at eol when l then it crosses to the next line start', async () => {
    const s = freshSpec();
    s.given('two lines', 'abc<caret>\ndef');
    await s.whenKeys('l');
    s.thenCaretAt(4);
  });

  it('given j j through a short line then the goal column is kept', async () => {
    const s = freshSpec();
    s.given('short middle line', 'abcd<caret>ef\nxy\nlmnopq');
    await s.whenKeys('j');
    s.thenCaretAt(9);
    await s.whenKeys('j');
    s.thenCaretAt(14);
  });

  it('given j on the last line then the caret moves to the end of buffer', async () => {
    const s = freshSpec();
    s.given('two lines', 'ab\nc<caret>def');
    await s.whenKeys('j');
    s.thenCaretAt(7);
  });

  it('given k on the first line then the caret moves to the beginning of buffer', async () => {
    const s = freshSpec();
    s.given('two lines', 'a<caret>bc\ndef');
    await s.whenKeys('k');
    s.thenCaretAt(0);
  });
});
