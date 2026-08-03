// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * search_actions' tool descriptor, split out from search-actions.ts for the same reason as
 * get-context-tool.ts: registry.ts needs the descriptor without pulling in search-actions.ts's
 * own dependency on context-data.ts (which depends on registry.ts), which would cycle.
 */

import type { FdxTool } from "./shared.ts";

export const searchActionsTool: FdxTool = {
  name: "search_actions",
  description:
    "List all available MCP tools and their names — useful for discovering what operations are supported without needing an fdx file loaded.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query (currently unused; reserved for future filtering).",
      },
    },
  },
};
