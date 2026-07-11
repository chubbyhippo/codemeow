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
import * as Engine from '../core/engine';
import {
  ClipboardPort,
  Ctx,
  EditorPort,
  SelRange,
  TextEdit,
  UiPort,
} from '../core/port';
import { Config, Rc } from '../core/rc';
import { MeowMode, MeowState, SelType } from '../core/state';
import { lineOfOffset } from '../core/text';

class FakeEditor implements EditorPort {
  text = '';
  sels: SelRange[] = [{ anchor: 0, active: 0 }];
  writable = true;
  visible: { first: number; last: number } | null = null;

  getText(): string {
    return this.text;
  }

  getSelections(): SelRange[] {
    return this.sels.map((s) => ({ ...s }));
  }

  setSelections(sels: SelRange[]): void {
    this.sels = sels.map((s) => ({ ...s }));
  }

  async edit(edits: TextEdit[]): Promise<void> {
    for (const e of [...edits].sort((a, b) => b.start - a.start)) {
      this.text = this.text.slice(0, e.start) + e.text + this.text.slice(e.end);
    }
  }

  isWritable(): boolean {
    return this.writable;
  }

  visibleLineRange(): { first: number; last: number } | null {
    return this.visible;
  }

  undoCount = 0;

  async undo(): Promise<void> {
    this.undoCount++;
  }

  async closeEditor(): Promise<void> {}

  async symbolRangeAt(): Promise<{ start: number; end: number } | null> {
    return null;
  }
}

class FakeClipboard implements ClipboardPort {
  content: string | undefined;

  async read(): Promise<string | undefined> {
    return this.content;
  }

  async write(text: string): Promise<void> {
    this.content = text;
  }
}

class FakeUi implements UiPort {
  hints: string[] = [];
  infos: Array<[string, string]> = [];
  answers: string[] = [];
  ran: string[] = [];

  hint(text: string): void {
    this.hints.push(text);
  }

  info(title: string, body: string): void {
    this.infos.push([title, body]);
  }

  async input(): Promise<string | undefined> {
    return this.answers.shift();
  }

  async runCommand(id: string): Promise<void> {
    this.ran.push(id);
  }

  modes: MeowMode[] = [];

  expandHints: number[] = [];

  avyMatches: Array<{ start: number; end: number }> = [];
  avyLabels: Array<[number, string]> = [];

  scheduleWhichKey(): void {}
  hideWhichKey(): void {}

  showExpandHints(positions: number[]): void {
    this.expandHints = positions;
  }

  clearExpandHints(): void {
    this.expandHints = [];
  }

  showAvyMatches(ranges: Array<{ start: number; end: number }>): void {
    this.avyMatches = ranges;
  }

  showAvyLabels(labels: Array<[number, string]>): void {
    this.avyLabels = labels;
  }

  clearAvy(): void {
    this.avyMatches = [];
    this.avyLabels = [];
  }
  setGrabHighlight(): void {}

  modeChanged(st: MeowState): void {
    this.modes.push(st.mode);
  }

  refresh(): void {}
}

export class Spec {
  editor = new FakeEditor();
  clip = new FakeClipboard();
  ui = new FakeUi();
  st = new MeowState();

  get ctx(): Ctx {
    return {
      port: this.editor,
      clipboard: this.clip,
      ui: this.ui,
      st: this.st,
    };
  }

  given(_description: string, textWithCaret: string): void {
    const at = textWithCaret.indexOf('<caret>');
    this.editor.text = textWithCaret.replace('<caret>', '');
    const off = at < 0 ? 0 : at;
    this.editor.sels = [{ anchor: off, active: off }];
    this.st = new MeowState();
  }

  givenRc(text: string): void {
    Rc.setForTest(Rc.parse(text.split('\n')));
  }

  givenClipboard(text: string): void {
    this.clip.content = text;
  }

  givenMinibufferAnswers(...answers: string[]): void {
    this.ui.answers.push(...answers);
  }

  givenCaretAt(offset: number): void {
    this.editor.sels = [{ anchor: offset, active: offset }];
  }

  givenReadOnly(): void {
    this.editor.writable = false;
  }

  async whenKeys(keys: string): Promise<void> {
    for (const c of keys) await Engine.handleChar(this.ctx, c);
  }

  pressEsc(): boolean {
    return Engine.escapeKey(this.ctx);
  }

  selectedText(): string | undefined {
    const s = this.editor.sels[0];
    if (s.anchor === s.active) return undefined;
    return this.editor.text.slice(
      Math.min(s.anchor, s.active),
      Math.max(s.anchor, s.active),
    );
  }

  caretLine(): number {
    return lineOfOffset(this.editor.text, this.editor.sels[0].active);
  }

  thenSelection(expected: string): void {
    assert.equal(this.selectedText(), expected, 'selected text');
  }

  thenNoSelection(): void {
    const s = this.editor.sels[0];
    assert.equal(s.anchor, s.active, 'expected no selection');
  }

  thenCaretAt(offset: number): void {
    assert.equal(this.editor.sels[0].active, offset, 'caret offset');
  }

  thenCaretAtSelectionStart(): void {
    const s = this.editor.sels[0];
    assert.notEqual(s.anchor, s.active, 'expected a selection');
    assert.equal(
      s.active,
      Math.min(s.anchor, s.active),
      'caret at selection start (reversed)',
    );
  }

  thenCaretAtSelectionEnd(): void {
    const s = this.editor.sels[0];
    assert.notEqual(s.anchor, s.active, 'expected a selection');
    assert.equal(
      s.active,
      Math.max(s.anchor, s.active),
      'caret at selection end (forward)',
    );
  }

  thenText(expected: string): void {
    assert.equal(this.editor.text, expected, 'buffer text');
  }

  thenMode(expected: MeowMode): void {
    assert.equal(this.st.mode, expected, 'meow mode');
  }

  thenSelType(expected: SelType): void {
    assert.equal(this.st.selType, expected, 'selection type');
  }

  thenClipboard(expected: string): void {
    assert.equal(this.clip.content, expected, 'clipboard');
  }

  thenCaretCount(expected: number): void {
    assert.equal(this.editor.sels.length, expected, 'caret count');
  }
}

const rcPath = path.join(__dirname, '..', '..', '.codemeowrc');
Rc.initDefaults(fs.readFileSync(rcPath, 'utf8').split(/\r?\n/));

export function freshSpec(): Spec {
  Rc.setForTest(new Config());
  return new Spec();
}
