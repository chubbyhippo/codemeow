# codemeow

[meow](https://github.com/meow-edit/meow)-style modal editing for VS Code and
VSCodium — meow's suggested **QWERTY layout** as a native modal engine, with no
vim emulation in the middle. Select first, then act.

| | |
|---|---|
| Sibling | [ideameow](https://github.com/chubbyhippo/ideameow) — same idea for IntelliJ |
| Shared with it | keymap format, default layout, a behavior-identical test suite |
| Conflicts | disable VSCodeVim — two modal editors cannot share a keyboard |

## States

| State | What |
|---|---|
| **NORMAL** | keys are commands, block cursor; you start here |
| **INSERT** | keys type text — `i a c I A` enter, `ESC` leaves |
| **MOTION** | meow's reduced state, rebindable with `mmap`; what answers to it is the workbench trees |
| **KEYPAD** | `SPC` as the leader, dispatching editor commands Emacs-style (`SPC x f` quick open, `SPC w v` split); a which-key menu pops up on a pause |
| **BEACON** | meow's multi-edit on VS Code's native multiple cursors — grab with `G`, select inside it, a cursor lands on every similar range; `ESC` collapses |

The status bar always shows the current state.

## Where meow attaches

| Surface | Behavior |
|---|---|
| File buffers | full NORMAL editing |
| Read-only views (a diff's git side, the output panel, the cheatsheet) | full layout, edits blocked |
| The SCM commit message box | full meow editing |
| Notebook REPLs, review comments | native editing |

### Workbench trees

The Explorer, outline, search results, problems, timeline and every other
sidebar or panel tree answer to the MOTION map.

| Key | Does |
|---|---|
| `j` / `k` | move the selection |
| `h` | collapse, or go to the parent |
| `l` | expand, or enter |
| `q` | hide the side bar |
| `Enter`, any unmapped letter | native — the tree's type-to-find still starts |

| rc line | Effect |
|---|---|
| `mmap o <action>(filesExplorer.openFilePreserveFocus)` | open the file but keep navigating |
| `mmap r <action>(workbench.files.action.refreshFilesExplorer)` | refresh |
| `mmap q ignore` | give `q` back to the tree, so it types into the find again |

Meow commands other than the four motions have no tree meaning and are inert
there.

### Double-ESC leaves any tool window

| Press | In | Result |
|---|---|---|
| `ESC` ×2 within 500 ms | the terminal, a sidebar or a panel view | focus jumps back to the editor |
| a lone `ESC` | anywhere | keeps its native meaning — lists clear their selection, the shell receives its escape byte |

The terminal half needs one setting, because VS Code sends every unlisted key
to the shell:

```json
"terminal.integrated.commandsToSkipShell": ["codemeow.toolWindowEscape"]
```

| Surface | Note |
|---|---|
| Chat-style webview inputs | not reachable generically — their extensions own their `when` contexts; add your own `escape` keybinding on `codemeow.toolWindowEscape` with that context |

## Windows

`(windmove-default-keybindings)` from `init.el`, ported.

| Key | Does |
|---|---|
| `Shift+←→↑↓` | select the editor window in that direction |
| `SPC w h/j/k/l` | the same four commands, mirroring init.el's `C-c w` window map |
| `SPC w b` | balance the split sizes (init.el's `C-c w b`) |
| `SPC w H/J/K/L` | the window swaps — VS Code cannot exchange two groups' contents, so they move THIS group to that side of the grid |

| Fact | Value |
|---|---|
| What counts as a window | the editor groups *plus* the two panes of a side-by-side diff, which plain group focus never crosses — `S-left` in the modified pane enters the original, `S-left` again leaves the diff toward the group on its left |
| Wrap-around | none |
| At the edge | "No window left from selected window" in the status bar, as in Emacs |
| Where the chords live | the manifest keybindings — modifier chords never reach the modal engine; rebind under *Preferences → Keyboard Shortcuts → Windmove* |
| Tradeoff | inside meow buffers they shadow shift-selection, exactly as the Emacs binding does; anywhere meow does not attach keeps native shift-select |

### Ace-window

| Key | Does |
|---|---|
| `SPC w w`, `SPC x o` | ace-window over the editor groups: three or more, every group showing a text editor gets a home-row label (`a s d f g h j k l`, avy's colors) at the top and the next key jumps there; exactly two hops straight across, like `other-window`; `Esc` cancels |

| Limit | Detail |
|---|---|
| Groups whose active tab has no text editor (a webview, an image) | cannot take a label |
| Reach | the first eight groups — the platform's own focus-group commands |
| The key prompt | rides a quick-pick sink, the same trick the which-key menu uses |

### Ace-click

`SPC SPC` paints a hint on every clickable thing; one key clicks it. Both hint
kinds are real paint, no lists.

| Target | Hint | The label |
|---|---|---|
| every open tab | a badge on the tab, and on the file's Explorer row for free | activates that editor |
| links, code lenses, quick-fix lightbulbs in view | painted in the text | follows the link, runs the lens, or opens the fix menu there |

| Fact | Value |
|---|---|
| Labels | avy's own subdivision — past nine targets they grow a second letter, and the surviving hints narrow as you type; `Esc` cancels |
| Editor panes | deliberately not targets — labelling panes is ace-window's job, `SPC w w` |
| Tab badges need | `workbench.editor.decorations.badges` (on by default) |
| Badge width | VS Code renders at most two badge characters, so past roughly seventy targets the deepest labels stop being distinguishable on tabs |
| Toolbar buttons, menu items | unreachable — an extension runs outside the workbench's own process and cannot paint on them |
| Shift-to-right-click | absent — VS Code exposes no per-target context menu |

## Emacs chords

| Behavior | Value |
|---|---|
| Bound to | the real Emacs point motions, not meow commands |
| With no selection | the chord moves the cursor |
| With one active | it extends it, anchored exactly like meow's own `H J K L` expand — `w` then `Ctrl+f Ctrl+f` grows the marked word one character at a time |
| `;` (reverse) | flips which end subsequent chords grow from |

| Chord | Command |
|---|---|
| `Ctrl+f` / `Ctrl+b` | `forward/backward-char` |
| `Ctrl+n` / `Ctrl+p` | `next/previous-line` |
| `Ctrl+a` / `Ctrl+e` | `move-beginning/end-of-line` |
| `Alt+f` / `Alt+b` | `forward/backward-word` |
| `Alt+a` / `Alt+e` | `backward/forward-sentence` |
| `Alt+Shift+,` / `Alt+Shift+.` | `beginning/end-of-buffer` (`M-<` / `M->`) — a count lands N/10 of the way in, snapping to the next line start |
| `Alt+Shift+[` / `Alt+Shift+]` | `backward/forward-paragraph` (`M-{` / `M-}`) — blank-line-delimited; forward lands on the separator line, backward on the paragraph start with one adjacent empty line joining it |
| `Alt+u` / `Alt+l` / `Alt+c` | `upcase/downcase/capitalize-word` — from the cursor through the word's end; `-` then the chord reaches back without moving the cursor |
| `Alt+d` | `kill-word` into the clipboard; a negative count kills backward |
| `Ctrl+/`, `Ctrl+_` | undo |
| `Ctrl+d` | delete |
| `Ctrl+k` / `Ctrl+w` | kill — `Ctrl+k` with no selection kills the line, `Ctrl+w` kills the region, through the same command |
| `Alt+w` | save |
| `Ctrl+y` | yank |
| `Ctrl+g` | cancel |
| `Alt+m` | back-to-indentation |
| `Ctrl+o` | open-line |
| `Alt+\`, `Alt+Space` | whitespace |
| `Alt+^` | join |

| Chord | Why not bound |
|---|---|
| `Alt+n` / `Alt+p` | stock Emacs has no default binding either — only the unrelated `M-g n` / `M-g p` prefix |

| Fact | Value |
|---|---|
| Config | all thirty-six are rc lines, one `cmap` each, in either spelling — `cmap C-f forward-char` or `cmap control F forward-char` |
| Active in | NORMAL and MOTION only, so `Ctrl+F` stays Find while you type |
| Which chords are intercepted | the manifest decides, enumerating exactly those thirty-six — VS Code cannot register keybindings at runtime; the rc decides what each one does |
| `cmap C-f ignore` | really gives `Ctrl+F` back to VS Code — each binding is gated on a context key the extension switches off for the chords your rc leaves unbound |

## No keys in code

| Layer | What |
|---|---|
| Bundled `.codemeowrc` | the entire keymap — the NORMAL/MOTION layout *and* the whole `SPC` keypad table |
| `~/.codemeowrc` | overrides it entry by entry |

## Build & install

```bash
cd codemeow
./setup.sh                  # build + side-load into every detected VS Code /
                            # VSCodium (Linux, macOS, WSL server, and Windows
                            # editors from WSL) and install ~/.codemeowrc
./setup.sh --list           # just show which extension dirs it would target
npm test                    # typecheck + lint + format check + behavior suite
```

| Item | Value |
|---|---|
| Toolchain | node 24, pinned in `mise.toml`; `setup.sh` falls back to `mise exec` when the PATH node is older |
| Install form | a plain folder under `<editor>/extensions/` — no marketplace account |
| After restart | you are in NORMAL mode |

## The layout

| Item | Value |
|---|---|
| Layout | meow's suggested QWERTY layout, validated against [KEYBINDING_QWERTY.org](https://github.com/meow-edit/meow/blob/master/KEYBINDING_QWERTY.org) in meow's repository |
| Authoritative reference | the bundled `.codemeowrc` — one `nmap <key> <meow-command>` line per key |

### Moving and selecting

| Key | Does |
|---|---|
| `h j k l` | move — a char-selection survives, any other selection is cancelled |
| `H J K L` | extend a char selection |
| `w` / `W` | mark the word / symbol at point, and push it to the search ring, so `n` finds the next occurrence |
| `e` / `E`, `b` / `B` | next / previous word or symbol; after a `w` they extend rather than replace (meow's `(expand . word)` rule) |
| `x` | select the line — repeat or press digits to take more |
| `Q` / `X` | go to a line |
| `f` / `t` | find / till a character |
| `o` / `O` | select the enclosing block / to its end |
| `m` | select the join region |
| `,` `.` `[` `]` | inner / bounds / begin / end of a *thing* |
| `;` | reverse the selection |
| `z` | pop back to the previous selection |
| `v` | visit a regexp |
| `n` | continue the search — backward when the selection is reversed |
| `1`-`9`, `0` | expand by N units (`0` = 10), painted hints showing where each digit lands; a count when nothing is selected |
| `-` | negative argument |

| Thing | Char |
|---|---|
| round / square / curly | `r` / `s` / `c` |
| string / symbol | `g` / `e` |
| window / buffer | `w` / `b` |
| paragraph / line / visual line | `p` / `l` / `v` |
| defun / sentence | `d` / `.` |

meow's exact char-thing table.

### Editing

| Key | Does |
|---|---|
| `i` / `a` | insert at the selection's start / end |
| `I` / `A` | open a line above / below |
| `c` | change |
| `s` | kill (cut) |
| `d` / `D` | delete forward / backward |
| `y` | save (copy) |
| `p` | yank (paste) |
| `r` | replace the selection with the clipboard |
| `u` | undo |
| `'` | repeat the last command, counts and all — `'` after `2fa` finds the second `a` again |
| `g` | cancel |
| `q` | close the tab |
| `ESC` | back to NORMAL |

### Grab and beacon

| Key | Does |
|---|---|
| `G` | grab the selection (highlighted) |
| any selection inside a grab | drops a cursor on every similar range — change them all, then `ESC` |
| `R` | swap-grab: exchange the selection and grab texts |
| `Y` | sync-grab: re-stash |

### Keypad

| Sequence | Does |
|---|---|
| `SPC x/c/m/w …` | the Emacs/meow keypad of the companion `init.el` / `.ideavimrc` / ideameow setups — quick open, save all, splits, font size… |
| `SPC b` | bookmarks via the `alefragnani.numbered-bookmarks` extension — `0-9` numbered set, `j` jump, `b` MRU editors |
| `SPC 1-9` | digit argument |
| `SPC ?` | the cheatsheet |
| `SPC /` | describe a key |
| `SPC c m` / `SPC c M` | edit / reload your config |

## ~/.codemeowrc

| Item | Value |
|---|---|
| Path | `~/.codemeowrc` on Linux/macOS, `C:\Users\<you>\.codemeowrc` on Windows |
| Format | `.ideavimrc`-style |
| Precedence | the bundled defaults stay underneath; overrides apply entry by entry, so deleting a line falls back to the default |
| Disable a key | bind it to `ignore` |

| Step | Do |
|---|---|
| 1 | `SPC c m` — the first press creates `~/.codemeowrc` as a full copy of the bundled defaults and opens it |
| 2 | Edit, then `SPC c M`, or the **Reload** button in the rc editor's title bar |

| Reload detail | Value |
|---|---|
| When the button appears | whenever the file's content differs from the loaded config — comparison is on the parsed config, IdeaVim-style, so comment and formatting edits do not count |
| Unsaved edits | saved for you |
| Feedback | a message with the mapping count, and any parse problems with their line numbers |

### Syntax reference

| Line | Meaning |
| --- | --- |
| `" text` or `# text` | comment (also at the end of a line: `nmap S <action>(X) " jump`) |
| `nmap <key> <meow-command>` | bind a NORMAL key to a named meow command, e.g. `nmap n meow-mark-word` — this is how you remap the layout itself |
| `nmap <key> <action>(command.id)` | NORMAL key runs a VS Code command |
| `nmap <key> <keys>` | NORMAL key replays a meow key sequence, e.g. `nmap Z ,b` |
| `nnoremap` / `noremap` | like `nmap`/`map`, but the replayed keys resolve through the bundled defaults, ignoring your other mappings |
| `mmap` / `mnoremap` | the same three target forms, for MOTION mode — the keymap of the workbench trees (read-only views stay in NORMAL) |
| `cmap` / `cnoremap` `<chord>` `<target>` | the Emacs modifier-chord layer: `cmap C-f forward-char` (or `cmap control F forward-char`); `ignore` gives the key back to VS Code |
| `map <leader><seq> <action>(id)` | keypad entry: `SPC` + sequence runs the command (yours override the bundled defaults) |
| `map <leader><seq> <keys>` | keypad entry replaying meow keys after the keypad closes |
| `desc <leader><seq> <text>` | which-key label for an entry (exact seq) or a group (prefix) |
| `let g:WhichKeyDesc_x = "<leader>x text"` | same as `desc` — paste `.ideavimrc` lines unchanged |
| `set timeoutlen=300` | which-key hint delay in milliseconds (the bundled default sets 300) |
| `set which-key` / `set nowhich-key` | hint on/off (default on) |
| `set overlay-color=#2ECC71` | avy / ace-window label background — one `#RRGGBB` applied to both themes |
| `set overlay-text-color=#ffffff` | that label's text color |
| `set expand-hint-color=#d05c0a` | the `0`–`9` expand-hint color (unset = a VS Code theme color) |
| `set grab-color=#cde8cd` | the grab / beacon highlight (unset = a VS Code theme color) |

| Item | Value |
|---|---|
| Key notation | plain printable characters, plus `<Space>` and `<lt>` |
| Finding a command id | `SPC i d` — a filterable list of every command id the editor knows: type to narrow, `Enter` copies the id. (VS Code's stable API has no "command executed" listener, so this is a searchable directory rather than ideameow's live tracking) |
| "What does this key run?" | the list's two title buttons: one opens *Keyboard Shortcuts* in record-keys mode (press the chord, see its commands, right-click → *Copy Command ID*), the other toggles *Toggle Keyboard Shortcuts Troubleshooting*, which logs every keypress with its command to the Window log until toggled off |

### Relayouting (Dvorak, Colemak, …)

The layout section of the bundled `.codemeowrc` IS the default keymap — an
`nmap`/`mmap` line per key, like a `meow-normal-define-key` block in Emacs.

| Right-hand side | Effect |
|---|---|
| a known command name | binds it — meow's own names (`meow-next-word`, `meow-kill`, …) plus `repeat` and `ignore` |
| `ignore` | disables the key |
| a misspelled `meow-*` name | reported as an error |
| anything else | replayed as keys |
| a key you do not mention | keeps its bundled binding |

### Semantics worth knowing

| Fact | Value |
|---|---|
| Repeat | mapped keys work with `'`; key-replay mappings are recursion-guarded — a self-referencing map stops at depth 8 with a hint |
| `repeat` | itself a bindable command, so even `'` can be reassigned |
| Reserved | keypad `0-9` (digit argument), `?` (cheatsheet), `/` (describe key); `SPC` is always the keypad key |
| Reach | only printable keys reach the modal engine through `nmap`/`mmap` — `<CR>` and `<Esc>` belong in VS Code's `keybindings.json`, and modifier chords have their own rc layer, `cmap` |
| Unknown `set` / `let` lines | ignored, so pasting a whole `.ideavimrc` or `.ideameowrc` will not error |

### which-key

| Fact | Value |
|---|---|
| Trigger | pause on any pending prefix — a keypad `SPC` sequence, or the `,` `.` `[` `]` thing table — for `timeoutlen` ms |
| Appearance | a native QuickPick, the familiar VS Code which-key UX |
| Typing into it | keys dispatch immediately and never filter the list, so chains behave exactly as they do without the menu |
| Arrows + `Enter`, or a click | runs the highlighted key instead |
| `ESC`, or clicking away | cancels the chain, like `ESC` in the editor |
| Deeper prefixes | redraw the menu in place; it closes itself when the sequence ends, and fast chains finish before it appears |
| `SPC ?` | the full cheatsheet as a read-only document — `j`/`k` scroll, `q` closes |

### What the bundled default gives you

| Item | Value |
|---|---|
| Layout | the full meow QWERTY layout and the complete keypad table |
| Leader scheme | the companion `.ideavimrc`/ideameow scheme ported to VS Code commands where analogs exist — `SPC ;` settings, `SPC a` views, `SPC d/e/f/g/…` groups, `SPC .` / `SPC ,` next/prev change, diff and error |
| `S` / `Q` | a native port of avy 0.5.0's `avy-goto-char-timer` and `avy-goto-line`, nothing to install: `S`, type a few chars, pause 0.25 s, and home-row labels (`a s d f g h j k l`, avy's tree labeling) appear over the candidates; `Q` labels every visible line, and a digit switches to a plain goto-line prompt |
| avy details | a single candidate jumps immediately, a wrong label key reports and waits, `ESC` cancels, and jumping with an active selection extends it (`avy-action-goto` is a plain goto-char) |
| avy deviations | the current editor's visible area only (no `avy-all-windows`), and no `DEL` editing of the input — the pause ends it |
| Split resizing | `=` `_` `+` |
| The rc footer | lists what deliberately is not ported, with reasons |

| Divergence | Detail |
|---|---|
| `-` | keeps meow's negative argument — this engine has real negative counts, so it does not need vim's workaround |
| `Q` | a later line for the same key wins, so `Q` ends up on the avy line jump; `nmap Q meow-goto-line` in your home rc restores meow's binding (`X` has it regardless) |

## Known deviations from meow

All deliberate, none accidental.

| Deviation | Detail |
|---|---|
| `U` (meow-undo-in-selection) | falls back to plain undo — VS Code's undo stack cannot be scoped to a region |
| Beacon | native multiple cursors instead of kmacro recording |
| Block/string/defun "things" | a text scan (same-line strings skipped); `d` (defun) asks the language's symbol provider first and falls back to the outermost brace pair — close to, but not literally, Emacs' syntax-ppss |
| The kill-ring | the system clipboard (`meow-use-clipboard` behavior); `kill-line` does not append consecutive kills |
| `I` / `A` | open plain lines without language re-indent |
| Windmove | composed, not geometric — VS Code exposes no window rectangles, so `Shift+arrows` chain the editor's own directional group focus with diff-pane crossing; the caret-row rule from window.el lives in ideameow only. Side-by-side is read from `diffEditor.renderSideBySide`, since a per-editor inline toggle is not visible to extensions |
| Read-only detection | VS Code does not expose it, so a list of known read-only schemes (git views, output, the cheatsheet) feeds the gate — those stay in NORMAL with modifications blocked like `meow--allow-modify-p`: kill / change / backspace / replace silently inert, delete / yank / open / swap-grab answering "Buffer is read-only"; `i`/`a` still enter INSERT but typing lands in a read-only surface |
| MOTION | no *editor* attaches to it by default — the workbench trees answer to it instead |
| `ESC` in NORMAL | consumed while a meow buffer is focused (VS Code has no "run the default escape" escape hatch); suggest, find, rename and snippets are excluded in the keybinding's `when` clause and keep their own `ESC` |

## Hacking on it

| Rule | Value |
|---|---|
| Commands are data | every command registers under its meow name; keys only ever resolve through rc bindings |
| The engine never imports `vscode` | which is what makes the behavior suite run headless in milliseconds |

| Where | What |
| --- | --- |
| `src/core/engine.ts` | the dispatcher: key → binding → command; repeat (`'`) and rc-replay bookkeeping |
| `src/core/registry.ts` | the command registry every rc binding resolves against |
| `src/core/motions.ts` | movement and the selections it creates: hjkl, words, lines, find/till, plus the Ctrl/Alt Emacs motion chords (region-expanding) |
| `src/core/selections.ts` | the selection primitive (meow's expand/select model), reverse/cancel/pop, digit expand |
| `src/core/search.ts` | meow-search / meow-visit and the shared regexp ring |
| `src/core/structures.ts` | the char-thing table dispatch, blocks, join |
| `src/core/grab.ts` | grab / swap / sync and the beacon (multi-cursor) reaction |
| `src/core/edits.ts` | everything that mutates text: insert/change/delete/kill/yank/… |
| `src/core/things.ts` | what a "thing" is: pairs, strings, paragraphs, defuns… |
| `src/core/rc.ts` / `rcParser.ts` | the two rc layers (bundled defaults + `~/.codemeowrc`) and the line syntax |
| `src/core/chord.ts` / `chords.ts` | the modifier-chord layer: both spellings of a chord, and the `cmap` lookup that claims one in NORMAL/MOTION |
| `src/core/treeMeow.ts` | the tree surface: MOTION-map dispatch on workbench trees (`j k h l` → the `list.*` arrow commands) |
| `src/core/windmove.ts` | windmove's step decision: diff panes are windows, then directional group focus |
| `src/core/aceWindow.ts` / `aceClick.ts` | the two ace pickers' pure halves: how many windows mean self/other/labels, and the avy-subdivided labels a click session narrows through |
| `src/core/port.ts` | the editor/clipboard/UI interfaces the core sees — the seam that keeps `vscode` out |
| `src/vscode/` | the thin adapter: the `type` override, decorations, status bar, rc files on disk, the per-key tree keybindings (`treeKeys.ts`) |
| `src/test/` | the behavior suite over a fake editor — a straight port of ideameow's specs |

| Item | Value |
|---|---|
| Specs | `src/test`, given/whenKeys/then…, every assertion cross-checked against meow's source; the layout contract is validated against meow's `KEYBINDING_QWERTY.org` |
| A red spec means | "you changed meow's semantics", not "update the test" |
| Run | `npm test` — no VS Code download, no display server, under a second |

## License

GPL-3.0-or-later. See [LICENSE](LICENSE) for the full text.
