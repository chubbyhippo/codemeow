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

import { MeowMode, MeowState } from './state';

/**
 * The engine's entire view of the host editor. The core never imports
 * 'vscode': the VS Code adapter implements these ports, and the test suite
 * implements them over a plain string buffer — which is what makes every
 * meow behavior testable without an editor process.
 */

/** A directed selection, VS Code style: active is the caret end. */
export interface SelRange {
  anchor: number;
  active: number;
}

export interface TextEdit {
  start: number;
  end: number;
  text: string;
}

export interface EditorPort {
  getText(): string;
  /** All selections, primary first. An empty range is a bare caret. */
  getSelections(): SelRange[];
  /** Replace all selections (primary first) and reveal the primary caret. */
  setSelections(sels: SelRange[]): void;
  /** Apply non-overlapping edits as ONE undo step. */
  edit(edits: TextEdit[]): Promise<void>;
  isWritable(): boolean;
  /** Line span currently on screen (the `w` window thing); null = unknown. */
  visibleLineRange(): { first: number; last: number } | null;
  undo(): Promise<void>;
  closeEditor(): Promise<void>;
  /** Language-aware defun range at offset when the host can provide one. */
  symbolRangeAt(offset: number): Promise<{ start: number; end: number } | null>;
}

export interface ClipboardPort {
  read(): Promise<string | undefined>;
  write(text: string): Promise<void>;
}

export interface UiPort {
  hint(text: string): void;
  info(title: string, body: string): void;
  input(prompt: string, initial?: string): Promise<string | undefined>;
  /** Run a host command by id; rejects when the id is unknown. */
  runCommand(id: string): Promise<void>;
  scheduleWhichKey(kind: 'keypad' | 'things', buffer: string): void;
  hideWhichKey(): void;
  showExpandHints(positions: number[]): void;
  clearExpandHints(): void;
  /** Live match highlights while avy-goto-char-timer collects input. */
  showAvyMatches(ranges: Array<{ start: number; end: number }>): void;
  /** avy's at-full labels: each [offset, label] painted OVER the text. */
  showAvyLabels(labels: Array<[number, string]>): void;
  clearAvy(): void;
  setGrabHighlight(range: { start: number; end: number } | null): void;
  modeChanged(st: MeowState): void;
  /** Called after every handled key so the status widget stays fresh. */
  refresh(st: MeowState): void;
}

/** Everything a command needs, bundled — the one parameter they all take. */
export interface Ctx {
  port: EditorPort;
  clipboard: ClipboardPort;
  ui: UiPort;
  st: MeowState;
}

export function setMode(ctx: Ctx, mode: MeowMode): void {
  ctx.st.mode = mode;
  if (mode !== MeowMode.KEYPAD) ctx.st.keypad = '';
  ctx.ui.modeChanged(ctx.st);
}
