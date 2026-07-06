// Copyright (C) 2026 Chubby Hippo
// SPDX-License-Identifier: GPL-3.0-or-later
// (see LICENSE for the full GPL-3.0-or-later text)

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { freshSpec, Spec } from './helpers';
import * as Avy from '../core/avy';

describe('AvySpec', () => {
  // The native avy port (S = avy-goto-char-timer, Q = avy-goto-line). Every
  // behavior was read out of avy 0.5.0's avy.el — the tree/subdiv math, the
  // timer input flow, single-candidate jump, the stay-on-bad-key handler, the
  // goto-line digit escape — not guessed. The timeout is a real setTimeout in
  // production; specs end the input phase with Avy.finishInput.

  const timeout = (s: Spec): void => Avy.finishInput(s.ctx);

  it('given S with input matching many places then labels select the jump target', async () => {
    const s = freshSpec();
    s.given('repeats', '<caret>foo bar foo baz foo');
    await s.whenKeys('S');
    await s.whenKeys('fo');
    timeout(s); // avy-tree over 3 candidates: labels a, s, d
    await s.whenKeys('s');
    s.thenCaretAt(8); // the second foo
    assert.equal(s.st.avy, null, 'session ends after the jump');
  });

  it('given a single candidate then avy jumps immediately (avy-single-candidate-jump)', async () => {
    const s = freshSpec();
    s.given('words', '<caret>alpha beta gamma');
    await s.whenKeys('S');
    await s.whenKeys('gam');
    timeout(s);
    s.thenCaretAt(11);
    assert.equal(s.st.avy, null);
  });

  it('given no candidates then the session ends where it started', async () => {
    const s = freshSpec();
    s.given('words', '<caret>alpha beta');
    await s.whenKeys('S');
    await s.whenKeys('zz');
    timeout(s);
    s.thenCaretAt(0);
    assert.equal(s.st.avy, null);
    await s.whenKeys('l'); // keys act as meow again
    s.thenCaretAt(1);
  });

  it('given matching is case-insensitive (avy-case-fold-search)', async () => {
    const s = freshSpec();
    s.given('mixed case', '<caret>Foo bar fOO');
    await s.whenKeys('S');
    await s.whenKeys('foo');
    timeout(s); // two candidates -> labels
    await s.whenKeys('s');
    s.thenCaretAt(8);
  });

  it('given an active selection then the avy jump extends it (avy-action-goto)', async () => {
    const s = freshSpec();
    s.given('words', '<caret>hello world again');
    await s.whenKeys('w'); // select hello, caret at 5
    await s.whenKeys('S');
    await s.whenKeys('aga');
    timeout(s); // single candidate -> jump lands at the match START
    s.thenSelection('hello world ');
    s.thenCaretAtSelectionEnd();
  });

  it('given a bad selection key then avy stays active (avy-handler-default)', async () => {
    const s = freshSpec();
    s.given('repeats', '<caret>xx xx xx');
    await s.whenKeys('S');
    await s.whenKeys('xx');
    timeout(s); // 3 candidates
    await s.whenKeys('z'); // not a label: message, keep waiting
    assert.notEqual(s.st.avy, null);
    await s.whenKeys('d');
    s.thenCaretAt(6);
  });

  it('given more candidates than keys then leading keys stay single and the last key hosts a subtree', async () => {
    // avy-subdiv(10, 9) = eight 1s then a 2: candidates 1-8 get a..k,
    // the last two live under 'l' as la / ls
    const s = freshSpec();
    s.given('ten es', '<caret>e e e e e e e e e e');
    await s.whenKeys('S');
    await s.whenKeys('e');
    timeout(s);
    await s.whenKeys('l'); // descend into the subtree; labels shorten to a / s
    assert.notEqual(s.st.avy, null);
    await s.whenKeys('s');
    s.thenCaretAt(18); // the tenth e
  });

  it('given escape during an avy session then it cancels in place', async () => {
    const s = freshSpec();
    s.given('words', '<caret>foo foo foo');
    await s.whenKeys('S');
    await s.whenKeys('foo');
    timeout(s);
    assert.notEqual(s.st.avy, null);
    assert.equal(s.pressEsc(), true);
    assert.equal(s.st.avy, null);
    s.thenCaretAt(0);
  });

  it('given Q then visible lines are labeled and a key jumps to that line', async () => {
    const s = freshSpec();
    s.given('four lines', 'one\ntwo\nthr<caret>ee\nfour');
    await s.whenKeys('Q'); // labels: a s d f on the four line starts
    assert.notEqual(s.st.avy, null);
    await s.whenKeys('f');
    s.thenCaretAt(14); // start of "four"
    assert.equal(s.st.avy, null);
  });

  it('given Q then a digit switches to the goto-line number prompt', async () => {
    const s = freshSpec();
    s.given('four lines', '<caret>one\ntwo\nthree\nfour');
    s.givenMinibufferAnswers('3');
    await s.whenKeys('Q3');
    s.thenCaretAt(8); // start of line 3
    assert.equal(s.st.avy, null);
  });

  it('the avy-subdiv distribution matches avy 0-5-0', () => {
    // values computed by the elisp (avy-subdiv n b) itself
    assert.deepEqual(Avy.subdiv(9, 9), [1, 1, 1, 1, 1, 1, 1, 1, 1]);
    assert.deepEqual(Avy.subdiv(10, 9), [1, 1, 1, 1, 1, 1, 1, 1, 2]);
    assert.deepEqual(Avy.subdiv(49, 9), [1, 1, 1, 1, 9, 9, 9, 9, 9]);
    assert.deepEqual(Avy.subdiv(81, 9), [9, 9, 9, 9, 9, 9, 9, 9, 9]);
  });
});
