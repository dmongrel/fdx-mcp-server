/**
 * get_character_appearances — Read-Only. Retrieve per-scene appearance counts for one or all
 * characters, as JSON. Mirrors Go's tools/get_character_appearances.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { getCachedFdx, pushCacheWarning, textResult, errResult } from "./shared.ts";
import { buildCharacterAppearances, rankCharacters } from "./breakdown.ts";

export const getCharacterAppearancesTool: FdxTool = {
  name: "get_character_appearances",
  description:
    "Read-Only. Retrieve, as JSON, each character's scene-by-scene appearance counts (Character/Parenthetical/Dialogue paragraphs attributed to that speaker). Pass character to filter to one name (case-insensitive); omit for every character sorted by total count descending.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      character: {
        type: "string",
        description: "optional character name to filter (case-insensitive); when omitted, returns every character",
      },
    },
    required: ["path"],
  },
};

export async function handleGetCharacterAppearances(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = args?.path as string | undefined;
  if (!path) return errResult("path is required");

  let doc, warning;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const appearances = buildCharacterAppearances(doc);
  const ranked = rankCharacters(appearances);

  const want = ((args?.character as string | undefined) ?? "").trim();
  if (want !== "") {
    const hit = ranked.find((r) => r.name.toLowerCase() === want.toLowerCase());
    if (!hit) {
      return pushCacheWarning(textResult(`no appearances found for character: ${want}`), warning);
    }
    const entry = { character: hit.name, total: hit.total, appearances: appearances.get(hit.name) ?? [] };
    return pushCacheWarning(textResult(JSON.stringify(entry)), warning);
  }

  const ordered = ranked.map((r) => ({
    character: r.name,
    total: r.total,
    appearances: appearances.get(r.name) ?? [],
  }));
  return pushCacheWarning(textResult(JSON.stringify(ordered)), warning);
}
