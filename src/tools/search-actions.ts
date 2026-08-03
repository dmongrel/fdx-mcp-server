// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * search_actions — list all available MCP tools; useful for discovering
 * what operations are supported without needing an fdx file loaded.
 * The `query` argument is accepted for future filtering but is not yet used,
 * matching the Go implementation.
 */

import { searchActionsText } from "./context-data.ts";
import { searchActionsTool } from "./search-actions-tool.ts";

export { searchActionsTool };

export function handleSearchActions(): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: searchActionsText }],
  };
}

