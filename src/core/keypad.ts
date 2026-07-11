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
import { Rc } from './rc';
import * as Engine from './engine';

export async function key(ctx: Ctx, c: string): Promise<void> {
  const st = ctx.st;
  ctx.ui.hideWhichKey();
  const keypad = Rc.keypad();
  const buf = st.keypad;

  if (buf === '/') {
    describe(ctx, c);
    exit(ctx);
    return;
  }
  if (buf === '') {
    if (c >= '0' && c <= '9') {
      st.pendingCount = st.pendingCount * 10 + (c.charCodeAt(0) - 48);
      exit(ctx);
      return;
    }
    if (c === '?') {
      exit(ctx);
      ctx.ui.info('Meow Cheatsheet', CHEATSHEET);
      return;
    }
    if (c === '/') {
      st.keypad += '/';
      return;
    }
  }

  st.keypad += c;
  const cur = st.keypad;
  const binding = keypad.get(cur);
  if (binding) {
    exit(ctx);
    await Engine.runBinding(ctx, binding);
    return;
  }
  let hasPrefix = false;
  for (const seq of keypad.keys()) {
    if (seq.startsWith(cur)) {
      hasPrefix = true;
      break;
    }
  }
  if (!hasPrefix) {
    exit(ctx);
    ctx.ui.hint(`SPC ${cur.split('').join(' ')} is undefined`);
  } else {
    ctx.ui.scheduleWhichKey('keypad', cur);
  }
}

export function exit(ctx: Ctx): void {
  ctx.ui.hideWhichKey();
  setMode(ctx, ctx.st.keypadPreviousState);
}

function describe(ctx: Ctx, c: string): void {
  const descs = Rc.keypadDescs();
  const entries = [...Rc.keypad().entries()]
    .filter(([seq]) => seq.startsWith(c))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([seq, b]) => {
      const target = b.action ?? b.command ?? b.keys ?? '';
      const desc = descs.has(seq) ? `  (${descs.get(seq)})` : '';
      return `SPC ${seq.split('').join(' ')}  ->  ${target}${desc}`;
    })
    .join('\n');
  ctx.ui.info(
    `Meow Describe: SPC ${c}`,
    entries === '' ? `SPC ${c} is undefined` : entries,
  );
}

export const CHEATSHEET = `
The bundled default layout (meow's suggested QWERTY) — every key below can
be rebound from ~/.codemeowrc.

NORMAL — selection first, then act
  h j k l  move (cancel selection)       H J K L  extend char selection
  w / W    mark word / symbol            e / E    next word / symbol end
  b / B    back word / symbol            x        line (repeat: extend)
  f / t    find / till char (inclusive / exclusive)
  o / O    block / to end of block       m        select join region
  , / .    inner / bounds of thing       [ / ]    to beginning / end of thing
     things: r round  s square  c curly  g string  e symbol  w window
             b buffer  p paragraph  l line  v visual line  d defun  . sentence
  1-9, 0   expand selection by N units (0 = 10); without selection: count
  -        negative argument              ;        reverse selection
  i / a    insert at start / end          I / A    open line above / below
  c        change                         s        kill (cut)
  d / D    delete char/sel fwd / back     y        save (copy)
  p        yank (paste at point)          r        replace selection with clipboard
  u        undo                           '        repeat last command
  v        visit (regexp search+select)   n        search next (reversed sel = backward)
  z        pop selection (or grab)        g        cancel selection / cursors
  G        grab (secondary selection)     R / Y    swap grab / sync grab
  Q / X    goto line                      q        close editor tab
  ESC      insert -> normal; drops extra cursors
  BEACON   grab a region (G), then select w/x/f... inside it:
           a cursor lands on every match — edit them all, ESC to finish

EMACS CHORDS (VS Code keybindings, not rc-configurable — Preferences)
  C-f/b/n/p  char/line move            C-a/e      beginning/end of line
  M-f/b      word move                 M-a/e      backward/forward sentence
             no selection: just moves; with one active: extends it
             (point motion over an active Emacs mark) — same rule ; reverses

KEYPAD (SPC — or Alt+; from ANY state, INSERT included; returns there)
  SPC b bookmarks/buffers   SPC x file/buffer/window   SPC c commands   SPC m meta
  SPC w windows   SPC 0-9 count   SPC ? this sheet   SPC / describe key
  SPC c m edit ~/.codemeowrc   SPC c M reload it
  SPC i d find a command id — filterable list, Enter copies the id
          to use in <action>(...) mappings; its title buttons open
          record-keys mode and the keystroke log ("what runs this key?")
  REPEAT  some entries start a run (Emacs repeat-mode): after
          SPC . e keep tapping . / , to walk errors, after SPC w i
          keep tapping i (or = - o u 0) to keep zooming — any other
          key ends the run and keeps its normal meaning

~/.codemeowrc: nmap <key> <action>(command.id) | nmap <key> meow-command | nmap <key> <meow keys>
  mmap ... (MOTION mode) | map <leader><seq> ... | desc <leader><seq> text | set nowhich-key
  repeat <group> <key> <target> — tap-to-continue groups (the REPEAT runs above)
  every binding above is an rc line — the defaults ship as a bundled
  .codemeowrc inside the extension; ~/.codemeowrc overrides them key by key
`.trim();
