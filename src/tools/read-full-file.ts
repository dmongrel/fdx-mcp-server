// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * read_full_file — concatenates the title page and all body paragraphs of a loaded screenplay
 * into plain text (one paragraph per line), preserving order but not formatting. Mirrors Go's
 * tools/read_full_file.go.
 */

import type { FdxTool } from "./shared.ts";
import { textResult, errResult, getCachedFdx, pushCacheWarning, hasFdxExtension } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { paragraphText } from "../fdx/paragraph.ts";

export const readFullFileTool: FdxTool = {
  name: "read_full_file",
  description: "Read-Only. Returns the full content of an .fdx file as concatenated text (TitlePage then Paragraphs).",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the absolute or relative path to the file" },
    },
    required: ["path"],
  },
};

export async function handleReadFullFile(args: Record<string, unknown> | undefined) {
  const path = args?.path as string | undefined;
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const lines: string[] = [];
  for (const p of doc.getTitlePageParagraphs()) lines.push(paragraphText(p));
  for (const p of doc.getParagraphElements()) lines.push(paragraphText(p));

  return pushCacheWarning(textResult(lines.join("\n") + "\n"), warning);
}

