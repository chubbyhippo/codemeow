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

/**
 * windmove for VS Code — the ideameow port's sibling of Emacs'
 * windmove-left/right/up/down (windmove.el, Emacs 30.2): Shift+arrows and
 * SPC w h/j/k/l select the window in a direction. Unlike ideameow, the
 * platform exposes NO window geometry to extensions, so this is a composed
 * approximation, not window.el's caret-band pick: the "windows" are the
 * editor groups (VS Code's own directional grid focus) plus the two panes
 * of a side-by-side diff, which group focus never crosses — left/right
 * step between original and modified first, then leave the group. What
 * survives of windmove exactly: the direction model, no wrap-around, and
 * Emacs' user-error when nothing is there ("No window left from selected
 * window", batch-verified — the adapter shows it when a move changed
 * nothing).
 */

export type WindmoveDir = 'left' | 'right' | 'up' | 'down';

/** What the adapter can see of the active diff editor: which pane has the
 *  caret, and whether the panes are side by side at all (an inline diff is
 *  a single window). Null when the active editor is not a text diff. */
export interface DiffSideView {
  onOriginal: boolean;
  onModified: boolean;
  sideBySide: boolean;
}

/** VS Code's own directional group focus (grid geometry, no wrap). */
const GROUP_FOCUS: Record<WindmoveDir, string> = {
  left: 'workbench.action.focusLeftGroup',
  right: 'workbench.action.focusRightGroup',
  up: 'workbench.action.focusAboveGroup',
  down: 'workbench.action.focusBelowGroup',
};

/** windmove-do-window-select's user-error, verbatim. */
export function noWindowMessage(dir: WindmoveDir): string {
  return `No window ${dir} from selected window`;
}

/** Decide one windmove step: in a side-by-side diff the panes are windows —
 *  original sits left of modified, so left from the modified pane and right
 *  from the original pane cross between them (diffEditor.switchSide);
 *  everything else is the editor group in that direction. */
export function plan(dir: WindmoveDir, diff: DiffSideView | null): string {
  if (diff !== null && diff.sideBySide) {
    if (dir === 'left' && diff.onModified) return 'diffEditor.switchSide';
    if (dir === 'right' && diff.onOriginal) return 'diffEditor.switchSide';
  }
  return GROUP_FOCUS[dir];
}
