/**
 * get_header_and_footer — retrieves header and/or footer content from the script body and/or
 * title page. Mirrors Go's tools/get_header_and_footer.go.
 */

import type { FdxTool } from "./shared.ts";
import { textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import { renderHeaderAndFooter, titlePageHfExists } from "../fdx/header-footer.ts";

export const getHeaderAndFooterTool: FdxTool = {
  name: "get_header_and_footer",
  description:
    "Read-Only. Retrieve header and/or footer content. location selects which HeaderAndFooter(s) to read ('body', 'title', or 'all' (default)); element selects which part(s) to render ('header', 'footer', or 'all' (default)). Returns the selected content as concatenated text plus dynamic-label tag values (e.g. [Page #]) in document order.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      location: { type: "string", description: "which HeaderAndFooter to read: 'body', 'title', or 'all' (default)" },
      element: { type: "string", description: "which part to read: 'header', 'footer', or 'all' (default)" },
    },
    required: ["path"],
  },
};

export async function handleGetHeaderAndFooter(args: Record<string, unknown> | undefined) {
  const path = args?.path as string | undefined;
  if (!path) return errResult("path is required");

  const location = ((args?.location as string | undefined) ?? "").toLowerCase() || "all";
  if (location !== "body" && location !== "title" && location !== "all") {
    return errResult("location must be 'body', 'title', or 'all'");
  }
  const element = ((args?.element as string | undefined) ?? "").toLowerCase() || "all";
  if (element !== "header" && element !== "footer" && element !== "all") {
    return errResult("element must be 'header', 'footer', or 'all'");
  }

  let doc, warning;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  let out = "";
  if (location === "body" || location === "all") {
    out += "Body:\n";
    const hf = doc.getBodyHeaderAndFooterElement();
    out += hf ? renderHeaderAndFooter(hf, element) : "(no HeaderAndFooter)\n";
  }
  if (location === "title" || location === "all") {
    if (out.length > 0) out += "\n";
    out += "Title Page:\n";
    const hf = doc.getTitlePageHeaderAndFooterElement();
    out += titlePageHfExists(hf) ? renderHeaderAndFooter(hf!, element) : "(no HeaderAndFooter)\n";
  }

  return pushCacheWarning(textResult(out), warning);
}
