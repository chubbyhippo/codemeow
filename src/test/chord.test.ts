// Copyright (C) 2026 Chubby Hippo
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the Free
// Software Foundation, either version 3 of the License, or (at your option)
// any later version.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
// FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
// more details.
//
// You should have received a copy of the GNU General Public License along
// with this program. If not, see <https://www.gnu.org/licenses/>.
//
// SPDX-License-Identifier: GPL-3.0-or-later

import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Chord } from '../core/chord';
import { Chords } from '../core/chords';
import { Rc } from '../core/rc';
import { MeowMode } from '../core/state';
import { CHORD_KEYS, chordKeybindings } from '../vscode/chordKeys';
import { describe, freshSpec, it } from './helpers';

function keyOf(text: string): string | null {
  return Chord.keyOf(text);
}

describe('ChordSpec', () => {
  it('given the host spelling then it normalizes to the same chord as the Emacs one', () => {
    assert.equal(keyOf('control F'), keyOf('C-f'));
    assert.equal(keyOf('alt B'), keyOf('M-b'));
    assert.equal(keyOf('control alt X'), keyOf('C-M-x'));
    assert.equal(Chord.parse('control F')?.shift, false);
    assert.equal(Chord.parse('C-F')?.shift, true);
  });

  it('given SPC or TAB as the key name then the chord parses like Emacs writes it', () => {
    assert.deepEqual(Chord.parse('M-SPC'), {
      ctrl: false,
      alt: true,
      shift: false,
      key: ' ',
    });
    assert.equal(keyOf('alt SPACE'), keyOf('M-SPC'));
    assert.deepEqual(Chord.parse('C-TAB'), {
      ctrl: true,
      alt: false,
      shift: false,
      key: '\t',
    });
    assert.equal(Chord.parse('SPC'), null);
  });

  it('given a cmap line then it parses into a chord binding', () => {
    const c = Rc.parse(['cmap control F forward-char']);
    assert.deepEqual(c.errors, []);
    assert.equal(c.chords.get('C-f')?.command, 'forward-char');
  });

  it('given a cmap with no modifier or a bad keystroke then errors are collected', () => {
    const c = Rc.parse(['cmap kj forward-char', 'cmap control forward-char']);
    assert.equal(c.errors.length, 2);
    assert.match(c.errors[0] ?? '', /not a chord/);
    assert.match(c.errors[1] ?? '', /not a chord/);
    assert.equal(c.chords.size, 0);
  });

  it('given a pressed chord event then bindingFor resolves it and plain keys do not', () => {
    const spec = freshSpec();
    spec.givenRc('cmap C-f forward-char');
    assert.notEqual(Chords.bindingFor(Chord.parse('C-f')), null);
    assert.equal(Chords.bindingFor(Chord.parse('f')), null);
    assert.equal(Chords.bindingFor(null), null);
  });

  it('given shift alone then it is not a chord but Ctrl and Alt-Shift are', () => {
    assert.equal(Chord.parse('S-f'), null);
    assert.equal(Chord.parse('shift F'), null);
    assert.notEqual(Chord.parse('C-f'), null);
    assert.notEqual(Chord.parse('alt shift E'), null);
    assert.equal(Chord.parse('alt shift E')?.shift, true);
  });

  it('given NORMAL or MOTION then a mapped chord is claimed but INSERT and KEYPAD are not', () => {
    const spec = freshSpec();
    spec.givenRc('cmap C-f forward-char');
    const chord = Chord.parse('C-f');
    assert.equal(Chords.claims(MeowMode.NORMAL, chord), true);
    assert.equal(Chords.claims(MeowMode.MOTION, chord), true);
    assert.equal(Chords.claims(MeowMode.INSERT, chord), false);
    assert.equal(Chords.claims(MeowMode.KEYPAD, chord), false);
    assert.equal(Chords.claims(MeowMode.NORMAL, Chord.parse('C-q')), false);
  });

  it('given an unmapped chord then it is handed back rather than swallowed', async () => {
    const spec = freshSpec();
    spec.given('plain text', '<caret>hello');
    spec.givenRc('');
    assert.equal(await Chords.dispatch(spec.ctx, Chord.parse('C-q')), false);
    spec.thenCaretAt(0);
  });

  it('given both spellings of a punctuation chord then they collapse to one binding', () => {
    assert.equal(keyOf('alt shift COMMA'), keyOf('M-<'));
    assert.equal(keyOf('alt shift PERIOD'), keyOf('M->'));
    assert.equal(keyOf('alt shift OPEN_BRACKET'), keyOf('M-{'));
    assert.equal(keyOf('control SLASH'), keyOf('C-/'));
    assert.equal(keyOf('control shift MINUS'), keyOf('C-_'));
    assert.equal(keyOf('alt shift 6'), keyOf('M-^'));
  });

  it('given the bundled defaults then the whole Emacs chord layer resolves', () => {
    freshSpec();
    const chords = Rc.chordBindings();
    const expected: Array<[string, string]> = [
      ['C-f', 'forward-char'],
      ['C-b', 'backward-char'],
      ['C-n', 'next-line'],
      ['C-p', 'previous-line'],
      ['C-a', 'move-beginning-of-line'],
      ['C-e', 'move-end-of-line'],
      ['M-f', 'forward-word'],
      ['M-b', 'backward-word'],
      ['M-a', 'backward-sentence'],
      ['M-e', 'forward-sentence'],
      ['M-u', 'upcase-word'],
      ['M-l', 'downcase-word'],
      ['M-c', 'capitalize-word'],
      ['M-d', 'kill-word'],
      ['M-<', 'beginning-of-buffer'],
      ['M->', 'end-of-buffer'],
      ['M-{', 'backward-paragraph'],
      ['M-}', 'forward-paragraph'],
      ['C-/', 'meow-undo'],
      ['C-_', 'meow-undo'],
      ['C-d', 'meow-delete'],
      ['C-k', 'meow-kill'],
      ['C-w', 'meow-kill'],
      ['M-w', 'meow-save'],
      ['C-y', 'meow-yank'],
      ['C-g', 'meow-cancel-selection'],
      ['M-m', 'back-to-indentation'],
      ['C-o', 'open-line'],
      ['M-\\', 'delete-horizontal-space'],
      ['M-SPC', 'just-one-space'],
    ];
    for (const [spelling, command] of expected) {
      assert.equal(
        chords.get(keyOf(spelling) ?? '')?.command,
        command,
        spelling,
      );
    }
    assert.equal(chords.get(keyOf('M-^') ?? '')?.keys, 'ms');
  });

  it('given the bundled defaults then the ported tranche-2 chords resolve to their verified action ids', () => {
    freshSpec();
    const chords = Rc.chordBindings();
    assert.equal(chords.get(keyOf('C-s') ?? '')?.action, 'actions.find');
    assert.equal(
      chords.get(keyOf('C-r') ?? '')?.action,
      'editor.action.previousMatchFindAction',
    );
    assert.equal(chords.get(keyOf('C-;') ?? '')?.action, 'codemeow.aceClick');
    assert.equal(chords.get(keyOf('M-;') ?? '')?.action, 'codemeow.aceWindow');
  });

  it('given a home cmap override then it wins over the bundled default', () => {
    const spec = freshSpec();
    spec.givenRc('cmap C-f meow-kill');
    assert.equal(Chords.bindingFor(Chord.parse('C-f'))?.command, 'meow-kill');
  });

  it('given a home cmap ignore then the chord is handed back to the IDE', () => {
    const spec = freshSpec();
    spec.givenRc('cmap C-f ignore');
    assert.equal(Chords.bindingFor(Chord.parse('C-f')), null);
  });

  it('given a NORMAL editor then dispatching a chord binding runs its command', async () => {
    const spec = freshSpec();
    spec.given('word', '<caret>hello');
    spec.givenRc('cmap C-f forward-char');
    assert.equal(await Chords.dispatch(spec.ctx, Chord.parse('C-f')), true);
    spec.thenCaretAt(1);
  });

  it('given the manifest then every bundled chord is intercepted and rc-gated', () => {
    freshSpec();
    const bundled = [...Rc.chordBindings().keys()].sort();
    const table = CHORD_KEYS.map(
      ({ spelling }) => keyOf(spelling) ?? '',
    ).sort();
    assert.deepEqual(
      table,
      bundled,
      'the manifest table and the bundled cmap block must name the same chords',
    );

    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'),
    ) as { contributes: { keybindings: Array<{ command: string }> } };
    const contributed = pkg.contributes.keybindings.filter(
      (k) => k.command === 'codemeow.chord',
    );
    assert.deepEqual(
      contributed,
      chordKeybindings(),
      'package.json must carry the generated table',
    );
  });
});
