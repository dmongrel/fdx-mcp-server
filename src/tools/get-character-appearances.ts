// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_character_appearances — Read-Only. Retrieve per-scene appearance counts for one or all
 * characters, as JSON. Mirrors Go's tools/get_character_appearances.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, getCachedFdx, pushCacheWarning, pushWarning, textResult, errResult, skippedNestedWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { buildCharacterAppearances, rankCharacters } from "./breakdown.ts";
import { countNestedParagraphs } from "../fdx/paragraph.ts";

export const getCharacterAppearancesTool: FdxTool = {
  name: "get_character_appearances",
  description:
    "Read-Only. Retrieve, as JSON, each character's scene-by-scene appearance counts (Character/Parenthetical/Dialogue paragraphs attributed to that speaker). Pass character to filter to one name (case-insensitive); omit for every character sorted by total count descending. Scoped to top-level body paragraphs — a warning is prepended reporting how many nested inside a DualDialogue block were not scanned when the document contains any; speaker attribution around a DualDialogue interruption may also be inaccurate.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      character: {
        type: "string",
        description: "optional character name to filter (case-insensitive); when omitted, returns every character",
      },
    },
    required: ["path"],
  },
};

export async function handleGetCharacterAppearances(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const appearances = buildCharacterAppearances(doc);
  const ranked = rankCharacters(appearances);
  const skippedWarning = skippedNestedWarning(countNestedParagraphs(doc.getParagraphElements()));

  const want = ((arg<string>(args, "character")) ?? "").trim();
  if (want !== "") {
    const hit = ranked.find((r) => r.name.toLowerCase() === want.toLowerCase());
    if (!hit) {
      let notFoundResult = textResult(`no appearances found for character: ${want}`);
      notFoundResult = pushWarning(notFoundResult, skippedWarning);
      return pushCacheWarning(notFoundResult, warning);
    }
    const entry = { character: hit.name, total: hit.total, appearances: appearances.get(hit.name) ?? [] };
    let oneResult = textResult(JSON.stringify(entry));
    oneResult = pushWarning(oneResult, skippedWarning);
    return pushCacheWarning(oneResult, warning);
  }

  const ordered = ranked.map((r) => ({
    character: r.name,
    total: r.total,
    appearances: appearances.get(r.name) ?? [],
  }));
  let allResult = textResult(JSON.stringify(ordered));
  allResult = pushWarning(allResult, skippedWarning);
  return pushCacheWarning(allResult, warning);
}

