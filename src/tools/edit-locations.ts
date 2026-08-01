// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * edit_locations — Rename a location across every Scene Heading that uses it, editing the actual
 * script text (not the SmartType Locations dictionary that only feeds FinalDraft's autocomplete —
 * see edit_smarttype_locations for that).
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, getParagraphType, paragraphText, spliceParagraphText } from "../fdx/paragraph.ts";
import { locateSluglineLocation } from "./breakdown.ts";
import { addSmartTypeValue } from "./edit-par.ts";

export const editLocationsTool: FdxTool = {
  name: "edit_locations",
  description:
    "Rename a location across every Scene Heading that uses it, editing the actual script text (not the SmartType Locations dictionary — see edit_smarttype_locations for that). Matches find against each Scene Heading's parsed location (case-insensitive unless cs=true) and splices replace into just that segment, preserving the intro token, separators, and time-of-day around it. Adds replace to the SmartType Locations list if missing, and warns (without blocking) when find is left orphaned there. After editing, call save_fdx to persist changes to disk.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      find: { type: "string", description: "the existing location text to match, as parsed from Scene Heading sluglines" },
      replace: { type: "string", description: "the new location text" },
      cs: { type: "boolean", description: "match find case-sensitively (default false)" },
    },
    required: ["path", "find", "replace"],
  },
};

export async function handleEditLocations(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  const find = arg<string>(args, "find");
  const replace = arg<string>(args, "replace");
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");
  if (!find) return errResult("find is required");
  if (!replace) return errResult("replace is required");
  const cs = Boolean(args?.cs);

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const matchesFind = (location: string): boolean =>
    cs ? location === find : location.toLowerCase() === find.toLowerCase();

  const collapsed: string[] = [];
  let renamedCount = 0;
  for (const p of doc.getParagraphElements()) {
    if (getParagraphType(p) !== "Scene Heading") continue;
    const loc = locateSluglineLocation(doc, paragraphText(p));
    if (!loc || !matchesFind(loc.location)) continue;
    const outcome = spliceParagraphText(p, loc.start, loc.end, replace);
    if (outcome === "collapsed") collapsed.push(getParagraphId(p));
    renamedCount++;
  }

  if (renamedCount === 0) {
    return pushCacheWarning(errResult(`location not found in any Scene Heading: ${find}`), warning);
  }

  addSmartTypeValue(doc, "Location", replace);

  let orphanWarning = "";
  const stillUsed = doc.getParagraphElements().some((p) => {
    if (getParagraphType(p) !== "Scene Heading") return false;
    const loc = locateSluglineLocation(doc, paragraphText(p));
    return loc ? matchesFind(loc.location) : false;
  });
  if (!stillUsed) {
    const smartList = doc.getSmartTypeList("Location");
    const stillInDictionary = smartList?.values.some((v) => matchesFind(v));
    if (stillInDictionary) {
      orphanWarning = `Note: "${find}" is no longer used by any Scene Heading but is still in the SmartType Locations list; call edit_smarttype_locations action=remove find="${find}" to clean it up.`;
    }
  }

  const dirtyWarning = documentCache.touchDirty(path, doc);
  let msg = `Renamed ${renamedCount} Scene Heading(s) from "${find}" to "${replace}".`;
  if (collapsed.length > 0) {
    msg += ` Reformatted as a single unstyled run (location text spanned multiple styled runs) for: ${collapsed.join(", ")}.`;
  }
  if (orphanWarning) msg += ` ${orphanWarning}`;
  msg += " File updated in cache — call save_fdx to persist changes to disk.";

  return pushCacheWarning(pushCacheWarning(textResult(msg), dirtyWarning), warning);
}
