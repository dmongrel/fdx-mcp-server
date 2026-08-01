// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * edit_smarttype_transitions — Add, change, remove, or fix entries in the SmartType Transitions
 * list. Mirrors Go's tools/edit_transitions.go.
 */

import { makeSmartListEditTool } from "./smart-type-ops.ts";

const { tool, handler } = makeSmartListEditTool(
  "edit_smarttype_transitions",
  "Add, change, remove, or fix entries in the SmartType Transitions list (transitions like 'CUT TO:', 'FADE IN:', 'SMASH CUT TO:').",
  "Transition",
  "Transition",
);

export const editSmarttypeTransitionsTool = tool;
export const handleEditSmarttypeTransitions = handler;
