// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_flagged_words — Read-Only. Surfaces every <Text> run carrying AdornmentStyle="-1" (Final
 * Draft's unknown-word marker, the on-screen squiggle) as a ready-made typo index — every
 * misspelling in a script is already marked in the file, this just asks for the list instead of
 * calling get_par_runs on every paragraph one at a time.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, getParagraphType, getParagraphRuns } from "../fdx/paragraph.ts";
import { findContainingSectionIndex } from "../fdx/sections.ts";
import { getSceneProperties } from "./breakdown.ts";

export const getFlaggedWordsTool: FdxTool = {
  name: "get_flagged_words",
  description:
    'Read-Only. Surfaces every <Text> run carrying AdornmentStyle="-1" — Final Draft\'s unknown-word marker — as {word, paragraphId, paragraphType, page} per hit. Scoped to top-level body paragraphs (nested DualDialogue paragraphs are out of scope, same as find_par/replace_text). Pass excludeIgnoreList=true to filter out words already in the spell-check ignore list.',
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      excludeIgnoreList: {
        type: "boolean",
        description: "when true, omit words already in the spell-check ignore list (default false)",
      },
    },
    required: ["path"],
  },
};

interface FlaggedWord {
  word: string;
  paragraphId: string;
  paragraphType: string;
  page: number | null;
}

export async function handleGetFlaggedWords(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");
  const excludeIgnoreList = Boolean(args?.excludeIgnoreList);

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const ignoreSet = new Set(doc.getIgnoredWords().map((w) => w.toLowerCase()));
  const paragraphs = doc.getParagraphElements();
  const flaggedWords: FlaggedWord[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]!;
    for (const run of getParagraphRuns(p)) {
      if (run.attrs.AdornmentStyle !== "-1") continue;
      if (excludeIgnoreList && ignoreSet.has(run.content.toLowerCase())) continue;

      const sectionIdx = findContainingSectionIndex(paragraphs, i);
      let page: number | null = null;
      if (sectionIdx !== -1) {
        const sp = getSceneProperties(paragraphs[sectionIdx]!);
        const parsedPage = sp ? parseInt(sp.page, 10) : NaN;
        page = Number.isNaN(parsedPage) ? null : parsedPage;
      }

      flaggedWords.push({
        word: run.content,
        paragraphId: getParagraphId(p),
        paragraphType: getParagraphType(p),
        page,
      });
    }
  }

  const body = { flaggedWords, count: flaggedWords.length };
  return pushCacheWarning(textResult(JSON.stringify(body, null, 2)), warning);
}
