// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * rollback — restores a document to its last savepoint (set explicitly by savepoint, or
 * automatically by batch_edit right before its operations ran), discarding any edits made since.
 * Does not touch disk.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";

export const rollbackTool: FdxTool = {
  name: "rollback",
  description:
    "Restores a document to its last savepoint — set explicitly by savepoint, or automatically by batch_edit right before its operations ran — discarding any edits made since. Errors if no savepoint exists for this path. Does not touch disk; call save_fdx afterward if you want the rollback persisted.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
    },
    required: ["path"],
  },
};

export function handleRollback(args: Record<string, unknown> | undefined): ToolResult {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");

  const result = documentCache.rollback(path);
  if (!result.ok) return errResult(`failed to rollback: ${result.reason}`);
  return textResult(`Rolled back ${path} to its last savepoint. Does not touch disk — call save_fdx if you want this persisted.`);
}
