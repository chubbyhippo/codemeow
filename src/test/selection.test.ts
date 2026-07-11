// Copyright (C) 2026 Chubby Hippo
// SPDX-License-Identifier: GPL-3.0-or-later
// (see LICENSE for the full GPL-3.0-or-later text)

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { freshSpec } from './helpers';
import { SelType } from '../core/state';

describe('SelectionSpec', () => {
  it('given caret on a word when w then the word is marked and caret sits at its end', async () => {
    const s = freshSpec();
    s.given('two words', '<caret>hello world');
    await s.whenKeys('w');
    s.thenSelection('hello');
    s.thenSelType(SelType.WORD);
    s.thenCaretAtSelectionEnd();
  });

  it('given caret between words when w then the next word is marked', async () => {
    const s = freshSpec();
    s.given('gap between words', 'hello <caret> world');
    await s.whenKeys('w');
    s.thenSelection('world');
  });

  it('given a symbol with underscore when W then the whole symbol is marked', async () => {
    const s = freshSpec();
    s.given('snake case', '<caret>foo_bar baz');
    await s.whenKeys('W');
    s.thenSelection('foo_bar');
    s.thenSelType(SelType.SYMBOL);
  });

  it('given w then W distinction - w stops at underscore boundary chars', async () => {
    const s = freshSpec();
    s.given('snake case', '<caret>foo_bar baz');
    await s.whenKeys('w');
    s.thenSelection('foo');
  });

  it('given a bare e when pressed twice then it steps word by word (non-expandable)', async () => {
    const s = freshSpec();
    s.given('three words', '<caret>one two three');
    await s.whenKeys('e');
    s.thenSelection('one');
    await s.whenKeys('e');
    s.thenSelection('two');
  });

  it('given words separated by punctuation when e e e then each selection is one bare word', async () => {
    const s = freshSpec();
    s.given('comma separated', '<caret>word1, word2 word3');
    await s.whenKeys('ee');
    s.thenSelection('word2');
    await s.whenKeys('e');
    s.thenSelection('word3');
    s.thenCaretAtSelectionEnd();
  });

  it('given b b b from the end then each selection is one bare word', async () => {
    const s = freshSpec();
    s.given('comma separated', 'word1, word2 word3<caret>');
    await s.whenKeys('b');
    s.thenSelection('word3');
    s.thenCaretAtSelectionStart();
    await s.whenKeys('bb');
    s.thenSelection('word1');
  });

  it('given e then b then the same word is re-selected backward', async () => {
    const s = freshSpec();
    s.given('comma separated', '<caret>word1, word2 word3');
    await s.whenKeys('eb');
    s.thenSelection('word1');
    s.thenCaretAtSelectionStart();
  });

  it('given a selection of another type when e then the history restarts at the cancel', async () => {
    const s = freshSpec();
    s.given('two lines', '<caret>hello world\nnext line');
    await s.whenKeys('x');
    s.thenSelection('hello world');
    await s.whenKeys('e');
    s.thenSelection('next');
    await s.whenKeys('z');
    s.thenNoSelection();
    s.thenCaretAt(11);
  });

  it('given w first when e then the word selection extends (meow expand-word rule)', async () => {
    const s = freshSpec();
    s.given('three words', '<caret>one two three');
    await s.whenKeys('we');
    s.thenSelection('one two');
    await s.whenKeys('e');
    s.thenSelection('one two three');
  });

  it('given w then b extends the selection backward anchored at the word end', async () => {
    const s = freshSpec();
    s.given('three words', 'one t<caret>wo three');
    await s.whenKeys('w');
    s.thenSelection('two');
    await s.whenKeys('b');
    s.thenSelection('one two');
    s.thenCaretAtSelectionStart();
  });

  it('given w b then e re-normalizes forward and extends to the right', async () => {
    const s = freshSpec();
    s.given('three words', 'one t<caret>wo three');
    await s.whenKeys('wbe');
    s.thenSelection('one two three');
    s.thenCaretAtSelectionEnd();
  });

  it('given W then B extends the symbol selection backward', async () => {
    const s = freshSpec();
    s.given('symbols', 'foo_a bar_b<caret> baz_c');
    await s.whenKeys('W');
    s.thenSelection('bar_b');
    await s.whenKeys('B');
    s.thenSelection('foo_a bar_b');
    s.thenCaretAtSelectionStart();
  });

  it('given caret at end when b then selects back to word beginning', async () => {
    const s = freshSpec();
    s.given('two words', 'hello world<caret>');
    await s.whenKeys('b');
    s.thenSelection('world');
    s.thenCaretAtSelectionStart();
  });

  it('given negative argument when - e then selects backward like b', async () => {
    const s = freshSpec();
    s.given('two words', 'hello<caret> world');
    await s.whenKeys('-e');
    s.thenSelection('hello');
    s.thenCaretAtSelectionStart();
  });

  it('given E and B then symbol variants honor underscores', async () => {
    const s = freshSpec();
    s.given('snake case', '<caret>foo_bar baz');
    await s.whenKeys('E');
    s.thenSelection('foo_bar');
    s.thenSelType(SelType.SYMBOL);
  });

  it('given x then the current line is selected without the newline', async () => {
    const s = freshSpec();
    s.given('two lines', 'li<caret>ne one\nline two');
    await s.whenKeys('x');
    s.thenSelection('line one');
    s.thenSelType(SelType.LINE);
    s.thenCaretAtSelectionEnd();
  });

  it('given a line selection when x again then it extends one line down', async () => {
    const s = freshSpec();
    s.given('three lines', '<caret>one\ntwo\nthree');
    await s.whenKeys('xx');
    s.thenSelection('one\ntwo');
  });

  it('given a reversed line selection when x then it extends upward', async () => {
    const s = freshSpec();
    s.given('three lines', 'one\ntwo\nth<caret>ree');
    await s.whenKeys('x;x');
    s.thenSelection('two\nthree');
    s.thenCaretAtSelectionStart();
  });

  it('given a selection then expand hints overlay the text without inserting inline content', async () => {
    const s = freshSpec();
    s.given('three words', '<caret>hello world again');
    await s.whenKeys('w');
    assert.ok(s.ui.expandHints.length > 0, 'hint positions computed');
    assert.equal(s.ui.expandHints[0], 11);
    await s.whenKeys('g');
    assert.equal(s.ui.expandHints.length, 0);
  });

  it('given a find selection when the target char sits at the caret then the first hint marks it', async () => {
    const s = freshSpec();
    s.given('chars', '<caret>aXX');
    await s.whenKeys('fX');
    assert.deepEqual(s.ui.expandHints, [3]);
  });

  it('given digits after w then the selection expands by that many words', async () => {
    const s = freshSpec();
    s.given('five words', '<caret>one two three four five');
    await s.whenKeys('w2');
    s.thenSelection('one two three');
  });

  it('given 0 after a word mark then the selection expands by ten units', async () => {
    const s = freshSpec();
    s.given('twelve words', '<caret>a b c d e f g h i j k l');
    await s.whenKeys('w0');
    s.thenSelection('a b c d e f g h i j k');
  });

  it('given digits after x then the selection expands by lines', async () => {
    const s = freshSpec();
    s.given('three lines', '<caret>one\ntwo\nthree');
    await s.whenKeys('x2');
    s.thenSelection('one\ntwo\nthree');
  });

  it('given a reversed selection when digit then it expands backward', async () => {
    const s = freshSpec();
    s.given('three lines', 'one\ntwo\nthr<caret>ee');
    await s.whenKeys('x;1');
    s.thenSelection('two\nthree');
  });

  it('given semicolon then point and mark swap (meow-reverse)', async () => {
    const s = freshSpec();
    s.given('two words', '<caret>hello world');
    await s.whenKeys('w');
    s.thenCaretAtSelectionEnd();
    await s.whenKeys(';');
    s.thenSelection('hello');
    s.thenCaretAtSelectionStart();
    await s.whenKeys(';');
    s.thenCaretAtSelectionEnd();
  });

  it('given goto line via minibuffer then that line is selected (meow-goto-line expands line selection)', async () => {
    const s = freshSpec();
    s.given('three lines', '<caret>one\ntwo\nthree');
    s.givenMinibufferAnswers('2');
    await s.whenKeys('X');
    s.thenSelection('two');
    s.thenSelType(SelType.LINE);
  });

  it('given Q then goto-line as well (QWERTY binds both Q and X)', async () => {
    const s = freshSpec();
    s.given('three lines', '<caret>one\ntwo\nthree');
    s.givenRc('nmap Q meow-goto-line');
    s.givenMinibufferAnswers('3');
    await s.whenKeys('Q');
    s.thenSelection('three');
  });

  it('given a selection history when z then the previous selection is restored with its type', async () => {
    const s = freshSpec();
    s.given('two words', '<caret>hello world');
    await s.whenKeys('w');
    await s.whenKeys('x');
    await s.whenKeys('z');
    s.thenSelection('hello');
    s.thenSelType(SelType.WORD);
    s.thenCaretAtSelectionEnd();
  });

  it('given w then z then the caret returns to where the chain started (null placeholder)', async () => {
    const s = freshSpec();
    s.given('two words', 'he<caret>llo world');
    await s.whenKeys('w');
    s.thenSelection('hello');
    await s.whenKeys('z');
    s.thenNoSelection();
    s.thenCaretAt(2);
  });

  it('given g then the selection history is cleared (meow--cancel-selection)', async () => {
    const s = freshSpec();
    s.given('two words', '<caret>hello world');
    await s.whenKeys('wxg');
    await s.whenKeys('z');
    s.thenNoSelection();
  });

  it('given a digit expand then the selection is demoted to select type', async () => {
    const s = freshSpec();
    s.given('five words', '<caret>one two three four five');
    await s.whenKeys('w2');
    s.thenSelection('one two three');
    await s.whenKeys('e');
    s.thenSelection('four');
  });

  it('given x 2 then x re-selects the current line instead of extending', async () => {
    const s = freshSpec();
    s.given('four lines', '<caret>one\ntwo\nthree\nfour');
    await s.whenKeys('x2');
    s.thenSelection('one\ntwo\nthree');
    await s.whenKeys('x');
    s.thenSelection('three');
  });

  it('given no history but a grab when z then the grab becomes the selection (meow-pop-grab fallback)', async () => {
    const s = freshSpec();
    s.given('two words', '<caret>hello world');
    await s.whenKeys('wG');
    s.st.selectionHistory = [];
    await s.whenKeys('z');
    s.thenSelection('hello');
    assert.equal(s.st.grab, null, 'grab is consumed by pop');
  });

  it('given g then the selection is cancelled', async () => {
    const s = freshSpec();
    s.given('two words', '<caret>hello world');
    await s.whenKeys('w');
    s.thenSelection('hello');
    await s.whenKeys('g');
    s.thenNoSelection();
  });
});
