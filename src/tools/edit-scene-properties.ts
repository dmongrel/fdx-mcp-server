// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * edit_scene_properties — set Color and/or Title on a paragraph's SceneProperties block,
 * creating the block if it doesn't exist yet (e.g. a paragraph created through edit_par has none).
 * Length and Page are Final Draft's own derived pagination values and are never written here.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { setAttr } from "../fdx/xml.ts";
import { getParagraphId } from "../fdx/paragraph.ts";
import { getOrCreateSceneProperties } from "./breakdown.ts";

export const editScenePropertiesTool: FdxTool = {
  name: "edit_scene_properties",
  description:
    "Set Color and/or Title on a paragraph's SceneProperties block, creating the block if it doesn't exist yet — a paragraph created through edit_par has no SceneProperties at all until this is called. At least one of color or title is required. Neither value is format-validated; see get_context for Final Draft's actual color format. Length and Page are Final Draft's own derived pagination values and are never written by this tool. After editing, call save_fdx to persist changes to disk.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      id: { type: "string", description: "the paragraph id (typically a Scene Heading) whose SceneProperties to set" },
      color: { type: "string", description: "the Color value to set, written verbatim" },
      title: { type: "string", description: "the Title value to set, written verbatim" },
    },
    required: ["path", "id"],
  },
};

export async function handleEditSceneProperties(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  const id = arg<string>(args, "id");
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");
  if (!id) return errResult("id is required");

  const color = arg<string>(args, "color");
  const title = arg<string>(args, "title");
  if (color === undefined && title === undefined) {
    return errResult("at least one of color or title is required");
  }

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const para = doc.getParagraphElements().find((p) => getParagraphId(p) === id);
  if (!para) return errResult(`paragraph id not found: ${id}`);

  const sp = getOrCreateSceneProperties(para);
  const set: string[] = [];
  if (color !== undefined) {
    setAttr(sp, "Color", color);
    set.push("color");
  }
  if (title !== undefined) {
    setAttr(sp, "Title", title);
    set.push("title");
  }

  const dirtyWarning = documentCache.touchDirty(path, doc);
  const msg = `Successfully set ${set.join(" and ")} on scene ${id}. File updated in cache — call save_fdx to persist changes to disk.`;
  return pushCacheWarning(pushCacheWarning(textResult(msg), dirtyWarning), warning);
}
