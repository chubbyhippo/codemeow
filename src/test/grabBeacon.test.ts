// Copyright (C) 2026 Chubby Hippo
// SPDX-License-Identifier: GPL-3.0-or-later
// (see LICENSE for the full GPL-3.0-or-later text)

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { freshSpec } from './helpers';
import { MeowMode } from '../core/state';

describe('GrabBeaconSpec', () => {
  it('given a selection when G then it becomes the grab and the selection is cancelled', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello world');
    await s.whenKeys('wG');
    s.thenNoSelection();
    assert.ok(s.st.grab);
    assert.equal(s.st.grab.start, 0);
    assert.equal(s.st.grab.end, 5);
  });

  it('given a grab and a selection elsewhere when R then the two texts swap (meow-swap-grab)', async () => {
    const s = freshSpec();
    s.given('three words', '<caret>one two three');
    await s.whenKeys('wG');
    s.givenCaretAt(8);
    await s.whenKeys('w');
    s.thenSelection('three');
    await s.whenKeys('R');
    s.thenText('three two one');
    s.thenNoSelection();
    assert.equal(
      s.editor.text.slice(s.st.grab!.start, s.st.grab!.end),
      'three',
      'grab now holds the swapped-in text',
    );
  });

  it('given no selection when G then an existing grab is cancelled (meow 1.5.0 body)', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello world');
    await s.whenKeys('wG');
    assert.ok(s.st.grab);
    await s.whenKeys('G');
    assert.equal(s.st.grab, null);
  });

  it('given no grab when R then nothing changes', async () => {
    const s = freshSpec();
    s.given('word', '<caret>hello');
    await s.whenKeys('wR');
    s.thenText('hello');
    s.thenSelection('hello');
  });

  it('given a selection overlapping the grab when R then the swap is refused', async () => {
    const s = freshSpec();
    s.given('three words', '<caret>one two three');
    await s.whenKeys('weG');
    s.givenCaretAt(4);
    await s.whenKeys('fr');
    await s.whenKeys('R');
    s.thenText('one two three');
  });

  it('given Y then the grab is re-synced to the current selection (meow-sync-grab)', async () => {
    const s = freshSpec();
    s.given('two words', '<caret>hello world');
    await s.whenKeys('wG');
    s.givenCaretAt(6);
    await s.whenKeys('wY');
    s.thenNoSelection();
    assert.equal(s.st.grab!.start, 6);
    assert.equal(s.st.grab!.end, 11);
  });

  it('given a grab when marking a word inside it then a cursor lands on every occurrence (BEACON)', async () => {
    const s = freshSpec();
    s.given('repeats', '<caret>foo bar foo baz foo');
    await s.whenKeys(',bG');
    s.givenCaretAt(0);
    await s.whenKeys('w');
    s.thenCaretCount(3);
  });

  it('given beacon cursors when c then all occurrences change together', async () => {
    const s = freshSpec();
    s.given('repeats', '<caret>foo bar foo baz foo');
    await s.whenKeys(',bG');
    s.givenCaretAt(0);
    await s.whenKeys('wc');
    s.thenText(' bar  baz ');
    s.thenMode(MeowMode.INSERT);
    s.thenCaretCount(3);
  });

  it('given beacon cursors when c then every cursor lands at its own edit', async () => {
    const s = freshSpec();
    s.given('repeats', '<caret>foo bar foo baz foo');
    await s.whenKeys(',bG');
    s.givenCaretAt(0);
    await s.whenKeys('wc');
    s.thenText(' bar  baz ');
    assert.deepEqual(s.editor.sels, [
      { anchor: 0, active: 0 },
      { anchor: 5, active: 5 },
      { anchor: 10, active: 10 },
    ]);
  });

  it('given a grab when x inside it then a cursor lands on every line (line beacon)', async () => {
    const s = freshSpec();
    s.given('three lines', '<caret>a\nb\nc');
    await s.whenKeys(',bG');
    s.givenCaretAt(0);
    await s.whenKeys('x');
    s.thenCaretCount(3);
  });

  it('given beacon cursors when g then they collapse to one', async () => {
    const s = freshSpec();
    s.given('repeats', '<caret>foo bar foo baz foo');
    await s.whenKeys(',bG');
    s.givenCaretAt(0);
    await s.whenKeys('w');
    s.thenCaretCount(3);
    await s.whenKeys('g');
    s.thenCaretCount(1);
    s.thenNoSelection();
  });

  it('given a selection outside the grab then no beacon cursors appear', async () => {
    const s = freshSpec();
    s.given('repeats', '<caret>foo bar foo');
    await s.whenKeys('wG');
    s.givenCaretAt(8);
    await s.whenKeys('w');
    s.thenCaretCount(1);
  });
});
