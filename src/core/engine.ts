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

const KEYPAD_BINDING: Binding = { command: 'meow-keypad', recursive: true };

export let repeatMap: Map<string, Binding> | null = null;

export function clearRepeat(): void {
  repeatMap = null;
}

export function enterKeypad(ctx: Ctx): void {
  ctx.st.keypadPreviousState = ctx.st.mode;
  setMode(ctx, MeowMode.KEYPAD);
  ctx.ui.scheduleWhichKey('keypad', '');
}

export async function runEmacsMotion(ctx: Ctx, command: string): Promise<void> {
  const cmd = COMMANDS.get(command);
  if (cmd) await cmd(ctx);
  ctx.ui.refresh(ctx.st);
}

export async function handleChar(ctx: Ctx, c: string): Promise<boolean> {
  const st = ctx.st;
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
  if (st.mode === MeowMode.INSERT) return false;

  ctx.ui.hideWhichKey();
  ctx.ui.clearExpandHints();

  const pend = st.pending;
  const repeatBinding = pend === null ? (repeatMap?.get(c) ?? null) : null;
  if (pend === null && repeatBinding === null) repeatMap = null;
  const motionish = st.mode === MeowMode.MOTION;
  const binding =
    pend === null ? (repeatBinding ?? resolve(ctx, c, motionish)) : null;
  const cmd = binding?.command;

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
    st.lastCommand = cmd ?? binding.action ?? st.lastCommand;
  } else {
    st.lastCommand = null;
  }

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

export async function runBinding(ctx: Ctx, b: Binding): Promise<void> {
  await dispatch(ctx, b);
  const map = Rc.repeatMapFor(b);
  if (!map) return;
  if (repeatMap === null) {
    ctx.ui.hint(`Repeat with ${[...map.keys()].join(', ')}`);
  }
  repeatMap = map;
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
  st.replaying = true;
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

export function escapeKey(ctx: Ctx): boolean {
  const st = ctx.st;
  if (st.avy) {
    Avy.cancel(ctx);
    ctx.ui.refresh(st);
    return true;
  }
  st.pending = null;
  repeatMap = null;
  ctx.ui.hideWhichKey();
  ctx.ui.clearExpandHints();
  if (st.mode === MeowMode.INSERT) {
    setMode(ctx, MeowMode.NORMAL);
    ctx.ui.refresh(st);
    return true;
  }
  if (st.mode === MeowMode.KEYPAD) {
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
