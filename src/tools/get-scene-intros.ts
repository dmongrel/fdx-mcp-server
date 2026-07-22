// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_scene_intros — Read-Only. Retrieve the SmartType SceneIntros list (scene-heading prefixes
 * such as INT, EXT), plus the container Separator (default ". "). Mirrors Go's
 * tools/get_scene_intros.go.
 */

import { makeSmartListGetTool } from "./smart-type-ops.ts";

const { tool, handler } = makeSmartListGetTool(
  "get_scene_intros",
  "Read-Only. Retrieve the SmartType SceneIntros list (scene heading prefixes like 'INT.', 'EXT.') as newline-joined entries in document order, or an empty message if none exist. Reports the effective separator on a leading line when present.",
  "SceneIntro",
  "SceneIntro",
);

export const getSceneIntrosTool = tool;
export const handleGetSceneIntros = handler;

