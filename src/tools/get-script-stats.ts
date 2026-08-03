// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_script_stats — Read-Only. Retrieve high-level document metrics as JSON. Mirrors Go's
 * tools/get_script_stats.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, getCachedFdx, pushCacheWarning, textResult, errResult } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { buildScriptStats } from "./breakdown.ts";

export const getScriptStatsTool: FdxTool = {
  name: "get_script_stats",
  description:
    'Read-Only. Retrieve high-level document metrics as JSON: total pages, scene count, act break count, total paragraph count, a per-paragraph-type breakdown, document integrity counts (adornmentStyleCount, winVoiceCount, totalTextRuns, curlyQuoteCount, flaggedWordCount — flaggedWordCount is the AdornmentStyle="-1" subset of adornmentStyleCount, Final Draft\'s proofing flag covering spelling and grammar both; see get_flagged_words to list them individually), and placeholderCount (whole-bracket paragraphs like "[FIX - ...]", counted regardless of paragraph type). Pass excludePlaceholders=true to exclude them from paragraphCount/byType/sceneCount/actBreakCount so a baseline is recoverable without deleting anything; totalPages is unaffected either way. Call this first for a quick overview before deeper inspection, or to confirm nothing was altered by a sweep (compare these counts before/after).',
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      excludePlaceholders: {
        type: "boolean",
        description:
          'when true, exclude whole-bracket placeholder paragraphs (e.g. "[FIX - ...]") from paragraphCount, byType, sceneCount, and actBreakCount — placeholderCount is still reported either way',
      },
    },
    required: ["path"],
  },
};

export async function handleGetScriptStats(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");
  const excludePlaceholders = Boolean(args?.excludePlaceholders);

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const stats = buildScriptStats(doc, { excludePlaceholders });
  return pushCacheWarning(textResult(JSON.stringify(stats)), warning);
}

