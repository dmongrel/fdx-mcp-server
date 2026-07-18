/**
 * get_par — retrieves a single top-level body paragraph by id from a loaded screenplay, returning
 * its plain text content (styling stripped). Mirrors Go's tools/get_par.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import { getParagraphId, paragraphText } from "../fdx/paragraph.ts";

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

  let doc, warning;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const para = doc.getParagraphElements().find((p) => getParagraphId(p) === id);
  if (!para) return errResult(`paragraph id not found: ${id}`);

  return pushCacheWarning(textResult(paragraphText(para)), warning);
}
