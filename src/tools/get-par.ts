// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_par — retrieves a single top-level body paragraph by id from a loaded screenplay, returning
 * its plain text content (styling stripped). Mirrors Go's tools/get_par.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, pushWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, paragraphText } from "../fdx/paragraph.ts";
import { duplicateIdWarning } from "../fdx/duplicate-ids.ts";

export const getParTool: FdxTool = {
  name: "get_par",
  description: "Read-Only. Retrieve a paragraph by id.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      id: { type: "string", description: "id is the paragraph id to retrieve" },
    },
    required: ["path", "id"],
  },
};

export async function handleGetPar(args: Record<string, unknown> | undefined): Promise<ToolResult> {
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

  const paragraphs = doc.getParagraphElements();
  const matches = paragraphs.filter((p) => getParagraphId(p) === id);
  if (matches.length === 0) return errResult(`paragraph id not found: ${id}`);
  const para = matches[0]!;

  const result = pushWarning(textResult(paragraphText(para)), duplicateIdWarning(matches.length));
  return pushCacheWarning(result, warning);
}

