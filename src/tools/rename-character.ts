// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * rename_character — renames or merges a character across all five places a name is stored:
 * Character-cue paragraphs, the SmartType Characters dictionary, Cast Member rows, CharacterArcBeat
 * entries in every scene's SceneProperties, and CharacterHighlighting. A merge (to already exists
 * somewhere) drops from's entry there rather than creating a duplicate, except a scene where both
 * from and to already have separate arc beats — arc beats carry authored notes as nested
 * paragraphs, so that scene is left untouched (with a warning) rather than destroying one side's
 * notes. Never touches <Actors> (binary voice-synthesis data) — only Cast's Character attribute.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { getAttr, setAttr, findChild, findChildren, type XmlElement } from "../fdx/xml.ts";
import { getParagraphId } from "../fdx/paragraph.ts";
import { editSmartList } from "./smart-type-ops.ts";
import { runPreservingReplace } from "./replace-text.ts";

export const renameCharacterTool: FdxTool = {
  name: "rename_character",
  description:
    "Rename (or merge) a character across every place its name is stored: Character-cue paragraphs (run-preserving substring replace, like replace_text, including cues nested inside a DualDialogue block), the SmartType Characters dictionary, Cast Member rows, CharacterArcBeat entries in every scene's SceneProperties, and CharacterHighlighting. A merge (to already exists somewhere) drops from's entry there rather than creating a duplicate — except a scene where both from and to already have separate arc beats, which is left untouched (with a warning) since arc beats carry authored notes that a drop would destroy. Errors if from isn't found in any of the five locations. Returns a JSON report of what was touched in each location, plus any warnings. Never touches <Actors>. After editing, call save_fdx to persist changes to disk.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      from: { type: "string", description: "the existing character name to rename (or merge away)" },
      to: { type: "string", description: "the new character name (or the existing name to merge into)" },
      cs: { type: "boolean", description: "match from/to case-sensitively (default false)" },
    },
    required: ["path", "from", "to"],
  },
};

function matchName(value: string, target: string, cs: boolean): boolean {
  return cs ? value === target : value.toLowerCase() === target.toLowerCase();
}

export async function handleRenameCharacter(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");

  const fromArg = arg<string>(args, "from");
  const toArg = arg<string>(args, "to");
  if (!fromArg) return errResult("from is required");
  if (!toArg) return errResult("to is required");
  const from = fromArg.trim();
  const to = toArg.trim();
  if (from === "") return errResult("from must not be empty");
  if (to === "") return errResult("to must not be empty");
  const cs = Boolean(args?.cs);
  if (matchName(from, to, cs)) return errResult("from and to must be different");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const warnings: string[] = [];
  let anyTouched = false;

  // Location 1: Character-cue paragraphs.
  const replaceResult = runPreservingReplace(doc, {
    find: from,
    replace: to,
    caseSensitive: cs,
    parType: "Character",
    includeNested: true,
  });
  if (replaceResult.touched) anyTouched = true;

  // Location 2: SmartType Characters list.
  const charList = doc.getSmartTypeList("Character");
  const charValues = charList?.values ?? [];
  const fromInList = charValues.some((v) => matchName(v, from, cs));
  const toInList = charValues.some((v) => matchName(v, to, cs));
  let smartTypeCharacters: string;
  if (!fromInList) {
    smartTypeCharacters = "not found";
  } else if (toInList) {
    const result = editSmartList(charValues, { action: "remove", find: from, cs });
    doc.setSmartTypeList("Character", result.ok ? result.list : charValues);
    smartTypeCharacters = `removed (merged into existing "${to}" entry)`;
    anyTouched = true;
  } else {
    const result = editSmartList(charValues, { action: "edit", find: from, replace: to, cs });
    doc.setSmartTypeList("Character", result.ok ? result.list : charValues);
    smartTypeCharacters = "renamed";
    anyTouched = true;
  }

  // Location 3: Cast Member rows.
  const members = doc.getCastMembers();
  const fromMember = members.find((m) => matchName(getAttr(m, "Character") ?? "", from, cs));
  const toMember = members.find((m) => matchName(getAttr(m, "Character") ?? "", to, cs));
  let castMember: string;
  if (!fromMember) {
    castMember = "not found";
  } else if (toMember) {
    const cast = doc.getCastElement()!;
    const idx = cast.children.indexOf(fromMember);
    if (idx !== -1) cast.children.splice(idx, 1);
    const droppedActor = getAttr(fromMember, "Actor") ?? "";
    const keptActor = getAttr(toMember, "Actor") ?? "";
    warnings.push(`Dropped Cast row for "${from}" (actor "${droppedActor}") — "${to}" already had actor "${keptActor}".`);
    castMember = `removed (merged into existing "${to}" row)`;
    anyTouched = true;
  } else {
    setAttr(fromMember, "Character", to);
    castMember = "renamed";
    anyTouched = true;
  }

  // Location 4: CharacterArcBeat entries.
  let arcBeatsRenamed = 0;
  const conflictingScenes: string[] = [];
  for (const p of doc.getParagraphElements()) {
    const sp = findChild(p, "SceneProperties");
    const arcBeatsEl = sp && findChild(sp, "SceneArcBeats");
    if (!arcBeatsEl) continue;
    const beats = findChildren(arcBeatsEl, "CharacterArcBeat");
    const fromBeat = beats.find((b) => matchName(getAttr(b, "Name") ?? "", from, cs));
    if (!fromBeat) continue;
    const toBeat = beats.find((b) => matchName(getAttr(b, "Name") ?? "", to, cs));
    if (toBeat) {
      conflictingScenes.push(getParagraphId(p));
      continue;
    }
    setAttr(fromBeat, "Name", to);
    arcBeatsRenamed++;
    anyTouched = true;
  }
  if (conflictingScenes.length > 0) {
    warnings.push(
      `Scene(s) ${conflictingScenes.join(", ")} already have an arc beat for "${to}"; left "${from}"'s beat and notes untouched there — consolidate manually if desired.`,
    );
  }

  // Location 5: CharacterHighlighting.
  const highlighted = doc.getHighlightedCharacters();
  const fromHi = highlighted.find((c) => matchName(getAttr(c, "Name") ?? "", from, cs));
  const toHi = highlighted.find((c) => matchName(getAttr(c, "Name") ?? "", to, cs));
  let characterHighlighting: string;
  if (!fromHi) {
    characterHighlighting = "not found";
  } else if (toHi) {
    const ch = doc.getCharacterHighlightingElement()!;
    const fromVisible = getAttr(fromHi, "Visible") === "Yes";
    const toVisible = getAttr(toHi, "Visible") === "Yes";
    if (fromVisible && !toVisible) {
      const idx = ch.children.indexOf(toHi as XmlElement);
      if (idx !== -1) ch.children.splice(idx, 1);
      setAttr(fromHi, "Name", to);
      characterHighlighting = `kept "${from}"'s entry (was the visible assignment), renamed to "${to}"`;
    } else {
      const idx = ch.children.indexOf(fromHi as XmlElement);
      if (idx !== -1) ch.children.splice(idx, 1);
      characterHighlighting = `removed (kept existing "${to}" entry)`;
    }
    anyTouched = true;
  } else {
    setAttr(fromHi, "Name", to);
    characterHighlighting = "renamed";
    anyTouched = true;
  }

  if (!anyTouched) {
    return errResult(
      `"${from}" not found anywhere (cue paragraphs, SmartType Characters, Cast, arc beats, or CharacterHighlighting)`,
    );
  }

  const dirtyWarning = documentCache.touchDirty(path, doc);
  const responseBody = {
    from,
    to,
    cueParagraphs: {
      paragraphsTouched: replaceResult.paragraphsTouched,
      occurrencesReplaced: replaceResult.totalReplaced,
      skipped: replaceResult.skipped,
    },
    smartTypeCharacters,
    castMember,
    arcBeats: { renamed: arcBeatsRenamed, conflictingScenes },
    characterHighlighting,
    warnings,
    message: `Successfully renamed "${from}" to "${to}". File updated in cache — call save_fdx to persist changes to disk.`,
  };

  return pushCacheWarning(pushCacheWarning(textResult(JSON.stringify(responseBody, null, 2)), dirtyWarning), warning);
}
