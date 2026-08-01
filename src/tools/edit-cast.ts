// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * edit_cast — create, edit, remove, or fix <Member Character="..." Actor="..."/> rows in the
 * <Cast> block.
 *
 * Hazard this tool must never touch: the sibling <Actors> block stores a binary voice-synthesis
 * blob in each row's WinVoice attribute (MacVoice too). A Cast Member's `actor` value is just the
 * plain-text name of an Actor row — this tool reads/writes that name only, never the <Actors>
 * element itself, and never normalizes or re-encodes any attribute value it touches. Do not
 * extend this tool (or replace_text) to reach into <Actors> for any kind of text normalization.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { createElement, getAttr, setAttr, type XmlElement } from "../fdx/xml.ts";
import { getParagraphType, paragraphText } from "../fdx/paragraph.ts";

export const editCastTool: FdxTool = {
  name: "edit_cast",
  description:
    "Create, edit, remove, or fix Cast Member rows (character-to-actor mappings). action=create adds a Member for character/actor (both required — the actor must already be a known Actor name; this tool never invents or retargets one). action=edit changes the actor and/or character of the row matching character. action=remove deletes the row matching character. action=fix drops rows whose character has no Character-cue paragraph and no SmartType Characters entry — the cleanup for orphaned rows left behind by a rename. Matching on character is case-insensitive unless cs=true. Never touches <Actors> (binary voice-synthesis data). After editing, call save_fdx to persist changes to disk.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      action: { type: "string", description: "create, edit, remove, or fix" },
      character: { type: "string", description: "the Character value identifying the row (required for create/edit/remove)" },
      actor: { type: "string", description: "the Actor value (required for create; optional for edit)" },
      newCharacter: { type: "string", description: "(edit) renames the row's Character value" },
      cs: { type: "boolean", description: "match character case-sensitively (default false)" },
    },
    required: ["path", "action"],
  },
};

function findMemberIndex(members: XmlElement[], character: string, cs: boolean): number {
  for (let i = 0; i < members.length; i++) {
    const v = getAttr(members[i]!, "Character") ?? "";
    if (v === character || (!cs && v.toLowerCase() === character.toLowerCase())) return i;
  }
  return -1;
}

function hasCharacterCue(doc: FdxDocument, character: string): boolean {
  const target = character.toLowerCase();
  return doc
    .getParagraphElements()
    .some((p) => getParagraphType(p) === "Character" && paragraphText(p).trim().toLowerCase() === target);
}

function hasSmartTypeEntry(doc: FdxDocument, character: string): boolean {
  const target = character.toLowerCase();
  return (doc.getSmartTypeList("Character")?.values ?? []).some((v) => v.toLowerCase() === target);
}

export async function handleEditCast(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  const action = arg<string>(args, "action");
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");
  if (!action) return errResult("action is required");

  const character = arg<string>(args, "character");
  const actor = arg<string>(args, "actor");
  const newCharacter = arg<string>(args, "newCharacter");
  const cs = Boolean(args?.cs);

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  let msg: string;

  if (action === "create") {
    if (!character) return errResult("failed to create cast member: character is required");
    if (!actor) return errResult("failed to create cast member: actor is required");
    if (findMemberIndex(doc.getCastMembers(), character, cs) !== -1) {
      return errResult(`failed to create cast member: a row for "${character}" already exists; use action=edit`);
    }
    const cast = doc.getCastElement(true)!;
    cast.children.push(createElement("Member", [
      ["Actor", actor],
      ["Character", character],
    ]));
    msg = `Successfully created cast member "${character}".`;
  } else if (action === "edit") {
    if (!character) return errResult("failed to edit cast member: character is required");
    const members = doc.getCastMembers();
    const idx = findMemberIndex(members, character, cs);
    if (idx === -1) return errResult(`failed to edit cast member: no row found for "${character}"`);
    if (!actor && !newCharacter) {
      return errResult("failed to edit cast member: provide actor and/or newCharacter to change");
    }
    const member = members[idx]!;
    if (actor) setAttr(member, "Actor", actor);
    if (newCharacter) setAttr(member, "Character", newCharacter);
    msg = `Successfully edited cast member "${character}".`;
  } else if (action === "remove") {
    if (!character) return errResult("failed to remove cast member: character is required");
    const members = doc.getCastMembers();
    const idx = findMemberIndex(members, character, cs);
    if (idx === -1) return errResult(`failed to remove cast member: no row found for "${character}"`);
    const cast = doc.getCastElement()!;
    const childIdx = cast.children.indexOf(members[idx]!);
    cast.children.splice(childIdx, 1);
    msg = `Successfully removed cast member "${character}".`;
  } else if (action === "fix") {
    const members = doc.getCastMembers();
    const orphans = members.filter((m) => {
      const c = getAttr(m, "Character") ?? "";
      return !hasCharacterCue(doc, c) && !hasSmartTypeEntry(doc, c);
    });
    if (orphans.length === 0) {
      msg = "No orphaned cast members found.";
    } else {
      const cast = doc.getCastElement()!;
      for (const m of orphans) {
        const childIdx = cast.children.indexOf(m);
        if (childIdx !== -1) cast.children.splice(childIdx, 1);
      }
      const names = orphans.map((m) => getAttr(m, "Character") ?? "").join(", ");
      msg = `Removed ${orphans.length} orphaned cast member(s): ${names}.`;
    }
  } else {
    return errResult(`failed to ${action} cast member`);
  }

  const dirtyWarning = documentCache.touchDirty(path, doc);
  msg += " File updated in cache — call save_fdx to persist changes to disk.";
  return pushCacheWarning(pushCacheWarning(textResult(msg), dirtyWarning), warning);
}
