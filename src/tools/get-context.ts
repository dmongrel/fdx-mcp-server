/**
 * get_context — call before processing any file to get formatting rules,
 * constraints, and the full list of available tools with their descriptions.
 */

import { getContextText } from "./context-data.ts";

export interface FdxTool {
  name: string;
  description: string;
  inputSchema: object;
}

export const getContextTool: FdxTool = {
  name: "get_context",
  description:
    "Read-Only. Call this tool before processing any file to get the exact formatting rules, constraints, and structural requirements. Returns a list of all available tools with their full descriptions.",
  inputSchema: {
    type: "object",
    properties: {},
  },
};

export function handleGetContext() {
  return {
    content: [{ type: "text" as const, text: getContextText }],
  };
}
