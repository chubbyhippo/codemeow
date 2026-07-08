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
 * Double-ESC in a tool window returns focus to the editor — ideameow's
 * ToolWindowEscape, ported. The terminal and chat-style views swallow every
 * single ESC (a shell or a TUI needs the key), so plain escape never leaves
 * them; pressing it twice quickly should.
 *
 * The pairing state machine lives here, pure and identical to ideameow's:
 * a plain ESC press reports which surface owns focus (null = not a tool
 * window surface) and its time; the second press on the SAME surface within
 * [TIMEOUT_MS] is the jump. A miss (different surface, too slow, null)
 * re-arms with the current press.
 *
 * The platform half differs from IntelliJ by necessity: VS Code has no
 * pre-dispatch hook to observe keys without consuming them, so the manifest
 * binds `escape` on the tool-window surfaces (terminal / lists / other
 * side-bar, panel and secondary-side-bar views) and the adapter re-emits a
 * lone first press's native meaning — the terminal gets its escape byte via
 * workbench.action.terminal.sendSequence {text:"\u001b"}, lists get list.clear
 * (the platform's own ESC binding for WorkbenchListFocusContextKey,
 * source-verified in microsoft/vscode listCommands.ts, 2026-07). Note the
 * terminal binding only fires when codemeow.toolWindowEscape is listed in
 * terminal.integrated.commandsToSkipShell — see the README.
 */

/** Two presses at most this many ms apart count as a double-press. */
export const TIMEOUT_MS = 500;

let lastSurface: string | null = null;
let lastAt = 0;

/** True = second press of a pair on the same surface: the caller jumps. */
export function onEscape(surface: string | null, at: number): boolean {
  const doubled =
    surface !== null && surface === lastSurface && at - lastAt <= TIMEOUT_MS;
  if (doubled) {
    reset();
    return true;
  }
  lastSurface = surface;
  lastAt = at;
  return false;
}

export function reset(): void {
  lastSurface = null;
  lastAt = 0;
}
