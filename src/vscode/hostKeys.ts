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

import { HostKey } from '../core/hostKey';

interface HostKeyBinding {
  host: HostKey;
  key: string;
  ctx: string;
}

const HOST_WHEN = 'editorTextFocus && codemeow.active';

export const HOST_KEY_TABLE: HostKeyBinding[] = [
  { host: 'alt+;', key: 'alt+;', ctx: 'altSemicolon' },
  { host: 'shift+left', key: 'shift+left', ctx: 'shiftLeft' },
  { host: 'shift+right', key: 'shift+right', ctx: 'shiftRight' },
  { host: 'shift+up', key: 'shift+up', ctx: 'shiftUp' },
  { host: 'shift+down', key: 'shift+down', ctx: 'shiftDown' },
];

export function hostKeybindings(): Array<{
  key: string;
  command: string;
  args: string;
  when: string;
}> {
  return HOST_KEY_TABLE.map(({ host, key, ctx }) => ({
    key,
    command: 'codemeow.hostKey',
    args: host,
    when: `${HOST_WHEN} && codemeow.host.${ctx}`,
  }));
}
