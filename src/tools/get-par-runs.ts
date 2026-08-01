// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_par_runs — retrieves a single top-level body paragraph by id from a loaded screenplay,
 * returning its <Text> runs with full attribute sets (AdornmentStyle, Font, Color, Size,
 * RevisionID, ...) intact. Unlike get_par (which flattens runs into plain text), this is the
 * read half of the round-trip needed to edit a styled paragraph without losing its styling.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, getParagraphType, getParagraphRuns } from "../fdx/paragraph.ts";

export const getParRunsTool: FdxTool = {
  name: "get_par_runs",
  description:
    "Read-Only. Retrieve a paragraph's <Text> runs by id, with each run's full attribute set (AdornmentStyle, Font, Color, Size, RevisionID, etc.) preserved — unlike get_par, which returns flattened plain text and discards run boundaries and attributes. Use this before edit_par when a paragraph may contain styled runs, so the attrs can be passed back unchanged.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      id: { type: "string", description: "id is the paragraph id to retrieve" },
    },
    required: ["path", "id"],
  },
};

export async function handleGetParRuns(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  const id = arg<string>(args, "id");
  if (!path) return errResult("path is required");
  if (!id) return errResult("id is required");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const para = doc.getParagraphElements().find((p) => getParagraphId(p) === id);
  if (!para) return errResult(`paragraph id not found: ${id}`);

  const body = {
    id: getParagraphId(para),
    type: getParagraphType(para),
    runs: getParagraphRuns(para),
  };

  return pushCacheWarning(textResult(JSON.stringify(body, null, 2)), warning);
}
