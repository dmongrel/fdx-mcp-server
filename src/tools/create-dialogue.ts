// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * create_dialogue — creates a Character/[Parenthetical]/Dialogue group as one atomic, contiguous
 * insertion, so a new speech never leaves the document in the invalid intermediate state that two
 * or three separate edit_par creates would (Dialogue is invalid unless immediately preceded by
 * Character or Parenthetical, per get_context's Dialogue Sequence rule). Validity is structural:
 * this tool only ever builds Character -> [Parenthetical] -> Dialogue, contiguously, in that order,
 * so there is no separate "check the rule" step.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { generateUuid } from "../fdx/uuid.ts";
import { buildParagraphElement, getParagraphId } from "../fdx/paragraph.ts";
import { addSmartTypeValue } from "./edit-par.ts";
import type { XmlElement } from "../fdx/xml.ts";

export const createDialogueTool: FdxTool = {
  name: "create_dialogue",
  description:
    "Create a Character/[Parenthetical]/Dialogue group as one atomic, contiguous insertion — a new speech in a single call, instead of two or three separate edit_par creates that leave the document in an invalid intermediate state in between (Dialogue is invalid unless immediately preceded by Character or Parenthetical). Use beforeParId or afterParId to control insertion position (falls back to append). character's text is added to the SmartType Characters list, same as edit_par action=create type=Character. Returns {characterId, parentheticalId, dialogueId, message} as JSON. After editing, call save_fdx to persist changes to disk.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      character: { type: "string", description: 'the Character cue text, e.g. "GROG" or "GROG (V.O.)"' },
      dialogue: { type: "string", description: "the Dialogue text" },
      parenthetical: {
        type: "string",
        description: "optional Parenthetical text, inserted between Character and Dialogue",
      },
      beforeParId: { type: "string", description: "the paragraph id to insert the group before" },
      afterParId: { type: "string", description: "the paragraph id to insert the group after" },
    },
    required: ["path", "character", "dialogue"],
  },
};

export async function handleCreateDialogue(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");

  const character = arg<string>(args, "character");
  const dialogue = arg<string>(args, "dialogue");
  const parenthetical = arg<string>(args, "parenthetical");
  if (!character) return errResult("character is required");
  if (!dialogue) return errResult("dialogue is required");

  const beforeParId = arg<string>(args, "beforeParId");
  const afterParId = arg<string>(args, "afterParId");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const content = doc.getContentElement(true)!;
  const paragraphs = doc.getParagraphElements();

  let insertPos: number;
  if (beforeParId) {
    const idx = paragraphs.findIndex((p) => getParagraphId(p) === beforeParId);
    if (idx === -1) return errResult("failed to create dialogue: anchor paragraph not found");
    insertPos = content.children.indexOf(paragraphs[idx]!);
  } else if (afterParId) {
    const idx = paragraphs.findIndex((p) => getParagraphId(p) === afterParId);
    if (idx === -1) return errResult("failed to create dialogue: anchor paragraph not found");
    insertPos = content.children.indexOf(paragraphs[idx]!) + 1;
  } else {
    insertPos = content.children.length;
  }

  const characterId = generateUuid();
  const dialogueId = generateUuid();
  const characterPara = buildParagraphElement("Character", characterId, undefined, [{ content: character }]);
  const dialoguePara = buildParagraphElement("Dialogue", dialogueId, undefined, [{ content: dialogue }]);

  const group: XmlElement[] = [characterPara];
  let parentheticalId: string | null = null;
  if (parenthetical) {
    parentheticalId = generateUuid();
    group.push(buildParagraphElement("Parenthetical", parentheticalId, undefined, [{ content: parenthetical }]));
  }
  group.push(dialoguePara);

  content.children.splice(insertPos, 0, ...group);

  addSmartTypeValue(doc, "Character", character);

  const dirtyWarning = documentCache.touchDirty(path, doc);
  const body = {
    characterId,
    parentheticalId,
    dialogueId,
    message:
      "Successfully created a Character/Dialogue group. File updated in cache — call save_fdx to persist changes to disk.",
  };
  return pushCacheWarning(pushCacheWarning(textResult(JSON.stringify(body, null, 2)), dirtyWarning), warning);
}
