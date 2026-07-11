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

export type WindmoveDir = 'left' | 'right' | 'up' | 'down';

export interface DiffSideView {
  onOriginal: boolean;
  onModified: boolean;
  sideBySide: boolean;
}

const GROUP_FOCUS: Record<WindmoveDir, string> = {
  left: 'workbench.action.focusLeftGroup',
  right: 'workbench.action.focusRightGroup',
  up: 'workbench.action.focusAboveGroup',
  down: 'workbench.action.focusBelowGroup',
};

export function noWindowMessage(dir: WindmoveDir): string {
  return `No window ${dir} from selected window`;
}

export function plan(dir: WindmoveDir, diff: DiffSideView | null): string {
  if (diff !== null && diff.sideBySide) {
    if (dir === 'left' && diff.onModified) return 'diffEditor.switchSide';
    if (dir === 'right' && diff.onOriginal) return 'diffEditor.switchSide';
  }
  return GROUP_FOCUS[dir];
}
