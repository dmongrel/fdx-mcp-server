/**
 * edit_extensions — Add, change, remove, or fix entries in the SmartType Extensions list.
 * Mirrors Go's tools/edit_extensions.go.
 */

import { makeSmartListEditTool } from "./smart-type-ops.ts";

const { tool, handler } = makeSmartListEditTool(
  "edit_extensions",
  "Add, change, remove, or fix entries in the SmartType Extensions list (character extensions like '(V.O.)', '(O.S.)').",
  "Extension",
  "Extension",
);

export const editExtensionsTool = tool;
export const handleEditExtensions = handler;
