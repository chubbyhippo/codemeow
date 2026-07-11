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

import * as vscode from 'vscode';
import { ClipboardPort, EditorPort, SelRange, TextEdit } from '../core/port';
import { isWritableScheme } from '../core/attachPolicy';

export class VscEditorPort implements EditorPort {
  constructor(private readonly editor: vscode.TextEditor) {}

  private get doc(): vscode.TextDocument {
    return this.editor.document;
  }

  getText(): string {
    return this.doc.getText();
  }

  getSelections(): SelRange[] {
    return this.editor.selections.map((s) => ({
      anchor: this.doc.offsetAt(s.anchor),
      active: this.doc.offsetAt(s.active),
    }));
  }

  setSelections(sels: SelRange[]): void {
    this.editor.selections = sels.map(
      (s) =>
        new vscode.Selection(
          this.doc.positionAt(s.anchor),
          this.doc.positionAt(s.active),
        ),
    );
    const caret = this.doc.positionAt(sels[0].active);
    this.editor.revealRange(
      new vscode.Range(caret, caret),
      vscode.TextEditorRevealType.Default,
    );
  }

  async edit(edits: TextEdit[]): Promise<void> {
    await this.editor.edit(
      (builder) => {
        for (const e of edits) {
          const range = new vscode.Range(
            this.doc.positionAt(e.start),
            this.doc.positionAt(e.end),
          );
          if (e.start === e.end) builder.insert(range.start, e.text);
          else if (e.text === '') builder.delete(range);
          else builder.replace(range, e.text);
        }
      },
      { undoStopBefore: true, undoStopAfter: true },
    );
  }

  isWritable(): boolean {
    return isWritableScheme(this.doc.uri.scheme);
  }

  visibleLineRange(): { first: number; last: number } | null {
    const v = this.editor.visibleRanges[0];
    return v ? { first: v.start.line, last: v.end.line } : null;
  }

  async undo(): Promise<void> {
    await vscode.commands.executeCommand('undo');
  }

  async closeEditor(): Promise<void> {
    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }

  async symbolRangeAt(
    offset: number,
  ): Promise<{ start: number; end: number } | null> {
    try {
      const symbols = await vscode.commands.executeCommand<
        vscode.DocumentSymbol[]
      >('vscode.executeDocumentSymbolProvider', this.doc.uri);
      if (!symbols) return null;
      const pos = this.doc.positionAt(offset);
      const fnKinds = new Set([
        vscode.SymbolKind.Function,
        vscode.SymbolKind.Method,
        vscode.SymbolKind.Constructor,
      ]);
      let best: vscode.DocumentSymbol | null = null;
      const walk = (list: vscode.DocumentSymbol[]) => {
        for (const s of list) {
          if (s.range.contains(pos)) {
            if (fnKinds.has(s.kind)) best = s;
            walk(s.children);
          }
        }
      };
      walk(symbols);
      if (!best) return null;
      const range = (best as vscode.DocumentSymbol).range;
      return {
        start: this.doc.offsetAt(range.start),
        end: this.doc.offsetAt(range.end),
      };
    } catch {
      return null;
    }
  }
}

export class VscClipboard implements ClipboardPort {
  async read(): Promise<string | undefined> {
    const t = await vscode.env.clipboard.readText();
    return t === '' ? undefined : t;
  }

  async write(text: string): Promise<void> {
    await vscode.env.clipboard.writeText(text);
  }
}
