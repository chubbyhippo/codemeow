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
import * as Sel from './selections';
import * as Structures from './structures';
import * as Keypad from './keypad';
import * as Avy from './avy';

const KEYPAD_BINDING: Binding = { command: 'meow-keypad', recursive: true };

const MAX_REPLAY_DEPTH = 8;

export let repeatMap: Map<string, Binding> | null = null;

export function clearRepeat(): void {
  repeatMap = null;
}

export function enterKeypad(ctx: Ctx): void {
  if (ctx.state.mode === MeowMode.KEYPAD) return;
  ctx.state.keypadPreviousState = ctx.state.mode;
  setMode(ctx, MeowMode.KEYPAD);
  ctx.ui.scheduleWhichKey('keypad', '');
}

export async function handleChar(ctx: Ctx, c: string): Promise<boolean> {
  const state = ctx.state;
  if (state.mode === MeowMode.KEYPAD) {
    await Keypad.key(ctx, c);
    state.lastCommand = 'keypad';
    ctx.ui.refresh(state);
    return true;
  }
  if (state.avy) {
    await Avy.key(ctx, c);
    state.lastCommand = 'avy';
    ctx.ui.refresh(state);
    return true;
  }
  if (state.mode === MeowMode.INSERT) return false;

  ctx.ui.hideWhichKey();
  ctx.ui.clearExpandHints();

  const pend = state.pending;
  const repeatBinding = pend === null ? (repeatMap?.get(c) ?? null) : null;
  if (pend === null && repeatBinding === null) repeatMap = null;
  const motionish = state.mode === MeowMode.MOTION;
  const binding =
    pend === null ? (repeatBinding ?? resolve(ctx, c, motionish)) : null;
  const cmd = binding?.command;

  if (!state.replaying && cmd !== 'repeat') {
    if (pend === null && state.pendingCount === 0 && !state.negative)
      state.unit = [];
    state.unit.push(c);
  }

  if (pend !== null) {
    state.pending = null;
    await resolvePending(ctx, pend, c);
    state.lastCommand = 'pending';
  } else if (binding) {
    await runBinding(ctx, binding);
    state.lastCommand = cmd ?? binding.action ?? state.lastCommand;
  } else {
    state.lastCommand = null;
  }

  const prefixy =
    state.pending !== null ||
    (state.pendingCount !== 0 &&
      cmd !== undefined &&
      cmd.startsWith('meow-expand-')) ||
    (state.negative && cmd === 'meow-negative-argument') ||
    cmd === 'meow-keypad';
  if (!state.replaying && cmd !== 'repeat' && !prefixy)
    state.lastKeys = [...state.unit];

  ctx.ui.refresh(state);
  return true;
}

function resolve(ctx: Ctx, c: string, motion: boolean): Binding | null {
  if (c === ' ') return KEYPAD_BINDING;
  if (ctx.state.noremapDepth === 0) {
    const cfg = Rc.cfg();
    const user = motion ? cfg.motion.get(c) : cfg.normal.get(c);
    if (user) return user;
  }
  const defaults = Rc.defaults();
  return (motion ? defaults.motion.get(c) : defaults.normal.get(c)) ?? null;
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
  const state = ctx.state;
  const keys = state.lastKeys;
  if (keys.length === 0) return;
  state.replaying = true;
  try {
    for (const key of keys) await handleChar(ctx, key);
  } finally {
    state.replaying = false;
  }
}

export async function runBinding(ctx: Ctx, binding: Binding): Promise<void> {
  await dispatch(ctx, binding);
  const map = Rc.repeatMapFor(binding);
  if (!map) return;
  if (repeatMap === null) {
    ctx.ui.hint(`Repeat with ${[...map.keys()].join(', ')}`);
  }
  repeatMap = map;
}

async function dispatch(ctx: Ctx, binding: Binding): Promise<void> {
  const state = ctx.state;
  if (binding.command !== undefined) {
    const cmd = COMMANDS.get(binding.command);
    if (cmd) await cmd(ctx);
    else ctx.ui.hint(`Unknown meow command: ${binding.command}`);
    return;
  }
  if (binding.action !== undefined) {
    try {
      await ctx.ui.runCommand(binding.action);
    } catch {
      ctx.ui.hint(`Unknown command: ${binding.action}`);
    }
    return;
  }
  if (binding.keys === undefined) return;
  if (state.replayDepth >= MAX_REPLAY_DEPTH) {
    ctx.ui.hint('codemeow: mapping recursion is too deep');
    return;
  }
  const savedReplaying = state.replaying;
  state.replaying = true;
  state.replayDepth++;
  if (!binding.recursive) state.noremapDepth++;
  try {
    for (const key of binding.keys) await handleChar(ctx, key);
  } finally {
    if (!binding.recursive) state.noremapDepth--;
    state.replayDepth--;
    state.replaying = savedReplaying;
  }
}

export function escapeKey(ctx: Ctx): boolean {
  const state = ctx.state;
  if (state.avy) {
    Avy.cancel(ctx);
    ctx.ui.refresh(state);
    return true;
  }
  const hadTransient = state.pending !== null || repeatMap !== null;
  state.pending = null;
  repeatMap = null;
  ctx.ui.hideWhichKey();
  ctx.ui.clearExpandHints();
  if (state.mode === MeowMode.INSERT) {
    setMode(ctx, MeowMode.NORMAL);
    ctx.ui.refresh(state);
    return true;
  }
  if (state.mode === MeowMode.KEYPAD) {
    Keypad.exit(ctx);
    ctx.ui.refresh(state);
    return true;
  }
  const sels = ctx.port.getSelections();
  if (sels.length > 1 || Sel.hasSelection(sels[0])) {
    Sel.cancelAll(ctx);
    ctx.ui.refresh(state);
    return true;
  }
  return hadTransient;
}
