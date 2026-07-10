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

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { attachMode } from '../core/attachPolicy';
import * as Engine from '../core/engine';
import { Ctx, UiPort } from '../core/port';
import { Config, Rc } from '../core/rc';
import { RcState } from '../core/rcState';
import { MeowMode, MeowState } from '../core/state';
import * as ToolWindowEscape from '../core/toolWindowEscape';
import * as TreeMeow from '../core/treeMeow';
import { keypadRows, THINGS } from '../core/whichKey';
import {
  DiffSideView,
  noWindowMessage,
  plan,
  WindmoveDir,
} from '../core/windmove';
import { VscClipboard, VscEditorPort } from './editorPort';
import { TREE_KEYS } from './treeKeys';

/**
 * The VS Code shell around the meow core: owns the `type` override, the
 * per-document state, the status-bar widget, the decorations (grab region,
 * expand hints), the which-key overlay, and the two rc layers on disk.
 * All editing semantics live in ../core — this file only wires them up.
 */

const states = new Map<string, MeowState>();
const clipboard = new VscClipboard();
let statusBar: vscode.StatusBarItem;
let grabDecoration: vscode.TextEditorDecorationType;
let hintDecoration: vscode.TextEditorDecorationType;
let avyMatchDecoration: vscode.TextEditorDecorationType;
let avyLabelDecoration: vscode.TextEditorDecorationType;
let whichKeyTimer: ReturnType<typeof setTimeout> | undefined;
/** The open which-key menu; `closing` marks a programmatic dispose so
 *  onDidHide can tell it apart from the user's ESC / click-away. */
let whichKeyMenu:
  { qp: vscode.QuickPick<WhichKeyItem>; closing: boolean } | undefined;
/** Grace timer: between chain steps the menu redraws in place; it is
 *  disposed only when no follow-up schedule arrives (the chain ended). */
let whichKeyCloseTimer: ReturnType<typeof setTimeout> | undefined;
/** True when hide() closed a visible menu: the chain's next menu appears
 *  with no delay, like which-key refreshing between prefixes. */
let whichKeyChain = false;
/** The engine is a state machine — menu keystrokes dispatch strictly in order. */
let whichKeyDispatch: Promise<void> = Promise.resolve();

interface WhichKeyItem extends vscode.QuickPickItem {
  /** The raw char this row dispatches ('SPC' displays, ' ' dispatches). */
  meowKey: string;
}
let hintTimer: ReturnType<typeof setTimeout> | undefined;
let infoBody = '';
const infoEmitter = new vscode.EventEmitter<vscode.Uri>();
const INFO_URI = vscode.Uri.parse('codemeow:meow-info');

function stateFor(editor: vscode.TextEditor): MeowState | undefined {
  const key = editor.document.uri.toString();
  const existing = states.get(key);
  if (existing) return existing;
  const mode = attachMode(editor.document.uri.scheme);
  if (mode === null) return undefined;
  const st = new MeowState();
  st.mode = mode;
  states.set(key, st);
  return st;
}

function makeUi(editor: vscode.TextEditor, st: MeowState): UiPort {
  return {
    hint: (text) =>
      void vscode.window.setStatusBarMessage(`meow: ${text}`, 3000),

    info: (title, body) => {
      if (body.includes('\n')) {
        infoBody = `${title}\n${'='.repeat(title.length)}\n\n${body}\n`;
        infoEmitter.fire(INFO_URI);
        void vscode.workspace
          .openTextDocument(INFO_URI)
          .then((doc) =>
            vscode.window.showTextDocument(doc, { preview: true }),
          );
      } else {
        void vscode.window.showInformationMessage(`${title}: ${body}`);
      }
    },

    input: (prompt, initial) =>
      Promise.resolve(vscode.window.showInputBox({ prompt, value: initial })),

    runCommand: async (id) => {
      await vscode.commands.executeCommand(id);
    },

    scheduleWhichKey: (kind, buffer) => {
      if (whichKeyCloseTimer !== undefined) {
        clearTimeout(whichKeyCloseTimer); // the chain continues: keep the menu
        whichKeyCloseTimer = undefined;
      }
      if (whichKeyTimer !== undefined) clearTimeout(whichKeyTimer);
      whichKeyTimer = undefined;
      if (!Rc.whichKeyEnabled()) {
        whichKeyChain = false;
        return;
      }
      if (whichKeyMenu) {
        fillWhichKeyMenu(whichKeyMenu.qp, kind, buffer); // deeper prefix: redraw in place
        return;
      }
      // meow's timeoutlen for the first menu; follow-up prefixes reopen at once
      const delay = whichKeyChain ? 0 : Math.max(Rc.whichKeyDelayMs(), 0);
      whichKeyChain = false;
      whichKeyTimer = setTimeout(() => {
        whichKeyTimer = undefined;
        openWhichKeyMenu(editor, st, kind, buffer);
      }, delay);
    },

    hideWhichKey,

    showExpandHints: (positions) => {
      clearExpandHints(editor);
      if (positions.length === 0) return;
      const doc = editor.document;
      editor.setDecorations(
        hintDecoration,
        positions.map((off, i) => ({
          range: new vscode.Range(doc.positionAt(off), doc.positionAt(off)),
          renderOptions: { after: { contentText: String((i + 1) % 10) } },
        })),
      );
      // meow-expand-hint-remove-delay: 1 second
      hintTimer = setTimeout(() => clearExpandHints(editor), 1000);
    },

    clearExpandHints: () => clearExpandHints(editor),

    showAvyMatches: (ranges) => {
      const doc = editor.document;
      editor.setDecorations(avyLabelDecoration, []);
      editor.setDecorations(
        avyMatchDecoration,
        ranges.map(
          (r) =>
            new vscode.Range(doc.positionAt(r.start), doc.positionAt(r.end)),
        ),
      );
    },

    showAvyLabels: (labels) => {
      const doc = editor.document;
      editor.setDecorations(avyMatchDecoration, []);
      editor.setDecorations(
        avyLabelDecoration,
        labels.map(([off, label]) => ({
          range: new vscode.Range(doc.positionAt(off), doc.positionAt(off)),
          renderOptions: { after: { contentText: label } },
        })),
      );
    },

    clearAvy: () => {
      editor.setDecorations(avyMatchDecoration, []);
      editor.setDecorations(avyLabelDecoration, []);
    },

    setGrabHighlight: (range) => {
      const doc = editor.document;
      editor.setDecorations(
        grabDecoration,
        range
          ? [
              new vscode.Range(
                doc.positionAt(range.start),
                doc.positionAt(range.end),
              ),
            ]
          : [],
      );
    },

    modeChanged: () => applyMode(editor, st),

    refresh: () => refreshStatus(editor, st),
  };
}

function makeCtx(editor: vscode.TextEditor, st: MeowState): Ctx {
  return {
    port: new VscEditorPort(editor),
    clipboard,
    ui: makeUi(editor, st),
    st,
  };
}

function hideWhichKey(): void {
  if (whichKeyTimer !== undefined) clearTimeout(whichKeyTimer);
  whichKeyTimer = undefined;
  if (whichKeyMenu && whichKeyCloseTimer === undefined) {
    whichKeyChain = true; // a follow-up prefix in the same chain redraws instantly
    // dispose only when the chain really ends: scheduleWhichKey cancels this
    whichKeyCloseTimer = setTimeout(() => {
      whichKeyCloseTimer = undefined;
      whichKeyChain = false;
      closeWhichKeyMenu();
    }, 60);
  }
}

function closeWhichKeyMenu(): void {
  const menu = whichKeyMenu;
  if (!menu) return;
  whichKeyMenu = undefined;
  menu.closing = true;
  menu.qp.dispose(); // fires onDidHide, which sees `closing` and stays quiet
}

/**
 * which-key as a native QuickPick — the established VS Code which-key UX.
 * There is no non-focusable floating widget in the API, so unlike ideameow's
 * bottom JBPopup the menu takes the keyboard while it is up; its input box is
 * a key sink: every typed char is swallowed and dispatched through the engine
 * exactly like an editor key (it does NOT filter — filtering would break
 * typing sequences through the menu), so chains behave identically with or
 * without the menu. Enter or a click dispatches the highlighted row's key;
 * ESC / clicking away cancels the pending chain just like ESC in the editor.
 * Appears after timeoutlen, meow-style — fast chains never see it.
 */
function openWhichKeyMenu(
  editor: vscode.TextEditor,
  st: MeowState,
  kind: 'keypad' | 'things',
  buffer: string,
): void {
  if (kind === 'keypad' && keypadRows(buffer).length === 0) return;
  closeWhichKeyMenu(); // a stale menu must not leak its handlers
  const qp = vscode.window.createQuickPick<WhichKeyItem>();
  const menu = { qp, closing: false };
  whichKeyMenu = menu;
  qp.placeholder =
    'keep typing the sequence — Enter or a click runs the highlighted key';
  fillWhichKeyMenu(qp, kind, buffer);
  qp.onDidChangeValue((v) => {
    if (v === '') return; // our own reset below
    qp.value = ''; // swallow: keys dispatch, they do not filter
    dispatchMenuKeys(editor, st, v);
  });
  qp.onDidAccept(() => {
    const item = qp.activeItems[0];
    if (item) dispatchMenuKeys(editor, st, item.meowKey);
  });
  qp.onDidHide(() => {
    const userHid = whichKeyMenu === menu && !menu.closing;
    if (whichKeyMenu === menu) whichKeyMenu = undefined;
    qp.dispose();
    if (userHid) {
      whichKeyChain = false;
      // ESC / click-away cancels the chain the way editor ESC would; the
      // guard keeps a mode-already-left close from collapsing beacon cursors
      if (st.mode === MeowMode.KEYPAD || st.pending !== null) {
        Engine.escapeKey(makeCtx(editor, st));
      }
    }
  });
  qp.show();
}

function fillWhichKeyMenu(
  qp: vscode.QuickPick<WhichKeyItem>,
  kind: 'keypad' | 'things',
  buffer: string,
): void {
  const rows = kind === 'things' ? THINGS : keypadRows(buffer);
  qp.title =
    kind === 'things' ? 'thing' : `SPC ${buffer.split('').join(' ')}`.trimEnd();
  qp.items = rows.map(([k, d]) => ({
    label: k,
    description: `→ ${d}`,
    meowKey: k === 'SPC' ? ' ' : k,
  }));
  qp.activeItems = qp.items.length > 0 ? [qp.items[0]] : [];
}

function dispatchMenuKeys(
  editor: vscode.TextEditor,
  st: MeowState,
  keys: string,
): void {
  whichKeyDispatch = whichKeyDispatch
    .then(async () => {
      const ctx = makeCtx(editor, st);
      for (const ch of keys) await Engine.handleChar(ctx, ch);
    })
    .catch(() => undefined);
}

function clearExpandHints(editor: vscode.TextEditor): void {
  if (hintTimer !== undefined) clearTimeout(hintTimer);
  hintTimer = undefined;
  editor.setDecorations(hintDecoration, []);
}

function applyMode(editor: vscode.TextEditor, st: MeowState): void {
  editor.options = {
    cursorStyle:
      st.mode === MeowMode.INSERT
        ? vscode.TextEditorCursorStyle.Line
        : vscode.TextEditorCursorStyle.Block,
  };
  refreshStatus(editor, st);
}

function refreshStatus(editor: vscode.TextEditor, st: MeowState): void {
  const beacon = editor.selections.length > 1;
  statusBar.text =
    st.mode === MeowMode.KEYPAD
      ? `MEOW KEYPAD  SPC ${st.keypad.split('').join(' ')}`
      : beacon && st.mode === MeowMode.INSERT
        ? 'MEOW BEACON-INSERT'
        : beacon
          ? 'MEOW BEACON'
          : `MEOW ${st.mode}`;
  statusBar.show();
  void vscode.commands.executeCommand('setContext', 'codemeow.active', true);
}

// ----------------------------------------------------------- tree surface

/** Turn on the context gates for exactly the mmap-bound keys — the analog
 *  of ideameow registering its shortcut set on the focused tree. Re-run
 *  after a rc reload (SPC c M) so new mmap lines apply without a restart. */
function syncTreeKeys(): void {
  const bound = TreeMeow.boundChars();
  for (const { ch, ctx } of TREE_KEYS) {
    void vscode.commands.executeCommand(
      'setContext',
      `codemeow.tree.${ctx}`,
      bound.has(ch),
    );
  }
}

/** The focused tree's command executor for TreeMeow.dispatch — the list.*
 *  commands act on whichever workbench list/tree has the keyboard, which is
 *  the one that matched the keybinding's `when`. Unknown ids hint, like
 *  runBinding's action arm. */
async function runTreeCommand(id: string): Promise<void> {
  try {
    await vscode.commands.executeCommand(id);
  } catch {
    void vscode.window.setStatusBarMessage(
      `meow: Unknown command: ${id}`,
      3000,
    );
  }
}

// --------------------------------------------------------------- windmove

/** The active text diff as core/windmove sees it: which pane the caret is
 *  in (by URI against the tab's diff input) and whether the panes render
 *  side by side. The per-editor inline/side-by-side toggle is not exposed
 *  to extensions, so the diffEditor.renderSideBySide setting stands in. */
function diffSideView(): DiffSideView | null {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  if (!(input instanceof vscode.TabInputTextDiff)) return null;
  const active = vscode.window.activeTextEditor?.document.uri.toString();
  return {
    onOriginal: active === input.original.toString(),
    onModified: active === input.modified.toString(),
    sideBySide:
      vscode.workspace
        .getConfiguration('diffEditor')
        .get<boolean>('renderSideBySide', true) === true,
  };
}

function focusFingerprint(): string {
  return (
    `${vscode.window.tabGroups.activeTabGroup.viewColumn}:` +
    `${vscode.window.activeTextEditor?.document.uri.toString() ?? ''}`
  );
}

/** One windmove step; when nothing changed hands, report what Emacs would
 *  ("No window left from selected window"). The focus fingerprint settles
 *  through extension-host events, hence the small delay before comparing. */
async function windmove(dir: WindmoveDir): Promise<void> {
  const before = focusFingerprint();
  try {
    await vscode.commands.executeCommand(plan(dir, diffSideView()));
  } catch {
    /* an id VS Code doesn't know would be an extension bug; fall through */
  }
  await new Promise((resolve) => setTimeout(resolve, 80));
  if (focusFingerprint() === before) {
    void vscode.window.setStatusBarMessage(
      `meow: ${noWindowMessage(dir)}`,
      3000,
    );
  }
}

// -------------------------------------------------------------- rc loading

function userRcPath(): string {
  return path.join(os.homedir(), Rc.FILE_NAME);
}

/** Is this document the user's ~/.codemeowrc? */
function isRcDocument(d: vscode.TextDocument): boolean {
  return path.resolve(d.uri.fsPath) === path.resolve(userRcPath());
}

/** Keep the codemeow.rcChanged context key (the editor-title Reload button's
 *  when-clause) in step with a parse-level comparison: comment/formatting
 *  edits never light the button up (RcState — IdeaVim's VimRcFileState
 *  design, same as ideameow's RcFileState). */
function syncRcChanged(): void {
  const doc = vscode.workspace.textDocuments.find(isRcDocument);
  const changed =
    doc !== undefined &&
    !RcState.equalTo(Rc.parse(doc.getText().split(/\r?\n/)));
  void vscode.commands.executeCommand(
    'setContext',
    'codemeow.rcChanged',
    changed,
  );
}

function loadUserRc(): Config {
  const p = userRcPath();
  const lines = fs.existsSync(p)
    ? fs.readFileSync(p, 'utf8').split(/\r?\n/)
    : [];
  const c = Rc.setUserLines(lines);
  if (c.errors.length > 0) {
    void vscode.window.showWarningMessage(
      `codemeow: problem(s) in ~/${Rc.FILE_NAME} — ${c.errors.join('; ')}`,
    );
  }
  return c;
}

function loadDefaults(extensionPath: string): void {
  const p = path.join(extensionPath, Rc.FILE_NAME);
  try {
    const c = Rc.initDefaults(fs.readFileSync(p, 'utf8').split(/\r?\n/));
    if (c.errors.length > 0) {
      void vscode.window.showErrorMessage(
        `codemeow: broken bundled ${Rc.FILE_NAME} (extension bug) — ${c.errors.join('; ')}`,
      );
    }
  } catch {
    void vscode.window.showErrorMessage(
      `codemeow: bundled ${Rc.FILE_NAME} is missing (extension bug)`,
    );
  }
}

// -------------------------------------------------------------- activation

export function activate(context: vscode.ExtensionContext): void {
  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  grabDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('diffEditor.insertedTextBackground'),
  });
  // meow paints the expand digits OVER the text (meow-visual.el: a one-char
  // overlay whose 'display replaces it) — text must never shift. VS Code's
  // after-decorations are inline by default (they push the line), so the
  // injected `position: absolute` takes the label out of the layout flow and
  // the editor-background fill visually covers the char underneath.
  hintDecoration = vscode.window.createTextEditorDecorationType({
    after: {
      color: new vscode.ThemeColor('editorWarning.foreground'),
      backgroundColor: new vscode.ThemeColor('editor.background'),
      fontWeight: 'bold',
      textDecoration: 'none; position: absolute; z-index: 1',
    },
  });
  // the native avy port: live match highlights while collecting input, and
  // avy-lead-face (white on amaranth) labels painted over the text —
  // absolutely positioned like the expand hints so nothing shifts
  avyMatchDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor(
      'editor.findMatchHighlightBackground',
    ),
  });
  avyLabelDecoration = vscode.window.createTextEditorDecorationType({
    after: {
      color: '#ffffff',
      backgroundColor: '#e52b50',
      fontWeight: 'bold',
      textDecoration: 'none; position: absolute; z-index: 1',
    },
  });
  context.subscriptions.push(
    statusBar,
    grabDecoration,
    hintDecoration,
    avyMatchDecoration,
    avyLabelDecoration,
    infoEmitter,
  );

  loadDefaults(context.extensionPath);
  loadUserRc();
  syncTreeKeys();
  syncRcChanged();
  // the editor-title Reload button (the ideameow/IdeaVim floating-toolbar
  // analog): its when-clause gates on codemeow.rcChanged, kept in sync with
  // a parse-hash comparison against the loaded config — comment edits don't
  // light it up
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (isRcDocument(e.document)) {
        syncRcChanged();
      }
    }),
    vscode.workspace.onDidOpenTextDocument((d) => {
      if (isRcDocument(d)) {
        syncRcChanged();
      }
    }),
  );

  // the modal heart: intercept typing before it becomes an insertion
  try {
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'type',
        async (args: { text?: string }) => {
          const editor = vscode.window.activeTextEditor;
          const text = args?.text ?? '';
          if (!editor || text === '') {
            return vscode.commands.executeCommand('default:type', args);
          }
          const st = stateFor(editor);
          if (!st || st.mode === MeowMode.INSERT) {
            return vscode.commands.executeCommand('default:type', args);
          }
          const ctx = makeCtx(editor, st);
          for (const ch of text) {
            if (!(await Engine.handleChar(ctx, ch))) {
              await vscode.commands.executeCommand('default:type', {
                text: ch,
              });
            }
          }
        },
      ),
    );
  } catch {
    void vscode.window.showErrorMessage(
      'codemeow: another extension already owns typing (VSCodeVim?). Disable it and reload — two modal editors cannot share a keyboard.',
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('codemeow.escape', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const st = stateFor(editor);
      if (st) Engine.escapeKey(makeCtx(editor, st));
    }),

    // the tree surface: the per-key manifest keybindings (gated on the
    // codemeow.tree.* contexts, see treeKeys.ts) land here with the pressed
    // char, and the MOTION map decides what it does on the focused tree
    vscode.commands.registerCommand('codemeow.tree', (c: unknown) => {
      if (typeof c !== 'string') return;
      return TreeMeow.dispatch(runTreeCommand, c);
    }),

    // windmove: Shift+arrows (manifest keybindings, meow editors only) and
    // SPC w h/j/k/l from the rc
    vscode.commands.registerCommand('codemeow.windmoveLeft', () =>
      windmove('left'),
    ),
    vscode.commands.registerCommand('codemeow.windmoveRight', () =>
      windmove('right'),
    ),
    vscode.commands.registerCommand('codemeow.windmoveUp', () =>
      windmove('up'),
    ),
    vscode.commands.registerCommand('codemeow.windmoveDown', () =>
      windmove('down'),
    ),

    // double-ESC in a tool window focuses the editor (ideameow's
    // ToolWindowEscape): the manifest binds escape on the terminal, lists,
    // and the other side-bar/panel/secondary-side-bar views. A lone press
    // keeps its native meaning — the terminal gets its escape byte back
    // (that binding only fires when codemeow.toolWindowEscape is listed in
    // terminal.integrated.commandsToSkipShell), lists get their own ESC
    // command (list.clear, verified in microsoft/vscode listCommands.ts)
    vscode.commands.registerCommand(
      'codemeow.toolWindowEscape',
      (surface: unknown) => {
        if (typeof surface !== 'string') return;
        if (ToolWindowEscape.onEscape(surface, Date.now())) {
          return vscode.commands.executeCommand(
            'workbench.action.focusActiveEditorGroup',
          );
        }
        if (surface === 'terminal') {
          return vscode.commands.executeCommand(
            'workbench.action.terminal.sendSequence',
            {
              text: String.fromCharCode(27), // the ESC byte the shell was owed
            },
          );
        }
        if (surface === 'list') {
          return vscode.commands.executeCommand('list.clear');
        }
      },
    ),

    vscode.commands.registerCommand('codemeow.reloadRc', async () => {
      // the rc is usually edited right here (SPC c m) and may sit in a dirty
      // editor — reloading straight from disk would re-read stale content and
      // look dead until something saves it. Same guard as ideameow's
      // ReloadRcAction; IdeaVim's ReloadVimRc saves the document as-is before
      // re-executing for the same reason (ui/ReloadVimRc.kt).
      const rc = path.resolve(userRcPath());
      const dirty = vscode.workspace.textDocuments.find(
        (d) => d.isDirty && path.resolve(d.uri.fsPath) === rc,
      );
      if (dirty) {
        await dirty.save();
      }
      const c = loadUserRc();
      syncTreeKeys();
      syncRcChanged(); // the title button drops back to hidden
      const problems =
        c.errors.length === 0 ? '' : `, ${c.errors.length} problem(s)`;
      void vscode.window.showInformationMessage(
        `Reloaded ~/${Rc.FILE_NAME}: ${c.normal.size} normal map(s), ${c.motion.size} motion map(s), ` +
          `${c.keypad.size} keypad map(s), ${c.keypadDesc.size} description(s)${problems}`,
      );
    }),

    vscode.commands.registerCommand('codemeow.editRc', async () => {
      const p = userRcPath();
      if (!fs.existsSync(p)) {
        // a first ~/.codemeowrc starts as a full copy of the bundled
        // defaults — the complete layout and keypad table, ready to edit
        const bundled = path.join(context.extensionPath, Rc.FILE_NAME);
        if (fs.existsSync(bundled)) {
          fs.copyFileSync(bundled, p);
        } else {
          // a missing bundled rc is an extension bug (loadDefaults reports
          // it); leave a minimal self-describing file so SPC c m still works
          fs.writeFileSync(
            p,
            [
              `" ~/${Rc.FILE_NAME} — codemeow configuration`,
              '" the bundled defaults (full meow layout + keypad table) stay',
              '" underneath — lines here override them entry by entry, e.g.:',
              '" nmap Q meow-goto-line',
              '',
            ].join('\n'),
          );
        }
      }
      const doc = await vscode.workspace.openTextDocument(p);
      await vscode.window.showTextDocument(doc);
    }),

    vscode.commands.registerCommand('codemeow.commandIds', async () => {
      // the ideameow Track Action IDs analog (keypad: SPC i d). VS Code's
      // stable API has no "command executed" listener (vscode.d.ts, checked),
      // so instead of live tracking this lists every command id the editor
      // knows — the ids <action>(...) rc lines take — and Enter copies one.
      // The title buttons cover tracking's "what does this key run?" half
      // with the platform's own tools (ids source-verified 2026-07): the
      // Keyboard Shortcuts editor in record-keys mode, and the keystroke
      // log (Toggle Keyboard Shortcuts Troubleshooting — logging on also
      // opens the Window log, where each keypress shows its command).
      const ids = (await vscode.commands.getCommands(true)).sort();
      const recordButton: vscode.QuickInputButton = {
        iconPath: new vscode.ThemeIcon('record-keys'),
        tooltip:
          'What does a key run? Record keys in the Keyboard Shortcuts editor',
      };
      const logButton: vscode.QuickInputButton = {
        iconPath: new vscode.ThemeIcon('output'),
        tooltip: 'Toggle the keystroke log (every keypress logs its command)',
      };
      const qp = vscode.window.createQuickPick();
      qp.title = 'command ids';
      qp.placeholder =
        'command id for <action>(...) rc mappings — Enter copies it to the clipboard';
      qp.items = ids.map((id) => ({ label: id }));
      qp.buttons = [recordButton, logButton];
      qp.onDidTriggerButton((b) => {
        qp.hide();
        if (b === recordButton) {
          void vscode.commands
            .executeCommand('workbench.action.openGlobalKeybindings')
            .then(() =>
              vscode.commands.executeCommand(
                'keybindings.editor.recordSearchKeys',
              ),
            );
        } else {
          void vscode.commands.executeCommand(
            'workbench.action.toggleKeybindingsLog',
          );
        }
      });
      qp.onDidAccept(async () => {
        const picked = qp.activeItems[0]?.label;
        qp.hide();
        if (picked !== undefined) {
          await vscode.env.clipboard.writeText(picked);
          void vscode.window.setStatusBarMessage(
            `meow: copied ${picked}`,
            3000,
          );
        }
      });
      qp.onDidHide(() => qp.dispose());
      qp.show();
    }),

    vscode.commands.registerCommand('codemeow.cheatsheet', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const st = stateFor(editor);
      if (!st) return;
      const ctx = makeCtx(editor, st);
      // same path as SPC ?
      void import('../core/keypad').then((k) =>
        ctx.ui.info('Meow Cheatsheet', k.CHEATSHEET),
      );
    }),

    { dispose: closeWhichKeyMenu },

    vscode.workspace.registerTextDocumentContentProvider('codemeow', {
      onDidChange: infoEmitter.event,
      provideTextDocumentContent: () => infoBody,
    }),

    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) {
        statusBar.hide();
        void vscode.commands.executeCommand(
          'setContext',
          'codemeow.active',
          false,
        );
        return;
      }
      const st = stateFor(editor);
      if (st) applyMode(editor, st);
      else {
        statusBar.hide();
        void vscode.commands.executeCommand(
          'setContext',
          'codemeow.active',
          false,
        );
      }
    }),

    vscode.workspace.onDidCloseTextDocument((doc) => {
      states.delete(doc.uri.toString());
    }),
  );

  const active = vscode.window.activeTextEditor;
  if (active) {
    const st = stateFor(active);
    if (st) applyMode(active, st);
  }
}

export function deactivate(): void {
  states.clear();
}
