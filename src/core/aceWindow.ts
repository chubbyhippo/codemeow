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

export const LABEL_THRESHOLD = 2;

export enum Plan {
  None = 'none',
  Other = 'other',
  Labels = 'labels',
}

export function plan(windowCount: number): Plan {
  if (windowCount <= 1) return Plan.None;
  if (windowCount <= LABEL_THRESHOLD) return Plan.Other;
  return Plan.Labels;
}

export function ordered<T>(
  candidates: { item: T; x: number; y: number }[],
): T[] {
  return [...candidates]
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .map((c) => c.item);
}
