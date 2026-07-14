// Copyright (C) 2026 Chubby Hippo
// SPDX-License-Identifier: GPL-3.0-or-later
// (see LICENSE for the full GPL-3.0-or-later text)

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';
import { freshSpec, Spec } from './helpers';
import * as Avy from '../core/avy';

describe('AvySpec', () => {
  const timeout = (s: Spec): void => Avy.finishInput(s.ctx);

  it('given S with input matching many places then labels select the jump target', async () => {
    const s = freshSpec();
    s.given('repeats', '<caret>foo bar foo baz foo');
    await s.whenKeys('S');
    await s.whenKeys('fo');
    timeout(s);
    await s.whenKeys('s');
    s.thenCaretAt(8);
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
    await s.whenKeys('l');
    s.thenCaretAt(1);
  });

  it('given matching is case-insensitive (avy-case-fold-search)', async () => {
    const s = freshSpec();
    s.given('mixed case', '<caret>Foo bar fOO');
    await s.whenKeys('S');
    await s.whenKeys('foo');
    timeout(s);
    await s.whenKeys('s');
    s.thenCaretAt(8);
  });

  it('given an active selection then the avy jump extends it (avy-action-goto)', async () => {
    const s = freshSpec();
    s.given('words', '<caret>hello world again');
    await s.whenKeys('w');
    await s.whenKeys('S');
    await s.whenKeys('aga');
    timeout(s);
    s.thenSelection('hello world ');
    s.thenCaretAtSelectionEnd();
  });

  it('given a bad selection key then avy stays active (avy-handler-default)', async () => {
    const s = freshSpec();
    s.given('repeats', '<caret>xx xx xx');
    await s.whenKeys('S');
    await s.whenKeys('xx');
    timeout(s);
    await s.whenKeys('z');
    assert.notEqual(s.st.avy, null);
    await s.whenKeys('d');
    s.thenCaretAt(6);
  });

  it('given more candidates than keys then leading keys stay single and the last key hosts a subtree', async () => {
    const s = freshSpec();
    s.given('ten es', '<caret>e e e e e e e e e e');
    await s.whenKeys('S');
    await s.whenKeys('e');
    timeout(s);
    await s.whenKeys('l');
    assert.notEqual(s.st.avy, null);
    await s.whenKeys('s');
    s.thenCaretAt(18);
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

  it('given S then the input timeout is awaited only once a char is typed (avy-timeout-seconds)', async () => {
    const s = freshSpec();
    s.given('words', '<caret>foo foo foo');
    await s.whenKeys('S');
    assert.equal(s.st.avy?.timer, null);
    await s.whenKeys('f');
    assert.notEqual(s.st.avy?.timer, null);
    timeout(s);
    assert.equal(s.st.avy?.phase, 'selecting');
    assert.notEqual(s.st.avy, null);
  });

  it('given Q then visible lines are labeled and a key jumps to that line', async () => {
    const s = freshSpec();
    s.given('four lines', 'one\ntwo\nthr<caret>ee\nfour');
    await s.whenKeys('Q');
    assert.notEqual(s.st.avy, null);
    await s.whenKeys('f');
    s.thenCaretAt(14);
    assert.equal(s.st.avy, null);
  });

  it('given Q then a digit switches to the goto-line number prompt', async () => {
    const s = freshSpec();
    s.given('four lines', '<caret>one\ntwo\nthree\nfour');
    s.givenMinibufferAnswers('3');
    await s.whenKeys('Q3');
    s.thenCaretAt(8);
    assert.equal(s.st.avy, null);
  });

  it('the avy-subdiv distribution matches avy 0-5-0', () => {
    assert.deepEqual(Avy.subdiv(9, 9), [1, 1, 1, 1, 1, 1, 1, 1, 1]);
    assert.deepEqual(Avy.subdiv(10, 9), [1, 1, 1, 1, 1, 1, 1, 1, 2]);
    assert.deepEqual(Avy.subdiv(49, 9), [1, 1, 1, 1, 9, 9, 9, 9, 9]);
    assert.deepEqual(Avy.subdiv(81, 9), [9, 9, 9, 9, 9, 9, 9, 9, 9]);
  });
});
