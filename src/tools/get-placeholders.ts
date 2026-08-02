// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_placeholders — Read-Only. Lists every paragraph whose full text is entirely one [...] span
 * (e.g. "[FIX - ...]" drafting notes), regardless of paragraph type. Pairs with batch_edit +
 * edit_par action=remove to bulk-clear them once applied.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, getParagraphType, paragraphText } from "../fdx/paragraph.ts";
import { findContainingSectionIndex } from "../fdx/sections.ts";
import { getSceneProperties, isPlaceholderParagraph } from "./breakdown.ts";

export const getPlaceholdersTool: FdxTool = {
  name: "get_placeholders",
  description:
    'Read-Only. Lists every paragraph whose full text (trimmed) is entirely one [...] span — a drafting placeholder like "[FIX - ...]" — regardless of paragraph type, as {id, type, text, page} per hit. Scoped to top-level body paragraphs (nested DualDialogue paragraphs are out of scope, same as find_par/get_flagged_words). Combine with batch_edit and edit_par action=remove to bulk-clear placeholders once applied; see also get_script_stats\'s placeholderCount and excludePlaceholders.',
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
    },
    required: ["path"],
  },
};

interface PlaceholderHit {
  id: string;
  type: string;
  text: string;
  page: number | null;
}

export async function handleGetPlaceholders(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const paragraphs = doc.getParagraphElements();
  const placeholders: PlaceholderHit[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]!;
    if (!isPlaceholderParagraph(p)) continue;

    const sectionIdx = findContainingSectionIndex(paragraphs, i);
    let page: number | null = null;
    if (sectionIdx !== -1) {
      const sp = getSceneProperties(paragraphs[sectionIdx]!);
      const parsedPage = sp ? parseInt(sp.page, 10) : NaN;
      page = Number.isNaN(parsedPage) ? null : parsedPage;
    }

    placeholders.push({
      id: getParagraphId(p),
      type: getParagraphType(p),
      text: paragraphText(p),
      page,
    });
  }

  const body = { placeholders, count: placeholders.length };
  return pushCacheWarning(textResult(JSON.stringify(body, null, 2)), warning);
}
