/**
 * get_section_par_list — retrieves all paragraph ids/types/text within a section, starting from a
 * given section id (the heading itself included); omit id to start at the first section. Mirrors
 * Go's tools/get_section_par_list.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import { getParagraphId, getParagraphType, paragraphText } from "../fdx/paragraph.ts";
import { findSectionIndex, isSectionType } from "../fdx/sections.ts";

export const getSectionParListTool: FdxTool = {
  name: "get_section_par_list",
  description: "Read-Only. Retrieve a list of all paragraphs in a section, starting from a specific section id.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      id: {
        type: "string",
        description:
          "id is the section id (the id of a section-heading paragraph such as a Scene Heading or Act Break); omit to start at the first section",
      },
    },
    required: ["path"],
  },
};

export async function handleGetSectionParList(args: Record<string, unknown> | undefined): Promise<ToolResult> {
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
  let startIndex: number;
  if (sceneId) {
    const idx = findSectionIndex(paragraphs, sceneId);
    if (idx === -1) return errResult(`section id not found: ${sceneId}`);
    startIndex = idx;
  } else {
    const idx = findSectionIndex(paragraphs, "");
    if (idx === -1) return pushCacheWarning(textResult("No sections found"), warning);
    startIndex = idx;
  }

  const head = paragraphs[startIndex]!;
  const lines: string[] = [`${getParagraphType(head)} [${getParagraphId(head)}]: ${paragraphText(head)}`];

  for (let i = startIndex + 1; i < paragraphs.length; i++) {
    const p = paragraphs[i]!;
    if (isSectionType(getParagraphType(p))) break;
    lines.push(`${getParagraphType(p)} [${getParagraphId(p)}]: ${paragraphText(p)}`);
  }

  return pushCacheWarning(textResult(lines.join("\n")), warning);
}
