// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * edit_characters — Add, change, remove, or fix entries in the SmartType Characters list.
 * Mirrors Go's tools/edit_characters.go.
 */

import { makeSmartListEditTool } from "./smart-type-ops.ts";

const { tool, handler } = makeSmartListEditTool(
  "edit_characters",
  "Add, change, remove, or fix entries in the SmartType Characters list (character names).",
  "Character",
  "Character",
);

export const editCharactersTool = tool;
export const handleEditCharacters = handler;

