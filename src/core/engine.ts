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

import { Ctx, setMode } from './port';
import { MeowMode, Pending } from './state';
import { COMMANDS } from './registry';
import { Binding, Rc } from './rc';
import * as Motions from './motions';
import * as Structures from './structures';
import * as Keypad from './keypad';
import * as Avy from './avy';

/**
 * The key dispatcher. Like meow in Emacs, the engine binds no keys of its
 * own: every command is registered by its meow name in the registry, and
 * keys resolve through rc bindings only — ~/.codemeowrc over the bundled
 * default .codemeowrc (see Rc). Besides dispatch, this module owns the
 * pieces of behavior that need the whole-keystroke view: the repeat unit
 * (`'`), rc-binding replay with its noremap/recursion bookkeeping, and the
 * repeat transient (Emacs repeat-mode: rc `repeat` groups arm a one-shot map
 * whose member keys re-dispatch — tap `.`/`,` to keep walking errors after
 * SPC . e).
 */

const KEYPAD_BINDING: Binding = { command: 'meow-keypad', recursive: true };

/** meow-keypad (meow-keypad.el): record meow--keypad-previous-state, then
 *  switch — Keypad.exit restores it, so SPC round-trips to NORMAL and the
 *  Alt+; chord returns to INSERT. Shared by the rc-dispatched 'meow-keypad'
 *  registry command and the adapter's codemeow.keypad command. */
export function enterKeypad(ctx: Ctx): void {
  ctx.st.keypadPreviousState = ctx.st.mode;
  setMode(ctx, MeowMode.KEYPAD);
  ctx.ui.scheduleWhichKey('keypad', '');
}

/** @return true when the key was consumed (the type handler skips insertion). */
export async function handleChar(ctx: Ctx, c: string): Promise<boolean> {
  const st = ctx.st;
  if (st.mode === MeowMode.INSERT) return false;
  if (st.mode === MeowMode.KEYPAD) {
    await Keypad.key(ctx, c);
    st.lastCommand = 'keypad';
    ctx.ui.refresh(st);
    return true;
  }
  if (st.avy) {
    await Avy.key(ctx, c);
    st.lastCommand = 'avy';
    ctx.ui.refresh(st);
    return true;
  }

  ctx.ui.hideWhichKey();
  ctx.ui.clearExpandHints();

  const pend = st.pending;
  // the repeat transient: a member key of the armed group re-dispatches
  // its binding, shadowing the normal map for exactly that keypress
  // (runBinding re-arms it); any other key ends the run and falls through
  // to the resolve below — Emacs set-transient-map semantics, never
  // swallowed. ESC ends the run too (escapeKey).
  const repeatBinding = pend === null ? (st.repeatMap?.get(c) ?? null) : null;
  if (pend === null && repeatBinding === null) st.repeatMap = null;
  // like Emacs: read-only buffers stay in NORMAL with every motion working
  // (the modify commands gate themselves via allow-modify in edits); the
  // motion map applies only to the MOTION state proper
  const motionish = st.mode === MeowMode.MOTION;
  const binding =
    pend === null ? (repeatBinding ?? resolve(ctx, c, motionish)) : null;
  const cmd = binding?.command;

  // the repeat unit: everything since the last complete command, so `'`
  // can replay counts and pending args (2fa) as one stroke
  if (!st.replaying && cmd !== 'repeat') {
    if (pend === null && st.pendingCount === 0 && !st.negative) st.unit = [];
    st.unit.push(c);
  }

  if (pend !== null) {
    st.pending = null;
    await resolvePending(ctx, pend, c);
    st.lastCommand = 'pending';
  } else if (binding) {
    await runBinding(ctx, binding);
    // the this-command/last-command handoff: vertical-motion chains keep
    // their goal column only while uninterrupted (see motions.goalColumn);
    // a keys-replay binding keeps the innermost replayed command's name
    st.lastCommand = cmd ?? binding.action ?? st.lastCommand;
  } else {
    st.lastCommand = null;
  } // undefined key: swallow, never self-insert

  const prefixy =
    st.pending !== null ||
    (st.pendingCount !== 0 &&
      cmd !== undefined &&
      cmd.startsWith('meow-expand-')) ||
    (st.negative && cmd === 'meow-negative-argument') ||
    cmd === 'meow-keypad';
  if (!st.replaying && cmd !== 'repeat' && !prefixy) st.lastKeys = [...st.unit];

  ctx.ui.refresh(st);
  return true;
}

/** SPC = keypad (reserved), then ~/.codemeowrc maps (skipped inside a
 *  noremap replay), then the bundled default rc; null = undefined key. */
function resolve(ctx: Ctx, c: string, motion: boolean): Binding | null {
  if (c === ' ') return KEYPAD_BINDING;
  if (ctx.st.noremapDepth === 0) {
    const cfg = Rc.cfg();
    const user = motion ? cfg.motion.get(c) : cfg.normal.get(c);
    if (user) return user;
  }
  const d = Rc.defaults();
  return (motion ? d.motion.get(c) : d.normal.get(c)) ?? null;
}

/** Commands that read one more key: find/till chars and the thing table. */
async function resolvePending(ctx: Ctx, p: Pending, c: string): Promise<void> {
  switch (p) {
    case Pending.FIND:
      Motions.findTill(ctx, c, false);
      break;
    case Pending.TILL:
      Motions.findTill(ctx, c, true);
      break;
    default:
      await Structures.thingSelect(ctx, p, c);
  }
}

export async function repeatLast(ctx: Ctx): Promise<void> {
  const st = ctx.st;
  const keys = st.lastKeys;
  if (keys.length === 0) return;
  st.replaying = true;
  try {
    for (const k of keys) await handleChar(ctx, k);
  } finally {
    st.replaying = false;
  }
}

/** Run a binding: a named meow command, a host command, or meow keys
 *  replayed through the engine (noremap bindings skip user maps while
 *  replaying). Afterwards, Emacs repeat-mode's post-command arming: a
 *  binding whose target sits in an rc repeat group arms that group's
 *  transient — membership by target identity (the repeat-map symbol
 *  property), no entered-with-key check (repeat-check-key 'no semantics —
 *  keypad keys are never group members). */
export async function runBinding(ctx: Ctx, b: Binding): Promise<void> {
  await dispatch(ctx, b);
  const map = Rc.repeatMapFor(b);
  if (!map) return;
  if (ctx.st.repeatMap === null) {
    // repeat-echo-message, once per run: "Repeat with ., ,"
    ctx.ui.hint(`Repeat with ${[...map.keys()].join(', ')}`);
  }
  ctx.st.repeatMap = map;
}

async function dispatch(ctx: Ctx, b: Binding): Promise<void> {
  const st = ctx.st;
  if (b.command !== undefined) {
    const cmd = COMMANDS.get(b.command);
    if (cmd) await cmd(ctx);
    else ctx.ui.hint(`Unknown meow command: ${b.command}`);
    return;
  }
  if (b.action !== undefined) {
    try {
      await ctx.ui.runCommand(b.action);
    } catch {
      ctx.ui.hint(`Unknown command: ${b.action}`);
    }
    return;
  }
  if (b.keys === undefined) return;
  if (st.replayDepth >= 8) {
    ctx.ui.hint('codemeow: mapping recursion is too deep');
    return;
  }
  const savedReplaying = st.replaying;
  st.replaying = true; // inner keys must not clobber the ' (repeat) unit
  st.replayDepth++;
  if (!b.recursive) st.noremapDepth++;
  try {
    for (const k of b.keys) await handleChar(ctx, k);
  } finally {
    if (!b.recursive) st.noremapDepth--;
    st.replayDepth--;
    st.replaying = savedReplaying;
  }
}

/**
 * The ESC key: INSERT -> NORMAL, KEYPAD -> the state it was entered from,
 * drops pending keys, collapses beacon cursors. @return false when there was
 * nothing meow-related to do (the host may fall through to its own escape
 * behavior).
 */
export function escapeKey(ctx: Ctx): boolean {
  const st = ctx.st;
  if (st.avy) {
    Avy.cancel(ctx);
    ctx.ui.refresh(st);
    return true;
  }
  st.pending = null;
  st.repeatMap = null; // ESC always ends a repeat run (a non-member key)
  ctx.ui.hideWhichKey();
  ctx.ui.clearExpandHints();
  if (st.mode === MeowMode.INSERT) {
    setMode(ctx, MeowMode.NORMAL);
    ctx.ui.refresh(st);
    return true;
  }
  if (st.mode === MeowMode.KEYPAD) {
    // meow-keypad-quit: back to the state keypad was entered from
    Keypad.exit(ctx);
    ctx.ui.refresh(st);
    return true;
  }
  const sels = ctx.port.getSelections();
  if (sels.length > 1) {
    const p = sels[0];
    ctx.port.setSelections([{ anchor: p.active, active: p.active }]);
    ctx.ui.refresh(st);
    return true;
  }
  return false;
}
