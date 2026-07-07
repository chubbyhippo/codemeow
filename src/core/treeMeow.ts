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

import { Rc } from './rc';

/**
 * Meow for workbench trees — MOTION state ported to the one surface VS Code
 * navigates without a text editor. Like special buffers in Emacs, a tree or
 * list (the Explorer, outline, search results, problems, ...) answers to
 * the MOTION map: the `mmap` lines of the rc. Motion commands translate to
 * the list widget's own arrow-key vocabulary (the `list.*` commands),
 * `<action>(...)` bindings dispatch against the focused tree, and every key
 * the map does NOT bind keeps its native meaning — Enter still opens,
 * unmapped letters still start the tree's type-to-find.
 *
 * Mechanism (ideameow's TreeMeow, itself ported from IdeaVim's NERDTree):
 * where ideameow registers its shortcut set on whichever JTree owns focus,
 * VS Code has no runtime keybinding registration — so the manifest
 * contributes one keybinding per printable key (built from
 * src/vscode/treeKeys.ts), each gated on a `codemeow.tree.<key>` context
 * key, and the adapter turns exactly the mmap-bound set on (re-synced after
 * SPC c M reloads the rc). While the tree's find widget is open the shared
 * `when` clause disables the whole surface: typing into the find always
 * wins (ideameow's speed-search check).
 */

/**
 * The meow motion commands with a native tree meaning — the four arrows.
 * Values are the workbench list commands the real arrow keys invoke, the
 * exact JTree ActionMap semantics ideameow binds (listCommands.ts, read
 * from microsoft/vscode main 2026-07): focusDown/Up move the focused row,
 * collapse folds — else goes to the parent, expand unfolds — else enters
 * the first child. Every other meow command needs a text buffer and is
 * simply inert here.
 */
const LIST_MOTIONS = new Map([
  ['meow-next', 'list.focusDown'],
  ['meow-prev', 'list.focusUp'],
  ['meow-left', 'list.collapse'],
  ['meow-right', 'list.expand'],
]);

/** Every char the MOTION map binds (defaults + ~/.codemeowrc) — the tree
 *  shortcut set. Anything else never reaches the dispatcher; a key whose
 *  effective binding is `ignore` is excluded too, which is how a home rc
 *  returns a default key to the tree (native type-to-find). */
export function boundChars(): Set<string> {
  const chars = [...Rc.defaults().motion.keys(), ...Rc.cfg().motion.keys()];
  return new Set(chars.filter(
    (c) => (Rc.cfg().motion.get(c) ?? Rc.defaults().motion.get(c))?.command !== 'ignore',
  ));
}

/** Resolve one key against the MOTION map and run it through [run] — the
 *  focused tree's command executor — the tree-surface analog of
 *  Engine.handleChar + runBinding, with the same layering (user maps unless
 *  inside a noremap replay, then the bundled defaults) and the same replay
 *  depth guard. */
export async function dispatch(
  run: (commandId: string) => Promise<void> | void,
  c: string,
  noremap = false,
  depth = 0,
): Promise<void> {
  const b = (noremap ? undefined : Rc.cfg().motion.get(c)) ?? Rc.defaults().motion.get(c);
  if (!b) return;
  if (b.command !== undefined) {
    const listCommand = LIST_MOTIONS.get(b.command);
    if (listCommand !== undefined) await run(listCommand);
    return;
  }
  if (b.action !== undefined) {
    await run(b.action);
    return;
  }
  if (b.keys === undefined) return;
  if (depth >= 8) return;
  for (const k of b.keys) await dispatch(run, k, noremap || !b.recursive, depth + 1);
}
