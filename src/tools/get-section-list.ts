/**
 * get_section_list — lists all section-type headings (or, with `type`, only paragraphs of that
 * exact section type) in document order, optionally starting from a given section id. Mirrors
 * Go's tools/get_section_list.go.
 */

import type { FdxTool } from "./shared.ts";
import { textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import { getParagraphId, getParagraphType, paragraphText } from "../fdx/paragraph.ts";
import { findSectionIndex, isSectionType } from "../fdx/sections.ts";

export const getSectionListTool: FdxTool = {
  name: "get_section_list",
  description:
    "Read-Only. Retrieve a list of sections. By default lists all section-type headings (Scene Headings, Act Breaks, Sequence Headings, etc.); pass 'type' to list only paragraphs of that exact type instead. Optionally start from a specific section ID.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      id: {
        type: "string",
        description: "id is the section id (the id of a section-heading paragraph) to start with; omit to list from the start",
      },
      type: {
        type: "string",
        description:
          "optional section-type filter (e.g. 'Scene Heading', 'Act Break'); when set, only sections of this exact type are listed (case-insensitive). Must be a section type; non-section types are rejected",
      },
    },
    required: ["path"],
  },
};

export async function handleGetSectionList(args: Record<string, unknown> | undefined) {
  const path = args?.path as string | undefined;
  if (!path) return errResult("path is required");
  const sectionId = args?.id as string | undefined;
  const wantType = ((args?.type as string | undefined) ?? "").trim();

  let doc, warning;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const paragraphs = doc.getParagraphElements();
  let startIndex = 0;
  if (sectionId) {
    const idx = findSectionIndex(paragraphs, sectionId);
    if (idx === -1) return errResult(`section id not found: ${sectionId}`);
    startIndex = idx;
  }

  if (wantType !== "" && !isSectionType(wantType)) {
    return errResult(`not a section type: ${wantType} (use list_types to see section types)`);
  }

  const lines: string[] = [];
  for (let i = startIndex; i < paragraphs.length; i++) {
    const p = paragraphs[i]!;
    const type = getParagraphType(p);
    const match = wantType !== "" ? type.toLowerCase() === wantType.toLowerCase() : isSectionType(type);
    if (match) lines.push(`${type} [${getParagraphId(p)}]: ${paragraphText(p)}`);
  }

  return pushCacheWarning(textResult(lines.join("\n")), warning);
}
