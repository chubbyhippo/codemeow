// Copyright (C) 2026 Chubby Hippo
// SPDX-License-Identifier: GPL-3.0-or-later
// (see LICENSE for the full GPL-3.0-or-later text)

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { freshSpec } from './helpers';
import { SelType } from '../core/state';

describe('FindSearchSpec', () => {
  it('given f X then selects from point through the char inclusive', async () => {
    const s = freshSpec();
    s.given('marker text', '<caret>abcXdef');
    await s.whenKeys('fX');
    s.thenSelection('abcX');
    s.thenSelType(SelType.FIND);
    s.thenCaretAtSelectionEnd();
  });

  it('given t X then selects up to but excluding the char', async () => {
    const s = freshSpec();
    s.given('marker text', '<caret>abcXdef');
    await s.whenKeys('tX');
    s.thenSelection('abc');
    s.thenSelType(SelType.TILL);
  });

  it('given w then f X then a fresh find selection runs from the word end through the char', async () => {
    const s = freshSpec();
    s.given('comma separated', 'w<caret>ord1, word2 word3');
    await s.whenKeys('w');
    s.thenSelection('word1');
    await s.whenKeys('f3');
    s.thenSelection(', word2 word3');
    s.thenSelType(SelType.FIND);
    s.thenCaretAtSelectionEnd();
  });

  it('given w then t X then the till selection stops before the char', async () => {
    const s = freshSpec();
    s.given('comma separated', 'w<caret>ord1, word2 word3');
    await s.whenKeys('wt3');
    s.thenSelection(', word2 word');
    s.thenSelType(SelType.TILL);
  });

  it('given a count when 2 f a then the second occurrence is reached', async () => {
    const s = freshSpec();
    s.given('repeating', '<caret>xaxaxa');
    await s.whenKeys('2fa');
    s.thenSelection('xaxa');
  });

  it('given a find selection when digit then it expands to the next occurrence', async () => {
    const s = freshSpec();
    s.given('repeating', '<caret>xaxaxa');
    await s.whenKeys('fa1');
    s.thenSelection('xaxa');
    await s.whenKeys('1');
    s.thenSelection('xaxaxa');
  });

  it('given the char is absent when f then nothing changes', async () => {
    const s = freshSpec();
    s.given('plain', '<caret>hello');
    await s.whenKeys('fZ');
    s.thenNoSelection();
    s.thenCaretAt(0);
  });

  it('given negative argument when - f then finds backward', async () => {
    const s = freshSpec();
    s.given('repeating', 'xabc<caret>def');
    await s.whenKeys('-fa');
    s.thenSelection('abc');
    s.thenCaretAtSelectionStart();
  });

  it('given w then n repeats the pushed word search forward (meow-search)', async () => {
    const s = freshSpec();
    s.given('repeats', '<caret>foo bar foo baz foo');
    await s.whenKeys('w');
    await s.whenKeys('n');
    s.thenSelection('foo');
    assert.equal(Math.min(s.editor.sels[0].anchor, s.editor.sels[0].active), 8);
  });

  it('given repeated n then the search wraps at the end of the buffer', async () => {
    const s = freshSpec();
    s.given('repeats', '<caret>foo bar foo');
    await s.whenKeys('wnn');
    assert.equal(Math.min(s.editor.sels[0].anchor, s.editor.sels[0].active), 0);
    s.thenSelection('foo');
  });

  it('given a reversed selection when n then the search goes backward', async () => {
    const s = freshSpec();
    s.given('repeats', 'foo bar <caret>foo bar foo');
    await s.whenKeys('w');
    await s.whenKeys(';');
    await s.whenKeys('n');
    assert.equal(Math.min(s.editor.sels[0].anchor, s.editor.sels[0].active), 0);
    s.thenSelection('foo');
    s.thenCaretAtSelectionStart();
  });

  it('given a selection that does not match the pattern when n then the selection text becomes the pattern', async () => {
    const s = freshSpec();
    s.given('repeats', 'foo <caret>bar foo bar');
    s.st.searchHistory.push('zzz');
    await s.whenKeys(',e');
    await s.whenKeys('n');
    s.thenSelection('bar');
    assert.equal(
      Math.min(s.editor.sels[0].anchor, s.editor.sels[0].active),
      12,
    );
  });

  it('given no pattern and no selection when n then nothing is selected', async () => {
    const s = freshSpec();
    s.given('plain', '<caret>hello');
    await s.whenKeys('n');
    s.thenNoSelection();
  });

  it('given visit with minibuffer input then the first match after point is selected', async () => {
    const s = freshSpec();
    s.given('repeats', '<caret>alpha beta gamma beta');
    s.givenMinibufferAnswers('beta');
    await s.whenKeys('v');
    s.thenSelection('beta');
    assert.equal(Math.min(s.editor.sels[0].anchor, s.editor.sels[0].active), 6);
    s.thenSelType(SelType.VISIT);
  });

  it('given visit then n continues to the next match', async () => {
    const s = freshSpec();
    s.given('repeats', '<caret>alpha beta gamma beta');
    s.givenMinibufferAnswers('beta');
    await s.whenKeys('vn');
    assert.equal(
      Math.min(s.editor.sels[0].anchor, s.editor.sels[0].active),
      17,
    );
  });

  it('given W on a dollar symbol then n finds the next symbol occurrence', async () => {
    const s = freshSpec();
    s.given('dollar symbols', '$<caret>foo bar $foo');
    await s.whenKeys('W');
    s.thenSelection('$foo');
    await s.whenKeys('n');
    s.thenSelection('$foo');
    s.thenCaretAt(13);
  });
});
