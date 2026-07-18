/**
 * get_script_stats — Read-Only. Retrieve high-level document metrics as JSON. Mirrors Go's
 * tools/get_script_stats.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, getCachedFdx, pushCacheWarning, textResult, errResult } from "./shared.ts";
import { buildScriptStats } from "./breakdown.ts";

export const getScriptStatsTool: FdxTool = {
  name: "get_script_stats",
  description:
    "Read-Only. Retrieve high-level document metrics as JSON: total pages, scene count, act break count, total paragraph count, and a per-paragraph-type breakdown. Call this first for a quick overview before deeper inspection.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
    },
    required: ["path"],
  },
};

export async function handleGetScriptStats(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");

  let doc, warning;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const stats = buildScriptStats(doc);
  return pushCacheWarning(textResult(JSON.stringify(stats)), warning);
}
