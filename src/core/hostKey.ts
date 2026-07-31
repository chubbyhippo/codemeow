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

export const HOST_KEYS = [
  'space',
  'alt+;',
  'shift+left',
  'shift+right',
  'shift+up',
  'shift+down',
] as const;

export type HostKey = (typeof HOST_KEYS)[number];

const SPELLINGS: Array<{ key: HostKey; mods: string[]; names: string[] }> = [
  { key: 'alt+;', mods: ['alt', 'm'], names: [';', 'semicolon'] },
  { key: 'shift+left', mods: ['shift', 's'], names: ['left'] },
  { key: 'shift+right', mods: ['shift', 's'], names: ['right'] },
  { key: 'shift+up', mods: ['shift', 's'], names: ['up'] },
  { key: 'shift+down', mods: ['shift', 's'], names: ['down'] },
];

const BARE_SPELLINGS: Array<{ key: HostKey; names: string[] }> = [
  { key: 'space', names: ['space', 'spc'] },
];

const ALIASES: Map<string, HostKey> = new Map([
  ...SPELLINGS.flatMap(({ key, mods, names }) =>
    mods.flatMap((mod) =>
      names.map((name): [string, HostKey] => [`${mod} ${name}`, key]),
    ),
  ),
  ...BARE_SPELLINGS.flatMap(({ key, names }) =>
    names.map((name): [string, HostKey] => [name, key]),
  ),
]);

export function normalize(spelling: string): HostKey | null {
  const flat = spelling
    .trim()
    .toLowerCase()
    .replace(/[<>+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return ALIASES.get(flat) ?? null;
}
