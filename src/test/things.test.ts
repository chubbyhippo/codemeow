// Copyright (C) 2026 Chubby Hippo
// SPDX-License-Identifier: GPL-3.0-or-later
// (see LICENSE for the full GPL-3.0-or-later text)

import { describe, it } from 'node:test';
import { freshSpec } from './helpers';
import { SelType } from '../core/state';

describe('ThingsSpec', () => {
  it('given caret inside parens when comma r then inner round is selected forward', async () => {
    const s = freshSpec();
    s.given('round pair', 'foo (b<caret>ar baz) qux');
    await s.whenKeys(',r');
    s.thenSelection('bar baz');
    s.thenSelType(SelType.TRANSIENT);
    s.thenCaretAtSelectionEnd();
  });

  it('given caret inside parens when dot r then bounds include the parens and select backward', async () => {
    const s = freshSpec();
    s.given('round pair', 'foo (b<caret>ar baz) qux');
    await s.whenKeys('.r');
    s.thenSelection('(bar baz)');
    s.thenCaretAtSelectionStart();
  });

  it('given nested pairs when comma r then the innermost pair wins', async () => {
    const s = freshSpec();
    s.given('nested', '(a (b<caret>) c)');
    await s.whenKeys(',r');
    s.thenSelection('b');
  });

  it('given square and curly things then s and c select them', async () => {
    const s = freshSpec();
    s.given('square', 'a [b<caret> c] d');
    await s.whenKeys(',s');
    s.thenSelection('b c');

    s.given('curly', 'a {b<caret> c} d');
    await s.whenKeys('.c');
    s.thenSelection('{b c}');
  });

  it('given a double quoted string when comma g then the quoted run is selected', async () => {
    const s = freshSpec();
    s.given('string', 'say "hi th<caret>ere" now');
    await s.whenKeys(',g');
    s.thenSelection('hi there');
    await s.whenKeys('.g');
    s.thenSelection('"hi there"');
  });

  it('given a single quoted string when comma g then inner selects the run and dot g keeps the quotes', async () => {
    const s = freshSpec();
    s.given('single quotes', "say 'hi th<caret>ere' now");
    await s.whenKeys(',g');
    s.thenSelection('hi there');
    await s.whenKeys('.g');
    s.thenSelection("'hi there'");
  });

  it('given a backtick string when comma g then inner selects the run and dot g keeps the backticks', async () => {
    const s = freshSpec();
    s.given('backticks', 'say `hi th<caret>ere` now');
    await s.whenKeys(',g');
    s.thenSelection('hi there');
    await s.whenKeys('.g');
    s.thenSelection('`hi there`');
  });

  it('given a triple double quoted string when comma g then inner drops all three quotes and dot g keeps them', async () => {
    const s = freshSpec();
    s.given('triple double', 'say """hi th<caret>ere""" now');
    await s.whenKeys(',g');
    s.thenSelection('hi there');
    await s.whenKeys('.g');
    s.thenSelection('"""hi there"""');
  });

  it('given a triple single quoted string when comma g then inner drops all three quotes and dot g keeps them', async () => {
    const s = freshSpec();
    s.given('triple single', "say '''hi th<caret>ere''' now");
    await s.whenKeys(',g');
    s.thenSelection('hi there');
    await s.whenKeys('.g');
    s.thenSelection("'''hi there'''");
  });

  it('given a triple backtick fence when comma g then inner drops all three backticks and dot g keeps them', async () => {
    const s = freshSpec();
    s.given('triple backtick', 'say ```hi th<caret>ere``` now');
    await s.whenKeys(',g');
    s.thenSelection('hi there');
    await s.whenKeys('.g');
    s.thenSelection('```hi there```');
  });

  it('given a triple quoted docstring spanning lines when comma g then the whole multiline run is selected', async () => {
    const s = freshSpec();
    s.given('multiline docstring', 'x = """\nhe<caret>llo\nworld\n"""');
    await s.whenKeys(',g');
    s.thenSelection('\nhello\nworld\n');
    await s.whenKeys('.g');
    s.thenSelection('"""\nhello\nworld\n"""');
  });

  it('given an apostrophe earlier on another line when comma g then the real string below still selects', async () => {
    const s = freshSpec();
    s.given('stray apostrophe', "don't\nx = 'h<caret>i'");
    await s.whenKeys(',g');
    s.thenSelection('hi');
  });

  it('given an unterminated quote when comma g then nothing is selected', async () => {
    const s = freshSpec();
    s.given('unterminated', "it'<caret>s fine");
    await s.whenKeys(',g');
    s.thenNoSelection();
  });

  it('given a symbol thing when comma e then the symbol is selected', async () => {
    const s = freshSpec();
    s.given('symbol', 'f<caret>oo_bar baz');
    await s.whenKeys(',e');
    s.thenSelection('foo_bar');
  });

  it('given a paragraph when comma p then the block of lines is selected', async () => {
    const s = freshSpec();
    s.given('paragraphs', 'aaa\nb<caret>bb\n\nccc');
    await s.whenKeys(',p');
    s.thenSelection('aaa\nbbb');
  });

  it('given a paragraph when dot p then trailing blank lines are included', async () => {
    const s = freshSpec();
    s.given('paragraphs', 'aaa\nb<caret>bb\n\nccc');
    await s.whenKeys('.p');
    s.thenSelection('aaa\nbbb\n\n');
  });

  it('given a line thing then comma l excludes and dot l includes the newline', async () => {
    const s = freshSpec();
    s.given('lines', 'a<caret>b\ncd');
    await s.whenKeys(',l');
    s.thenSelection('ab');
    await s.whenKeys('.l');
    s.thenSelection('ab\n');
  });

  it('given the buffer thing when comma b then everything is selected', async () => {
    const s = freshSpec();
    s.given('buffer', 'on<caret>e\ntwo');
    await s.whenKeys(',b');
    s.thenSelection('one\ntwo');
  });

  it('given sentences when comma dot then the sentence around point is selected', async () => {
    const s = freshSpec();
    s.given('sentences', 'One. Tw<caret>o. Three.');
    await s.whenKeys(',.');
    s.thenSelection('Two.');
  });

  it('given a curly block in plain text when comma d then the defun fallback selects the braces', async () => {
    const s = freshSpec();
    s.given('pseudo function', 'fun x() {\n  bo<caret>dy\n}');
    await s.whenKeys(',d');
    s.thenSelection('{\n  body\n}');
  });

  it('given open bracket r then selects from point back to the thing beginning with cursor at the beginning', async () => {
    const s = freshSpec();
    s.given('round pair', 'foo (b<caret>ar baz) qux');
    await s.whenKeys('[r');
    s.thenSelection('b');
    s.thenCaretAtSelectionStart();
  });

  it('given close bracket r then selects from point to the thing end with cursor at the end', async () => {
    const s = freshSpec();
    s.given('round pair', 'foo (b<caret>ar baz) qux');
    await s.whenKeys(']r');
    s.thenSelection('ar baz');
    s.thenCaretAtSelectionEnd();
  });

  it('given angle bracket aliases then they behave like square brackets', async () => {
    const s = freshSpec();
    s.given('round pair', 'foo (b<caret>ar baz) qux');
    await s.whenKeys('<r');
    s.thenCaretAtSelectionStart();
    s.thenSelection('b');
  });

  it('given no thing at point when comma r then the selection is unchanged', async () => {
    const s = freshSpec();
    s.given('no parens', 'he<caret>llo');
    await s.whenKeys(',r');
    s.thenNoSelection();
  });

  it('given o then the enclosing block including delimiters is selected', async () => {
    const s = freshSpec();
    s.given('round pair', 'foo (b<caret>ar baz) qux');
    await s.whenKeys('o');
    s.thenSelection('(bar baz)');
    s.thenSelType(SelType.BLOCK);
  });

  it('given a block selection when o again then it expands to the parent block', async () => {
    const s = freshSpec();
    s.given('nested', '((x<caret>))');
    await s.whenKeys('o');
    s.thenSelection('(x)');
    await s.whenKeys('o');
    s.thenSelection('((x))');
  });

  it('given a negative argument when o then the block selection is backward', async () => {
    const s = freshSpec();
    s.given('round pair', 'foo (b<caret>ar baz) qux');
    await s.whenKeys('-o');
    s.thenSelection('(bar baz)');
    s.thenCaretAtSelectionStart();
  });

  it('given O then selects from point to the end of the current block', async () => {
    const s = freshSpec();
    s.given('round pair', 'foo (b<caret>ar baz) qux');
    await s.whenKeys('O');
    s.thenSelection('ar baz)');
    s.thenCaretAtSelectionEnd();
  });

  it('given m then the join region between this line and the previous non-empty one is selected', async () => {
    const s = freshSpec();
    s.given('indented continuation', 'one\n  t<caret>wo');
    await s.whenKeys('m');
    s.thenSelType(SelType.JOIN);
    s.thenSelection('\n  ');
  });

  it('given the first line when m then nothing is selected', async () => {
    const s = freshSpec();
    s.given('first line', 'o<caret>ne\ntwo');
    await s.whenKeys('m');
    s.thenNoSelection();
  });

  it('given negative argument when - m then the join region reaches forward instead', async () => {
    const s = freshSpec();
    s.given('forward join', 'o<caret>ne\n  two');
    await s.whenKeys('-m');
    s.thenSelType(SelType.JOIN);
    s.thenSelection('\n  ');
  });

  it('given a CRLF document then the line thing bounds include the whole delimiter', async () => {
    const s = freshSpec();
    s.given('two crlf lines', 'a<caret>b\r\ncd');
    await s.whenKeys('.l');
    s.thenSelection('ab\r\n');
  });
});
