// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * edit_characters — Add, change, remove, or fix entries in the SmartType Characters list.
 * Mirrors Go's tools/edit_characters.go.
 */

import { makeSmartListEditTool } from "./smart-type-ops.ts";
import { countCharacterReferences } from "./breakdown.ts";
import type { FdxDocument } from "../fdx/document.ts";

/** Warns (does not block) when a name being removed from the Characters list still has Cast or
 * arc-beat rows pointing at it — those are orphaned the moment this removal lands, silently,
 * unless something says so here. */
function crossRefCheck(doc: FdxDocument, name: string, cs: boolean): string {
  const { cast, arcBeats } = countCharacterReferences(doc, name, cs);
  if (cast === 0 && arcBeats === 0) return "";
  return `Warning: ${cast} Cast member(s) and ${arcBeats} arc beat(s) still reference this name.`;
}

const { tool, handler } = makeSmartListEditTool(
  "edit_characters",
  "Add, change, remove, or fix entries in the SmartType Characters list (character names).",
  "Character",
  "Character",
  crossRefCheck,
);

export const editCharactersTool = tool;
export const handleEditCharacters = handler;

