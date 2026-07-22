// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * convert_to_pdf — Read-Only. Render the full screenplay (title page + body) to a printable PDF,
 * written to targetPath rather than returned inline (a base64 PDF payload would bloat the
 * conversation). See screenplay-pdf.ts for the renderer.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, getCachedFdx, pushCacheWarning, textResult, errResult } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { renderScreenplayPdf } from "./screenplay-pdf.ts";
import { writeBinaryFile } from "../fdx/runtime.ts";

export const convertToPdfTool: FdxTool = {
  name: "convert_to_pdf",
  description:
    "Read-Only. Render the full screenplay — title page plus every body paragraph, in industry-standard US screenplay format (Courier 12pt, standard scene heading/action/character/dialogue/parenthetical/transition margins, dual dialogue as side-by-side columns) — to a printable PDF. Writes the PDF to targetPath instead of returning it inline. CRITICAL: call read_fdx first.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      targetPath: { type: "string", description: "the file path to write the rendered PDF to (e.g. a .pdf file)" },
    },
    required: ["path", "targetPath"],
  },
};

export async function handleConvertToPdf(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");

  const targetPath = arg<string>(args, "targetPath");
  if (!targetPath) return errResult("targetPath is required");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const bytes = await renderScreenplayPdf(doc);
    await writeBinaryFile(targetPath, bytes);
  } catch (err) {
    return errResult(`render/write error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return pushCacheWarning(textResult(`Wrote PDF to ${targetPath}.`), warning);
}
