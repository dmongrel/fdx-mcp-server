/**
 * edit_scene_intros — Add, change, remove, or fix entries in the SmartType SceneIntros list, and
 * optionally set its container Separator attribute. Mirrors Go's tools/edit_scene_intros.go.
 */

import { makeSmartSeparatorEditTool } from "./smart-type-ops.ts";

const { tool, handler } = makeSmartSeparatorEditTool(
  "edit_scene_intros",
  "Add, change, remove, or fix entries in the SmartType SceneIntros list (scene-heading prefixes like 'INT.', 'EXT.', 'INT./EXT.').",
  "SceneIntro",
  "SceneIntro",
);

export const editSceneIntrosTool = tool;
export const handleEditSceneIntros = handler;
