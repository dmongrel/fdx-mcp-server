// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * Small shared helpers for identifiers and timestamps in the shape FinalDraft expects.
 */

/** Generates a random v4 UUID (8-4-4-4-12 lowercase hex), matching FinalDraft's paragraph id format. */
export function generateUuid(): string {
  return crypto.randomUUID();
}

/** Formats a Date the way FinalDraft stamps DocumentRef DateTime attributes: YYYYMMDDThhmmss. */
export function fdxDateTimeNow(date: Date = new Date()): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  const y = date.getFullYear();
  const mo = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const mi = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `${y}${mo}${d}T${h}${mi}${s}`;
}

