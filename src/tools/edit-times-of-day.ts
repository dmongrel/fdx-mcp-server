/**
 * edit_times_of_day — Add, change, remove, or fix entries in the SmartType TimesOfDay list, and
 * optionally set its container Separator attribute. Mirrors Go's tools/edit_times_of_day.go.
 */

import { makeSmartSeparatorEditTool } from "./smart-type-ops.ts";

const { tool, handler } = makeSmartSeparatorEditTool(
  "edit_times_of_day",
  "Add, change, remove, or fix entries in the SmartType TimesOfDay list (time-of-day suffixes like 'DAY', 'NIGHT', 'DAWN - LATER').",
  "TimeOfDay",
  "TimeOfDay",
);

export const editTimesOfDayTool = tool;
export const handleEditTimesOfDay = handler;
