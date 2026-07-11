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
  getSelections(): SelRange[];
  setSelections(sels: SelRange[]): void;
  edit(edits: TextEdit[]): Promise<void>;
  isWritable(): boolean;
  visibleLineRange(): { first: number; last: number } | null;
  undo(): Promise<void>;
  closeEditor(): Promise<void>;
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
  runCommand(id: string): Promise<void>;
  scheduleWhichKey(kind: 'keypad' | 'things', buffer: string): void;
  hideWhichKey(): void;
  showExpandHints(positions: number[]): void;
  clearExpandHints(): void;
  showAvyMatches(ranges: Array<{ start: number; end: number }>): void;
  showAvyLabels(labels: Array<[number, string]>): void;
  clearAvy(): void;
  setGrabHighlight(range: { start: number; end: number } | null): void;
  modeChanged(st: MeowState): void;
  refresh(st: MeowState): void;
}

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
