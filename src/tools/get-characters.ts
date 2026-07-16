/**
 * get_characters — Read-Only. Retrieve the SmartType Characters list (character names known to
 * the document), in document order. Mirrors Go's tools/get_characters.go.
 */

import { makeSmartListGetTool } from "./smart-type-ops.ts";

const { tool, handler } = makeSmartListGetTool(
  "get_characters",
  "Read-Only. Retrieve the SmartType Characters list (character names) as newline-joined entries in document order, or an empty message if none exist.",
  "Character",
  "Character",
);

export const getCharactersTool = tool;
export const handleGetCharacters = handler;
