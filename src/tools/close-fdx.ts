/**
 * close_fdx — deliberately evicts a document from the cache, freeing a slot. Refuses to discard
 * unsaved edits unless force=true is passed. Mirrors Go's tools/close_fdx.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";

export const closeFdxTool: FdxTool = {
  name: "close_fdx",
  description:
    "Deliberately release a document from the server's 4-slot document cache, freeing a slot for other files instead of waiting for automatic LRU eviction. If the document has unsaved edits (from an edit_* tool, not yet written with save_fdx), this refuses and reports so unless force=true is passed, which discards those edits. Call get_cache_status first to check a document's dirty state. Not an error if the path was not cached — the goal (nothing cached for that path) is already met.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file to remove from the cache" },
      force: {
        type: "boolean",
        description:
          "required to close a document that has unsaved edits; without it, close_fdx refuses rather than silently discarding them",
      },
    },
    required: ["path"],
  },
};

export function handleCloseFdx(args: Record<string, unknown> | undefined): ToolResult {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");
  const force = Boolean(arg<boolean>(args, "force"));

  const { existed, dirty, removed } = documentCache.removeIf(path, force);
  if (!existed) {
    return textResult(`${path} was not cached; nothing to close.`);
  }
  if (!removed) {
    return errResult(
      `refused: ${path} has unsaved edits — call save_fdx first, or pass force=true to close it and discard those edits.`,
    );
  }
  let msg = `Closed ${path} and released its cache slot.`;
  if (dirty) msg += " Unsaved edits were discarded (force=true).";
  return textResult(msg);
}
