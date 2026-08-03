// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * replace_text — run-preserving find/replace across a loaded screenplay's paragraph text.
 * Substitutes inside each <Text> run's own content, leaving run boundaries and every run
 * attribute (AdornmentStyle, Font, Color, Size, RevisionID, ...) untouched. A match that only
 * exists when spanning two runs is left alone and reported as skipped rather than merged.
 * Pass preview=true to see what would happen (each occurrence marked with «...» in its
 * paragraph's text) without changing anything.
 *
 * The core substitution loop is exported as runPreservingReplace so other tools (rename_character)
 * can reuse it instead of duplicating run-preserving substring replace.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, pushWarning, hasFdxExtension, skippedNestedWarning } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { findChildren, textContent, setTextContent } from "../fdx/xml.ts";
import { getParagraphId, getParagraphType, paragraphText, expandDualDialogue, countNestedParagraphs } from "../fdx/paragraph.ts";
import { findSectionIndex, findSectionEnd } from "../fdx/sections.ts";

export const replaceTextTool: FdxTool = {
  name: "replace_text",
  description:
    "Find and replace text across paragraphs in a loaded screenplay, substituting inside each <Text> run's own content so run boundaries and every run attribute (AdornmentStyle, Font, Color, Size, RevisionID, ...) are preserved. A match that only exists by spanning two runs is left unreplaced and reported as skipped. Optionally scope to a section (id) and/or a paragraph type (parType). Pass preview=true to see what would be matched — each occurrence marked with «...» in its paragraph's text, original document casing preserved — without changing anything; call again with preview omitted (or false) to apply. When the scope contains a DualDialogue block, a warning is prepended reporting how many nested paragraphs were not scanned. After editing, call save_fdx to persist changes to disk.",
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
      preview: {
        type: "boolean",
        description: "when true, report what would be matched/skipped without changing anything",
      },
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

/** Wraps every occurrence of `find` in «...», preserving the original matched substring's casing. */
function markMatches(haystack: string, find: string, caseSensitive: boolean): string {
  if (caseSensitive) return haystack.split(find).join(`«${find}»`);
  return haystack.replace(new RegExp(escapeRegExp(find), "gi"), (m) => `«${m}»`);
}

export interface RunPreservingReplaceOptions {
  find: string;
  replace: string;
  caseSensitive: boolean;
  parType?: string;
  startIndex?: number;
  endIndex?: number;
  preview?: boolean;
  includeNested?: boolean;
}

export interface PreviewMatch {
  id: string;
  type: string;
  text: string;
  wouldReplace: number;
  skipped: number;
}

export interface RunPreservingReplaceResult {
  totalReplaced: number;
  paragraphsTouched: number;
  touched: boolean;
  skipped: Array<{ id: string; count: number }>;
  previewMatches?: PreviewMatch[];
}

/**
 * Substitutes `find` with `replace` inside each <Text> run's own content across the paragraphs in
 * [startIndex, endIndex) (defaults to the whole document), optionally restricted to `parType`. A
 * match that only exists by spanning two runs is left unreplaced and counted in `skipped` instead.
 * When `preview` is true, nothing is mutated — `previewMatches` reports what would happen instead.
 */
export function runPreservingReplace(doc: FdxDocument, opts: RunPreservingReplaceOptions): RunPreservingReplaceResult {
  const { find, replace, caseSensitive, parType, preview, includeNested } = opts;
  const paragraphs = includeNested ? expandDualDialogue(doc.getParagraphElements()) : doc.getParagraphElements();
  const startIndex = opts.startIndex ?? 0;
  const endIndex = opts.endIndex ?? paragraphs.length;

  let totalReplaced = 0;
  let paragraphsTouched = 0;
  const skipped: Array<{ id: string; count: number }> = [];
  const previewMatches: PreviewMatch[] = [];
  let touched = false;

  for (let i = startIndex; i < endIndex; i++) {
    const para = paragraphs[i]!;
    if (parType && getParagraphType(para) !== parType) continue;

    const text = paragraphText(para);
    const naiveTotal = countOccurrences(text, find, caseSensitive);
    if (naiveTotal === 0) continue;

    let perRunReplaced = 0;
    for (const run of findChildren(para, "Text")) {
      const content = textContent(run);
      const count = countOccurrences(content, find, caseSensitive);
      if (count === 0) continue;
      if (!preview) {
        setTextContent(run, replaceAllOccurrences(content, find, replace, caseSensitive));
      }
      perRunReplaced += count;
    }

    const skippedCount = naiveTotal - perRunReplaced;

    if (preview) {
      previewMatches.push({
        id: getParagraphId(para),
        type: getParagraphType(para),
        text: markMatches(text, find, caseSensitive),
        wouldReplace: perRunReplaced,
        skipped: skippedCount,
      });
      continue;
    }

    if (perRunReplaced > 0) {
      totalReplaced += perRunReplaced;
      paragraphsTouched++;
      touched = true;
    }

    if (skippedCount > 0) skipped.push({ id: getParagraphId(para), count: skippedCount });
  }

  return preview
    ? { totalReplaced, paragraphsTouched, touched, skipped, previewMatches }
    : { totalReplaced, paragraphsTouched, touched, skipped };
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
  const preview = Boolean(args?.preview);

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

  const result = runPreservingReplace(doc, { find, replace, caseSensitive, parType, startIndex, endIndex, preview });
  const skippedNested = countNestedParagraphs(paragraphs.slice(startIndex, endIndex));

  if (preview) {
    const matches = result.previewMatches ?? [];
    const totalMatches = matches.reduce((sum, m) => sum + m.wouldReplace, 0);
    const totalSkipped = matches.reduce((sum, m) => sum + m.skipped, 0);
    const paragraphsWithReplacements = matches.filter((m) => m.wouldReplace > 0).length;
    const skipNote = totalSkipped > 0 ? `; ${totalSkipped} occurrence(s) would be skipped (span a run boundary)` : "";
    const body = {
      preview: true,
      find,
      replace,
      matches,
      totalMatches,
      totalSkipped,
      message: `Preview: ${totalMatches} occurrence(s) across ${paragraphsWithReplacements} paragraph(s) would be replaced${skipNote}. Nothing was changed — call again with preview=false (or omit preview) to apply.`,
    };
    let previewResult = textResult(JSON.stringify(body, null, 2));
    previewResult = pushWarning(previewResult, skippedNestedWarning(skippedNested));
    return pushCacheWarning(previewResult, warning);
  }

  let msg = `Replaced ${result.totalReplaced} occurrence(s) of "${find}" with "${replace}".`;
  if (result.skipped.length > 0) {
    const skippedTotal = result.skipped.reduce((sum, s) => sum + s.count, 0);
    const detail = result.skipped.map((s) => `${s.id} (${s.count})`).join(", ");
    msg += ` ${skippedTotal} occurrence(s) skipped because they only match by spanning a run boundary — inspect with get_par_runs: ${detail}.`;
  }

  let dirtyWarning = "";
  if (result.touched) {
    dirtyWarning = documentCache.touchDirty(path, doc);
    msg += " File updated in cache — call save_fdx to persist changes to disk.";
  }

  let finalResult = textResult(msg);
  finalResult = pushWarning(finalResult, skippedNestedWarning(skippedNested));
  return pushCacheWarning(pushCacheWarning(finalResult, dirtyWarning), warning);
}
