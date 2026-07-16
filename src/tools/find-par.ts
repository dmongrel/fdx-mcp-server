/**
 * find_par — searches top-level body paragraphs by text content, optionally scoped to a section
 * (via id) and/or filtered by paragraph type, with optional case sensitivity. Mirrors Go's
 * tools/find_par.go.
 */

import type { FdxTool } from "./shared.ts";
import { textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import { getParagraphId, getParagraphType, paragraphText } from "../fdx/paragraph.ts";
import { findSectionIndex, findSectionEnd } from "../fdx/sections.ts";

export const findParTool: FdxTool = {
  name: "find_par",
  description: "Read-Only. Search for a paragraph by text content.",
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

export async function handleFindPar(args: Record<string, unknown> | undefined) {
  const path = args?.path as string | undefined;
  const query = args?.textContent as string | undefined;
  if (!path) return errResult("path is required");
  if (query === undefined) return errResult("textContent is required");

  const sceneId = args?.id as string | undefined;
  const parType = args?.parType as string | undefined;
  const caseSensitive = Boolean(args?.caseSensitive);

  let doc, warning;
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

  const searchLower = query.toLowerCase();
  const results: string[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    const p = paragraphs[i]!;
    if (parType && getParagraphType(p) !== parType) continue;

    const text = paragraphText(p);
    const hit = caseSensitive ? text.includes(query) : text.toLowerCase().includes(searchLower);
    if (hit) results.push(`[${getParagraphType(p)}] [${getParagraphId(p)}] ${text}`);
  }

  const out = results.length === 0 ? "No paragraph found" : results.join("\n---\n");
  return pushCacheWarning(textResult(out), warning);
}
