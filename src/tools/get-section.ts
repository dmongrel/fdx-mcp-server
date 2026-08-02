// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_section — retrieves a section: its heading paragraph (any section type) plus all following
 * paragraphs up to the next section heading of any type (exclusive), as a JSON array of
 * {id, type, text}. Omit id to start at the first section in the document. Absorbs what used to be
 * the separate get_section_par_list tool — any edit workflow needed both id and text, so both are
 * always returned together now.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, getParagraphType, paragraphText } from "../fdx/paragraph.ts";
import { findSectionIndex, isSectionType } from "../fdx/sections.ts";

export const getSectionTool: FdxTool = {
  name: "get_section",
  description:
    "Read-Only. Retrieve every paragraph in a section (a section-type heading such as a Scene Heading, Act Break, or Shot, and the paragraphs that follow it up to the next section heading) as a JSON array of {id, type, text}. Omit id to start at the first section in the document.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      id: {
        type: "string",
        description: "id is the section id (the id of a section-heading paragraph such as a Scene Heading or Act Break); omit to start at the first section",
      },
    },
    required: ["path"],
  },
};

interface SectionParagraph {
  id: string;
  type: string;
  text: string;
}

export async function handleGetSection(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");
  const sceneId = arg<string>(args, "id");

  let doc: FdxDocument;
  let warning: string;
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
    if (idx === -1) return pushCacheWarning(textResult("[]"), warning);
    startIndex = idx;
  }

  const items: SectionParagraph[] = [];
  for (let i = startIndex; i < paragraphs.length; i++) {
    const p = paragraphs[i]!;
    if (i > startIndex && isSectionType(getParagraphType(p))) break;
    items.push({ id: getParagraphId(p), type: getParagraphType(p), text: paragraphText(p) });
  }

  return pushCacheWarning(textResult(JSON.stringify(items)), warning);
}
