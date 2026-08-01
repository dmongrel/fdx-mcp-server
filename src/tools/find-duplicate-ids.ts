// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * find_duplicate_ids — Read-Only. Reports top-level body paragraphs that share the same id.
 * FinalDraft's copy/paste sometimes duplicates a paragraph's id instead of minting a new one, and
 * every id-addressed tool silently resolves a duplicated id to the first match. See
 * HANDOFF-duplicate-paragraph-ids.md.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { findDuplicateParagraphIds } from "../fdx/duplicate-ids.ts";

export const findDuplicateIdsTool: FdxTool = {
  name: "find_duplicate_ids",
  description:
    "Read-Only. Detects top-level body paragraphs that share the same id — a silent-corruption gap where FinalDraft's copy/paste duplicates a paragraph's id instead of minting a new one. Every id-addressed tool (get_par, edit_par, edit_scene_arc_beats, get_section_par_list) resolves a duplicated id to its first match, so a caller addressing a later paragraph with that id edits the wrong one. Call fix_duplicate_ids to repair what this finds.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
    },
    required: ["path"],
  },
};

export async function handleFindDuplicateIds(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const groups = findDuplicateParagraphIds(doc);
  const msg =
    groups.length === 0
      ? "No duplicate paragraph ids found."
      : JSON.stringify(groups, null, 2);

  return pushCacheWarning(textResult(msg), warning);
}
