/**
 * Shared "what is a section" helpers used by find_par and the get_section* tools (Phase 3): a
 * section starts at any section-type paragraph (per list_types' sectionTypes catalog) and extends
 * to the next section-type paragraph of any type (exclusive). Mirrors Go's tools/util.go
 * findSectionIndex/isSectionType.
 */

import type { XmlElement } from "./xml.ts";
import { isSectionType } from "../tools/list-types.ts";
import { getParagraphId, getParagraphType } from "./paragraph.ts";

export { isSectionType };

/**
 * Scans paragraphs for the first section-type paragraph, additionally matching `id` when
 * non-empty (an empty id matches the first section-type paragraph regardless of its own id).
 * Returns the zero-based index, or -1 when no match exists.
 */
export function findSectionIndex(paragraphs: XmlElement[], id: string): number {
  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]!;
    if (!isSectionType(getParagraphType(p))) continue;
    if (id === "" || getParagraphId(p) === id) return i;
  }
  return -1;
}

/** The exclusive end index of the section starting at `startIndex` (next section heading, or length). */
export function findSectionEnd(paragraphs: XmlElement[], startIndex: number): number {
  for (let i = startIndex + 1; i < paragraphs.length; i++) {
    if (isSectionType(getParagraphType(paragraphs[i]!))) return i;
  }
  return paragraphs.length;
}
