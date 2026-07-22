// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_locations — Read-Only. Retrieve the SmartType Locations list (location names known to the
 * document). Mirrors Go's tools/get_locations.go.
 */

import { makeSmartListGetTool } from "./smart-type-ops.ts";

const { tool, handler } = makeSmartListGetTool(
  "get_locations",
  "Read-Only. Retrieve the SmartType Locations list (scene locations) as newline-joined entries in document order, or an empty message if none exist.",
  "Location",
  "Location",
);

export const getLocationsTool = tool;
export const handleGetLocations = handler;

