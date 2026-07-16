/**
 * get_fdx_breakdown — Read-Only. Retrieve a combined script-breakdown report in text, html, or pdf
 * form. Mirrors Go's tools/get_fdx_breakdown.go + get_fdx_breakdown_pdf.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { getCachedFdx, pushCacheWarning, textResult, errResult } from "./shared.ts";
import { buildBreakdownData, renderBreakdownHtml, renderBreakdownText } from "./breakdown-report.ts";
import { renderBreakdownPdf } from "./breakdown-pdf.ts";

export const getFdxBreakdownTool: FdxTool = {
  name: "get_fdx_breakdown",
  description:
    "Read-Only. Retrieve a combined script-breakdown report: document overview, paragraph-type breakdown, act structure, full scene catalog, character frequency, pagination map, arc-beat summary, scene-length analysis, and production flags (color-coded scenes, scenes over a page, missing time-of-day, characters without arc beats). Pass asType='text' (default, 80-column plain text for chat), 'html' (standalone styled page), or 'pdf' (base64-encoded printable document). CRITICAL: call read_fdx first.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      asType: {
        type: "string",
        description: "output format: 'text' (default), 'html', or 'pdf' (base64-encoded)",
      },
    },
    required: ["path"],
  },
};

export async function handleGetFdxBreakdown(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = args?.path as string | undefined;
  if (!path) return errResult("path is required");

  const asType = String(args?.asType ?? "").trim().toLowerCase();
  if (asType !== "" && asType !== "text" && asType !== "html" && asType !== "pdf") {
    return errResult("asType must be 'text', 'html', or 'pdf'");
  }

  let doc, warning;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const data = buildBreakdownData(doc);

  let result: ToolResult;
  switch (asType) {
    case "":
    case "text":
      result = textResult(renderBreakdownText(data));
      break;
    case "html":
      result = textResult(renderBreakdownHtml(data));
      break;
    case "pdf": {
      let bytes: Uint8Array;
      try {
        bytes = await renderBreakdownPdf(data);
      } catch (err) {
        return errResult(`pdf render error: ${err instanceof Error ? err.message : String(err)}`);
      }
      result = textResult(bytes.toBase64());
      break;
    }
    default:
      return errResult("asType must be 'text', 'html', or 'pdf'");
  }

  return pushCacheWarning(result, warning);
}
