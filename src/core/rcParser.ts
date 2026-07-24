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

const ACTION_RE = /^<action>\(([\w.\-$(),=]+)\)$/i;
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

    const cut = line.search(/\s"/);
    if (cut >= 0) line = line.slice(0, cut).trimEnd();
    if (line === '') return;

    const m = /^(\S+)(?:\s+(.*))?$/.exec(line)!;
    const cmd = m[1];
    const rest = (m[2] ?? '').trim();
    switch (cmd) {
      case 'let':
      case 'cmap':
      case 'cnoremap':
        break;
      case 'set':
        parseSet(c, rest, err);
        break;
      case 'desc':
        parseDescBody(c, rest, err);
        break;
      case 'map':
      case 'noremap':
      case 'nmap':
      case 'nnoremap':
      case 'mmap':
      case 'mnoremap':
        parseMap(c, cmd, rest, err);
        break;
      case 'repeat':
        parseRepeat(c, rest, err);
        break;
      default:
        err(`unknown command '${cmd}'`);
    }
  });
  return c;
}

function parseSet(c: Config, rest: string, err: (m: string) => void): void {
  if (rest === 'which-key') c.whichKey = true;
  else if (rest === 'nowhich-key') c.whichKey = false;
  else if (rest.startsWith('timeoutlen')) {
    const eq = rest.includes('=')
      ? rest.slice(rest.indexOf('=') + 1).trim()
      : '';
    const n =
      eq !== '' ? parseInt(eq, 10) : parseInt(rest.split(/\s+/)[1] ?? '', 10);
    if (!Number.isNaN(n) && n >= 0) c.whichKeyDelayMs = n;
  } else parseSetColor(c, rest, err);
}

type ColorField =
  'overlayColor' | 'overlayTextColor' | 'expandHintColor' | 'grabColor';

const COLOR_SET_FIELDS = new Map<string, ColorField>([
  ['overlay-color', 'overlayColor'],
  ['overlay-text-color', 'overlayTextColor'],
  ['expand-hint-color', 'expandHintColor'],
  ['grab-color', 'grabColor'],
]);

const HEX_COLOR_RE = /^[0-9a-fA-F]{6}$/;

function parseSetColor(
  c: Config,
  rest: string,
  err: (m: string) => void,
): void {
  const { key, value } = splitSetOption(rest);
  const field = COLOR_SET_FIELDS.get(key);
  if (field === undefined) return;
  const color = parseHexColor(value);
  if (color === null) {
    err(`set ${key}: invalid color '${value}' (expected #RRGGBB)`);
    return;
  }
  c[field] = color;
}

function splitSetOption(rest: string): { key: string; value: string } {
  const eq = rest.indexOf('=');
  if (eq < 0) return { key: rest.trim(), value: '' };
  return { key: rest.slice(0, eq).trim(), value: rest.slice(eq + 1).trim() };
}

function parseHexColor(text: string): string | null {
  const hex = text.startsWith('#') ? text.slice(1) : text;
  if (!HEX_COLOR_RE.test(hex)) return null;
  return `#${hex.toLowerCase()}`;
}

function parseDescBody(
  c: Config,
  body: string,
  err: (m: string) => void,
): void {
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

function parseMap(
  c: Config,
  cmd: string,
  rest: string,
  err: (m: string) => void,
): void {
  const m = /^(\S+)\s+(.*)$/.exec(rest);
  if (!m) {
    err(`${cmd} needs a key and a target`);
    return;
  }
  const lhs = m[1];
  const rhs = m[2].trim();
  const recursive = cmd === 'map' || cmd === 'nmap' || cmd === 'mmap';
  const motion = cmd === 'mmap' || cmd === 'mnoremap';

  const binding = parseTarget(rhs, recursive, `${cmd} ${rest}`, err);
  if (binding === null) return;

  if (lhs.startsWith('<leader>')) {
    if (motion) {
      err(`${cmd} cannot define keypad entries; use map <leader>...`);
      return;
    }
    const seq = parseKeys(lhs.slice('<leader>'.length), err);
    if (seq === null) return;
    if (seq === '') err('<leader> alone cannot be mapped');
    else if ('0123456789?/'.includes(seq[0])) {
      err(
        `keypad ${seq[0]} is reserved (digit argument / cheatsheet / describe)`,
      );
    } else c.keypad.set(seq, binding);
    return;
  }

  const keys = parseKeys(lhs, err);
  if (keys === null) return;
  if (keys.length !== 1) {
    err(
      `${motion ? 'motion' : 'normal'}-mode key must be a single printable key: ${lhs}`,
    );
  } else if (keys === ' ') {
    err('SPC is the keypad key and cannot be remapped');
  } else {
    (motion ? c.motion : c.normal).set(keys, binding);
  }
}

function parseTarget(
  rhs: string,
  recursive: boolean,
  errContext: string,
  err: (m: string) => void,
): Binding | null {
  const action = ACTION_RE.exec(rhs)?.[1];
  if (action !== undefined) return { action, recursive };
  if (COMMANDS.has(rhs)) return { command: rhs, recursive };
  if (rhs.startsWith('meow-')) {
    err(`unknown meow command '${rhs}'`);
    return null;
  }
  const keys = parseKeys(rhs.replace(/\s+/g, ''), err);
  if (keys === null) return null;
  if (keys === '') {
    err(`empty target in '${errContext}'`);
    return null;
  }
  return { keys, recursive };
}

function parseRepeat(c: Config, rest: string, err: (m: string) => void): void {
  const m = /^(\S+)\s+(\S+)\s+(.*)$/.exec(rest);
  if (!m) {
    err('repeat needs a group, a member key and a target');
    return;
  }
  const group = m[1];
  const keyToken = m[2];
  const key = parseKeys(keyToken, err);
  if (key === null) return;
  if (key.length !== 1) {
    err(`repeat member key must be a single printable key: ${keyToken}`);
  } else if (key === ' ') {
    err('SPC is the keypad key and cannot be a repeat member');
  } else {
    const binding = parseTarget(m[3].trim(), true, `repeat ${rest}`, err);
    if (binding === null) return;
    let members = c.repeat.get(group);
    if (!members) {
      members = new Map<string, Binding>();
      c.repeat.set(group, members);
    }
    members.set(key, binding);
  }
}

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
        err(
          `unsupported key token ${s.slice(i, close + 1)} (only printable keys reach the meow engine)`,
        );
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
