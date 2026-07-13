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

import type { AvySession } from './avy';

export enum MeowMode {
  NORMAL = 'NORMAL',
  INSERT = 'INSERT',
  MOTION = 'MOTION',
  KEYPAD = 'KEYPAD',
}

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

export enum Pending {
  FIND = 'FIND',
  TILL = 'TILL',
  INNER = 'INNER',
  BOUNDS = 'BOUNDS',
  BEGIN = 'BEGIN',
  END = 'END',
}

export interface SavedSelection {
  type: SelType | null;
  expand: boolean;
  anchor: number;
  active: number;
}

export class MeowState {
  mode: MeowMode = MeowMode.NORMAL;
  selType: SelType = SelType.NONE;
  selExpand = false;
  pending: Pending | null = null;

  pendingCount = 0;
  negative = false;

  lastFind: string | null = null;

  searchHistory: string[] = [];

  selectionHistory: SavedSelection[] = [];

  lastSelection: SavedSelection | null = null;

  goalColumn: number | null = null;

  lastCommand: string | null = null;

  grab: { start: number; end: number } | null = null;

  avy: AvySession | null = null;

  keypad = '';

  keypadPreviousState: MeowMode = MeowMode.NORMAL;

  unit: string[] = [];
  lastKeys: string[] = [];
  replaying = false;

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
