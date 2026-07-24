# codemeow — meow modal editing for VS Code and VSCodium

If you love [meow](https://github.com/meow-edit/meow) in Emacs and sigh every
time you open VS Code, this extension is for you. It implements meow's
suggested **QWERTY layout** as a native modal editing engine — no vim
emulation in the middle. Just meow: select first, then act.

It is the sibling of [ideameow](https://github.com/chubbyhippo/ideameow) (the
same idea for IntelliJ): the two share their keymap format, their default
layout, and a behavior-identical test suite, so your muscle memory transfers
between editors unchanged.

(Do disable VSCodeVim while this is enabled — both extensions intercept
typing, and two modal editors cannot share a keyboard.)

## What you get

The states you know from meow:

- **NORMAL** — keys are commands, block cursor. You start here.
- **INSERT** — keys type text. `i a c I A` get you in, `ESC` gets you out.
- **MOTION** — meow's reduced state for special contexts, rebindable with
  `mmap`. Read-only views do _not_ use it: like read-only buffers in Emacs
  they stay in NORMAL — every motion, selection, search and avy jump works,
  and the modify commands are simply inert (meow's `meow--allow-modify-p`).
  What _does_ answer to it, like special buffers in Emacs: the workbench
  trees — see below.
- **KEYPAD** — `SPC` as the leader, dispatching editor commands Emacs-style
  (`SPC x f` = quick open, `SPC w v` = split…). A which-key menu pops up
  with your options whenever you pause on a prefix.
- **BEACON** — meow's multi-edit, built on VS Code's native multiple cursors:
  grab a region with `G`, select something inside it, and a cursor lands on
  every similar range. Edit them all at once; `ESC` collapses.

The status bar always tells you which state you're in. Meow runs in file
buffers, in read-only views (a diff's git side, the output panel, the
cheatsheet — full layout, edits blocked), and in the SCM commit message box;
inputs that need their own keys (notebook REPLs, review comments) keep
native editing.

**Workbench trees** — the Explorer, outline, search results, problems,
timeline, and every other sidebar or panel tree — answer to the MOTION map,
like special buffers in Emacs: `j`/`k` move the selection, `h` collapses or
goes to the parent, `l` expands or enters, `q` hides the side bar.
Everything else stays native: `Enter` opens, and any _unmapped_ letter still
starts the tree's type-to-find. Add your own tree keys with `mmap` lines in
`~/.codemeowrc`, e.g. `mmap o <action>(filesExplorer.openFilePreserveFocus)`
(open the file but keep navigating) or
`mmap r <action>(workbench.files.action.refreshFilesExplorer)`;
`mmap <key> ignore` gives a key back to the tree (so `mmap q ignore` makes
`q` type into the find again). Meow commands other than the four motions
have no tree meaning and are simply inert there.

**Double-ESC leaves any tool window** — press `ESC` twice quickly (within
500 ms) in the terminal, a sidebar or panel view, and focus jumps back to
the editor; a lone `ESC` keeps its native meaning (lists still clear their
selection, the shell still receives its escape byte). One setting is needed
for the terminal half — by default VS Code sends every unlisted key to the
shell, so let the codemeow binding through:

```json
"terminal.integrated.commandsToSkipShell": ["codemeow.toolWindowEscape"]
```

Chat-style webview inputs are the one surface this can't reach generically —
their extensions own their `when` contexts; add your own `escape` keybinding
on `codemeow.toolWindowEscape` with that context if you want it there.

**Windows** — `(windmove-default-keybindings)` from `init.el`, ported:
`Shift+←→↑↓` select the editor window in that direction, and the same four
commands live on `SPC w h/j/k/l`, mirroring init.el's `C-c w` window map.
The "windows" are the editor groups _plus_ the two panes of a side-by-side
diff, which plain group focus never crosses — `S-left` in the modified pane
enters the original, `S-left` again leaves the diff toward the group on its
left. No wrap-around, and where Emacs would complain, codemeow does too:
"No window left from selected window" in the status bar. `SPC w b`
balances the split sizes (init.el's `C-c w b`); the `H/J/K/L` window swaps
exist in ideameow only — VS Code has no command to exchange two groups'
contents. The Shift+arrow
chords live in the manifest keybindings (modifier chords never reach the
modal engine) — rebind them under _Preferences → Keyboard Shortcuts →
Windmove_ — and inside meow buffers they shadow shift-selection, the exact
tradeoff the Emacs binding makes (select with meow instead; anywhere meow
doesn't attach keeps native shift-select).

**Ace-window** — `SPC w w` (and `SPC x o`, the `C-x o` slot) is an
ace-window port over the editor groups: with three or more, every group
showing a text editor gets a home-row label painted at its top
(`a s d f g h j k l`, avy's colors) and the next key jumps to that group;
with exactly two it hops straight to the other one, like `other-window`;
`Esc` cancels. Groups whose active tab has no text editor (a webview, an
image) can't take a label, and picks reach the first eight groups — the
platform's own focus-group commands. The key prompt rides a quick-pick
sink, the same trick the which-key menu uses.

**Emacs chords** — `Ctrl+f/b/n/p/a/e` and `Alt+f/b/a/e` are the real
Emacs point motions (`forward/backward-char`, `next/previous-line`,
`move-beginning/end-of-line`, `forward/backward-word`,
`backward/forward-sentence`), not meow commands: meow itself never rebinds
these chords — its state keymaps hold only single printable keys, so every
chord falls through to the vanilla Emacs keymap ("Compatible with the
vanilla Emacs keymap", meow's own README) — and, because a meow
selection is an active Emacs mark, that same point motion stretches an
already-active selection for free, with no special-casing. codemeow ports
that: with no selection the chord just moves the cursor, and with one active
it extends it, anchored exactly like meow's own `H J K L` char/line expand —
so `w` then `Ctrl+f Ctrl+f` grows the marked word one character at a time,
and `;` (reverse) flips which end subsequent chords grow from. `Alt+n` /
`Alt+p` are deliberately left unbound: stock Emacs has no default binding for
them either (only the unrelated `M-g n` / `M-g p` error-navigation prefix) —
verified against the GNU Emacs manual, not guessed.

The same treatment covers the rest of the portable Emacs chord layer:
`Alt+Shift+,` / `Alt+Shift+.` are `beginning/end-of-buffer` (Emacs `M-<` /
`M->` — a count lands N/10 of the way in, snapping to the next line start,
exactly the stock behavior), `Alt+Shift+[` / `Alt+Shift+]` are
`backward/forward-paragraph` (Emacs `M-{` / `M-}` — paragraphs are
blank-line-delimited; forward lands on the separator line, backward on the
paragraph start with one adjacent empty line joining it), `Alt+u` /
`Alt+l` / `Alt+c` are
`upcase/downcase/capitalize-word` (from the cursor through the word's end; a
negative count — `-` then the chord — reaches back without moving the
cursor), and `Alt+d` is `kill-word` (into the clipboard; a negative count
kills backward). Like Windmove's Shift+arrows above, all of these live in
the manifest keybindings, gated to NORMAL meow buffers (so `Ctrl+F` stays
Find while you type) — rebind them under
_Preferences → Keyboard Shortcuts_.

And one idea borrowed straight from meow itself: **the extension binds no
keys in code.** The entire keymap — the NORMAL/MOTION layout _and_ the whole
`SPC` keypad table — lives in a `.codemeowrc` file bundled inside the
extension, and a `~/.codemeowrc` in your home directory overrides it entry by
entry. Rebind anything; relayout everything.

## Build & install

```bash
cd codemeow
./setup.sh                  # build + side-load into every detected VS Code /
                            # VSCodium (Linux, macOS, WSL server, and Windows
                            # editors from WSL) and install ~/.codemeowrc
./setup.sh --list           # just show which extension dirs it would target
npm test                    # compile + run the meow behavior suite
```

The toolchain is pinned in `mise.toml` (node 24); `setup.sh` falls back to
`mise exec` automatically when your PATH node is older. The extension is
side-loaded as a plain folder under `<editor>/extensions/` — no marketplace
account needed; restart the editor and you're in NORMAL mode.

## The layout

This is meow's suggested QWERTY layout, validated against
[KEYBINDING_QWERTY.org](https://github.com/meow-edit/meow/blob/master/KEYBINDING_QWERTY.org)
in meow's repository — not reconstructed from vim habits. The bundled
`.codemeowrc` spells it out as one `nmap <key> <meow-command>` line per key,
so the file doubles as the authoritative reference; what follows is the
guided tour.

**Moving and selecting.** `h j k l` move (a char-selection survives movement,
any other selection is cancelled), and `H J K L` extend a char selection.
`w`/`W` mark the word/symbol at point — and push it to the search ring, which
is why `n` finds the next occurrence right afterwards. `e`/`E` and `b`/`B` go
to the next/previous word or symbol, and after a `w` they _extend_ the
selection instead of replacing it (meow's `(expand . word)` rule). `x` selects
the line — repeat it or press digits to take more lines. `Q`/`X` go to a line,
`f`/`t` find/till a character, `o`/`O` select the enclosing block / to its
end, `m` selects the join region, and `,` `.` `[` `]` select inner/bounds/
begin/end of a _thing_ (`r` round, `s` square, `c` curly, `g` string, `e`
symbol, `w` window, `b` buffer, `p` paragraph, `l` line, `v` visual line, `d`
defun, `.` sentence — meow's exact char-thing table). `;` reverses the
selection, `z` pops back to the previous one, `v` visits a regexp, `n`
continues the search (backward when the selection is reversed). Digits expand
the selection by N units — little painted hints show you where each digit
lands (`0` = 10) — or act as a count when nothing is selected. `-` is the
negative argument.

**Editing.** `i`/`a` insert at the selection's start/end, `I`/`A` open a line
above/below, `c` change, `s` kill (cut), `d`/`D` delete forward/backward, `y`
save (copy), `p` yank (paste), `r` replace the selection with the clipboard,
`u` undo, `'` repeats the last command — counts and all, so `'` after `2fa`
finds the second `a` again. `g` cancels, `q` closes the tab, `ESC` always
brings you back to NORMAL.

**Grab and beacon.** `G` grabs the selection (you'll see it highlighted).
While a grab is active, any selection you make inside it — `w`, `x`, `f`… —
drops a cursor on every similar range: change them all, then `ESC`. `R`
swap-grab exchanges the selection and grab texts; `Y` sync-grab re-stashes.

**Keypad.** `SPC x/c/m/w …` mirror the Emacs/meow keypad of the companion
`init.el`/`.ideavimrc`/ideameow setups (quick open, save all, splits, font
size…); `SPC b` is bookmarks via the `alefragnani.numbered-bookmarks`
extension (`0-9` numbered set, `j` jump; `b` = MRU editors).
`SPC 1-9` is a digit argument, `SPC ?` opens the cheatsheet, `SPC /`
describes a key, and `SPC c m` / `SPC c M` edit / reload your config.

## ~/.codemeowrc — configuring everything

codemeow reads an `.ideavimrc`-style file from your home directory:
`~/.codemeowrc` on Linux/macOS, `C:\Users\<you>\.codemeowrc` on Windows.

**Getting started is two steps:**

1. Press `SPC c m` in the editor — the first press creates `~/.codemeowrc`
   as a full copy of the bundled defaults and opens it: the complete layout
   and keypad table, ready to edit. (The bundled defaults also stay
   underneath and overrides apply entry by entry, so deleting a line just
   falls back to the default — bind `ignore` to disable a key — and a
   pared-down file of only your overrides works exactly the same.)
2. Edit, then reload — either with `SPC c M`, or with the **Reload** button
   that appears in the rc editor's title bar whenever its content differs
   from the loaded config (comment and formatting edits don't count — the
   comparison is on the parsed config, IdeaVim-style). Unsaved edits are
   saved for you. A message tells you how many mappings loaded — and lists
   any parse problems with their line numbers.

**Syntax reference**

| Line                                      | Meaning                                                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `" text` or `# text`                      | comment (also at the end of a line: `nmap S <action>(X) " jump`)                                                  |
| `nmap <key> <meow-command>`               | bind a NORMAL key to a named meow command, e.g. `nmap n meow-mark-word` — this is how you remap the layout itself |
| `nmap <key> <action>(command.id)`         | NORMAL key runs a VS Code command                                                                                 |
| `nmap <key> <keys>`                       | NORMAL key replays a meow key sequence, e.g. `nmap Z ,b`                                                          |
| `nnoremap` / `noremap`                    | like `nmap`/`map`, but the replayed keys resolve through the bundled defaults, ignoring your other mappings       |
| `mmap` / `mnoremap`                       | the same three target forms, for MOTION mode — the keymap of the workbench trees (read-only views stay in NORMAL) |
| `map <leader><seq> <action>(id)`          | keypad entry: `SPC` + sequence runs the command (yours override the bundled defaults)                             |
| `map <leader><seq> <keys>`                | keypad entry replaying meow keys after the keypad closes                                                          |
| `desc <leader><seq> <text>`               | which-key label for an entry (exact seq) or a group (prefix)                                                      |
| `let g:WhichKeyDesc_x = "<leader>x text"` | same as `desc` — paste `.ideavimrc` lines unchanged                                                               |
| `set timeoutlen=300`                      | which-key hint delay in milliseconds (the bundled default sets 300)                                               |
| `set which-key` / `set nowhich-key`       | hint on/off (default on)                                                                                          |
| `set overlay-color=#E52B50`               | avy / ace-window label background — one `#RRGGBB` applied to both themes                                          |
| `set overlay-text-color=#ffffff`          | that label's text color                                                                                          |
| `set expand-hint-color=#d05c0a`           | the `0`–`9` expand-hint color (unset = a VS Code theme color)                                                    |
| `set grab-color=#cde8cd`                  | the grab / beacon highlight (unset = a VS Code theme color)                                                      |

Key notation: plain printable characters, plus `<Space>` and `<lt>`. To find
a command's id, press `SPC i d` — a filterable list of every command id the
editor knows: type to narrow, `Enter` copies the id to the clipboard. (This
is the sibling of ideameow's `SPC i d` action-id tracking; VS Code's stable
API has no "command executed" listener, so codemeow gives you a searchable
directory instead of live tracking.) For tracking's other half — "what does
this key run?" — the list's two title buttons hand you to the platform's own
tools: one opens _Keyboard Shortcuts_ in record-keys mode (press the chord,
see its commands, right-click → _Copy Command ID_), the other toggles the
keystroke log (_Toggle Keyboard Shortcuts Troubleshooting_), which logs every
keypress with the command it dispatched to the Window log until toggled off.

**Relayouting (Dvorak, Colemak, …).** The layout section of the bundled
`.codemeowrc` IS the default keymap — an `nmap`/`mmap` line per key, exactly
like a `meow-normal-define-key` block in Emacs. The command names are meow's
own (`meow-next-word`, `meow-kill`, …) plus `repeat` and `ignore`, so that
section doubles as the full command reference. A right-hand side that names a
known command binds it; `ignore` disables a key; a misspelled `meow-*` name is
reported as an error; anything else is replayed as keys. A key you don't
mention keeps its bundled binding.

**A few semantics worth knowing:**

- Mapped keys work with `'` (repeat), and key-replay mappings are
  recursion-guarded — a self-referencing map stops at depth 8 with a hint
  instead of freezing your editor.
- `repeat` is itself a bindable command, so even `'` can be reassigned.
- Reserved: keypad `0-9` (digit argument), `?` (cheatsheet), `/` (describe
  key); `SPC` is always the keypad key. Only printable keys reach the modal
  engine — `<CR>`, `<Esc>`, and modifier chords belong in VS Code's
  keybindings.json (that's where the bundled Emacs motion chords live too —
  see above).
- Unknown `set` options and `let` lines are ignored, so pasting a whole
  `.ideavimrc` or `.ideameowrc` won't error; only the lines codemeow
  understands take effect.

**which-key.** Pause on any pending prefix — a keypad `SPC` sequence, or the
`,` `.` `[` `]` thing table — and after `timeoutlen` ms a menu pops up with
the continuations (a native QuickPick, the familiar VS Code which-key UX).
Keep typing the sequence into it: typed keys dispatch immediately — they
never filter the list — so chains behave exactly as they do without the
menu. Arrows plus `Enter`, or a click, run the highlighted key instead;
`ESC` (or clicking away) cancels the chain like `ESC` in the editor. Deeper
prefixes redraw the menu in place, it closes itself when the sequence ends,
and fast chains finish before it ever appears. `SPC ?` still opens the full
cheatsheet as a read-only document (`j`/`k` scroll it, `q`… well, `q` closes
it, naturally).

**What the bundled default gives you.** The full meow QWERTY layout, the
complete keypad table, and the same leader scheme as the companion
`.ideavimrc`/ideameow configs, ported to VS Code commands where analogs exist
(`SPC ;` settings, `SPC a` views, `SPC d/e/f/g/…` groups, `SPC .`/`SPC ,` for
next/prev change, diff, and error). `S`/`Q` are avy jumps — a native port of
avy 0.5.0's `avy-goto-char-timer` and `avy-goto-line`, nothing to install:
`S`, type a few chars, pause 0.25 s, and home-row labels (`a s d f g h j k l`,
avy's tree labeling) appear painted over the candidates; `Q` labels every
visible line, and typing a digit switches to a plain goto-line prompt. A
single candidate jumps immediately, a wrong label key just tells you and
waits, `ESC` cancels, and jumping with an active selection extends it
(avy-action-goto is a plain goto-char). Deviations from the Emacs original:
it searches the current editor's visible area only (no `avy-all-windows`),
and there is no `DEL` editing of the input — the pause ends it. Split
resizing sits on `=` `_` `+`; `-` keeps meow's negative-argument (this engine
has real negative counts, so it doesn't need vim's workaround). The file's
footer lists what deliberately _isn't_ ported, with reasons. And since a
later line for the same key wins, `Q` ends up on the avy line jump — put
`nmap Q meow-goto-line` in your home rc if you want meow's own binding back
(`X` has it regardless).

## Known deviations from meow

All deliberate, none accidental:

- `U` (meow-undo-in-selection) falls back to plain undo — VS Code's undo
  stack cannot be scoped to a region.
- Beacon uses native multiple cursors instead of kmacro recording.
- Block/string/defun "things" use a text scan (same-line strings skipped);
  `d` (defun) asks the language's symbol provider first and falls back to the
  outermost brace pair — close to, but not literally, Emacs' syntax-ppss.
- The kill-ring is the system clipboard (`meow-use-clipboard` behavior);
  `kill-line` does not append consecutive kills.
- `I`/`A` open plain lines without language re-indent.
- Windmove is composed, not geometric: VS Code exposes no window rectangles
  to extensions, so `Shift+arrows` chain the editor's own directional group
  focus with diff-pane crossing, and the caret-row rule from window.el
  (with three stacked splits on the left, enter the one at your caret's
  height) lives in ideameow only. Whether a diff renders side-by-side is
  read from the `diffEditor.renderSideBySide` setting — a per-editor
  inline toggle isn't visible to extensions.
- VS Code doesn't expose whether an editor is read-only, so a list of known
  read-only schemes (git views, output, the cheatsheet) feeds the gate
  instead: those stay in NORMAL with modifications blocked like meow's
  `meow--allow-modify-p` — kill / change / backspace / replace silently
  inert, delete / yank / open / swap-grab answering "Buffer is read-only".
  `i`/`a` still switch to INSERT (as in Emacs) but typing lands in a
  read-only surface. No _editor_ attaches to MOTION by default — the
  workbench trees answer to it instead (see above).
- `ESC` in NORMAL is consumed while a meow buffer is focused (VS Code has no
  "run the default escape" escape hatch); the usual widgets — suggest, find,
  rename, snippets — are excluded in the keybinding's `when` clause and keep
  their own `ESC`.

## Hacking on it

The code keeps one rule from meow: commands are data. Every command registers
under its meow name, keys only ever resolve through rc bindings — and the
engine never imports `vscode`, which is what makes the whole behavior suite
run headless in milliseconds.

| Where                            | What                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/core/engine.ts`             | the dispatcher: key → binding → command; repeat (`'`) and rc-replay bookkeeping                                                |
| `src/core/registry.ts`           | the command registry every rc binding resolves against                                                                         |
| `src/core/motions.ts`            | movement and the selections it creates: hjkl, words, lines, find/till, plus the Ctrl/Alt Emacs motion chords (region-expanding) |
| `src/core/selections.ts`         | the selection primitive (meow's expand/select model), reverse/cancel/pop, digit expand                                         |
| `src/core/search.ts`             | meow-search / meow-visit and the shared regexp ring                                                                            |
| `src/core/structures.ts`         | the char-thing table dispatch, blocks, join                                                                                    |
| `src/core/grab.ts`               | grab / swap / sync and the beacon (multi-cursor) reaction                                                                      |
| `src/core/edits.ts`              | everything that mutates text: insert/change/delete/kill/yank/…                                                                 |
| `src/core/things.ts`             | what a "thing" is: pairs, strings, paragraphs, defuns…                                                                         |
| `src/core/rc.ts` / `rcParser.ts` | the two rc layers (bundled defaults + `~/.codemeowrc`) and the line syntax                                                     |
| `src/core/treeMeow.ts`           | the tree surface: MOTION-map dispatch on workbench trees (`j k h l` → the `list.*` arrow commands)                             |
| `src/core/windmove.ts`           | windmove's step decision: diff panes are windows, then directional group focus                                                 |
| `src/core/port.ts`               | the editor/clipboard/UI interfaces the core sees — the seam that keeps `vscode` out                                            |
| `src/vscode/`                    | the thin adapter: the `type` override, decorations, status bar, rc files on disk, the per-key tree keybindings (`treeKeys.ts`) |
| `src/test/`                      | the behavior suite over a fake editor — a straight port of ideameow's specs                                                    |

Behavior is pinned by the specs in `src/test` (given/whenKeys/then…) — every
assertion was cross-checked against meow's source, and the layout contract is
validated against meow's `KEYBINDING_QWERTY.org`, so treat a red spec as "you
changed meow's semantics", not "update the test". Run them with `npm test` —
no VS Code download, no display server, under a second.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE) for the full text.
