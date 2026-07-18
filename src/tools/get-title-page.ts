/**
 * get_title_page — retrieves the title page as plain text (all paragraphs concatenated top to
 * bottom). Mirrors Go's tools/get_title_page.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import { paragraphText } from "../fdx/paragraph.ts";

export const getTitlePageTool: FdxTool = {
  name: "get_title_page",
  description: "Read-Only. Retrieve the title page content.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
    },
    required: ["path"],
  },
};

export async function handleGetTitlePage(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");

  let doc, warning;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const paragraphs = doc.getTitlePageParagraphs();
  if (paragraphs.length === 0) return pushCacheWarning(textResult("No title page content found"), warning);

  const text = paragraphs.map((p) => `${paragraphText(p)}\n`).join("");
  return pushCacheWarning(textResult(text), warning);
}
