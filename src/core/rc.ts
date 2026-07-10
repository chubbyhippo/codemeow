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

import { parse as parseRc } from './rcParser';
import { RcState } from './rcState';

/**
 * The two rc layers and their layering rules. Like meow in Emacs, the engine
 * binds NO keys — the whole keymap (NORMAL/MOTION layout AND the SPC keypad
 * table) is rc lines. The repo's .codemeowrc ships inside the extension as
 * the DEFAULTS layer; an optional ~/.codemeowrc overrides it entry by entry,
 * and `nnoremap`/`mnoremap` replays resolve through the defaults alone.
 * Syntax lives in rcParser. The core stays IO-free: the host adapter (or the
 * test suite) reads the files and feeds the lines in.
 */

/** One key's target: a host command, replayed keys, or a named meow command. */
export interface Binding {
  action?: string;
  keys?: string;
  command?: string;
  recursive: boolean;
}

/** Everything one rc file declares. */
export class Config {
  normal = new Map<string, Binding>();
  motion = new Map<string, Binding>();
  keypad = new Map<string, Binding>();
  keypadDesc = new Map<string, string>();
  whichKey: boolean | null = null;
  whichKeyDelayMs: number | null = null;
  errors: string[] = [];
}

let userConfig = new Config();
let defaultConfig = new Config();

export const Rc = {
  FILE_NAME: '.codemeowrc',

  parse(lines: string[]): Config {
    return parseRc(lines);
  },

  /** The bundled .codemeowrc — the default layer beneath ~/.codemeowrc. */
  initDefaults(lines: string[]): Config {
    defaultConfig = parseRc(lines);
    return defaultConfig;
  },

  /** Load (or reload) the user layer from rc lines. */
  setUserLines(lines: string[]): Config {
    userConfig = parseRc(lines);
    RcState.saveParsed(userConfig); // the reload button's "loaded" snapshot
    return userConfig;
  },

  setForTest(c: Config): void {
    userConfig = c;
    RcState.resetForTest(); // no stale reload-button state across specs
  },

  cfg(): Config {
    return userConfig;
  },

  defaults(): Config {
    return defaultConfig;
  },

  // ------------------------------------------------------ effective views

  /** Effective keypad table: bundled defaults with ~/.codemeowrc on top. */
  keypad(): Map<string, Binding> {
    return new Map([...defaultConfig.keypad, ...userConfig.keypad]);
  },

  /** Effective which-key labels: bundled defaults with ~/.codemeowrc on top. */
  keypadDescs(): Map<string, string> {
    return new Map([...defaultConfig.keypadDesc, ...userConfig.keypadDesc]);
  },

  whichKeyEnabled(): boolean {
    return userConfig.whichKey ?? defaultConfig.whichKey ?? true;
  },

  whichKeyDelayMs(): number {
    return userConfig.whichKeyDelayMs ?? defaultConfig.whichKeyDelayMs ?? 250;
  },
};
