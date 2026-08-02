// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * Detects and repairs duplicate <Paragraph> ids: FinalDraft's copy/paste sometimes duplicates a
 * paragraph's id attribute instead of minting a new one, and every id-addressed tool (get_par,
 * edit_par, edit_scene_arc_beats, get_section) silently resolves a duplicated id to the first
 * match. See HANDOFF-duplicate-paragraph-ids.md for the repro that motivated this.
 */

import type { FdxDocument } from "./document.ts";
import { findParagraphIdAttr, getParagraphType, paragraphText } from "./paragraph.ts";
import { generateUuid } from "./uuid.ts";
import { setAttr } from "./xml.ts";

const PREVIEW_LENGTH = 60;

function preview(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > PREVIEW_LENGTH ? `${trimmed.slice(0, PREVIEW_LENGTH)}…` : trimmed;
}

export interface DuplicateIdParagraph {
  /** Index into doc.getParagraphElements(), i.e. document order among top-level body paragraphs. */
  index: number;
  type: string;
  textPreview: string;
}

export interface DuplicateIdGroup {
  id: string;
  count: number;
  paragraphs: DuplicateIdParagraph[];
}

/**
 * Groups top-level body paragraphs by id, returning only ids shared by 2+ paragraphs (in
 * document order). Empty ids are ignored — they are not addressable by any id-addressed tool, so
 * they can't be silently mis-resolved the way a duplicated real id can.
 */
export function findDuplicateParagraphIds(doc: FdxDocument): DuplicateIdGroup[] {
  const groups = new Map<string, DuplicateIdParagraph[]>();
  doc.getParagraphElements().forEach((el, index) => {
    const attr = findParagraphIdAttr(el);
    if (!attr || attr.value === "") return;
    const list = groups.get(attr.value) ?? [];
    list.push({ index, type: getParagraphType(el), textPreview: preview(paragraphText(el)) });
    groups.set(attr.value, list);
  });

  const out: DuplicateIdGroup[] = [];
  for (const [id, paragraphs] of groups) {
    if (paragraphs.length > 1) out.push({ id, count: paragraphs.length, paragraphs });
  }
  return out;
}

export interface DuplicateIdReassignment extends DuplicateIdParagraph {
  oldId: string;
  newId: string;
}

export interface DuplicateIdFixGroup {
  id: string;
  /** Index of the occurrence that keeps its original id (the first one, in document order). */
  keptIndex: number;
  reassigned: DuplicateIdReassignment[];
}

/**
 * Plans a repair for every duplicated id: the first occurrence (document order) keeps its id,
 * every later occurrence is assigned a freshly minted uuid. Does not mutate the document — call
 * applyDuplicateIdFixes with the result to actually write the new ids.
 */
export function planDuplicateIdFixes(doc: FdxDocument): DuplicateIdFixGroup[] {
  return findDuplicateParagraphIds(doc).map((group) => {
    const [first, ...rest] = group.paragraphs;
    return {
      id: group.id,
      keptIndex: first!.index,
      reassigned: rest.map((p) => ({ ...p, oldId: group.id, newId: generateUuid() })),
    };
  });
}

/**
 * Writes a previously planned repair back into the document, preserving each paragraph's
 * original id attribute name (id/Id/ID) exactly. Mutates paragraph elements in place; caller is
 * responsible for marking the document cache dirty afterward.
 */
export function applyDuplicateIdFixes(doc: FdxDocument, plan: DuplicateIdFixGroup[]): void {
  const paragraphs = doc.getParagraphElements();
  for (const group of plan) {
    for (const r of group.reassigned) {
      const el = paragraphs[r.index];
      if (!el) continue;
      const attr = findParagraphIdAttr(el);
      if (!attr) continue;
      setAttr(el, attr.name, r.newId);
    }
  }
}

/** One-line warning for id-addressed tools (get_par, edit_par, ...) when a resolved id is ambiguous. */
export function duplicateIdWarning(matchCount: number): string {
  if (matchCount <= 1) return "";
  return `warning: this id matches ${matchCount} paragraphs; the resolved paragraph is the first match, which may not be the one you intended. Call find_duplicate_ids to see all matches and fix_duplicate_ids to repair.`;
}
