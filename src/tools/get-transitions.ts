// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_transitions — Read-Only. Retrieve the SmartType Transitions list (transition strings such
 * as CUT TO:, FADE IN:). Mirrors Go's tools/get_transitions.go.
 */

import { makeSmartListGetTool } from "./smart-type-ops.ts";

const { tool, handler } = makeSmartListGetTool(
  "get_transitions",
  "Read-Only. Retrieve the SmartType Transitions list (transitions like 'CUT TO:', 'FADE IN:') as newline-joined entries in document order, or an empty message if none exist.",
  "Transition",
  "Transition",
);

export const getTransitionsTool = tool;
export const handleGetTransitions = handler;

