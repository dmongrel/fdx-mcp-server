// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * find_par — searches top-level body paragraphs by text content, optionally scoped to a section
 * (via id) and/or filtered by paragraph type, with optional case sensitivity. Each hit reports its
 * containing section (id, heading text, page), found by scanning backward for the nearest
 * preceding section-type paragraph — no more guessing which scene a match belongs to. Mirrors Go's
 * tools/find_par.go, extended with scene/page reporting.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, getParagraphType, paragraphText } from "../fdx/paragraph.ts";
import { findSectionIndex, findSectionEnd, findContainingSectionIndex } from "../fdx/sections.ts";
import { getSceneProperties } from "./breakdown.ts";

export const findParTool: FdxTool = {
  name: "find_par",
  description:
    "Read-Only. Search for a paragraph by text content. Returns a JSON array of hits, each carrying id, type, text, and the containing section's sceneId/sceneHeading/page (all null when the hit is before any section heading) — no separate lookup needed to place a match in the document.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the absolute or relative path to the file" },
      textContent: { type: "string", description: "the text content to search for" },
      id: {
        type: "string",
        description: "id is the scene id (the id of the Scene Heading paragraph) to scope the search to",
      },
      parType: { type: "string", description: "the type of paragraph to search for" },
      caseSensitive: { type: "boolean", description: "whether the search should be case-sensitive" },
    },
    required: ["path", "textContent"],
  },
};

interface FindParHit {
  id: string;
  type: string;
  text: string;
  sceneId: string | null;
  sceneHeading: string | null;
  page: number | null;
}

export async function handleFindPar(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  const query = arg<string>(args, "textContent");
  if (!path) return errResult("path is required");
  if (query === undefined) return errResult("textContent is required");

  const sceneId = arg<string>(args, "id");
  const parType = arg<string>(args, "parType");
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

  const searchLower = caseSensitive ? "" : query.toLowerCase();
  const hits: FindParHit[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    const p = paragraphs[i]!;
    if (parType && getParagraphType(p) !== parType) continue;

    const text = paragraphText(p);
    const isHit = caseSensitive ? text.includes(query) : text.toLowerCase().includes(searchLower);
    if (!isHit) continue;

    const sectionIdx = findContainingSectionIndex(paragraphs, i);
    let hSceneId: string | null = null;
    let sceneHeading: string | null = null;
    let page: number | null = null;
    if (sectionIdx !== -1) {
      const sectionPara = paragraphs[sectionIdx]!;
      hSceneId = getParagraphId(sectionPara);
      sceneHeading = paragraphText(sectionPara);
      const sp = getSceneProperties(sectionPara);
      const parsedPage = sp ? parseInt(sp.page, 10) : NaN;
      page = Number.isNaN(parsedPage) ? null : parsedPage;
    }

    hits.push({
      id: getParagraphId(p),
      type: getParagraphType(p),
      text,
      sceneId: hSceneId,
      sceneHeading,
      page,
    });
  }

  return pushCacheWarning(textResult(JSON.stringify(hits)), warning);
}
