// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * edit_smarttype_characters — Add, change, remove, or fix entries in the SmartType Characters
 * list. Mirrors Go's tools/edit_characters.go.
 */

import { makeSmartListEditTool } from "./smart-type-ops.ts";
import { countCharacterReferences } from "./breakdown.ts";
import type { FdxDocument } from "../fdx/document.ts";

/** Warns (does not block) when a name being removed from the Characters list still has Cast or
 * arc-beat rows pointing at it — those are orphaned the moment this removal lands, silently,
 * unless something says so here. */
function crossRefCheck(doc: FdxDocument, name: string, cs: boolean): string {
  const { cast, arcBeats, highlighting, cueParagraphsExact, cueParagraphsSubstringOnly } = countCharacterReferences(doc, name, cs);
  if (cast === 0 && arcBeats === 0 && highlighting === 0 && cueParagraphsExact === 0 && cueParagraphsSubstringOnly === 0) {
    return "";
  }
  const substringClause =
    cueParagraphsSubstringOnly > 0
      ? ` (plus ${cueParagraphsSubstringOnly} more containing the name as part of a longer cue, e.g. with an extension)`
      : "";
  return `Warning: ${cast} Cast member(s), ${arcBeats} arc beat(s), ${highlighting} CharacterHighlighting entry(ies), and ${cueParagraphsExact} cue paragraph(s)${substringClause} still reference this name.`;
}

const { tool, handler } = makeSmartListEditTool(
  "edit_smarttype_characters",
  "Add, change, remove, or fix entries in the SmartType Characters list (character names).",
  "Character",
  "Character",
  crossRefCheck,
);

export const editSmarttypeCharactersTool = tool;
export const handleEditSmarttypeCharacters = handler;
