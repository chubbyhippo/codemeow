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

export interface Binding {
  action?: string;
  keys?: string;
  command?: string;
  recursive: boolean;
}

export class Config {
  normal = new Map<string, Binding>();
  motion = new Map<string, Binding>();
  keypad = new Map<string, Binding>();
  keypadDesc = new Map<string, string>();

  repeat = new Map<string, Map<string, Binding>>();
  whichKey: boolean | null = null;
  whichKeyDelayMs: number | null = null;
  overlayColor: string | null = null;
  overlayTextColor: string | null = null;
  expandHintColor: string | null = null;
  grabColor: string | null = null;
  errors: string[] = [];
}

const DEFAULT_WHICH_KEY_DELAY_MS = 250;
const DEFAULT_OVERLAY_COLOR = '#e52b50';
const DEFAULT_OVERLAY_TEXT_COLOR = '#ffffff';

let userConfig = new Config();
let defaultConfig = new Config();

export const Rc = {
  FILE_NAME: '.codemeowrc',

  parse(lines: string[]): Config {
    return parseRc(lines);
  },

  initDefaults(lines: string[]): Config {
    defaultConfig = parseRc(lines);
    return defaultConfig;
  },

  setUserLines(lines: string[]): Config {
    userConfig = parseRc(lines);
    RcState.saveParsed(userConfig);
    return userConfig;
  },

  setForTest(c: Config): void {
    userConfig = c;
    RcState.resetForTest();
  },

  cfg(): Config {
    return userConfig;
  },

  defaults(): Config {
    return defaultConfig;
  },

  keypad(): Map<string, Binding> {
    return new Map([...defaultConfig.keypad, ...userConfig.keypad]);
  },

  keypadDescs(): Map<string, string> {
    return new Map([...defaultConfig.keypadDesc, ...userConfig.keypadDesc]);
  },

  repeatGroups(): Map<string, Map<string, Binding>> {
    const merged = new Map<string, Map<string, Binding>>();
    for (const [group, members] of defaultConfig.repeat) {
      merged.set(group, new Map(members));
    }
    for (const [group, members] of userConfig.repeat) {
      const m = merged.get(group) ?? new Map<string, Binding>();
      for (const [key, b] of members) m.set(key, b);
      merged.set(group, m);
    }
    for (const [group, members] of merged) {
      for (const [key, b] of members) {
        if (b.command === 'ignore') members.delete(key);
      }
      if (members.size === 0) merged.delete(group);
    }
    return merged;
  },

  repeatMapFor(b: Binding): Map<string, Binding> | null {
    for (const members of this.repeatGroups().values()) {
      for (const m of members.values()) {
        if (
          m.action === b.action &&
          m.command === b.command &&
          m.keys === b.keys
        ) {
          return members;
        }
      }
    }
    return null;
  },

  whichKeyEnabled(): boolean {
    return userConfig.whichKey ?? defaultConfig.whichKey ?? true;
  },

  whichKeyDelayMs(): number {
    return (
      userConfig.whichKeyDelayMs ??
      defaultConfig.whichKeyDelayMs ??
      DEFAULT_WHICH_KEY_DELAY_MS
    );
  },

  overlayColor(): string {
    return (
      userConfig.overlayColor ??
      defaultConfig.overlayColor ??
      DEFAULT_OVERLAY_COLOR
    );
  },

  overlayTextColor(): string {
    return (
      userConfig.overlayTextColor ??
      defaultConfig.overlayTextColor ??
      DEFAULT_OVERLAY_TEXT_COLOR
    );
  },

  expandHintColor(): string | null {
    return userConfig.expandHintColor ?? defaultConfig.expandHintColor ?? null;
  },

  grabColor(): string | null {
    return userConfig.grabColor ?? defaultConfig.grabColor ?? null;
  },
};
