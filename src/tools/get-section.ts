/**
 * get_section — retrieves a section: its heading paragraph (any section type) plus all following
 * paragraphs up to the next section heading of any type (exclusive). Mirrors Go's
 * tools/get_section.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import { getParagraphType, paragraphText } from "../fdx/paragraph.ts";
import { findSectionIndex, isSectionType } from "../fdx/sections.ts";

export const getSectionTool: FdxTool = {
  name: "get_section",
  description:
    "Read-Only. Retrieve a list of paragraphs in a section (a section-type heading such as a Scene Heading, Act Break, or Shot, and the paragraphs that follow it).",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      id: {
        type: "string",
        description: "id is the section id (the id of a section-heading paragraph such as a Scene Heading or Act Break)",
      },
    },
    required: ["path"],
  },
};

export async function handleGetSection(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");
  const sceneId = arg<string>(args, "id");

  let doc, warning;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const paragraphs = doc.getParagraphElements();
  let startIndex = 0;
  if (sceneId) {
    const idx = findSectionIndex(paragraphs, sceneId);
    if (idx === -1) return errResult(`section id not found: ${sceneId}`);
    startIndex = idx;
  }

  const lines: string[] = [];
  for (let i = startIndex; i < paragraphs.length; i++) {
    const p = paragraphs[i]!;
    if (i > startIndex && isSectionType(getParagraphType(p))) break;
    lines.push(`[${getParagraphType(p)}] ${paragraphText(p)}`);
  }

  return pushCacheWarning(textResult(lines.join("\n\n")), warning);
}
