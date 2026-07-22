// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_fdx_breakdown — Read-Only. Retrieve a combined script-breakdown report in text, html, or pdf
 * form. Mirrors Go's tools/get_fdx_breakdown.go + get_fdx_breakdown_pdf.go, but writes the
 * rendered report to targetPath on disk rather than returning it inline — the pdf/html payloads
 * are large enough (base64 PDFs in particular) that surfacing them directly in the tool result
 * bloats the conversation; writing to a file lets the caller open/inspect it separately instead.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, getCachedFdx, pushCacheWarning, textResult, errResult } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { buildBreakdownData, renderBreakdownHtml, renderBreakdownText } from "./breakdown-report.ts";
import { renderBreakdownPdf } from "./breakdown-pdf.ts";
import { writeTextFile, writeBinaryFile } from "../fdx/runtime.ts";

export const getFdxBreakdownTool: FdxTool = {
  name: "get_fdx_breakdown",
  description:
    "Read-Only. Generate a combined script-breakdown report: document overview, paragraph-type breakdown, act structure, full scene catalog, character frequency, pagination map, arc-beat summary, scene-length analysis, and production flags (color-coded scenes, scenes over a page, missing time-of-day, characters without arc beats). Writes the report to targetPath instead of returning it inline — pass asType='text' (default, 80-column plain text), 'html' (standalone styled page), or 'pdf' (printable document). CRITICAL: call read_fdx first.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      targetPath: {
        type: "string",
        description: "the file path to write the rendered report to (e.g. a .txt, .html, or .pdf file matching asType)",
      },
      asType: {
        type: "string",
        description: "output format: 'text' (default), 'html', or 'pdf'",
      },
    },
    required: ["path", "targetPath"],
  },
};

export async function handleGetFdxBreakdown(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");

  const targetPath = arg<string>(args, "targetPath");
  if (!targetPath) return errResult("targetPath is required");

  const asType = (arg<string>(args, "asType") ?? "").trim().toLowerCase();
  if (asType !== "" && asType !== "text" && asType !== "html" && asType !== "pdf") {
    return errResult("asType must be 'text', 'html', or 'pdf'");
  }

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const data = buildBreakdownData(doc);

  try {
    switch (asType) {
      case "":
      case "text":
        await writeTextFile(targetPath, renderBreakdownText(data));
        break;
      case "html":
        await writeTextFile(targetPath, renderBreakdownHtml(data));
        break;
      case "pdf": {
        const bytes = await renderBreakdownPdf(data);
        await writeBinaryFile(targetPath, bytes);
        break;
      }
      default:
        return errResult("asType must be 'text', 'html', or 'pdf'");
    }
  } catch (err) {
    return errResult(`render/write error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const result = textResult(`Wrote ${asType || "text"} breakdown report to ${targetPath}.`);
  return pushCacheWarning(result, warning);
}

