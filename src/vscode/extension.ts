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
import { MeowMode, MeowState } from '../core/state';
import { keypadRows, THINGS } from '../core/whichKey';
import { VscClipboard, VscEditorPort } from './editorPort';

/**
 * The VS Code shell around the meow core: owns the `type` override, the
 * per-document state, the status-bar widget, the decorations (grab region,
 * expand hints), the which-key status hints, and the two rc layers on disk.
 * All editing semantics live in ../core — this file only wires them up.
 */

const states = new Map<string, MeowState>();
const clipboard = new VscClipboard();
let statusBar: vscode.StatusBarItem;
let grabDecoration: vscode.TextEditorDecorationType;
let hintDecoration: vscode.TextEditorDecorationType;
let whichKeyTimer: ReturnType<typeof setTimeout> | undefined;
/** The bottom-panel view showing the which-key grid (resolved lazily). */
let whichKeyView: vscode.WebviewView | undefined;
/** Pending grid HTML, picked up when the view resolves. */
let whichKeyHtml: string | undefined;
/** Grace timer: the panel closes only when the prefix chain really ends. */
let whichKeyCloseTimer: ReturnType<typeof setTimeout> | undefined;
/** True while a prefix chain is alive: the next panel appears with no delay. */
let whichKeyChain = false;
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
    hint: (text) => void vscode.window.setStatusBarMessage(`meow: ${text}`, 3000),

    info: (title, body) => {
      if (body.includes('\n')) {
        infoBody = `${title}\n${'='.repeat(title.length)}\n\n${body}\n`;
        infoEmitter.fire(INFO_URI);
        void vscode.workspace.openTextDocument(INFO_URI).then((doc) =>
          vscode.window.showTextDocument(doc, { preview: true }),
        );
      } else {
        void vscode.window.showInformationMessage(`${title}: ${body}`);
      }
    },

    input: (prompt) => Promise.resolve(vscode.window.showInputBox({ prompt })),

    runCommand: async (id) => {
      await vscode.commands.executeCommand(id);
    },

    scheduleWhichKey: (kind, buffer) => {
      hideWhichKey();
      if (!Rc.whichKeyEnabled()) {
        whichKeyChain = false;
        return;
      }
      // meow's timeoutlen for the first menu; follow-up prefixes reopen at once
      const delay = whichKeyChain ? 0 : Math.max(Rc.whichKeyDelayMs(), 0);
      whichKeyChain = false;
      whichKeyTimer = setTimeout(() => {
        whichKeyTimer = undefined;
        void openWhichKey(kind, buffer);
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

    setGrabHighlight: (range) => {
      const doc = editor.document;
      editor.setDecorations(
        grabDecoration,
        range ? [new vscode.Range(doc.positionAt(range.start), doc.positionAt(range.end))] : [],
      );
    },

    modeChanged: () => applyMode(editor, st),

    refresh: () => refreshStatus(editor, st),
  };
}

function makeCtx(editor: vscode.TextEditor, st: MeowState): Ctx {
  return { port: new VscEditorPort(editor), clipboard, ui: makeUi(editor, st), st };
}

function hideWhichKey(): void {
  if (whichKeyTimer !== undefined) clearTimeout(whichKeyTimer);
  whichKeyTimer = undefined;
  if (whichKeyView?.visible) {
    whichKeyChain = true; // a follow-up prefix in the same chain redraws instantly
    // close only when the chain really ends: openWhichKey cancels this timer
    if (whichKeyCloseTimer !== undefined) clearTimeout(whichKeyCloseTimer);
    whichKeyCloseTimer = setTimeout(() => {
      whichKeyCloseTimer = undefined;
      closeWhichKeyPanel();
    }, 80);
  }
}

function closeWhichKeyPanel(): void {
  whichKeyChain = false;
  if (whichKeyView?.visible) {
    whichKeyView.webview.html = '';
    void vscode.commands.executeCommand('workbench.action.closePanel');
  }
}

/**
 * which-key, the Emacs way: a NON-focusable panel along the bottom (a
 * webview view revealed with preserveFocus) listing the continuations in
 * columns. It never interrupts — keep typing in the editor; ESC cancels
 * through the editor as usual. The very first reveal of a session has to
 * resolve the view, which briefly bounces focus through the panel and back.
 */
async function openWhichKey(kind: 'keypad' | 'things', buffer: string): Promise<void> {
  const rows = kind === 'things' ? THINGS : keypadRows(buffer);
  if (rows.length === 0) return;
  if (whichKeyCloseTimer !== undefined) {
    clearTimeout(whichKeyCloseTimer);
    whichKeyCloseTimer = undefined;
  }
  const title = kind === 'things' ? 'thing' : `SPC ${buffer.split('').join(' ')}`.trimEnd();
  whichKeyHtml = whichKeyGridHtml(title, rows);
  if (whichKeyView) {
    whichKeyView.webview.html = whichKeyHtml;
    whichKeyView.show(true); // preserveFocus: the editor keeps the keyboard
  } else {
    await vscode.commands.executeCommand('codemeow.whichKey.focus');
    await vscode.commands.executeCommand('workbench.action.focusActiveEditorGroup');
  }
}

/** which-key's grid, column-major via CSS columns, in the editor's theme. */
function whichKeyGridHtml(title: string, rows: Array<[string, string]>): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const widest = rows.reduce((w, [k, d]) => Math.max(w, k.length + 3 + d.length), 8);
  const entries = rows
    .map(([k, d]) => `<div class="e"><b>${esc(k)}</b><span class="s"> → </span>${esc(d)}</div>`)
    .join('');
  return `<!DOCTYPE html><html><head><style>
    body { margin: 4px 8px; font-family: var(--vscode-editor-font-family);
           font-size: var(--vscode-editor-font-size); color: var(--vscode-foreground); }
    .t { color: var(--vscode-descriptionForeground); margin-bottom: 4px; }
    .wk { column-width: ${widest}ch; column-gap: 2ch; }
    .e { break-inside: avoid; white-space: nowrap; }
    .e b { color: var(--vscode-textLink-foreground); }
    .s { color: var(--vscode-descriptionForeground); }
  </style></head><body><div class="t">${esc(title)}</div><div class="wk">${entries}</div></body></html>`;
}

function clearExpandHints(editor: vscode.TextEditor): void {
  if (hintTimer !== undefined) clearTimeout(hintTimer);
  hintTimer = undefined;
  editor.setDecorations(hintDecoration, []);
}

function applyMode(editor: vscode.TextEditor, st: MeowState): void {
  editor.options = {
    cursorStyle: st.mode === MeowMode.INSERT
      ? vscode.TextEditorCursorStyle.Line
      : vscode.TextEditorCursorStyle.Block,
  };
  refreshStatus(editor, st);
}

function refreshStatus(editor: vscode.TextEditor, st: MeowState): void {
  const beacon = editor.selections.length > 1;
  statusBar.text = st.mode === MeowMode.KEYPAD
    ? `MEOW KEYPAD  SPC ${st.keypad.split('').join(' ')}`
    : beacon && st.mode === MeowMode.INSERT
      ? 'MEOW BEACON-INSERT'
      : beacon
        ? 'MEOW BEACON'
        : `MEOW ${st.mode}`;
  statusBar.show();
  void vscode.commands.executeCommand('setContext', 'codemeow.active', true);
}

// -------------------------------------------------------------- rc loading

function userRcPath(): string {
  return path.join(os.homedir(), Rc.FILE_NAME);
}

function loadUserRc(): Config {
  const p = userRcPath();
  const lines = fs.existsSync(p) ? fs.readFileSync(p, 'utf8').split(/\r?\n/) : [];
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
    void vscode.window.showErrorMessage(`codemeow: bundled ${Rc.FILE_NAME} is missing (extension bug)`);
  }
}

// -------------------------------------------------------------- activation

export function activate(context: vscode.ExtensionContext): void {
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
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
  context.subscriptions.push(statusBar, grabDecoration, hintDecoration, infoEmitter);

  loadDefaults(context.extensionPath);
  loadUserRc();

  // the modal heart: intercept typing before it becomes an insertion
  try {
    context.subscriptions.push(
      vscode.commands.registerCommand('type', async (args: { text?: string }) => {
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
            await vscode.commands.executeCommand('default:type', { text: ch });
          }
        }
      }),
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

    vscode.commands.registerCommand('codemeow.reloadRc', () => {
      const c = loadUserRc();
      const problems = c.errors.length === 0 ? '' : `, ${c.errors.length} problem(s)`;
      void vscode.window.showInformationMessage(
        `Reloaded ~/${Rc.FILE_NAME}: ${c.normal.size} normal map(s), ${c.motion.size} motion map(s), ` +
        `${c.keypad.size} keypad map(s), ${c.keypadDesc.size} description(s)${problems}`,
      );
    }),

    vscode.commands.registerCommand('codemeow.editRc', async () => {
      const p = userRcPath();
      if (!fs.existsSync(p)) {
        fs.writeFileSync(p, [
          `" ~/${Rc.FILE_NAME} — codemeow configuration`,
          '" the bundled defaults (full meow layout + keypad table) stay',
          '" underneath — lines here override them entry by entry, e.g.:',
          '" nmap S <action>(extension.aceJump)',
          '" nmap n meow-mark-word',
          '" map <leader>gd <action>(editor.action.revealDefinition)',
          '" desc <leader>g goto',
          '',
        ].join('\n'));
      }
      const doc = await vscode.workspace.openTextDocument(p);
      await vscode.window.showTextDocument(doc);
    }),

    vscode.commands.registerCommand('codemeow.cheatsheet', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const st = stateFor(editor);
      if (!st) return;
      const ctx = makeCtx(editor, st);
      // same path as SPC ?
      void import('../core/keypad').then((k) => ctx.ui.info('Meow Cheatsheet', k.CHEATSHEET));
    }),

    vscode.window.registerWebviewViewProvider('codemeow.whichKey', {
      resolveWebviewView(view) {
        whichKeyView = view;
        view.webview.options = { enableScripts: false };
        if (whichKeyHtml !== undefined) view.webview.html = whichKeyHtml;
        view.onDidDispose(() => {
          if (whichKeyView === view) whichKeyView = undefined;
        });
      },
    }),

    vscode.workspace.registerTextDocumentContentProvider('codemeow', {
      onDidChange: infoEmitter.event,
      provideTextDocumentContent: () => infoBody,
    }),

    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!editor) {
        statusBar.hide();
        void vscode.commands.executeCommand('setContext', 'codemeow.active', false);
        return;
      }
      const st = stateFor(editor);
      if (st) applyMode(editor, st);
      else {
        statusBar.hide();
        void vscode.commands.executeCommand('setContext', 'codemeow.active', false);
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
