// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * edit_scene_arc_beats — rename or remove CharacterArcBeat entries tracked in Scene Headings'
 * SceneProperties. get_scene_arc_beats already reads this data (buildArcBeatData in
 * breakdown.ts); this is the write side, so a character rename can be propagated into arc-beat
 * tracking instead of leaving a stale name double-counting a single role. The attribute is
 * `Name`, not `Character` — CharacterArcBeat is a different element from Cast's Member row.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { findChild, findChildren, getAttr, setAttr } from "../fdx/xml.ts";
import { getParagraphId } from "../fdx/paragraph.ts";

export const editSceneArcBeatsTool: FdxTool = {
  name: "edit_scene_arc_beats",
  description:
    "Rename or remove CharacterArcBeat entries tracked in Scene Headings' SceneProperties. action=edit renames every beat matching name to newName; action=remove deletes every beat matching name. Scope to one scene with id (a Scene Heading paragraph id); omit id to act across the whole script. Matching on name is case-insensitive unless cs=true. After editing, call save_fdx to persist changes to disk.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      action: { type: "string", description: "edit or remove" },
      name: { type: "string", description: "the CharacterArcBeat Name to match" },
      newName: { type: "string", description: "(edit) the new Name value" },
      id: { type: "string", description: "restrict to the scene (Scene Heading paragraph id) with this id" },
      cs: { type: "boolean", description: "match name case-sensitively (default false)" },
    },
    required: ["path", "action", "name"],
  },
};

function matchName(value: string, name: string, cs: boolean): boolean {
  return cs ? value === name : value.toLowerCase() === name.toLowerCase();
}

export async function handleEditSceneArcBeats(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  const action = arg<string>(args, "action");
  const name = arg<string>(args, "name");
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");
  if (!action) return errResult("action is required");
  if (!name) return errResult("name is required");
  if (action !== "edit" && action !== "remove") {
    return errResult(`failed to ${action} arc beats: action must be 'edit' or 'remove'`);
  }

  const newName = arg<string>(args, "newName");
  if (action === "edit" && !newName) return errResult("edit requires newName");

  const sceneId = arg<string>(args, "id");
  const cs = Boolean(args?.cs);

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  let paragraphs = doc.getParagraphElements();
  if (sceneId) {
    paragraphs = paragraphs.filter((p) => getParagraphId(p) === sceneId);
    if (paragraphs.length === 0) return errResult(`scene id not found: ${sceneId}`);
  }

  let beatCount = 0;
  let sceneCount = 0;

  for (const p of paragraphs) {
    const sp = findChild(p, "SceneProperties");
    const arcBeatsEl = sp && findChild(sp, "SceneArcBeats");
    if (!arcBeatsEl) continue;

    if (action === "remove") {
      const before = arcBeatsEl.children.length;
      arcBeatsEl.children = arcBeatsEl.children.filter(
        (c) => !(c.type === "element" && c.name === "CharacterArcBeat" && matchName(getAttr(c, "Name") ?? "", name, cs)),
      );
      const removed = before - arcBeatsEl.children.length;
      if (removed > 0) {
        beatCount += removed;
        sceneCount++;
      }
    } else {
      let sceneTouched = false;
      for (const b of findChildren(arcBeatsEl, "CharacterArcBeat")) {
        if (matchName(getAttr(b, "Name") ?? "", name, cs)) {
          setAttr(b, "Name", newName!);
          beatCount++;
          sceneTouched = true;
        }
      }
      if (sceneTouched) sceneCount++;
    }
  }

  if (beatCount === 0) {
    return errResult(`no CharacterArcBeat found for name: ${name}${sceneId ? ` in scene ${sceneId}` : ""}`);
  }

  const dirtyWarning = documentCache.touchDirty(path, doc);
  const verb = action === "edit" ? "renamed" : "removed";
  const msg = `Successfully ${verb} ${beatCount} arc beat(s) across ${sceneCount} scene(s). File updated in cache — call save_fdx to persist changes to disk.`;
  return pushCacheWarning(pushCacheWarning(textResult(msg), dirtyWarning), warning);
}
