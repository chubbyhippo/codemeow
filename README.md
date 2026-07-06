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
- **MOTION** — read-only views (git detail views, output, the cheatsheet).
  `j`/`k` move, `SPC` still opens the keypad.
- **KEYPAD** — `SPC` as the leader, dispatching editor commands Emacs-style
  (`SPC x f` = quick open, `SPC w v` = split…). A which-key hint lists your
  options in the status bar whenever you pause on a prefix.
- **BEACON** — meow's multi-edit, built on VS Code's native multiple cursors:
  grab a region with `G`, select something inside it, and a cursor lands on
  every similar range. Edit them all at once; `ESC` collapses.

The status bar always tells you which state you're in. Meow runs in file
buffers and in the SCM commit message box; inputs that need their own keys
(notebook REPLs, review comments) keep native editing.

And one idea borrowed straight from meow itself: **the extension binds no
keys in code.** The entire keymap — the NORMAL/MOTION layout *and* the whole
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
to the next/previous word or symbol, and after a `w` they *extend* the
selection instead of replacing it (meow's `(expand . word)` rule). `x` selects
the line — repeat it or press digits to take more lines. `Q`/`X` go to a line,
`f`/`t` find/till a character, `o`/`O` select the enclosing block / to its
end, `m` selects the join region, and `,` `.` `[` `]` select inner/bounds/
begin/end of a *thing* (`r` round, `s` square, `c` curly, `g` string, `e`
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

**Keypad.** `SPC b/x/c/m/w …` mirror the Emacs/meow keypad of the companion
`init.el`/`.ideavimrc`/ideameow setups (quick open, save all, splits, font
size…). `SPC 1-9` is a digit argument, `SPC ?` opens the cheatsheet, `SPC /`
describes a key, and `SPC c m` / `SPC c M` edit / reload your config.

## ~/.codemeowrc — configuring everything

codemeow reads an `.ideavimrc`-style file from your home directory:
`~/.codemeowrc` on Linux/macOS, `C:\Users\<you>\.codemeowrc` on Windows.

**Getting started is two steps:**

1. Press `SPC c m` in the editor — it creates and opens the file for you.
   (The bundled defaults stay underneath, so an empty file changes nothing
   and a one-line file changes exactly one thing. Or copy the repo's
   `.codemeowrc` over it and edit anything.)
2. Edit, then reload with `SPC c M`. A message tells you how many mappings
   loaded — and lists any parse problems with their line numbers.

**Syntax reference**

| Line | Meaning |
|---|---|
| `" text` or `# text` | comment (also at the end of a line: `nmap S <action>(X) " jump`) |
| `nmap <key> <meow-command>` | bind a NORMAL key to a named meow command, e.g. `nmap n meow-mark-word` — this is how you remap the layout itself |
| `nmap <key> <action>(command.id)` | NORMAL key runs a VS Code command |
| `nmap <key> <keys>` | NORMAL key replays a meow key sequence, e.g. `nmap Z ,b` |
| `nnoremap` / `noremap` | like `nmap`/`map`, but the replayed keys resolve through the bundled defaults, ignoring your other mappings |
| `mmap` / `mnoremap` | the same three target forms, for MOTION mode (read-only views) |
| `map <leader><seq> <action>(id)` | keypad entry: `SPC` + sequence runs the command (yours override the bundled defaults) |
| `map <leader><seq> <keys>` | keypad entry replaying meow keys after the keypad closes |
| `desc <leader><seq> <text>` | which-key label for an entry (exact seq) or a group (prefix) |
| `let g:WhichKeyDesc_x = "<leader>x text"` | same as `desc` — paste `.ideavimrc` lines unchanged |
| `set timeoutlen=300` | which-key hint delay in milliseconds (the bundled default sets 300) |
| `set which-key` / `set nowhich-key` | hint on/off (default on) |

Key notation: plain printable characters, plus `<Space>` and `<lt>`. Find a
command's id in *Preferences → Keyboard Shortcuts*: right-click any entry and
pick *Copy Command ID*.

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
  keybindings.json.
- Unknown `set` options and `let` lines are ignored, so pasting a whole
  `.ideavimrc` or `.ideameowrc` won't error; only the lines codemeow
  understands take effect.

**which-key.** Pause on any pending prefix — a keypad `SPC` sequence, or the
`,` `.` `[` `]` thing table — and after `timeoutlen` ms a panel opens along
the bottom listing the continuations in columns, exactly like Emacs'
which-key. It never takes focus: just keep typing the sequence in the editor;
`ESC` cancels as usual, deeper prefixes in the same chain redraw the panel
instantly, and it closes itself when the sequence ends. (One platform quirk:
the very first time it appears in a session, VS Code has to materialize the
panel view, which bounces focus through it and straight back.) `SPC ?` still
opens the full cheatsheet as a read-only document (`j`/`k` scroll it, `q`…
well, `q` closes it, naturally).

**What the bundled default gives you.** The full meow QWERTY layout, the
complete keypad table, and the same leader scheme as the companion
`.ideavimrc`/ideameow configs, ported to VS Code commands where analogs exist
(`SPC .` settings, `SPC a` views, `SPC d/e/f/g/…` groups, `SPC ]`/`SPC [` for
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
footer lists what deliberately *isn't* ported, with reasons. And since a
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
- VS Code doesn't expose whether an editor is read-only, so MOTION mode
  covers a list of known read-only schemes (git views, output) instead.
- `ESC` in NORMAL is consumed while a meow buffer is focused (VS Code has no
  "run the default escape" escape hatch); the usual widgets — suggest, find,
  rename, snippets — are excluded in the keybinding's `when` clause and keep
  their own `ESC`.

## Hacking on it

The code keeps one rule from meow: commands are data. Every command registers
under its meow name, keys only ever resolve through rc bindings — and the
engine never imports `vscode`, which is what makes the whole behavior suite
run headless in milliseconds.

| Where | What |
|---|---|
| `src/core/engine.ts` | the dispatcher: key → binding → command; repeat (`'`) and rc-replay bookkeeping |
| `src/core/registry.ts` | the command registry every rc binding resolves against |
| `src/core/motions.ts` | movement and the selections it creates: hjkl, words, lines, find/till |
| `src/core/selections.ts` | the selection primitive (meow's expand/select model), reverse/cancel/pop, digit expand |
| `src/core/search.ts` | meow-search / meow-visit and the shared regexp ring |
| `src/core/structures.ts` | the char-thing table dispatch, blocks, join |
| `src/core/grab.ts` | grab / swap / sync and the beacon (multi-cursor) reaction |
| `src/core/edits.ts` | everything that mutates text: insert/change/delete/kill/yank/… |
| `src/core/things.ts` | what a "thing" is: pairs, strings, paragraphs, defuns… |
| `src/core/rc.ts` / `rcParser.ts` | the two rc layers (bundled defaults + `~/.codemeowrc`) and the line syntax |
| `src/core/port.ts` | the editor/clipboard/UI interfaces the core sees — the seam that keeps `vscode` out |
| `src/vscode/` | the thin adapter: the `type` override, decorations, status bar, rc files on disk |
| `src/test/` | the behavior suite over a fake editor — a straight port of ideameow's specs |

Behavior is pinned by the specs in `src/test` (given/whenKeys/then…) — every
assertion was cross-checked against meow's source, and the layout contract is
validated against meow's `KEYBINDING_QWERTY.org`, so treat a red spec as "you
changed meow's semantics", not "update the test". Run them with `npm test` —
no VS Code download, no display server, under a second.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE) for the full text.
