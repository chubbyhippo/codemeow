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

import { labelsFor, labelsMatching } from './avy';

export enum Plan {
  NONE = 'none',
  LABELS = 'labels',
}

export function plan(targetCount: number): Plan {
  return targetCount <= 0 ? Plan.NONE : Plan.LABELS;
}

export function labels(targetCount: number): string[] {
  return labelsFor(targetCount);
}

export function matches(labelList: string[], input: string): string[] {
  return labelsMatching(labelList, input);
}
