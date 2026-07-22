// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_extensions — Read-Only. Retrieve the SmartType Extensions list (character extensions such
 * as (V.O.), (O.S.)). Mirrors Go's tools/get_extensions.go.
 */

import { makeSmartListGetTool } from "./smart-type-ops.ts";

const { tool, handler } = makeSmartListGetTool(
  "get_extensions",
  "Read-Only. Retrieve the SmartType Extensions list (character extensions like '(V.O.)', '(O.S.)') as newline-joined entries in document order, or an empty message if none exist.",
  "Extension",
  "Extension",
);

export const getExtensionsTool = tool;
export const handleGetExtensions = handler;

