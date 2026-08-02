// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * savepoint — captures the current in-memory state of a cached document (content and dirty flag)
 * as a single rollback point, overwriting any previous savepoint for this path. Pairs with
 * rollback. Does not touch disk.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";

export const savepointTool: FdxTool = {
  name: "savepoint",
  description:
    "Captures the current in-memory state of a cached document (content and dirty flag) as a single rollback point, overwriting any previous savepoint for this path. Call rollback to restore it. Does not touch disk. One level only — batch_edit takes its own savepoint automatically right before it runs, which overwrites whatever savepoint (if any) was set here.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
    },
    required: ["path"],
  },
};

export function handleSavepoint(args: Record<string, unknown> | undefined): ToolResult {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");

  const result = documentCache.setSavepoint(path);
  if (!result.ok) return errResult(`failed to set savepoint: ${result.reason}; call read_fdx first`);
  return textResult(`Savepoint captured for ${path}. Call rollback to restore this state; does not touch disk.`);
}
