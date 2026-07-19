/**
 * get_scene_properties — Read-Only. Retrieve one paragraph's SceneProperties as JSON. Mirrors
 * Go's tools/get_scene_properties.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, getCachedFdx, pushCacheWarning, textResult, errResult } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { getScenePropertiesById } from "./breakdown.ts";

export const getScenePropertiesTool: FdxTool = {
  name: "get_scene_properties",
  description:
    "Read-Only. Retrieve one paragraph's SceneProperties as JSON — Color, Length (raw and parsed eighths-of-a-page), Page, and Title. Errors if the paragraph has no SceneProperties block.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      id: { type: "string", description: "the paragraph id of the Scene Heading whose properties to read" },
    },
    required: ["path", "id"],
  },
};

export async function handleGetSceneProperties(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  const id = arg<string>(args, "id");
  if (!path) return errResult("path is required");
  if (!id) return errResult("id is required");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const result = getScenePropertiesById(doc, id);
  if (result === null) return errResult(`paragraph id not found: ${id}`);
  if (result === undefined) return errResult(`paragraph has no SceneProperties: ${id}`);

  return pushCacheWarning(textResult(JSON.stringify(result)), warning);
}
