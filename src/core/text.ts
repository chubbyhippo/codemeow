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

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function escapeRegExp(pattern: string): string {
  return pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function lineOfOffset(text: string, offset: number): number {
  let line = 0;
  const end = clamp(offset, 0, text.length);
  for (let i = 0; i < end; i++) if (text.charAt(i) === '\n') line++;
  return line;
}

export function lineCount(text: string): number {
  let lines = 1;
  for (let i = 0; i < text.length; i++) if (text.charAt(i) === '\n') lines++;
  return lines;
}

export function lineStart(text: string, line: number): number {
  if (line <= 0) return 0;
  let newlinesSeen = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charAt(i) === '\n' && ++newlinesSeen === line) return i + 1;
  }
  return text.length;
}

export function lineEnd(text: string, line: number): number {
  const start = lineStart(text, line);
  const newline = text.indexOf('\n', start);
  if (newline < 0) return text.length;
  return newline > start && text.charAt(newline - 1) === '\r'
    ? newline - 1
    : newline;
}

export function isBlankLine(text: string, line: number): boolean {
  return text.slice(lineStart(text, line), lineEnd(text, line)).trim() === '';
}

function isWordChar(char: string): boolean {
  return /[\p{L}\p{N}]/u.test(char);
}

export function isSymbolChar(char: string): boolean {
  return isWordChar(char) || char === '_' || char === '$';
}

export function charPred(symbol: boolean): (char: string) => boolean {
  return symbol ? isSymbolChar : isWordChar;
}

function indexOfChar(text: string, char: string, from: number): number {
  for (let i = Math.max(from, 0); i < text.length; i++)
    if (text.charAt(i) === char) return i;
  return -1;
}

function lastIndexOfChar(text: string, char: string, from: number): number {
  for (let i = Math.min(from, text.length - 1); i >= 0; i--)
    if (text.charAt(i) === char) return i;
  return -1;
}

export function nthCharTarget(
  text: string,
  char: string,
  caret: number,
  count: number,
  backward: boolean,
  till: boolean,
): number {
  let found = -1;
  let from = backward
    ? till
      ? caret - 2
      : caret - 1
    : till
      ? caret + 1
      : caret;
  for (let remaining = 0; remaining < count; remaining++) {
    found = backward
      ? lastIndexOfChar(text, char, from)
      : indexOfChar(text, char, from);
    if (found < 0) return -1;
    from = backward ? found - 1 : found + 1;
  }
  if (found < 0) return -1;
  if (backward) return till ? found + 1 : found;
  return till ? found : found + 1;
}

export const SENTENCE_ENDERS = '.!?';

export function nextSentenceEnd(
  text: string,
  from: number,
  count: number,
): number {
  let offset = clamp(from, 0, text.length);
  for (let sentence = 0; sentence < count; sentence++) {
    while (
      offset < text.length &&
      !SENTENCE_ENDERS.includes(text.charAt(offset))
    )
      offset++;
    while (
      offset < text.length &&
      SENTENCE_ENDERS.includes(text.charAt(offset))
    )
      offset++;
    while (offset < text.length && /\s/.test(text.charAt(offset))) offset++;
  }
  return offset;
}

export function prevSentenceStart(
  text: string,
  from: number,
  count: number,
): number {
  const isGap = (char: string) =>
    /\s/.test(char) || SENTENCE_ENDERS.includes(char);
  let offset = clamp(from, 0, text.length);
  for (let sentence = 0; sentence < count; sentence++) {
    while (offset > 0 && isGap(text.charAt(offset - 1))) offset--;
    while (offset > 0 && !isGap(text.charAt(offset - 1))) offset--;
  }
  return offset;
}

function lineStartAt(text: string, offset: number): number {
  let start = offset;
  while (start > 0 && text.charAt(start - 1) !== '\n') start--;
  return start;
}

function followingLineStart(text: string, lineStartOffset: number): number {
  let offset = lineStartOffset;
  while (offset < text.length && text.charAt(offset) !== '\n') offset++;
  return offset < text.length ? offset + 1 : offset;
}

function blankLineAt(text: string, lineStartOffset: number): boolean {
  let offset = lineStartOffset;
  while (offset < text.length && text.charAt(offset) !== '\n') {
    if (!/\s/.test(text.charAt(offset))) return false;
    offset++;
  }
  return true;
}

export function nextParagraphEnd(
  text: string,
  from: number,
  count: number,
): number {
  let pos = clamp(from, 0, text.length);
  for (let paragraph = 0; paragraph < count; paragraph++) {
    let offset = lineStartAt(text, pos);
    while (offset < text.length && blankLineAt(text, offset))
      offset = followingLineStart(text, offset);
    while (offset < text.length && !blankLineAt(text, offset))
      offset = followingLineStart(text, offset);
    pos = offset;
  }
  return pos;
}

export function prevParagraphStart(
  text: string,
  from: number,
  count: number,
): number {
  let pos = clamp(from, 0, text.length);
  for (let paragraph = 0; paragraph < count; paragraph++) {
    if (pos > 0) {
      const start = paragraphStartBefore(text, pos);
      pos = start < pos ? start : paragraphStartBefore(text, start - 1);
    }
  }
  return pos;
}

function paragraphStartBefore(text: string, offset: number): number {
  let start = lineStartAt(text, offset);
  while (start > 0 && blankLineAt(text, start))
    start = lineStartAt(text, start - 1);
  while (start > 0 && !blankLineAt(text, lineStartAt(text, start - 1)))
    start = lineStartAt(text, start - 1);
  const prevLineEmpty =
    start > 0 &&
    text.charAt(start - 1) === '\n' &&
    (start === 1 || text.charAt(start - 2) === '\n');
  return prevLineEmpty ? start - 1 : start;
}

export const Words = {
  nextEnd(
    text: string,
    from: number,
    count: number,
    isWord: (char: string) => boolean,
  ): number {
    let offset = clamp(from, 0, text.length);
    for (let word = 0; word < count; word++) {
      while (offset < text.length && !isWord(text.charAt(offset))) offset++;
      while (offset < text.length && isWord(text.charAt(offset))) offset++;
    }
    return offset;
  },

  prevStart(
    text: string,
    from: number,
    count: number,
    isWord: (char: string) => boolean,
  ): number {
    let offset = clamp(from, 0, text.length);
    for (let word = 0; word < count; word++) {
      while (offset > 0 && !isWord(text.charAt(offset - 1))) offset--;
      while (offset > 0 && isWord(text.charAt(offset - 1))) offset--;
    }
    return offset;
  },

  fixSelectionMark(
    text: string,
    pos: number,
    mark: number,
    isWord: (char: string) => boolean,
  ): number {
    const probe = clamp(
      mark > pos ? pos : pos - 1,
      0,
      Math.max(text.length - 1, 0),
    );
    const bounds = Words.boundsAt(text, probe, isWord);
    if (!bounds) return mark;
    return mark > pos ? Math.min(mark, bounds[1]) : Math.max(mark, bounds[0]);
  },

  boundsAt(
    text: string,
    offset: number,
    isWord: (char: string) => boolean,
  ): [number, number] | null {
    const inWord = offsetInWord(text, offset, isWord);
    if (inWord === null) return null;
    let start = inWord;
    let end = inWord;
    while (start > 0 && isWord(text.charAt(start - 1))) start--;
    while (end < text.length && isWord(text.charAt(end))) end++;
    return [start, end];
  },
};

function offsetInWord(
  text: string,
  offset: number,
  isWord: (char: string) => boolean,
): number | null {
  if (offset < text.length && isWord(text.charAt(offset))) return offset;
  if (offset > 0 && isWord(text.charAt(offset - 1))) return offset - 1;
  let scan = offset;
  while (scan < text.length && !isWord(text.charAt(scan))) scan++;
  return scan < text.length ? scan : null;
}

export const isBlank = (char: string): boolean => char === ' ' || char === '\t';
