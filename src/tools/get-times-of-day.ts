/**
 * get_times_of_day — Read-Only. Retrieve the SmartType TimesOfDay list (times of day such as
 * DAY, NIGHT), plus the container Separator (default " - "). Mirrors Go's
 * tools/get_times_of_day.go.
 */

import { makeSmartListGetTool } from "./smart-type-ops.ts";

const { tool, handler } = makeSmartListGetTool(
  "get_times_of_day",
  "Read-Only. Retrieve the SmartType TimesOfDay list (time-of-day suffixes like 'DAY', 'NIGHT') as newline-joined entries in document order, or an empty message if none exist. Reports the effective separator on a leading line when present.",
  "TimeOfDay",
  "TimeOfDay",
);

export const getTimesOfDayTool = tool;
export const handleGetTimesOfDay = handler;
