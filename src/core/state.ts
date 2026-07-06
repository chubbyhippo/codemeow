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

export enum MeowMode {
  NORMAL = 'NORMAL',
  INSERT = 'INSERT',
  MOTION = 'MOTION',
  KEYPAD = 'KEYPAD',
}

/**
 * Selection types mirror meow's (expand/select . type) pairs:
 * [MeowState.selExpand] is the cdr flag that makes follow-up commands of the
 * same family extend the selection instead of re-creating it
 * (meow-mark-word -> meow-next-word).
 */
export enum SelType {
  NONE = 'NONE',
  CHAR = 'CHAR',
  WORD = 'WORD',
  SYMBOL = 'SYMBOL',
  LINE = 'LINE',
  BLOCK = 'BLOCK',
  FIND = 'FIND',
  TILL = 'TILL',
  VISIT = 'VISIT',
  JOIN = 'JOIN',
  TRANSIENT = 'TRANSIENT',
}

/** Commands that read one more key before acting. */
export enum Pending {
  FIND = 'FIND',
  TILL = 'TILL',
  INNER = 'INNER',
  BOUNDS = 'BOUNDS',
  BEGIN = 'BEGIN',
  END = 'END',
}

/**
 * A recorded selection, meow--selection style: type null is the placeholder
 * meow pushes when a selection is created from nothing — popping it returns
 * the caret to where the selection chain started.
 */
export interface SavedSelection {
  type: SelType | null;
  expand: boolean;
  anchor: number;
  active: number;
}

/** Everything meow remembers about one editor. */
export class MeowState {
  mode: MeowMode = MeowMode.NORMAL;
  selType: SelType = SelType.NONE;
  selExpand = false;
  pending: Pending | null = null;

  // digit-argument (keypad SPC 1-9, or plain digits with no selection) and
  // negative-argument, consumed by the next command
  pendingCount = 0;
  negative = false;

  lastFind: string | null = null;

  /** last entry is the active pattern (regexp source), meow's search ring. */
  searchHistory: string[] = [];

  /** meow--selection-history; cleared by meow--cancel-selection. */
  selectionHistory: SavedSelection[] = [];

  /** meow--selection: survives region-killing edits (stale on purpose). */
  lastSelection: SavedSelection | null = null;

  /** temporary-goal-column for consecutive vertical moves (j/k chains). */
  goalColumn: number | null = null;

  /** last dispatched command name — the this-command/last-command handoff. */
  lastCommand: string | null = null;

  /** The grab region (secondary selection); offsets track core-applied edits. */
  grab: { start: number; end: number } | null = null;

  keypad = '';
  unit: string[] = [];
  lastKeys: string[] = [];
  replaying = false;

  // ~/.codemeowrc binding replay: recursion guard, and noremap bypass depth
  replayDepth = 0;
  noremapDepth = 0;

  takeCount(def = 1): number {
    const n = this.pendingCount === 0 ? def : this.pendingCount;
    const r = this.negative ? -n : n;
    this.pendingCount = 0;
    this.negative = false;
    return r;
  }
}
