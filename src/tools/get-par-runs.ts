// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_par_runs — retrieves one or more top-level body paragraphs' <Text> runs, with full attribute
 * sets (AdornmentStyle, Font, Color, Size, RevisionID, ...) intact. Unlike get_par (which flattens
 * runs into plain text), this is the read half of the round-trip needed to edit a styled paragraph
 * without losing its styling. Accepts a single id (backward-compatible single-object response), or
 * a batch via ids or sectionId (array response) — a pre-sweep styled-run audit no longer needs one
 * call per paragraph.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, getParagraphType, getParagraphRuns } from "../fdx/paragraph.ts";
import { findSectionIndex, findSectionEnd } from "../fdx/sections.ts";
import type { XmlElement } from "../fdx/xml.ts";

export const getParRunsTool: FdxTool = {
  name: "get_par_runs",
  description:
    "Read-Only. Retrieve one or more paragraphs' <Text> runs, with each run's full attribute set (AdornmentStyle, Font, Color, Size, RevisionID, etc.) preserved — unlike get_par, which returns flattened plain text and discards run boundaries and attributes. Use this before edit_par when a paragraph may contain styled runs, so the attrs can be passed back unchanged. Pass exactly one of: id (single paragraph, returns one object), ids (array, returns an array in the given order — a missing id fails the whole call), or sectionId (every paragraph in that section, heading included, returns an array in document order) — useful for a pre-sweep audit of where styled runs are before running replace_text or edit_par across a scene.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      id: { type: "string", description: "a single paragraph id to retrieve" },
      ids: { type: "array", items: { type: "string" }, description: "a list of paragraph ids to retrieve, in the given order" },
      sectionId: { type: "string", description: "a section id (a section-heading paragraph's id); retrieves every paragraph in that section, heading included" },
    },
    required: ["path"],
  },
};

interface ParRunsBody {
  id: string;
  type: string;
  runs: ReturnType<typeof getParagraphRuns>;
}

function toBody(p: XmlElement): ParRunsBody {
  return { id: getParagraphId(p), type: getParagraphType(p), runs: getParagraphRuns(p) };
}

export async function handleGetParRuns(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");

  const id = arg<string>(args, "id");
  const ids = arg<string[]>(args, "ids");
  const sectionId = arg<string>(args, "sectionId");
  const selectorCount = [id, ids, sectionId].filter((v) => v !== undefined).length;
  if (selectorCount !== 1) {
    return errResult("exactly one of id, ids, or sectionId is required");
  }

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const paragraphs = doc.getParagraphElements();

  if (id !== undefined) {
    const para = paragraphs.find((p) => getParagraphId(p) === id);
    if (!para) return errResult(`paragraph id not found: ${id}`);
    return pushCacheWarning(textResult(JSON.stringify(toBody(para), null, 2)), warning);
  }

  if (ids !== undefined) {
    const bodies: ParRunsBody[] = [];
    for (const wantId of ids) {
      const para = paragraphs.find((p) => getParagraphId(p) === wantId);
      if (!para) return errResult(`paragraph id not found: ${wantId}`);
      bodies.push(toBody(para));
    }
    return pushCacheWarning(textResult(JSON.stringify(bodies)), warning);
  }

  const idx = findSectionIndex(paragraphs, sectionId!);
  if (idx === -1) return errResult(`section id not found: ${sectionId}`);
  const end = findSectionEnd(paragraphs, idx);
  const bodies = paragraphs.slice(idx, end).map(toBody);
  return pushCacheWarning(textResult(JSON.stringify(bodies)), warning);
}
