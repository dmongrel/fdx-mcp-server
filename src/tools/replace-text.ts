// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * replace_text — run-preserving find/replace across a loaded screenplay's paragraph text.
 * Substitutes inside each <Text> run's own content, leaving run boundaries and every run
 * attribute (AdornmentStyle, Font, Color, Size, RevisionID, ...) untouched. A match that only
 * exists when spanning two runs is left alone and reported as skipped rather than merged.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { findChildren, textContent, setTextContent } from "../fdx/xml.ts";
import { getParagraphId, getParagraphType, paragraphText } from "../fdx/paragraph.ts";
import { findSectionIndex, findSectionEnd } from "../fdx/sections.ts";

export const replaceTextTool: FdxTool = {
  name: "replace_text",
  description:
    "Find and replace text across paragraphs in a loaded screenplay, substituting inside each <Text> run's own content so run boundaries and every run attribute (AdornmentStyle, Font, Color, Size, RevisionID, ...) are preserved. A match that only exists by spanning two runs is left unreplaced and reported as skipped. Optionally scope to a section (id) and/or a paragraph type (parType). After editing, call save_fdx to persist changes to disk.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      find: { type: "string", description: "the text to search for" },
      replace: { type: "string", description: "the text to replace matches with" },
      parType: { type: "string", description: "restrict replacement to paragraphs of this type" },
      id: {
        type: "string",
        description: "id is the scene id (the id of the Scene Heading paragraph) to scope the replacement to",
      },
      caseSensitive: { type: "boolean", description: "whether matching should be case-sensitive" },
    },
    required: ["path", "find", "replace"],
  },
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Counts non-overlapping occurrences of `needle` in `haystack`. */
function countOccurrences(haystack: string, needle: string, caseSensitive: boolean): number {
  if (needle === "") return 0;
  const h = caseSensitive ? haystack : haystack.toLowerCase();
  const n = caseSensitive ? needle : needle.toLowerCase();
  let count = 0;
  let idx = 0;
  for (;;) {
    const found = h.indexOf(n, idx);
    if (found === -1) break;
    count++;
    idx = found + n.length;
  }
  return count;
}

function replaceAllOccurrences(haystack: string, find: string, replace: string, caseSensitive: boolean): string {
  if (caseSensitive) return haystack.split(find).join(replace);
  return haystack.replace(new RegExp(escapeRegExp(find), "gi"), replace);
}

export async function handleReplaceText(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  const find = arg<string>(args, "find");
  const replace = arg<string>(args, "replace");
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");
  if (!find) return errResult("find is required");
  if (replace === undefined) return errResult("replace is required");

  const parType = arg<string>(args, "parType");
  const sceneId = arg<string>(args, "id");
  const caseSensitive = Boolean(args?.caseSensitive);

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const paragraphs = doc.getParagraphElements();
  let startIndex = 0;
  let endIndex = paragraphs.length;

  if (sceneId) {
    const idx = findSectionIndex(paragraphs, sceneId);
    if (idx === -1) return errResult(`section id not found: ${sceneId}`);
    startIndex = idx;
    endIndex = findSectionEnd(paragraphs, idx);
  }

  let totalReplaced = 0;
  const skipped: Array<{ id: string; count: number }> = [];
  let touched = false;

  for (let i = startIndex; i < endIndex; i++) {
    const para = paragraphs[i]!;
    if (parType && getParagraphType(para) !== parType) continue;

    const naiveTotal = countOccurrences(paragraphText(para), find, caseSensitive);
    if (naiveTotal === 0) continue;

    let perRunReplaced = 0;
    for (const run of findChildren(para, "Text")) {
      const content = textContent(run);
      const count = countOccurrences(content, find, caseSensitive);
      if (count === 0) continue;
      setTextContent(run, replaceAllOccurrences(content, find, replace, caseSensitive));
      perRunReplaced += count;
    }

    if (perRunReplaced > 0) {
      totalReplaced += perRunReplaced;
      touched = true;
    }

    const skippedCount = naiveTotal - perRunReplaced;
    if (skippedCount > 0) skipped.push({ id: getParagraphId(para), count: skippedCount });
  }

  let msg = `Replaced ${totalReplaced} occurrence(s) of "${find}" with "${replace}".`;
  if (skipped.length > 0) {
    const skippedTotal = skipped.reduce((sum, s) => sum + s.count, 0);
    const detail = skipped.map((s) => `${s.id} (${s.count})`).join(", ");
    msg += ` ${skippedTotal} occurrence(s) skipped because they only match by spanning a run boundary — inspect with get_par_runs: ${detail}.`;
  }

  let dirtyWarning = "";
  if (touched) {
    dirtyWarning = documentCache.touchDirty(path, doc);
    msg += " File updated in cache — call save_fdx to persist changes to disk.";
  }

  return pushCacheWarning(pushCacheWarning(textResult(msg), dirtyWarning), warning);
}
