/**
 * get_page_map — Read-Only. Retrieve the pagination map as JSON. Mirrors Go's
 * tools/get_page_map.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { getCachedFdx, pushCacheWarning, textResult, errResult } from "./shared.ts";
import { buildPageMap } from "./breakdown.ts";

export const getPageMapTool: FdxTool = {
  name: "get_page_map",
  description:
    "Read-Only. Retrieve the pagination map as JSON: each page number and the 0-based paragraph index range on it, derived from SceneProperties page values. Check this before edit_par inserts to see whether it would split content across a page boundary.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
    },
    required: ["path"],
  },
};

export async function handleGetPageMap(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = args?.path as string | undefined;
  if (!path) return errResult("path is required");

  let doc, warning;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const pageMap = buildPageMap(doc);
  return pushCacheWarning(textResult(JSON.stringify(pageMap)), warning);
}
