/**
 * get_scene_index — Read-Only. Retrieve the full scene catalog as JSON. Mirrors Go's
 * tools/get_scene_index.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, getCachedFdx, pushCacheWarning, textResult, errResult } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { isSectionType } from "../fdx/sections.ts";
import { buildSceneIndex } from "./breakdown.ts";

export const getSceneIndexTool: FdxTool = {
  name: "get_scene_index",
  description:
    "Read-Only. Retrieve the full scene catalog as JSON: for every section-type heading, its id, type, text, page, length (eighths of a page), color, and — for Scene Headings — the parsed intro/location/timeOfDay. Pass type to filter to one section type.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      type: {
        type: "string",
        description:
          "optional section-type filter (e.g. 'Scene Heading', 'Act Break'); when set, only sections of this exact type are listed (case-insensitive). Must be a section type; non-section types are rejected",
      },
    },
    required: ["path"],
  },
};

export async function handleGetSceneIndex(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");

  const wantType = (arg<string>(args, "type") ?? "").trim();
  if (wantType !== "" && !isSectionType(wantType)) {
    return errResult(`not a section type: ${wantType} (use list_types to see section types)`);
  }

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  let scenes = buildSceneIndex(doc);
  if (wantType !== "") {
    scenes = scenes.filter((s) => s.type.toLowerCase() === wantType.toLowerCase());
  }

  return pushCacheWarning(textResult(JSON.stringify(scenes)), warning);
}
