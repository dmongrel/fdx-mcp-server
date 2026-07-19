/**
 * get_scene_arc_beats — Read-Only. Retrieve the CharacterArcBeat data tracked in each Scene
 * Heading's SceneProperties, as JSON. Mirrors Go's tools/get_scene_arc_beats.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, getCachedFdx, pushCacheWarning, textResult, errResult } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { buildArcBeatData } from "./breakdown.ts";

export const getSceneArcBeatsTool: FdxTool = {
  name: "get_scene_arc_beats",
  description:
    "Read-Only. Retrieve the CharacterArcBeat data tracked in each Scene Heading's SceneProperties, as JSON: for every scene with at least one arc beat, its id/text and the characters with beats there. Scenes with no arc beats are omitted.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
    },
    required: ["path"],
  },
};

export async function handleGetSceneArcBeats(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const arcs = buildArcBeatData(doc);
  return pushCacheWarning(textResult(JSON.stringify(arcs)), warning);
}
