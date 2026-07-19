// Copyright (C) 2026 Chubby Hippo
// SPDX-License-Identifier: GPL-3.0-or-later
// (see LICENSE for the full GPL-3.0-or-later text)

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as Engine from '../core/engine';
import { freshSpec } from './helpers';
import { MeowMode } from '../core/state';

describe('EditingSpec', () => {
  it('given a selection when i then INSERT starts at the selection beginning', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello world');
    await s.whenKeys('wi');
    s.thenMode(MeowMode.INSERT);
    s.thenCaretAt(0);
    s.thenNoSelection();
  });

  it('given a selection when a then INSERT starts at the selection end', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello world');
    await s.whenKeys('wa');
    s.thenMode(MeowMode.INSERT);
    s.thenCaretAt(5);
    s.thenNoSelection();
  });

  it('given no selection when i then INSERT starts at point (no cursor-position hack)', async () => {
    const s = freshSpec();
    s.given('word', 'he<caret>llo');
    await s.whenKeys('i');
    s.thenMode(MeowMode.INSERT);
    s.thenCaretAt(2);
  });

  it('given INSERT mode then printable keys are not intercepted', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello');
    await s.whenKeys('i');
    assert.equal(
      await Engine.handleChar(s.ctx, 'z'),
      false,
      'typed keys must reach the default handler in INSERT',
    );
  });

  it('given A then a line opens below and INSERT starts', async () => {
    const s = freshSpec();
    s.given('one line', 'ab<caret>cd');
    await s.whenKeys('A');
    s.thenMode(MeowMode.INSERT);
    s.thenText('abcd\n');
    s.thenCaretAt(5);
  });

  it('given I then a line opens above and INSERT starts', async () => {
    const s = freshSpec();
    s.given('one line', 'ab<caret>cd');
    await s.whenKeys('I');
    s.thenMode(MeowMode.INSERT);
    s.thenText('\nabcd');
    s.thenCaretAt(0);
  });

  it('given a selection when c then it is killed into INSERT (meow-change)', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello world');
    await s.whenKeys('wc');
    s.thenText(' world');
    s.thenMode(MeowMode.INSERT);
    s.thenCaretAt(0);
  });

  it('given no selection when c then the char at point is changed (meow-change-char fallback)', async () => {
    const s = freshSpec();
    s.given('word', 'a<caret>bc');
    await s.whenKeys('c');
    s.thenText('ac');
    s.thenMode(MeowMode.INSERT);
  });

  it('given the caret on a newline when c then the lines join (change-char takes any char)', async () => {
    const s = freshSpec();
    s.given('two lines', 'ab<caret>\ncd');
    await s.whenKeys('c');
    s.thenText('abcd');
    s.thenMode(MeowMode.INSERT);
  });

  it('given the caret at end of buffer when c then nothing happens, not even INSERT', async () => {
    const s = freshSpec();
    s.given('word', 'ab<caret>');
    await s.whenKeys('c');
    s.thenText('ab');
    s.thenMode(MeowMode.NORMAL);
  });

  it('given U then undo runs only with an active region (undo-in-selection is gated)', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello');
    await s.whenKeys('U');
    assert.equal(s.editor.undoCount, 0, 'no region: no undo');
    await s.whenKeys('wU');
    assert.equal(s.editor.undoCount, 1, 'with a region it undoes');
  });

  it('given a selection when d then it is deleted without touching the clipboard', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello world');
    s.givenClipboard('KEEP');
    await s.whenKeys('wd');
    s.thenText(' world');
    s.thenClipboard('KEEP');
    s.thenMode(MeowMode.NORMAL);
  });

  it('given no selection when d then the char at point is deleted (delete-char fallback)', async () => {
    const s = freshSpec();
    s.given('word', 'a<caret>bc');
    await s.whenKeys('d');
    s.thenText('ac');
  });

  it('given D then the char before point is deleted (meow-backward-delete)', async () => {
    const s = freshSpec();
    s.given('word', 'ab<caret>c');
    await s.whenKeys('D');
    s.thenText('ac');
    s.thenCaretAt(1);
  });

  it('given a selection when s then it is killed to the clipboard (meow-kill)', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello world');
    await s.whenKeys('ws');
    s.thenText(' world');
    s.thenClipboard('hello');
  });

  it('given no selection when s then kill-line takes over (meow-C-k fallback)', async () => {
    const s = freshSpec();
    s.given('two lines', 'he<caret>llo\nworld');
    await s.whenKeys('s');
    s.thenText('he\nworld');
    s.thenClipboard('llo');
  });

  it('given the caret at eol when s then the newline is killed (kill-line joins)', async () => {
    const s = freshSpec();
    s.given('two lines', 'he<caret>\nworld');
    await s.whenKeys('s');
    s.thenText('heworld');
  });

  it('given a join selection when s then the lines join with a single space (fixup-whitespace)', async () => {
    const s = freshSpec();
    s.given('indented continuation', 'one\n  t<caret>wo');
    await s.whenKeys('ms');
    s.thenText('one two');
    s.thenCaretAt(3);
  });

  it('given a join before a closing bracket then no space is inserted', async () => {
    const s = freshSpec();
    s.given('hanging paren', 'f(x\n  <caret>)');
    await s.whenKeys('ms');
    s.thenText('f(x)');
  });

  it('given y then the selection is copied and cancelled (kill-ring-save deactivates the mark)', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello world');
    await s.whenKeys('wy');
    s.thenText('hello world');
    s.thenClipboard('hello');
    s.thenNoSelection();
    s.thenCaretAt(5);
  });

  it('given a line selection when y then the newline is copied and the caret lands past it', async () => {
    const s = freshSpec();
    s.given('two lines', 'o<caret>ne\ntwo');
    await s.whenKeys('xy');
    s.thenText('one\ntwo');
    s.thenClipboard('one\n');
    s.thenNoSelection();
    s.thenCaretAt(4);
  });

  it('given x x then y then both lines are copied with the trailing newline', async () => {
    const s = freshSpec();
    s.given('three lines', 'o<caret>ne\ntwo\nthree');
    await s.whenKeys('xxy');
    s.thenText('one\ntwo\nthree');
    s.thenClipboard('one\ntwo\n');
    s.thenNoSelection();
    s.thenCaretAt(8);
  });

  it('given a line selection when s then the whole line goes including its newline', async () => {
    const s = freshSpec();
    s.given('three lines', 'o<caret>ne\ntwo\nthree');
    await s.whenKeys('xs');
    s.thenText('two\nthree');
    s.thenClipboard('one\n');
    s.thenCaretAt(0);
  });

  it('given a reversed line selection when s then the newline stays (backward selections kill as-is)', async () => {
    const s = freshSpec();
    s.given('three lines', 'one\nt<caret>wo\nthree');
    await s.whenKeys('x;s');
    s.thenText('one\n\nthree');
    s.thenClipboard('two');
  });

  it('given the last line when s then there is no newline to take', async () => {
    const s = freshSpec();
    s.given('two lines', 'one\nt<caret>wo');
    await s.whenKeys('xs');
    s.thenText('one\n');
    s.thenClipboard('two');
  });

  it('given p then the clipboard is inserted at point with the caret after it (meow-yank)', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello');
    s.givenClipboard('XY');
    await s.whenKeys('p');
    s.thenText('XYhello');
    s.thenCaretAt(2);
  });

  it('given r then the selection is replaced by the clipboard which stays intact (meow-replace)', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello world');
    s.givenClipboard('XY');
    await s.whenKeys('wr');
    s.thenText('XY world');
    s.thenClipboard('XY');
    s.thenNoSelection();
  });

  it('given r without a selection then nothing happens', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello');
    s.givenClipboard('XY');
    await s.whenKeys('r');
    s.thenText('hello');
  });

  it('given u then the selection is cancelled first (meow-undo)', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello world');
    await s.whenKeys('wu');
    s.thenNoSelection();
  });

  it('given x x then repeated u past the undo stack then nothing blows up', async () => {
    const s = freshSpec();
    s.given('three lines', '<caret>one\ntwo\nthree');
    await s.whenKeys('xx');
    await s.whenKeys('uuuuuu');
    s.thenText('one\ntwo\nthree');
    assert.equal(s.editor.undoCount, 6, 'undo dispatched on every press');
  });

  it('given quote then the last command repeats', async () => {
    const s = freshSpec();
    s.given('chars', '<caret>abcdef');
    await s.whenKeys('d');
    s.thenText('bcdef');
    await s.whenKeys("'");
    s.thenText('cdef');
  });

  it('given quote after a two-key command then the whole unit repeats', async () => {
    const s = freshSpec();
    s.given('markers', '<caret>xaxaxa');
    await s.whenKeys('fa');
    s.thenSelection('xa');
    await s.whenKeys("'");
    s.thenSelection('xa');
    assert.equal(
      Math.min(s.editor.sels[0].anchor, s.editor.sels[0].active),
      2,
      'repeat replayed f+a from the new point',
    );
  });

  it('given quote after finding a quote char then the find repeats', async () => {
    const s = freshSpec();
    s.given('quotes', "<caret>a'b'c");
    await s.whenKeys("f'");
    s.thenSelection("a'");
    await s.whenKeys("'");
    s.thenSelection("b'");
  });

  it('given a caret mid-word when upcase-word then the rest upcases and the caret moves to word end', async () => {
    const s = freshSpec();
    s.given('mixed-case word', 'he<caret>LLo world');
    await s.whenCommand('upcase-word');
    s.thenText('heLLO world');
    s.thenCaretAt(5);
  });

  it('given a count when upcase-word then that many words upcase', async () => {
    const s = freshSpec();
    s.given('three words', '<caret>hello world foo');
    await s.whenKeys('2');
    await s.whenCommand('upcase-word');
    s.thenText('HELLO WORLD foo');
    s.thenCaretAt(11);
  });

  it('given a negative count when upcase-word then the previous word upcases and the caret stays', async () => {
    const s = freshSpec();
    s.given('two words', 'hello <caret>world');
    await s.whenKeys('-');
    await s.whenCommand('upcase-word');
    s.thenText('HELLO world');
    s.thenCaretAt(6);
  });

  it('given a caret when downcase-word then the word downcases', async () => {
    const s = freshSpec();
    s.given('upper words', '<caret>HELLO WORLD');
    await s.whenCommand('downcase-word');
    s.thenText('hello WORLD');
    s.thenCaretAt(5);
  });

  it('given a caret mid-word when capitalize-word then the slice capitalizes as a fresh word', async () => {
    const s = freshSpec();
    s.given('mixed-case word', 'he<caret>LLo world');
    await s.whenCommand('capitalize-word');
    s.thenText('heLlo world');
    s.thenCaretAt(5);
  });

  it('given a count when capitalize-word then each word capitalizes', async () => {
    const s = freshSpec();
    s.given('mixed words', '<caret>heLLO WOrld');
    await s.whenKeys('2');
    await s.whenCommand('capitalize-word');
    s.thenText('Hello World');
    s.thenCaretAt(11);
  });

  it('given a selection when upcase-word then it upcases from the caret and deactivates it', async () => {
    const s = freshSpec();
    s.given('two words', '<caret>hello world');
    await s.whenKeys('w');
    s.thenSelection('hello');
    await s.whenCommand('upcase-word');
    s.thenText('hello WORLD');
    s.thenNoSelection();
    s.thenCaretAt(11);
  });

  it('given a caret when kill-word then the word kills to the clipboard', async () => {
    const s = freshSpec();
    s.given('two words', '<caret>hello world');
    await s.whenCommand('kill-word');
    s.thenText(' world');
    s.thenCaretAt(0);
    s.thenClipboard('hello');
  });

  it('given a negative count when kill-word then the previous word kills backward', async () => {
    const s = freshSpec();
    s.given('two words', 'hello world<caret>');
    await s.whenKeys('-');
    await s.whenCommand('kill-word');
    s.thenText('hello ');
    s.thenCaretAt(6);
    s.thenClipboard('world');
  });

  it('given a CRLF document then killing a line selection takes the whole delimiter', async () => {
    const s = freshSpec();
    s.given('two crlf lines', 'a<caret>b\r\ncd');
    await s.whenKeys('xs');
    s.thenText('cd');
    s.thenClipboard('ab\r\n');
  });

  it('given a CRLF document then kill-line at the content end removes the whole delimiter', async () => {
    const s = freshSpec();
    s.given('two crlf lines', 'ab<caret>\r\ncd');
    await s.whenKeys('s');
    s.thenText('abcd');
  });
});
