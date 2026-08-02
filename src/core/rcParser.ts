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

import { Chord } from './chord';
import { HOST_KEYS, normalize as normalizeHostKey } from './hostKey';
import { Binding, Config } from './rc';
import { COMMANDS } from './registry';

const ACTION_RE = /^<action>\(([\w.\-$(),=]+)\)$/i;
const WHICHKEY_LET_RE = /^let\s+g:WhichKeyDesc\w*\s*=\s*"(.+)"$/;

export function parse(lines: string[]): Config {
  const config = new Config();
  lines.forEach((raw, i) => {
    let line = raw.trim();
    const err = (msg: string) => config.errors.push(`line ${i + 1}: ${msg}`);

    if (line === '' || line.startsWith('"') || line.startsWith('#')) return;

    const wk = WHICHKEY_LET_RE.exec(line);
    if (wk) {
      const [, descBody = ''] = wk;
      parseDescBody(config, descBody, err);
      return;
    }

    const cut = line.search(/\s"/);
    if (cut >= 0) line = line.slice(0, cut).trimEnd();
    if (line === '') return;

    const [cmd, rest] = splitFirstWord(line);
    switch (cmd) {
      case 'let':
        break;
      case 'cmap':
      case 'cnoremap':
        parseChord(config, cmd, rest, err);
        break;
      case 'hostmap':
      case 'hostnoremap':
        parseHostKey(config, cmd, rest, err);
        break;
      case 'resizemap':
      case 'resizenoremap':
        parseResizeKey(config, cmd, rest, err);
        break;
      case 'set':
        parseSet(config, rest, err);
        break;
      case 'desc':
        parseDescBody(config, rest, err);
        break;
      case 'map':
      case 'noremap':
      case 'nmap':
      case 'nnoremap':
      case 'mmap':
      case 'mnoremap':
        parseMap(config, cmd, rest, err);
        break;
      case 'repeat':
        parseRepeat(config, rest, err);
        break;
      default:
        err(`unknown command '${cmd}'`);
    }
  });
  return config;
}

function splitFirstWord(line: string): [string, string] {
  const gap = line.search(/\s/);
  if (gap < 0) return [line, ''];
  return [line.slice(0, gap), line.slice(gap).trim()];
}

function parseSet(
  config: Config,
  rest: string,
  err: (m: string) => void,
): void {
  if (rest === 'which-key') config.whichKey = true;
  else if (rest === 'nowhich-key') config.whichKey = false;
  else if (rest.startsWith('timeoutlen')) {
    const eq = rest.includes('=')
      ? rest.slice(rest.indexOf('=') + 1).trim()
      : '';
    const parsed =
      eq !== '' ? parseInt(eq, 10) : parseInt(splitFirstWord(rest)[1], 10);
    if (!Number.isNaN(parsed) && parsed >= 0) config.whichKeyDelayMs = parsed;
  } else parseSetColor(config, rest, err);
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
  config: Config,
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
  config[field] = color;
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
  config: Config,
  body: string,
  err: (m: string) => void,
): void {
  if (!body.startsWith('<leader>')) {
    err(`descriptions must start with <leader>: ${body}`);
    return;
  }
  const after = body.slice('<leader>'.length);
  const [seqToken] = splitFirstWord(after);
  const desc = after.slice(seqToken.length).trim();
  const seq = parseKeys(seqToken, err);
  if (seq === null) return;
  if (seq === '') {
    err(`empty key sequence in description: ${body}`);
    return;
  }
  config.keypadDesc.set(seq, desc);
}

function parseChord(
  config: Config,
  cmd: string,
  rest: string,
  err: (m: string) => void,
): void {
  const split = Math.max(rest.lastIndexOf(' '), rest.lastIndexOf('\t'));
  if (split <= 0) {
    err(`${cmd} needs a chord and a target`);
    return;
  }
  const spelling = rest.slice(0, split).trim();
  const chord = Chord.parse(spelling);
  if (chord === null) {
    err(`not a chord (needs Ctrl or Alt and one key): ${spelling}`);
    return;
  }
  const rhs = rest.slice(split + 1).trim();
  const binding = parseTarget(rhs, cmd === 'cmap', `${cmd} ${rest}`, err);
  if (binding === null) return;
  config.chords.set(Chord.spelling(chord), binding);
}

function parseHostKey(
  config: Config,
  cmd: string,
  rest: string,
  err: (m: string) => void,
): void {
  const split = Math.max(rest.lastIndexOf(' '), rest.lastIndexOf('\t'));
  if (split <= 0) {
    err(`${cmd} needs a host key and a target`);
    return;
  }
  const spelling = rest.slice(0, split).trim();
  const host = normalizeHostKey(spelling);
  if (host === null) {
    err(`not a host key (one of ${HOST_KEYS.join(' ')}): ${spelling}`);
    return;
  }
  const rhs = rest.slice(split + 1).trim();
  const binding = parseTarget(rhs, cmd === 'hostmap', `${cmd} ${rest}`, err);
  if (binding === null) return;
  config.hosts.set(host, binding);
}

function parseResizeKey(
  config: Config,
  cmd: string,
  rest: string,
  err: (m: string) => void,
): void {
  const matched = /^(\S+)\s+(.*)$/.exec(rest);
  if (!matched) {
    err(`${cmd} needs a key and a target`);
    return;
  }
  const [, lhs = '', rhsRaw = ''] = matched;
  const key = parseKeys(lhs, err);
  if (key === null) return;
  if (key.length !== 1) {
    err(`resize key must be a single printable key: ${lhs}`);
    return;
  }
  const binding = parseTarget(
    rhsRaw.trim(),
    cmd === 'resizemap',
    `${cmd} ${rest}`,
    err,
  );
  if (binding === null) return;
  config.resizes.set(key, binding);
}

function parseMap(
  config: Config,
  cmd: string,
  rest: string,
  err: (m: string) => void,
): void {
  const matched = /^(\S+)\s+(.*)$/.exec(rest);
  if (!matched) {
    err(`${cmd} needs a key and a target`);
    return;
  }
  const [, lhs = '', rhsRaw = ''] = matched;
  const rhs = rhsRaw.trim();
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
    else if ('0123456789?/'.includes(seq.charAt(0))) {
      err(
        `keypad ${seq.charAt(0)} is reserved (digit argument / cheatsheet / describe)`,
      );
    } else config.keypad.set(seq, binding);
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
    (motion ? config.motion : config.normal).set(keys, binding);
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

function parseRepeat(
  config: Config,
  rest: string,
  err: (m: string) => void,
): void {
  const matched = /^(\S+)\s+(\S+)\s+(.*)$/.exec(rest);
  if (!matched) {
    err('repeat needs a group, a member key and a target');
    return;
  }
  const [, group = '', keyToken = '', targetToken = ''] = matched;
  const key = parseKeys(keyToken, err);
  if (key === null) return;
  if (key.length !== 1) {
    err(`repeat member key must be a single printable key: ${keyToken}`);
  } else if (key === ' ') {
    err('SPC is the keypad key and cannot be a repeat member');
  } else {
    const binding = parseTarget(
      targetToken.trim(),
      true,
      `repeat ${rest}`,
      err,
    );
    if (binding === null) return;
    let members = config.repeat.get(group);
    if (!members) {
      members = new Map<string, Binding>();
      config.repeat.set(group, members);
    }
    members.set(key, binding);
  }
}

function parseKeys(spec: string, err: (msg: string) => void): string | null {
  let out = '';
  let i = 0;
  while (i < spec.length) {
    const char = spec.charAt(i);
    if (char === '<') {
      const close = spec.indexOf('>', i);
      if (close < 0) {
        out += char;
        i++;
        continue;
      }
      const token = spec.slice(i + 1, close).toLowerCase();
      if (token === 'space') out += ' ';
      else if (token === 'lt') out += '<';
      else {
        err(
          `unsupported key token ${spec.slice(i, close + 1)} (only printable keys reach the meow engine)`,
        );
        return null;
      }
      i = close + 1;
    } else {
      out += char;
      i++;
    }
  }
  return out;
}
