// Copyright (C) 2026 Chubby Hippo
// SPDX-License-Identifier: GPL-3.0-or-later
// (see LICENSE for the full GPL-3.0-or-later text)

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { freshSpec } from './helpers';
import { Rc } from '../core/rc';
import { RcState } from '../core/rcState';
import { MeowMode, Pending } from '../core/state';

describe('RepeatSpec', () => {
  // The repeat transient — Emacs repeat-mode, ported (repeat.el read from
  // Emacs 30.2 source). Rc `repeat` groups
  // make multi-key entries tap-to-continue: dispatching any binding whose
  // TARGET is a group member arms the group (target identity, like the
  // repeat-map symbol property; the entering key needn't be a member —
  // repeat-check-key 'no), then member keys re-dispatch their targets and
  // any other key or ESC ends the run and keeps its normal meaning
  // (set-transient-map fall-through — never swallowed, no timeout).

  // a keypad nav entry plus a repeat group over the same targets; the
  // members deliberately sit on `.`/`,` — meow's bounds/inner-of-thing —
  // to pin that a live run shadows them and a finished run gives them back
  const navRc = [
    'map <leader>tn meow-next',
    'repeat nav . meow-next',
    'repeat nav , meow-prev',
  ].join('\n');

  // ------------------------------------------------------------------ parsing

  it('given repeat lines then named groups parse with their member targets', () => {
    const c = Rc.parse([
      'repeat nav . meow-next',
      'repeat nav , meow-prev',
      'repeat zoom i <action>(editor.action.fontZoomIn)',
    ]);
    assert.equal(c.repeat.get('nav')!.get('.')!.command, 'meow-next');
    assert.equal(c.repeat.get('nav')!.get(',')!.command, 'meow-prev');
    assert.equal(
      c.repeat.get('zoom')!.get('i')!.action,
      'editor.action.fontZoomIn',
    );
    assert.deepEqual(c.errors, []);
  });

  it('given a repeat line with a bad target then an error is collected', () => {
    const c = Rc.parse([
      'repeat nav . meow-frobnicate', // misspelled command
      'repeat nav', // group and key but no target
    ]);
    assert.equal(c.errors.length, 2);
    assert.ok(c.errors[0].includes('meow-frobnicate'));
  });

  it('given a repeat key that is not a single printable key then an error is collected', () => {
    const c = Rc.parse([
      'repeat nav ab meow-next', // two keys
      'repeat nav <Space> meow-next', // SPC is the keypad key
    ]);
    assert.equal(c.errors.length, 2);
  });

  it('given home rc repeat lines then they layer per key over the bundled group', () => {
    const s = freshSpec();
    s.givenRc(
      'repeat error , meow-prev\nrepeat error e <action>(editor.action.showHover)',
    );
    const g = Rc.repeatGroups().get('error')!;
    // bundled default beneath
    assert.equal(g.get('.')!.action, 'editor.action.marker.nextInFiles');
    assert.equal(g.get(',')!.command, 'meow-prev'); // the user override
    assert.equal(g.get('e')!.action, 'editor.action.showHover'); // the extension
  });

  it('given a repeat member bound to ignore then the key is given back', () => {
    const s = freshSpec();
    s.givenRc('repeat zoom 0 ignore');
    const g = Rc.repeatGroups().get('zoom')!;
    assert.equal(g.has('0'), false);
    assert.equal(g.get('i')!.action, 'editor.action.fontZoomIn'); // the rest stays
  });

  it('the bundled default codemeowrc declares the init el repeat groups', () => {
    // the bundled groups mirror the Emacs transients: flymake -> error,
    // diff-hl -> change, text-scale -> zoom, expreg -> expand
    freshSpec();
    const d = Rc.defaults().repeat;
    assert.equal(
      d.get('error')!.get('.')!.action,
      'editor.action.marker.nextInFiles',
    );
    assert.equal(
      d.get('error')!.get(',')!.action,
      'editor.action.marker.prevInFiles',
    );
    assert.equal(
      d.get('change')!.get('.')!.action,
      'workbench.action.editor.nextChange',
    );
    assert.equal(
      d.get('change')!.get(',')!.action,
      'workbench.action.editor.previousChange',
    );
    assert.deepEqual(
      new Set(d.get('zoom')!.keys()),
      new Set(['i', '=', 'o', '-', 'u', '0']),
    );
    assert.equal(
      d.get('expand')!.get('.')!.action,
      'editor.action.smartSelect.expand',
    );
    assert.equal(
      d.get('expand')!.get(',')!.action,
      'editor.action.smartSelect.shrink',
    );
  });

  it('given a repeat line edit then the reload button sees a change', () => {
    // the editor-title button compares the PARSED config — repeat groups
    // are part of it, so editing one must light the button up
    freshSpec();
    Rc.setUserLines(['nmap Z ,b']);
    assert.ok(
      !RcState.equalTo(Rc.parse(['nmap Z ,b', 'repeat nav . meow-next'])),
    );
  });

  // ------------------------------------------------------------------ dispatch

  it('given a keypad nav entry in a repeat group then tapping the members keeps walking', async () => {
    const s = freshSpec();
    s.given('four lines', '<caret>one\ntwo\nthree\nfour');
    s.givenRc(navRc);
    await s.whenKeys(' tn'); // SPC t n -> meow-next, arms the nav group
    assert.equal(s.caretLine(), 1);
    await s.whenKeys('.'); // member: re-dispatches meow-next, re-arms
    assert.equal(s.caretLine(), 2);
    await s.whenKeys('.');
    assert.equal(s.caretLine(), 3);
    await s.whenKeys(','); // the other member walks back
    assert.equal(s.caretLine(), 2);
    s.thenMode(MeowMode.NORMAL);
  });

  it('given a normal key bound to a member target then it arms the same run', async () => {
    // membership is the TARGET, not the key that ran it — Emacs puts
    // repeat-map on the command symbol, so every binding of it arms
    const s = freshSpec();
    s.given('four lines', '<caret>one\ntwo\nthree\nfour');
    s.givenRc(navRc);
    await s.whenKeys('j'); // bundled-default j = meow-next, a nav member by identity
    assert.equal(s.caretLine(), 1);
    await s.whenKeys('.');
    assert.equal(s.caretLine(), 2);
  });

  it('given a non-member key then the run ends and the key keeps its normal meaning', async () => {
    const s = freshSpec();
    s.given('four lines', '<caret>one\ntwo\nthree\nfour');
    s.givenRc(navRc);
    await s.whenKeys(' tn');
    assert.notEqual(s.st.repeatMap, null);
    await s.whenKeys('w'); // not a member: falls through to meow-mark-word
    s.thenSelection('two');
    assert.equal(s.st.repeatMap, null);
  });

  it('given the run over then the member keys mean their normal commands again', async () => {
    const s = freshSpec();
    s.given('four lines', '<caret>one\ntwo\nthree\nfour');
    s.givenRc(navRc);
    await s.whenKeys(' tn');
    await s.whenKeys('x'); // ends the run (meow-line)
    s.thenSelection('two');
    await s.whenKeys('.'); // meow-bounds-of-thing again, waiting for its thing key
    assert.equal(s.st.pending, Pending.BOUNDS);
    assert.equal(s.caretLine(), 1); // and no nav happened
  });

  it('given escape then the run ends', async () => {
    const s = freshSpec();
    s.given('four lines', '<caret>one\ntwo\nthree\nfour');
    s.givenRc(navRc);
    await s.whenKeys(' tn');
    assert.notEqual(s.st.repeatMap, null);
    s.pressEsc();
    assert.equal(s.st.repeatMap, null);
    await s.whenKeys('.');
    assert.equal(s.st.pending, Pending.BOUNDS);
    assert.equal(s.caretLine(), 1);
  });

  it('given SPC during a run then the keypad still opens', async () => {
    const s = freshSpec();
    s.given('four lines', '<caret>one\ntwo\nthree\nfour');
    s.givenRc(navRc);
    await s.whenKeys(' tn');
    await s.whenKeys(' tn'); // SPC is not a member: run ends, keypad works as ever
    assert.equal(s.caretLine(), 2);
    s.thenMode(MeowMode.NORMAL);
  });

  it('given a digit during a run then it falls through as a count', async () => {
    const s = freshSpec();
    s.given('four lines', '<caret>one\ntwo\nthree\nfour');
    s.givenRc(navRc);
    await s.whenKeys(' tn');
    assert.equal(s.caretLine(), 1);
    await s.whenKeys('2j'); // 2 ends the run and counts the next command
    assert.equal(s.caretLine(), 3);
  });

  it('given a run then the armed keys are the group members', async () => {
    const s = freshSpec();
    s.given('four lines', '<caret>one\ntwo\nthree\nfour');
    s.givenRc(navRc);
    await s.whenKeys(' tn');
    assert.deepEqual(new Set(s.st.repeatMap?.keys()), new Set(['.', ',']));
    await s.whenKeys('w');
    assert.equal(s.st.repeatMap, null);
  });
});
