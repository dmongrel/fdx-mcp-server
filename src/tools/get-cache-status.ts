// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_cache_status — reports the document cache's capacity and current contents (path + dirty
 * flag per entry, most-recently-used first). Read-only, no parameters.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { textResult } from "./shared.ts";
import { documentCache, MAX_DOCUMENT_CACHE_SIZE } from "../fdx/cache.ts";

export const getCacheStatusTool: FdxTool = {
  name: "get_cache_status",
  description:
    "Read-Only. Retrieve the server's document cache contents: capacity (currently 4 slots), the number of documents currently cached, and each cached document's path, dirty flag (true if it has unsaved edits from an edit_* tool since it was last loaded or saved), listed most-recently-used first. With only 4 slots shared across every open document, check this before loading another file to see what is cached and whether anything dirty is at risk of being silently evicted (the least-recently-used slot) — evict deliberately with close_fdx, or save first with save_fdx.",
  inputSchema: { type: "object", properties: {} },
};

export function handleGetCacheStatus(): ToolResult {
  const entries = documentCache.entries();
  const status = {
    capacity: MAX_DOCUMENT_CACHE_SIZE,
    count: entries.length,
    entries,
  };
  return textResult(JSON.stringify(status));
}

