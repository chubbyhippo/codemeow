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

import { Binding, Config } from './rc';
import { COMMANDS } from './registry';

/**
 * The .codemeowrc syntax — an .ideavimrc-flavored line format:
 *
 *   " comments start with a double quote (or #)
 *   nmap S <action>(extension.aceJump)  NORMAL key -> editor command
 *   nmap n meow-mark-word               NORMAL key -> a named meow command
 *   nmap Z ,b                           NORMAL key -> meow keys (recursive)
 *   nnoremap Z ,b                       same, but the RHS ignores user maps
 *   mmap j meow-next                    the same, for MOTION (read-only) mode
 *   map <leader>gd <action>(editor.action.revealDefinition)
 *   desc <leader>g goto things
 *   let g:WhichKeyDesc_g = "<leader>g goto things"   (ideavimrc-compatible)
 *   set nowhich-key / set timeoutlen=300
 *
 * A RHS that names a command in the registry binds the command; a misspelled
 * `meow-*` name is an error; any other RHS is replayed as keys. Keypad keys
 * 0-9, ? and / are reserved; SPC itself cannot be remapped. Unknown `set`
 * options and `let` lines are ignored so an .ideavimrc/.ideameowrc can be
 * pasted without errors.
 */

const ACTION_RE = /^<action>\(([\w.\-$]+)\)$/i;
const WHICHKEY_LET_RE = /^let\s+g:WhichKeyDesc\w*\s*=\s*"(.+)"$/;

export function parse(lines: string[]): Config {
  const c = new Config();
  lines.forEach((raw, i) => {
    let line = raw.trim();
    const err = (msg: string) => c.errors.push(`line ${i + 1}: ${msg}`);

    if (line === '' || line.startsWith('"') || line.startsWith('#')) return;

    const wk = WHICHKEY_LET_RE.exec(line);
    if (wk) {
      parseDescBody(c, wk[1], err);
      return;
    }

    // trailing `" comment` (checked after the let-line above, whose quoted
    // value would otherwise be truncated)
    const cut = line.search(/\s"/);
    if (cut >= 0) line = line.slice(0, cut).trimEnd();
    if (line === '') return;

    const m = /^(\S+)(?:\s+(.*))?$/.exec(line)!;
    const cmd = m[1];
    const rest = (m[2] ?? '').trim();
    switch (cmd) {
      case 'let': break; // mapleader and friends: accepted, nothing to do
      case 'set': parseSet(c, rest); break;
      case 'desc': parseDescBody(c, rest, err); break;
      case 'map': case 'noremap': case 'nmap': case 'nnoremap': case 'mmap': case 'mnoremap':
        parseMap(c, cmd, rest, err);
        break;
      default: err(`unknown command '${cmd}'`);
    }
  });
  return c;
}

function parseSet(c: Config, rest: string): void {
  if (rest === 'which-key') c.whichKey = true;
  else if (rest === 'nowhich-key') c.whichKey = false;
  else if (rest.startsWith('timeoutlen')) {
    const eq = rest.includes('=') ? rest.slice(rest.indexOf('=') + 1).trim() : '';
    const n = eq !== '' ? parseInt(eq, 10) : parseInt(rest.split(/\s+/)[1] ?? '', 10);
    if (!Number.isNaN(n) && n >= 0) c.whichKeyDelayMs = n;
  }
  // ignore unknown options so .ideavimrc content pastes cleanly
}

function parseDescBody(c: Config, body: string, err: (m: string) => void): void {
  if (!body.startsWith('<leader>')) {
    err(`descriptions must start with <leader>: ${body}`);
    return;
  }
  const after = body.slice('<leader>'.length);
  const seqToken = after.split(/\s/)[0];
  const desc = after.slice(seqToken.length).trim();
  const seq = parseKeys(seqToken, err);
  if (seq === null) return;
  if (seq === '') {
    err(`empty key sequence in description: ${body}`);
    return;
  }
  c.keypadDesc.set(seq, desc);
}

function parseMap(c: Config, cmd: string, rest: string, err: (m: string) => void): void {
  const m = /^(\S+)\s+(.*)$/.exec(rest);
  if (!m) {
    err(`${cmd} needs a key and a target`);
    return;
  }
  const lhs = m[1];
  const rhs = m[2].trim();
  const recursive = cmd === 'map' || cmd === 'nmap' || cmd === 'mmap';
  const motion = cmd === 'mmap' || cmd === 'mnoremap';

  const action = ACTION_RE.exec(rhs)?.[1];
  let binding: Binding;
  if (action !== undefined) {
    binding = { action, recursive };
  } else if (COMMANDS.has(rhs)) {
    binding = { command: rhs, recursive };
  } else if (rhs.startsWith('meow-')) {
    err(`unknown meow command '${rhs}'`);
    return;
  } else {
    const keys = parseKeys(rhs.replace(/\s+/g, ''), err);
    if (keys === null) return;
    if (keys === '') {
      err(`empty target in '${cmd} ${rest}'`);
      return;
    }
    binding = { keys, recursive };
  }

  if (lhs.startsWith('<leader>')) {
    if (motion) {
      err(`${cmd} cannot define keypad entries; use map <leader>...`);
      return;
    }
    const seq = parseKeys(lhs.slice('<leader>'.length), err);
    if (seq === null) return;
    if (seq === '') err('<leader> alone cannot be mapped');
    else if ('0123456789?/'.includes(seq[0])) {
      err(`keypad ${seq[0]} is reserved (digit argument / cheatsheet / describe)`);
    } else c.keypad.set(seq, binding);
    return;
  }

  const keys = parseKeys(lhs, err);
  if (keys === null) return;
  if (keys.length !== 1) {
    err(`${motion ? 'motion' : 'normal'}-mode key must be a single printable key: ${lhs}`);
  } else if (keys === ' ') {
    err('SPC is the keypad key and cannot be remapped');
  } else {
    (motion ? c.motion : c.normal).set(keys, binding);
  }
}

/** `<Space>` and `<lt>` tokens plus plain printable chars; null on error. */
function parseKeys(s: string, err: (m: string) => void): string | null {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '<') {
      const close = s.indexOf('>', i);
      if (close < 0) {
        out += ch;
        i++;
        continue;
      }
      const token = s.slice(i + 1, close).toLowerCase();
      if (token === 'space') out += ' ';
      else if (token === 'lt') out += '<';
      else {
        err(`unsupported key token ${s.slice(i, close + 1)} (only printable keys reach the meow engine)`);
        return null;
      }
      i = close + 1;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}
