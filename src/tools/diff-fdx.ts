// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * diff_fdx — Read-Only. Diffs two .fdx documents' top-level body paragraphs by id: which were
 * added, removed, or modified (type and/or text changed) going from pathA to pathB. Ids are stable
 * UUIDs preserved across edits and saves (including versioned ones), so id-based matching answers
 * "which paragraphs changed" for the exact workflow that motivated this — confirming what a
 * versioned save actually changed, not just how many paragraphs moved.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import { getParagraphId, getParagraphType, paragraphText } from "../fdx/paragraph.ts";

export const diffFdxTool: FdxTool = {
  name: "diff_fdx",
  description:
    "Read-Only. Diffs two .fdx documents' top-level body paragraphs by id: added (in pathB, not pathA), removed (in pathA, not pathB), and modified (present in both but type and/or text differs, reported as before/after). Everything else is folded into unchangedCount. Scoped to type+text only — not run-level styling, and not reordering (a paragraph that only moved position is unchanged). Loads both paths the same way any tool loads one (auto-loads on a cache miss).",
  inputSchema: {
    type: "object",
    properties: {
      pathA: { type: "string", description: "the baseline .fdx file" },
      pathB: { type: "string", description: "the .fdx file to compare against pathA" },
    },
    required: ["pathA", "pathB"],
  },
};

interface DiffParagraph {
  id: string;
  type: string;
  text: string;
}

export async function handleDiffFdx(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const pathA = arg<string>(args, "pathA");
  const pathB = arg<string>(args, "pathB");
  if (!pathA) return errResult("pathA is required");
  if (!pathB) return errResult("pathB is required");

  let warningA: string;
  let warningB: string;
  let mapA: Map<string, DiffParagraph>;
  let mapB: Map<string, DiffParagraph>;
  try {
    const loadedA = await getCachedFdx(pathA);
    warningA = loadedA.warning;
    mapA = new Map(
      loadedA.doc.getParagraphElements().map((p) => {
        const id = getParagraphId(p);
        return [id, { id, type: getParagraphType(p), text: paragraphText(p) }];
      }),
    );

    const loadedB = await getCachedFdx(pathB);
    warningB = loadedB.warning;
    mapB = new Map(
      loadedB.doc.getParagraphElements().map((p) => {
        const id = getParagraphId(p);
        return [id, { id, type: getParagraphType(p), text: paragraphText(p) }];
      }),
    );
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const added: DiffParagraph[] = [];
  const removed: DiffParagraph[] = [];
  const modified: Array<{ id: string; before: { type: string; text: string }; after: { type: string; text: string } }> = [];
  let unchangedCount = 0;

  for (const [id, a] of mapA) {
    const b = mapB.get(id);
    if (!b) {
      removed.push(a);
      continue;
    }
    if (a.type !== b.type || a.text !== b.text) {
      modified.push({ id, before: { type: a.type, text: a.text }, after: { type: b.type, text: b.text } });
    } else {
      unchangedCount++;
    }
  }
  for (const [id, b] of mapB) {
    if (!mapA.has(id)) added.push(b);
  }

  const body = {
    pathA,
    pathB,
    added,
    removed,
    modified,
    unchangedCount,
    message: `${added.length} added, ${removed.length} removed, ${modified.length} modified, ${unchangedCount} unchanged.`,
  };

  return pushCacheWarning(pushCacheWarning(textResult(JSON.stringify(body, null, 2)), warningB), warningA);
}
