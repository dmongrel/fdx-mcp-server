// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_copyright — retrieves the title page's copyright block (the first two title-page
 * paragraphs). Mirrors Go's tools/get_copyright.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { copyrightText } from "../fdx/title-page.ts";

export const getCopyrightTool: FdxTool = {
  name: "get_copyright",
  description:
    "Read-Only. Retrieve the title page's copyright block (the first two title-page paragraphs). Returns the 'Copyright © <year> <owner>.' line, plus 'All Rights Reserved.' when present; if there is no copyright, reports that none was found.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
    },
    required: ["path"],
  },
};

export async function handleGetCopyright(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const { text, found } = copyrightText(doc.getTitlePageParagraphs());
  if (!found) return pushCacheWarning(textResult("No copyright statement was found."), warning);
  return pushCacheWarning(textResult(text), warning);
}

