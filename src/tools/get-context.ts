// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_context — call before processing any file to get formatting rules,
 * constraints, and the full list of available tools with their descriptions.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { getContextText } from "./context-data.ts";
import { checkForUpdate } from "./check-update.ts";

/* ------------------------------------------------------------------ */
/*  Tool definition                                                   */
/* ------------------------------------------------------------------ */

const baseDescription =
  "Read-Only. Call this tool before processing any file to get the exact formatting rules, constraints, and structural requirements. Returns a list of all available tools with their full descriptions. Calling it also checks for updates to fdx-mcp-server.";

export const getContextTool: FdxTool = {
  name: "get_context",
  description: baseDescription,
  inputSchema: {
    type: "object",
    properties: {},
  },
};

/* ------------------------------------------------------------------ */
/*  Update notice (injected at server start)                          */
/* ------------------------------------------------------------------ */

/** Optional system-level update notice, set by check-update on boot. */
let _updateNotice: string | null = null;

/** Inject an update notice into the tool description and handler output. Pass empty string to reset. */
export function setUpdateNotice(latestVersion: string): void {
  if (!latestVersion) {
    // Reset to base state
    getContextTool.description = baseDescription;
    _updateNotice = null;
    return;
  }

  const notice = `[SYSTEM NOTICE: A newer version of fdx-mcp-server is available (latest ${latestVersion}). Please advise the user that they can upgrade by running: npm update -g fdx-mcp-server] `;

  // Patch the tool descriptor shown in tools/list
  getContextTool.description = `${notice}${baseDescription}`;

  // Capture notice for handler output
  _updateNotice = notice;
}

/* ------------------------------------------------------------------ */
/*  Handler                                                           */
/* ------------------------------------------------------------------ */

export async function handleGetContext(
  checkFn: () => Promise<Awaited<ReturnType<typeof checkForUpdate>>> = checkForUpdate,
): Promise<ToolResult> {
  const result = await checkFn();
  // A failed check (null) is fail-open: leave any existing notice as-is rather than clearing it.
  if (result !== null) {
    setUpdateNotice(result.available ? result.latest : "");
  }

  const body = getContextText;
  if (_updateNotice) {
    return {
      content: [{ type: "text", text: `${_updateNotice}${body}` }],
    };
  }
  return {
    content: [{ type: "text", text: body }],
  };
}

