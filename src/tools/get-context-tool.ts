// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_context's tool descriptor, split out from get-context.ts so registry.ts can list it
 * without importing get-context.ts itself — get-context.ts pulls its roster text from
 * context-data.ts, which pulls the full tool list from registry.ts, which would otherwise need
 * get-context.ts back, forming a cycle that crashes on the still-uninitialized export.
 */

import type { FdxTool } from "./shared.ts";

export const baseDescription =
  "Read-Only. Call this tool before processing any file to get the exact formatting rules, constraints, and structural requirements. Returns a list of all available tools with their full descriptions. Calling it also checks for updates to fdx-mcp-server.";

export const getContextTool: FdxTool = {
  name: "get_context",
  description: baseDescription,
  inputSchema: {
    type: "object",
    properties: {},
  },
};
