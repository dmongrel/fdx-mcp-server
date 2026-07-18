/**
 * search_actions — list all available MCP tools; useful for discovering
 * what operations are supported without needing an fdx file loaded.
 * The `query` argument is accepted for future filtering but is not yet used,
 * matching the Go implementation.
 */

import type { FdxTool } from "./shared.ts";
import { searchActionsText } from "./context-data.ts";

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

export function handleSearchActions(): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: searchActionsText }],
  };
}
