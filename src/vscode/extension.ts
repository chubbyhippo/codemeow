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

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import * as AceClick from '../core/aceClick';
import * as Ace from '../core/aceWindow';
import { attachMode } from '../core/attachPolicy';
import { Chord } from '../core/chord';
import { Chords } from '../core/chords';
import { normalize as normalizeHostKey } from '../core/hostKey';
import { Hosts } from '../core/hosts';
import { CHEATSHEET } from '../core/keypad';
import { Resizes } from '../core/resize';
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
import { CHORD_KEYS } from './chordKeys';
import { HOST_KEY_TABLE } from './hostKeys';
import { VscClipboard, VscEditorPort } from './editorPort';
import { TREE_KEYS } from './treeKeys';

const STATUS_MESSAGE_MS = 3000;
const EXPAND_HINT_MS = 1000;
const WHICH_KEY_GRACE_MS = 60;
const FOCUS_SETTLE_MS = 80;
const STATUS_BAR_PRIORITY = 100;
const ESC_SEQUENCE = String.fromCharCode(27);

const states = new Map<string, MeowState>();
const clipboard = new VscClipboard();
let statusBar: vscode.StatusBarItem;
let grabDecoration: vscode.TextEditorDecorationType;
let hintDecoration: vscode.TextEditorDecorationType;
let avyMatchDecoration: vscode.TextEditorDecorationType;
let avyLabelDecoration: vscode.TextEditorDecorationType;
let decorationsBuilt = false;
let whichKeyTimer: ReturnType<typeof setTimeout> | undefined;
let whichKeyMenu:
  { picker: vscode.QuickPick<WhichKeyItem>; closing: boolean } | undefined;
let whichKeyCloseTimer: ReturnType<typeof setTimeout> | undefined;
let whichKeyChain = false;
let whichKeyDispatch: Promise<void> = Promise.resolve();

interface WhichKeyItem extends vscode.QuickPickItem {
  meowKey: string;
}
let hintTimer:
  | { handle: ReturnType<typeof setTimeout>; editor: vscode.TextEditor }
  | undefined;

function sweepHintTimer(): void {
  if (hintTimer === undefined) return;
  clearTimeout(hintTimer.handle);
  const prev = hintTimer.editor;
  hintTimer = undefined;
  try {
    prev.setDecorations(hintDecoration, []);
  } catch (previousEditorAlreadyDisposed) {
    void previousEditorAlreadyDisposed;
  }
}
let infoBody = '';
const infoEmitter = new vscode.EventEmitter<vscode.Uri>();
const INFO_URI = vscode.Uri.parse('codemeow:meow-info');

function stateFor(editor: vscode.TextEditor): MeowState | undefined {
  const key = editor.document.uri.toString();
  const existing = states.get(key);
  if (existing) return existing;
  const mode = attachMode(editor.document.uri.scheme);
  if (mode === null) return undefined;
  const state = new MeowState();
  state.mode = mode;
  states.set(key, state);
  return state;
}

function makeUi(editor: vscode.TextEditor, state: MeowState): UiPort {
  return {
    hint: (text) =>
      void vscode.window.setStatusBarMessage(
        `meow: ${text}`,
        STATUS_MESSAGE_MS,
      ),

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
      Promise.resolve(
        vscode.window.showInputBox(
          initial === undefined ? { prompt } : { prompt, value: initial },
        ),
      ),

    runCommand: async (id) => {
      await vscode.commands.executeCommand(id);
    },

    revealCaret: async (at) => {
      await vscode.commands.executeCommand('revealLine', {
        lineNumber: editor.selection.active.line,
        at,
      });
    },

    scheduleWhichKey: (kind, buffer) => {
      if (whichKeyCloseTimer !== undefined) {
        clearTimeout(whichKeyCloseTimer);
        whichKeyCloseTimer = undefined;
      }
      if (whichKeyTimer !== undefined) clearTimeout(whichKeyTimer);
      whichKeyTimer = undefined;
      if (!Rc.whichKeyEnabled()) {
        whichKeyChain = false;
        return;
      }
      if (whichKeyMenu) {
        fillWhichKeyMenu(whichKeyMenu.picker, kind, buffer);
        return;
      }
      const delay = whichKeyChain ? 0 : Math.max(Rc.whichKeyDelayMs(), 0);
      whichKeyChain = false;
      whichKeyTimer = setTimeout(() => {
        whichKeyTimer = undefined;
        openWhichKeyMenu(editor, state, kind, buffer);
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
      hintTimer = {
        handle: setTimeout(() => clearExpandHints(editor), EXPAND_HINT_MS),
        editor,
      };
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

    modeChanged: () => applyMode(editor, state),

    refresh: () => refreshStatus(editor, state),
  };
}

function makeCtx(editor: vscode.TextEditor, state: MeowState): Ctx {
  return {
    port: new VscEditorPort(editor),
    clipboard,
    ui: makeUi(editor, state),
    state,
  };
}

function hideWhichKey(): void {
  if (whichKeyTimer !== undefined) clearTimeout(whichKeyTimer);
  whichKeyTimer = undefined;
  if (whichKeyMenu && whichKeyCloseTimer === undefined) {
    whichKeyChain = true;
    whichKeyCloseTimer = setTimeout(() => {
      whichKeyCloseTimer = undefined;
      whichKeyChain = false;
      closeWhichKeyMenu();
    }, WHICH_KEY_GRACE_MS);
  }
}

function closeWhichKeyMenu(): void {
  const menu = whichKeyMenu;
  if (!menu) return;
  whichKeyMenu = undefined;
  menu.closing = true;
  menu.picker.dispose();
}

function openWhichKeyMenu(
  editor: vscode.TextEditor,
  state: MeowState,
  kind: 'keypad' | 'things',
  buffer: string,
): void {
  if (kind === 'keypad' && keypadRows(buffer).length === 0) return;
  closeWhichKeyMenu();
  const picker = vscode.window.createQuickPick<WhichKeyItem>();
  const menu = { picker, closing: false };
  whichKeyMenu = menu;
  picker.placeholder =
    'keep typing the sequence — Enter or a click runs the highlighted key';
  fillWhichKeyMenu(picker, kind, buffer);
  picker.onDidChangeValue((v) => {
    if (v === '') return;
    picker.value = '';
    dispatchMenuKeys(editor, state, v);
  });
  picker.onDidAccept(() => {
    const item = picker.activeItems[0];
    if (item) dispatchMenuKeys(editor, state, item.meowKey);
  });
  picker.onDidHide(() => {
    const userHid = whichKeyMenu === menu && !menu.closing;
    if (whichKeyMenu === menu) whichKeyMenu = undefined;
    picker.dispose();
    if (userHid) {
      whichKeyChain = false;
      if (state.mode === MeowMode.KEYPAD || state.pending !== null) {
        Engine.escapeKey(makeCtx(editor, state));
      }
    }
  });
  picker.show();
}

function fillWhichKeyMenu(
  picker: vscode.QuickPick<WhichKeyItem>,
  kind: 'keypad' | 'things',
  buffer: string,
): void {
  const rows = kind === 'things' ? THINGS : keypadRows(buffer);
  picker.title =
    kind === 'things' ? 'thing' : `SPC ${buffer.split('').join(' ')}`.trimEnd();
  picker.items = rows.map(([k, d]) => ({
    label: k,
    description: `→ ${d}`,
    meowKey: k === 'SPC' ? ' ' : k,
  }));
  const [firstRow] = picker.items;
  picker.activeItems = firstRow ? [firstRow] : [];
}

function dispatchMenuKeys(
  editor: vscode.TextEditor,
  state: MeowState,
  keys: string,
): void {
  whichKeyDispatch = whichKeyDispatch
    .then(async () => {
      const ctx = makeCtx(editor, state);
      for (const ch of keys) await Engine.handleChar(ctx, ch);
    })
    .catch((e: unknown) =>
      console.error('codemeow: which-key dispatch failed', e),
    );
}

function clearExpandHints(editor: vscode.TextEditor): void {
  sweepHintTimer();
  editor.setDecorations(hintDecoration, []);
}

function applyMode(editor: vscode.TextEditor, state: MeowState): void {
  editor.options = {
    cursorStyle:
      state.mode === MeowMode.INSERT
        ? vscode.TextEditorCursorStyle.Line
        : vscode.TextEditorCursorStyle.Block,
  };
  refreshStatus(editor, state);
}

function statusText(state: MeowState, beacon: boolean): string {
  if (state.mode === MeowMode.KEYPAD) {
    return `MEOW KEYPAD  SPC ${state.keypad.split('').join(' ')}`;
  }
  if (beacon) {
    return state.mode === MeowMode.INSERT
      ? 'MEOW BEACON-INSERT'
      : 'MEOW BEACON';
  }
  if (Engine.repeatMap) {
    return `MEOW ${state.mode} [repeat ${[...Engine.repeatMap.keys()].join(' ')}]`;
  }
  return `MEOW ${state.mode}`;
}

function refreshStatus(editor: vscode.TextEditor, state: MeowState): void {
  const beacon = editor.selections.length > 1;
  statusBar.text = statusText(state, beacon);
  statusBar.show();
  void vscode.commands.executeCommand('setContext', 'codemeow.active', true);
  void vscode.commands.executeCommand(
    'setContext',
    'codemeow.normal',
    state.mode === MeowMode.NORMAL,
  );
  void vscode.commands.executeCommand(
    'setContext',
    'codemeow.insert',
    state.mode === MeowMode.INSERT,
  );
}

function clearActiveContext(): void {
  void vscode.commands.executeCommand('setContext', 'codemeow.active', false);
  void vscode.commands.executeCommand('setContext', 'codemeow.normal', false);
  void vscode.commands.executeCommand('setContext', 'codemeow.insert', false);
}

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

function syncChordKeys(): void {
  const bound = Rc.chordBindings();
  for (const { spelling, ctx } of CHORD_KEYS) {
    void vscode.commands.executeCommand(
      'setContext',
      `codemeow.chord.${ctx}`,
      bound.has(spelling),
    );
  }
}

function syncHostKeys(): void {
  const bound = Rc.hostBindings();
  for (const { host, ctx } of HOST_KEY_TABLE) {
    void vscode.commands.executeCommand(
      'setContext',
      `codemeow.host.${ctx}`,
      bound.has(host),
    );
  }
}

async function runTreeCommand(id: string): Promise<void> {
  try {
    await vscode.commands.executeCommand(id);
  } catch {
    void vscode.window.setStatusBarMessage(
      `meow: Unknown command: ${id}`,
      STATUS_MESSAGE_MS,
    );
  }
}

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

async function windmove(dir: WindmoveDir): Promise<void> {
  const before = focusFingerprint();
  try {
    await vscode.commands.executeCommand(plan(dir, diffSideView()));
  } catch (unknownWindmoveCommandId) {
    void unknownWindmoveCommandId;
  }
  await new Promise((resolve) => setTimeout(resolve, FOCUS_SETTLE_MS));
  if (focusFingerprint() === before) {
    void vscode.window.setStatusBarMessage(
      `meow: ${noWindowMessage(dir)}`,
      STATUS_MESSAGE_MS,
    );
  }
}

const ACE_FOCUS_GROUP_COMMANDS = [
  'workbench.action.focusFirstEditorGroup',
  'workbench.action.focusSecondEditorGroup',
  'workbench.action.focusThirdEditorGroup',
  'workbench.action.focusFourthEditorGroup',
  'workbench.action.focusFifthEditorGroup',
  'workbench.action.focusSixthEditorGroup',
  'workbench.action.focusSeventhEditorGroup',
  'workbench.action.focusEighthEditorGroup',
];

const ACE_CLICK_RESOLVE_LIMIT = 40;
const ACE_BADGE_COLOR = 'charts.green';
const SIDE_BAR_FOCUS_COMMAND = 'workbench.action.focusSideBar';
const SIDE_BAR_NAME = 'Explorer';
const TERMINAL_FOCUS_COMMAND = 'workbench.action.terminal.focus';
const TERMINAL_NAME = 'Terminal';
const STICKY_SCROLL_MAX_LINES = 5;

type HintPaint =
  | { kind: 'text'; editor: vscode.TextEditor; at: vscode.Position }
  | { kind: 'badge'; uri: vscode.Uri }
  | { kind: 'none' };

interface HintTarget {
  paint: HintPaint;
  open: () => Thenable<unknown>;
}

interface WindowTarget extends HintTarget {
  focused: boolean;
  unpaintedName?: string;
}

interface Hint {
  target: HintTarget;
  label: string;
}

class AceBadgeProvider implements vscode.FileDecorationProvider {
  private labels = new Map<string, string>();
  private readonly changed = new vscode.EventEmitter<vscode.Uri[]>();
  readonly onDidChangeFileDecorations = this.changed.event;

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const badge = this.labels.get(uri.toString());
    if (badge === undefined) return undefined;
    return new vscode.FileDecoration(
      badge,
      `ace: ${badge}`,
      new vscode.ThemeColor(ACE_BADGE_COLOR),
    );
  }

  show(labels: Map<string, string>): void {
    const touched = new Set([...this.labels.keys(), ...labels.keys()]);
    this.labels = labels;
    this.changed.fire([...touched].map((u) => vscode.Uri.parse(u)));
  }

  clear(): void {
    this.show(new Map());
  }
}

const aceBadges = new AceBadgeProvider();

function tabUri(input: unknown): vscode.Uri | undefined {
  if (input instanceof vscode.TabInputText) return input.uri;
  if (input instanceof vscode.TabInputTextDiff) return input.modified;
  if (input instanceof vscode.TabInputNotebook) return input.uri;
  if (input instanceof vscode.TabInputCustom) return input.uri;
  return undefined;
}

function tabTargets(): HintTarget[] {
  const groups = Ace.ordered(
    vscode.window.tabGroups.all.map((g) => ({
      item: g,
      x: g.viewColumn,
      y: 0,
    })),
  );
  const seen = new Set<string>();
  const out: HintTarget[] = [];
  for (const group of groups) {
    for (const tab of group.tabs) {
      const uri = tabUri(tab.input);
      if (!uri || seen.has(uri.toString())) continue;
      seen.add(uri.toString());
      out.push({
        paint: { kind: 'badge', uri },
        open: () =>
          vscode.commands.executeCommand('vscode.open', uri, {
            viewColumn: group.viewColumn,
            preview: false,
          }),
      });
    }
  }
  return out;
}

async function linkTargets(
  editor: vscode.TextEditor,
  visible: vscode.Range,
): Promise<HintTarget[]> {
  let links: vscode.DocumentLink[];
  try {
    links =
      (await vscode.commands.executeCommand<vscode.DocumentLink[]>(
        'vscode.executeLinkProvider',
        editor.document.uri,
        ACE_CLICK_RESOLVE_LIMIT,
      )) ?? [];
  } catch {
    return [];
  }
  return links
    .filter(
      (link) => link.target !== undefined && visible.contains(link.range.start),
    )
    .map((link) => ({
      paint: { kind: 'text' as const, editor, at: link.range.start },
      open: () => vscode.commands.executeCommand('vscode.open', link.target),
    }));
}

async function lensTargets(
  editor: vscode.TextEditor,
  visible: vscode.Range,
): Promise<HintTarget[]> {
  let lenses: vscode.CodeLens[];
  try {
    lenses =
      (await vscode.commands.executeCommand<vscode.CodeLens[]>(
        'vscode.executeCodeLensProvider',
        editor.document.uri,
        ACE_CLICK_RESOLVE_LIMIT,
      )) ?? [];
  } catch {
    return [];
  }
  return lenses
    .filter(
      (lens) =>
        lens.command !== undefined && visible.contains(lens.range.start),
    )
    .map((lens) => {
      const command = lens.command?.command ?? '';
      const args: unknown[] = lens.command?.arguments ?? [];
      return {
        paint: { kind: 'text' as const, editor, at: lens.range.start },
        open: () => vscode.commands.executeCommand(command, ...args),
      };
    });
}

function quickFixTargets(
  editor: vscode.TextEditor,
  visible: vscode.Range,
): HintTarget[] {
  return vscode.languages
    .getDiagnostics(editor.document.uri)
    .filter((d) => visible.contains(d.range.start))
    .map((d) => ({
      paint: { kind: 'text' as const, editor, at: d.range.start },
      open: async () => {
        const shown = await vscode.window.showTextDocument(
          editor.document,
          editor.viewColumn,
        );
        shown.selection = new vscode.Selection(d.range.start, d.range.start);
        await vscode.commands.executeCommand('editor.action.quickFix');
      },
    }));
}

async function inTextTargets(): Promise<HintTarget[]> {
  const editors = Ace.ordered(
    vscode.window.visibleTextEditors.map((e) => ({
      item: e,
      x: e.viewColumn ?? 0,
      y: 0,
    })),
  );
  const out: HintTarget[] = [];
  for (const editor of editors) {
    const visible = editor.visibleRanges[0];
    if (!visible) continue;
    const found = [
      ...(await linkTargets(editor, visible)),
      ...(await lensTargets(editor, visible)),
      ...quickFixTargets(editor, visible),
    ];
    out.push(
      ...Ace.ordered(
        found.map((target) => ({
          item: target,
          x: target.paint.kind === 'text' ? target.paint.at.line : 0,
          y: target.paint.kind === 'text' ? target.paint.at.character : 0,
        })),
      ),
    );
  }
  return out;
}

async function clickTargets(): Promise<HintTarget[]> {
  return [...tabTargets(), ...(await inTextTargets())];
}

function paintHints(shown: Hint[]): void {
  const inText = shown.flatMap((h) =>
    h.target.paint.kind === 'text'
      ? [
          {
            label: h.label,
            editor: h.target.paint.editor,
            at: h.target.paint.at,
          },
        ]
      : [],
  );
  for (const editor of vscode.window.visibleTextEditors) {
    editor.setDecorations(
      avyLabelDecoration,
      inText
        .filter((h) => h.editor === editor)
        .map((h) => ({
          range: new vscode.Range(h.at, h.at),
          renderOptions: { after: { contentText: ` ${h.label} ` } },
        })),
    );
  }
  aceBadges.show(
    new Map(
      shown.flatMap((h): Array<[string, string]> =>
        h.target.paint.kind === 'badge'
          ? [[h.target.paint.uri.toString(), h.label]]
          : [],
      ),
    ),
  );
}

function clearHints(): void {
  for (const editor of vscode.window.visibleTextEditors) {
    editor.setDecorations(avyLabelDecoration, []);
  }
  aceBadges.clear();
}

function runHintSession(
  title: string,
  targets: HintTarget[],
  labels: string[],
  narrow: (labelList: string[], input: string) => string[],
  unpainted = '',
): void {
  const hinted = targets.map((target, i) => ({
    target,
    label: labels[i] ?? '',
  }));
  paintHints(hinted);

  const unpaintable =
    unpainted === ''
      ? undefined
      : vscode.window.setStatusBarMessage(`meow ace: ${unpainted}`);

  const picker = vscode.window.createQuickPick();
  picker.title = title;
  picker.placeholder =
    unpainted === ''
      ? `${targets.length} hint(s) — type the label`
      : `${targets.length} hint(s) — type the label (${unpainted})`;
  let input = '';
  let picked: HintTarget | undefined;
  picker.onDidChangeValue((value) => {
    picker.value = '';
    input += value.slice(-1);
    const exact = labels.indexOf(input);
    if (exact >= 0) {
      picked = targets[exact];
      picker.hide();
      return;
    }
    const still = narrow(labels, input);
    if (still.length === 0) {
      vscode.window.setStatusBarMessage(
        `No such candidate: ${input}`,
        STATUS_MESSAGE_MS,
      );
      input = '';
      paintHints(hinted);
      return;
    }
    paintHints(hinted.filter((h) => still.includes(h.label)));
  });
  picker.onDidHide(() => {
    clearHints();
    unpaintable?.dispose();
    picker.dispose();
    if (picked) void picked.open();
  });
  picker.show();
}

async function aceClick(): Promise<void> {
  const targets = await clickTargets();
  if (AceClick.plan(targets.length) === AceClick.Plan.NONE) {
    vscode.window.setStatusBarMessage(
      'meow: nothing clickable in view',
      STATUS_MESSAGE_MS,
    );
    return;
  }
  runHintSession(
    'Ace click',
    targets,
    AceClick.labels(targets.length),
    AceClick.matches,
  );
}

function stickyScrollLines(editor: vscode.TextEditor): number {
  const editorConfig = vscode.workspace.getConfiguration(
    'editor',
    editor.document.uri,
  );
  if (!editorConfig.get<boolean>('stickyScroll.enabled')) return 0;
  return (
    editorConfig.get<number>('stickyScroll.maxLineCount') ??
    STICKY_SCROLL_MAX_LINES
  );
}

function hintAnchor(editor: vscode.TextEditor): vscode.Position {
  const visible = editor.visibleRanges[0];
  if (!visible) return new vscode.Position(0, 0);
  const firstUncoveredLine = Math.min(
    visible.start.line + stickyScrollLines(editor),
    visible.end.line,
  );
  const caret = editor.selection.active;
  const caretIsInSight =
    caret.line >= firstUncoveredLine &&
    editor.visibleRanges.some((range) => range.contains(caret));
  return caretIsInSight ? caret : new vscode.Position(firstUncoveredLine, 0);
}

function groupPaint(group: vscode.TabGroup): HintPaint | undefined {
  const editor = vscode.window.visibleTextEditors.find(
    (e) => e.viewColumn === group.viewColumn,
  );
  if (editor) return { kind: 'text', editor, at: hintAnchor(editor) };
  const uri = tabUri(group.activeTab?.input);
  return uri ? { kind: 'badge', uri } : undefined;
}

function groupFocus(
  group: vscode.TabGroup,
  index: number,
): (() => Thenable<unknown>) | undefined {
  const focusGroup = ACE_FOCUS_GROUP_COMMANDS[index];
  if (focusGroup) return () => vscode.commands.executeCommand(focusGroup);
  const uri = tabUri(group.activeTab?.input);
  if (!uri) return undefined;
  return () =>
    vscode.commands.executeCommand('vscode.open', uri, {
      viewColumn: group.viewColumn,
      preview: false,
    });
}

function groupWindowTargets(): WindowTarget[] {
  const groups = Ace.ordered(
    vscode.window.tabGroups.all.map((g) => ({
      item: g,
      x: g.viewColumn,
      y: 0,
    })),
  );
  return groups.flatMap((group, index) => {
    const paint = groupPaint(group);
    const open = groupFocus(group, index);
    if (!paint || !open) return [];
    return [
      {
        paint,
        open,
        focused: group === vscode.window.tabGroups.activeTabGroup,
      },
    ];
  });
}

function sideBarOnRight(): boolean {
  return (
    vscode.workspace
      .getConfiguration('workbench')
      .get<string>('sideBar.location') === 'right'
  );
}

function sideBarWindowTarget(): WindowTarget | undefined {
  const folders = vscode.workspace.workspaceFolders;
  const folder = folders?.[0];
  if (!folder) return undefined;
  const rootRowExists = folders.length > 1;
  return {
    paint: { kind: 'badge', uri: folder.uri },
    open: () => vscode.commands.executeCommand(SIDE_BAR_FOCUS_COMMAND),
    focused: false,
    ...(rootRowExists ? {} : { unpaintedName: SIDE_BAR_NAME }),
  };
}

function terminalWindowTarget(): WindowTarget | undefined {
  if (vscode.window.terminals.length === 0) return undefined;
  return {
    paint: { kind: 'none' },
    open: () => vscode.commands.executeCommand(TERMINAL_FOCUS_COMMAND),
    focused: false,
    unpaintedName: TERMINAL_NAME,
  };
}

function windowTargets(): WindowTarget[] {
  const groups = groupWindowTargets();
  const sideBar = sideBarWindowTarget();
  const terminal = terminalWindowTarget();
  const withSideBar = !sideBar
    ? groups
    : sideBarOnRight()
      ? [...groups, sideBar]
      : [sideBar, ...groups];
  return terminal ? [...withSideBar, terminal] : withSideBar;
}

async function aceWindow(): Promise<void> {
  const targets = windowTargets();
  const decision = Ace.plan(targets.length);
  if (decision === Ace.Plan.NONE) {
    vscode.window.setStatusBarMessage(
      'meow: no other window',
      STATUS_MESSAGE_MS,
    );
    return;
  }
  if (decision === Ace.Plan.OTHER) {
    const other = targets.find((target) => !target.focused);
    if (other) await other.open();
    return;
  }
  const labels = Ace.labels(targets.length);
  const unpainted = targets
    .flatMap((target, i) =>
      target.unpaintedName === undefined
        ? []
        : [`${labels[i]} = ${target.unpaintedName}`],
    )
    .join(', ');
  runHintSession('Ace window', targets, labels, Ace.matches, unpainted);
}

function aceResize(): void {
  const keys = Resizes.keys();
  if (keys.length === 0) {
    vscode.window.setStatusBarMessage(
      'meow: no resize keys in the rc',
      STATUS_MESSAGE_MS,
    );
    return;
  }
  const picker = vscode.window.createQuickPick();
  picker.title = 'Ace resize';
  picker.placeholder = `resize: ${keys.join(' ')} — ESC when done`;
  picker.onDidChangeValue((value) => {
    const key = value.slice(-1);
    picker.value = '';
    if (key === '') return;
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    const state = stateFor(editor);
    if (!state) return;
    void Resizes.dispatch(makeCtx(editor, state), key).then((handled) => {
      if (!handled) {
        vscode.window.setStatusBarMessage(
          `No such resize key: ${key}`,
          STATUS_MESSAGE_MS,
        );
      }
    });
  });
  picker.onDidHide(() => picker.dispose());
  picker.show();
}

const KEYPAD_SINK_HOST_KEY = 'space';

async function hostKey(key: unknown): Promise<void> {
  if (typeof key !== 'string') return;
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const state = stateFor(editor);
  if (!state) return;
  const ctx = makeCtx(editor, state);
  if (!(await Hosts.dispatch(ctx, key))) return;
  ctx.ui.refresh(state);
  const pressedOutsideTheEditor =
    normalizeHostKey(key) === KEYPAD_SINK_HOST_KEY;
  if (pressedOutsideTheEditor && state.mode === MeowMode.KEYPAD) {
    openWhichKeyMenu(editor, state, 'keypad', '');
  }
}

async function emacsChord(spelling: unknown): Promise<void> {
  if (typeof spelling !== 'string') return;
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;
  const state = stateFor(editor);
  if (!state) return;
  const ctx = makeCtx(editor, state);
  if (await Chords.dispatch(ctx, Chord.parse(spelling))) ctx.ui.refresh(state);
}

function userRcPath(): string {
  return path.join(os.homedir(), Rc.FILE_NAME);
}

function isRcDocument(d: vscode.TextDocument): boolean {
  return path.resolve(d.uri.fsPath) === path.resolve(userRcPath());
}

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
  const rcPath = userRcPath();
  const lines = fs.existsSync(rcPath)
    ? fs.readFileSync(rcPath, 'utf8').split(/\r?\n/)
    : [];
  const config = Rc.setUserLines(lines);
  if (config.errors.length > 0) {
    void vscode.window.showWarningMessage(
      `codemeow: problem(s) in ~/${Rc.FILE_NAME} — ${config.errors.join('; ')}`,
    );
  }
  return config;
}

function loadDefaults(extensionPath: string): void {
  const bundledPath = path.join(extensionPath, Rc.FILE_NAME);
  try {
    const config = Rc.initDefaults(
      fs.readFileSync(bundledPath, 'utf8').split(/\r?\n/),
    );
    if (config.errors.length > 0) {
      void vscode.window.showErrorMessage(
        `codemeow: broken bundled ${Rc.FILE_NAME} (extension bug) — ${config.errors.join('; ')}`,
      );
    }
  } catch {
    void vscode.window.showErrorMessage(
      `codemeow: bundled ${Rc.FILE_NAME} is missing (extension bug)`,
    );
  }
}

function disposeDecorations(): void {
  if (!decorationsBuilt) return;
  grabDecoration.dispose();
  hintDecoration.dispose();
  avyMatchDecoration.dispose();
  avyLabelDecoration.dispose();
}

function buildDecorations(): void {
  disposeDecorations();
  const hintColor = Rc.expandHintColor();
  const grabColor = Rc.grabColor();
  grabDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor:
      grabColor ?? new vscode.ThemeColor('diffEditor.insertedTextBackground'),
  });
  hintDecoration = vscode.window.createTextEditorDecorationType({
    after: {
      color: hintColor ?? new vscode.ThemeColor('editorWarning.foreground'),
      backgroundColor: new vscode.ThemeColor('editor.background'),
      fontWeight: 'bold',
      textDecoration: 'none; position: absolute; z-index: 1',
    },
  });
  avyMatchDecoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor(
      'editor.findMatchHighlightBackground',
    ),
  });
  avyLabelDecoration = vscode.window.createTextEditorDecorationType({
    after: {
      color: Rc.overlayTextColor(),
      backgroundColor: Rc.overlayColor(),
      fontWeight: 'bold',
      textDecoration: 'none; position: absolute; z-index: 1',
    },
  });
  decorationsBuilt = true;
}

export function activate(context: vscode.ExtensionContext): void {
  statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    STATUS_BAR_PRIORITY,
  );
  context.subscriptions.push(statusBar, infoEmitter, {
    dispose: disposeDecorations,
  });

  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(aceBadges),
  );
  loadDefaults(context.extensionPath);
  loadUserRc();
  buildDecorations();
  syncTreeKeys();
  syncChordKeys();
  syncHostKeys();
  syncRcChanged();
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

  try {
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'type',
        async (args: { text?: string }): Promise<void> => {
          const editor = vscode.window.activeTextEditor;
          const text = args?.text ?? '';
          const state = editor && text !== '' ? stateFor(editor) : undefined;
          if (!editor || !state || state.mode === MeowMode.INSERT) {
            await vscode.commands.executeCommand('default:type', args);
            return;
          }
          const ctx = makeCtx(editor, state);
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
      const state = stateFor(editor);
      if (state) Engine.escapeKey(makeCtx(editor, state));
    }),

    vscode.commands.registerCommand('codemeow.keypad', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const state = stateFor(editor);
      if (state && state.mode !== MeowMode.KEYPAD) {
        Engine.enterKeypad(makeCtx(editor, state));
      }
    }),

    vscode.commands.registerCommand('codemeow.tree', (c: unknown) => {
      if (typeof c !== 'string') return;
      return TreeMeow.dispatch(runTreeCommand, c);
    }),

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

    vscode.commands.registerCommand('codemeow.aceWindow', () => aceWindow()),
    vscode.commands.registerCommand('codemeow.aceClick', () => aceClick()),
    vscode.commands.registerCommand('codemeow.aceResize', () => aceResize()),

    vscode.commands.registerCommand('codemeow.chord', (spelling: unknown) =>
      emacsChord(spelling),
    ),

    vscode.commands.registerCommand('codemeow.hostKey', (key: unknown) =>
      hostKey(key),
    ),

    vscode.commands.registerCommand(
      'codemeow.toolWindowEscape',
      async (surface: unknown): Promise<void> => {
        if (typeof surface !== 'string') return;
        if (ToolWindowEscape.onEscape(surface, Date.now())) {
          await vscode.commands.executeCommand(
            'workbench.action.focusActiveEditorGroup',
          );
          return;
        }
        if (surface === 'terminal') {
          await vscode.commands.executeCommand(
            'workbench.action.terminal.sendSequence',
            { text: ESC_SEQUENCE },
          );
          return;
        }
        if (surface === 'list') {
          await vscode.commands.executeCommand('list.clear');
        }
      },
    ),

    vscode.commands.registerCommand('codemeow.reloadRc', async () => {
      const rcPath = path.resolve(userRcPath());
      const dirty = vscode.workspace.textDocuments.find(
        (d) => d.isDirty && path.resolve(d.uri.fsPath) === rcPath,
      );
      if (dirty) {
        await dirty.save();
      }
      const config = loadUserRc();
      buildDecorations();
      syncTreeKeys();
      syncChordKeys();
      syncHostKeys();
      syncRcChanged();
      const problems =
        config.errors.length === 0
          ? ''
          : `, ${config.errors.length} problem(s)`;
      void vscode.window.showInformationMessage(
        `Reloaded ~/${Rc.FILE_NAME}: ${config.normal.size} normal map(s), ${config.motion.size} motion map(s), ` +
          `${config.chords.size} chord(s), ${config.hosts.size} host key(s), ${config.resizes.size} resize key(s), ` +
          `${config.keypad.size} keypad map(s), ` +
          `${config.keypadDesc.size} description(s)${problems}`,
      );
    }),

    vscode.commands.registerCommand('codemeow.editRc', async () => {
      const rcPath = userRcPath();
      if (!fs.existsSync(rcPath)) {
        const bundled = path.join(context.extensionPath, Rc.FILE_NAME);
        if (fs.existsSync(bundled)) {
          fs.copyFileSync(bundled, rcPath);
        } else {
          fs.writeFileSync(
            rcPath,
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
      const doc = await vscode.workspace.openTextDocument(rcPath);
      await vscode.window.showTextDocument(doc);
    }),

    vscode.commands.registerCommand('codemeow.commandIds', showCommandIds),

    vscode.commands.registerCommand('codemeow.cheatsheet', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const state = stateFor(editor);
      if (!state) return;
      const ctx = makeCtx(editor, state);
      ctx.ui.info('Meow Cheatsheet', CHEATSHEET);
    }),

    { dispose: closeWhichKeyMenu },

    vscode.workspace.registerTextDocumentContentProvider('codemeow', {
      onDidChange: infoEmitter.event,
      provideTextDocumentContent: () => infoBody,
    }),

    vscode.window.onDidChangeActiveTextEditor((editor) => {
      dropHiddenAvySessions();
      if (!editor) {
        statusBar.hide();
        clearActiveContext();
        return;
      }
      const state = stateFor(editor);
      if (state) applyMode(editor, state);
      else {
        statusBar.hide();
        clearActiveContext();
      }
    }),

    vscode.workspace.onDidCloseTextDocument((doc) => {
      const state = states.get(doc.uri.toString());
      if (state) dropAvySession(state);
      states.delete(doc.uri.toString());
    }),
  );

  const active = vscode.window.activeTextEditor;
  if (active) {
    const state = stateFor(active);
    if (state) applyMode(active, state);
  }
}

async function showCommandIds(): Promise<void> {
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
  const picker = vscode.window.createQuickPick();
  picker.title = 'command ids';
  picker.placeholder =
    'command id for <action>(...) rc mappings — Enter copies it to the clipboard';
  picker.items = ids.map((id) => ({ label: id }));
  picker.buttons = [recordButton, logButton];
  picker.onDidTriggerButton((b) => {
    picker.hide();
    if (b === recordButton) {
      void vscode.commands
        .executeCommand('workbench.action.openGlobalKeybindings')
        .then(() =>
          vscode.commands.executeCommand('keybindings.editor.recordSearchKeys'),
        );
    } else {
      void vscode.commands.executeCommand(
        'workbench.action.toggleKeybindingsLog',
      );
    }
  });
  picker.onDidAccept(async () => {
    const picked = picker.activeItems[0]?.label;
    picker.hide();
    if (picked !== undefined) {
      await vscode.env.clipboard.writeText(picked);
      void vscode.window.setStatusBarMessage(
        `meow: copied ${picked}`,
        STATUS_MESSAGE_MS,
      );
    }
  });
  picker.onDidHide(() => picker.dispose());
  picker.show();
}

function dropAvySession(state: MeowState): void {
  const session = state.avy;
  if (session) {
    if (session.timer != null) clearTimeout(session.timer);
    state.avy = null;
  }
}

function dropHiddenAvySessions(): void {
  const visible = new Set(
    vscode.window.visibleTextEditors.map((e) => e.document.uri.toString()),
  );
  for (const [uri, state] of states) {
    if (state.avy && !visible.has(uri)) dropAvySession(state);
  }
}

export function deactivate(): void {
  sweepHintTimer();
  if (whichKeyTimer !== undefined) clearTimeout(whichKeyTimer);
  if (whichKeyCloseTimer !== undefined) clearTimeout(whichKeyCloseTimer);
  for (const state of states.values()) dropAvySession(state);
  states.clear();
}
