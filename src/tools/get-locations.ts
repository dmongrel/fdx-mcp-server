// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_locations — Read-Only. Retrieve actual location usage from Scene Heading paragraphs (not
 * the SmartType Locations dictionary — see get_smarttype_locations for that, which only reflects
 * FinalDraft's autocomplete list and can drift from what the script actually uses).
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { buildLocationAppearances, rankLocations } from "./breakdown.ts";

export const getLocationsTool: FdxTool = {
  name: "get_locations",
  description:
    "Read-Only. Retrieve, as JSON, actual location usage parsed from every Scene Heading's slugline (not the SmartType Locations dictionary — see get_smarttype_locations for that). Each entry is { location, count, scenes: [{ id, text, page }] }, sorted by scene count descending. Pass location to filter to one location (case-insensitive); omit for every location.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      location: {
        type: "string",
        description: "optional location name to filter (case-insensitive); when omitted, returns every location",
      },
    },
    required: ["path"],
  },
};

export async function handleGetLocations(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const appearances = buildLocationAppearances(doc);
  const ranked = rankLocations(appearances);

  const want = (arg<string>(args, "location") ?? "").trim();
  if (want !== "") {
    const hit = ranked.find((r) => r.location.toLowerCase() === want.toLowerCase());
    if (!hit) {
      return pushCacheWarning(textResult(`no scenes found for location: ${want}`), warning);
    }
    const entry = { location: hit.location, count: hit.total, scenes: appearances.get(hit.location) ?? [] };
    return pushCacheWarning(textResult(JSON.stringify(entry)), warning);
  }

  if (ranked.length === 0) {
    return pushCacheWarning(textResult("No locations found"), warning);
  }
  const ordered = ranked.map((r) => ({
    location: r.location,
    count: r.total,
    scenes: appearances.get(r.location) ?? [],
  }));
  return pushCacheWarning(textResult(JSON.stringify(ordered)), warning);
}
