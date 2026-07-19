// Copyright (C) 2026 Chubby Hippo
// SPDX-License-Identifier: GPL-3.0-or-later
// (see LICENSE for the full GPL-3.0-or-later text)

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { freshSpec } from './helpers';
import { SelType } from '../core/state';

describe('EmacsMotionSpec', () => {
  it('given no selection when forward-char then the caret moves right without selecting', async () => {
    const s = freshSpec();
    s.given('plain text', '<caret>hello');
    await s.whenCommand('forward-char');
    s.thenCaretAt(1);
    s.thenNoSelection();
  });

  it('given no selection when backward-char then the caret moves left without selecting', async () => {
    const s = freshSpec();
    s.given('plain text', 'he<caret>llo');
    await s.whenCommand('backward-char');
    s.thenCaretAt(1);
    s.thenNoSelection();
  });

  it('given no selection when next-line then the caret moves down without selecting', async () => {
    const s = freshSpec();
    s.given('two lines', '<caret>one\ntwo');
    await s.whenCommand('next-line');
    assert.equal(s.caretLine(), 1);
    s.thenNoSelection();
  });

  it('given no selection when previous-line then the caret moves up without selecting', async () => {
    const s = freshSpec();
    s.given('two lines', 'one\nt<caret>wo');
    await s.whenCommand('previous-line');
    assert.equal(s.caretLine(), 0);
    s.thenNoSelection();
  });

  it('given no selection when move-beginning-of-line then the caret goes to column zero', async () => {
    const s = freshSpec();
    s.given('indented line', 'hel<caret>lo world');
    await s.whenCommand('move-beginning-of-line');
    s.thenCaretAt(0);
    s.thenNoSelection();
  });

  it('given no selection when move-end-of-line then the caret goes to eol', async () => {
    const s = freshSpec();
    s.given('plain text', 'he<caret>llo');
    await s.whenCommand('move-end-of-line');
    s.thenCaretAt(5);
    s.thenNoSelection();
  });

  it('given no selection when forward-word then the caret lands at the end of the next word', async () => {
    const s = freshSpec();
    s.given('comma separated', '<caret>word1, word2');
    await s.whenCommand('forward-word');
    s.thenCaretAt(5);
    s.thenNoSelection();
  });

  it('given no selection when backward-word then the caret lands at the start of the word', async () => {
    const s = freshSpec();
    s.given('two words', 'hello world<caret>');
    await s.whenCommand('backward-word');
    s.thenCaretAt(6);
    s.thenNoSelection();
  });

  it('given no selection when forward-sentence then the caret lands past the sentence', async () => {
    const s = freshSpec();
    s.given('three sentences', '<caret>One. Two. Three.');
    await s.whenCommand('forward-sentence');
    s.thenCaretAt(5);
    s.thenNoSelection();
  });

  it('given no selection when backward-sentence then the caret lands at the sentence start', async () => {
    const s = freshSpec();
    s.given('three sentences', 'One. Two. Thr<caret>ee.');
    await s.whenCommand('backward-sentence');
    s.thenCaretAt(10);
    s.thenNoSelection();
  });

  it('given w then forward-char extends the selection one char forward', async () => {
    const s = freshSpec();
    s.given('two words', '<caret>hello world');
    await s.whenKeys('w');
    s.thenSelection('hello');
    await s.whenCommand('forward-char');
    s.thenSelection('hello ');
    s.thenSelType(SelType.CHAR);
    s.thenCaretAtSelectionEnd();
  });

  it('given w then backward-char shrinks the selection from its end', async () => {
    const s = freshSpec();
    s.given('two words', '<caret>hello world');
    await s.whenKeys('w');
    s.thenSelection('hello');
    await s.whenCommand('backward-char');
    s.thenSelection('hell');
  });

  it('given w then next-line extends the selection down', async () => {
    const s = freshSpec();
    s.given('word then a second line', '<caret>hello\nworld');
    await s.whenKeys('w');
    s.thenSelection('hello');
    await s.whenCommand('next-line');
    s.thenSelection('hello\nworld');
  });

  it('given w then move-end-of-line extends the selection to eol', async () => {
    const s = freshSpec();
    s.given('three words', '<caret>hello brave world');
    await s.whenKeys('w');
    s.thenSelection('hello');
    await s.whenCommand('move-end-of-line');
    s.thenSelection('hello brave world');
  });

  it('given caret mid-line when w then move-beginning-of-line extends the selection to bol', async () => {
    const s = freshSpec();
    s.given('three words', 'hello <caret>brave world');
    await s.whenKeys('w');
    s.thenSelection('brave');
    await s.whenCommand('move-beginning-of-line');
    s.thenSelection('hello ');
    s.thenCaretAtSelectionStart();
  });

  it('given w then forward-word extends the word selection (chains with e)', async () => {
    const s = freshSpec();
    s.given('three words', '<caret>one two three');
    await s.whenKeys('w');
    s.thenSelection('one');
    await s.whenCommand('forward-word');
    s.thenSelection('one two');
    s.thenSelType(SelType.WORD);
    await s.whenKeys('e');
    s.thenSelection('one two three');
  });

  it('given w then forward-sentence extends the selection through the next sentence', async () => {
    const s = freshSpec();
    s.given('two sentences', '<caret>One. Two.');
    await s.whenKeys('w');
    s.thenSelection('One');
    await s.whenCommand('forward-sentence');
    s.thenSelection('One. ');
    await s.whenCommand('forward-sentence');
    s.thenSelection('One. Two.');
  });

  it('given w then semicolon then forward-char shrinks from the start (reversed anchor)', async () => {
    const s = freshSpec();
    s.given('two words', '<caret>hello world');
    await s.whenKeys('w');
    s.thenSelection('hello');
    s.thenCaretAtSelectionEnd();
    await s.whenKeys(';');
    s.thenCaretAtSelectionStart();
    await s.whenCommand('forward-char');
    s.thenSelection('ello');
    s.thenCaretAtSelectionStart();
  });

  it('given w then semicolon then backward-char extends past the start', async () => {
    const s = freshSpec();
    s.given('leading padding then two words', ' <caret>hello world');
    await s.whenKeys('w');
    s.thenSelection('hello');
    await s.whenKeys(';');
    s.thenCaretAtSelectionStart();
    await s.whenCommand('backward-char');
    s.thenSelection(' hello');
    s.thenCaretAtSelectionStart();
  });

  it('given a reversed line selection then previous-line extends further up', async () => {
    const s = freshSpec();
    s.given('three lines', 'one\ntwo\nth<caret>ree');
    await s.whenKeys('x');
    await s.whenKeys(';');
    s.thenCaretAtSelectionStart();
    await s.whenCommand('previous-line');
    s.thenSelection('two\nthree');
  });

  it('given beacon cursors when forward-char then every cursor extends its own selection', async () => {
    const s = freshSpec();
    s.given('repeats with identical trailing context', '<caret>foo. foo. foo.');
    await s.whenKeys(',bG');
    s.givenCaretAt(0);
    await s.whenKeys('w');
    s.thenCaretCount(3);
    await s.whenCommand('forward-char');
    assert.deepEqual(
      s.editor.sels.map((sel) => sel.active).sort((a, b) => a - b),
      [4, 9, 14],
    );
  });

  it('given no selection when beginning-of-buffer then the caret goes to point-min', async () => {
    const s = freshSpec();
    s.given('two lines', 'one\nt<caret>wo');
    await s.whenCommand('beginning-of-buffer');
    s.thenCaretAt(0);
    s.thenNoSelection();
  });

  it('given no selection when end-of-buffer then the caret goes to point-max', async () => {
    const s = freshSpec();
    s.given('two lines', 'on<caret>e\ntwo');
    await s.whenCommand('end-of-buffer');
    s.thenCaretAt(7);
    s.thenNoSelection();
  });

  it('given w then end-of-buffer extends the selection to point-max', async () => {
    const s = freshSpec();
    s.given('two words', '<caret>hello world');
    await s.whenKeys('w');
    s.thenSelection('hello');
    await s.whenCommand('end-of-buffer');
    s.thenSelection('hello world');
    s.thenCaretAtSelectionEnd();
  });

  it('given w then beginning-of-buffer extends the selection back to point-min', async () => {
    const s = freshSpec();
    s.given('prefixed word', 'ab <caret>hello');
    await s.whenKeys('w');
    s.thenSelection('hello');
    await s.whenCommand('beginning-of-buffer');
    s.thenSelection('ab ');
    s.thenCaretAtSelectionStart();
  });

  it('given a count when beginning-of-buffer then the caret lands at the next line start past that tenth', async () => {
    const s = freshSpec();
    s.given(
      'five ten-char lines',
      '<caret>0123456789\n0123456789\n0123456789\n0123456789\n0123456789',
    );
    await s.whenKeys('3');
    await s.whenCommand('beginning-of-buffer');
    s.thenCaretAt(22);
    s.thenNoSelection();
  });

  it('given a count when end-of-buffer then the caret lands a tenth back at the next line start', async () => {
    const s = freshSpec();
    s.given(
      'five ten-char lines',
      '<caret>0123456789\n0123456789\n0123456789\n0123456789\n0123456789',
    );
    await s.whenKeys('3');
    await s.whenCommand('end-of-buffer');
    s.thenCaretAt(44);
    s.thenNoSelection();
  });

  it('given a count landing on a line boundary when beginning-of-buffer then the caret lands one line past that tenth', async () => {
    const s = freshSpec();
    s.given('three two-char lines', '<caret>aa\naa\naa\n');
    await s.whenKeys('3');
    await s.whenCommand('beginning-of-buffer');
    s.thenCaretAt(3);
    s.thenNoSelection();
  });

  it('given a long-short-long buffer then repeated next-line keeps the goal column across the short line', async () => {
    const s = freshSpec();
    s.given('long short long', '01234567<caret>89\nab\n0123456789');
    await s.whenCommand('next-line');
    await s.whenCommand('next-line');
    s.thenCaretAt(22);
    s.thenNoSelection();
  });

  it('given no selection when forward-paragraph then the caret lands on the separator blank line', async () => {
    const s = freshSpec();
    s.given('two paragraphs', 'a<caret>aa\nbbb\n\nccc');
    await s.whenCommand('forward-paragraph');
    s.thenCaretAt(8);
    s.thenNoSelection();
  });

  it('given no selection when backward-paragraph then the caret lands on the empty line joining the paragraph start', async () => {
    const s = freshSpec();
    s.given('two paragraphs', 'aaa\n\nbb<caret>b');
    await s.whenCommand('backward-paragraph');
    s.thenCaretAt(4);
    s.thenNoSelection();
  });

  it('given a caret on a blank line when forward-paragraph then it crosses to the next paragraph end', async () => {
    const s = freshSpec();
    s.given('blank line between paragraphs', 'aaa\n<caret>\nbbb\n\nccc');
    await s.whenCommand('forward-paragraph');
    s.thenCaretAt(9);
    s.thenNoSelection();
  });

  it('given a caret on a blank line when backward-paragraph then it lands at the previous paragraph start', async () => {
    const s = freshSpec();
    s.given('blank line after two-line paragraph', 'aaa\nbbb\n<caret>\nccc');
    await s.whenCommand('backward-paragraph');
    s.thenCaretAt(0);
    s.thenNoSelection();
  });

  it('given a whitespace-only separator when backward-paragraph then the caret stops at the paragraph text start', async () => {
    const s = freshSpec();
    s.given('space-only separator line', 'aaa\n \nbb<caret>b');
    await s.whenCommand('backward-paragraph');
    s.thenCaretAt(6);
    s.thenNoSelection();
  });

  it('given consecutive empty lines when backward-paragraph then only the adjacent one joins the paragraph start', async () => {
    const s = freshSpec();
    s.given('two empty separator lines', 'aaa\n\n\nbb<caret>b');
    await s.whenCommand('backward-paragraph');
    s.thenCaretAt(5);
    s.thenNoSelection();
  });

  it('given a count when forward-paragraph then the caret walks that many paragraph ends', async () => {
    const s = freshSpec();
    s.given('three paragraphs', 'a<caret>aa\n\nbbb\n\nccc');
    await s.whenKeys('2');
    await s.whenCommand('forward-paragraph');
    s.thenCaretAt(9);
    s.thenNoSelection();
  });

  it('given the last paragraph when forward-paragraph then the caret goes to point-max', async () => {
    const s = freshSpec();
    s.given('two paragraphs', 'aaa\n\nbb<caret>b');
    await s.whenCommand('forward-paragraph');
    s.thenCaretAt(8);
    s.thenNoSelection();
  });

  it('given w then forward-paragraph extends the selection through the paragraph end', async () => {
    const s = freshSpec();
    s.given('paragraph then another', '<caret>hello world\n\nnext');
    await s.whenKeys('w');
    s.thenSelection('hello');
    await s.whenCommand('forward-paragraph');
    s.thenSelection('hello world\n');
    s.thenSelType(SelType.CHAR);
    s.thenCaretAtSelectionEnd();
  });

  it('given w then backward-paragraph extends the selection back past the paragraph start', async () => {
    const s = freshSpec();
    s.given('paragraph after a blank line', 'aaa\n\nhello wo<caret>rld');
    await s.whenKeys('w');
    s.thenSelection('world');
    await s.whenCommand('backward-paragraph');
    s.thenSelection('\nhello ');
    s.thenCaretAtSelectionStart();
  });
});
