/**
 * edit_locations — Add, change, remove, or fix entries in the SmartType Locations list.
 * Mirrors Go's tools/edit_locations.go.
 */

import { makeSmartListEditTool } from "./smart-type-ops.ts";

const { tool, handler } = makeSmartListEditTool(
  "edit_locations",
  "Add, change, remove, or fix entries in the SmartType Locations list (scene locations).",
  "Location",
  "Location",
);

export const editLocationsTool = tool;
export const handleEditLocations = handler;
