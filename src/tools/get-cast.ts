// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_cast — Read-Only. Retrieve the <Cast> block: the Narrator's assigned actor and activated
 * element types, plus every character-to-actor <Member> row. Never reads the sibling <Actors>
 * block — its Actor rows carry a binary voice-synthesis blob in WinVoice/MacVoice that this
 * server does not parse or expose; Cast rows reference an actor only by name.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { getAttr, findChildren } from "../fdx/xml.ts";

export const getCastTool: FdxTool = {
  name: "get_cast",
  description:
    "Read-Only. Retrieve the <Cast> block as JSON: the Narrator's assigned actor and activated element types, plus every {character, actor} Member row. Does not expose <Actors> voice-synthesis data.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
    },
    required: ["path"],
  },
};

export async function handleGetCast(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const narratorEl = doc.getNarratorElement();
  const narrator = narratorEl
    ? {
        actor: getAttr(narratorEl, "Actor") ?? "",
        elements: findChildren(narratorEl, "Element").map((e) => getAttr(e, "Type") ?? ""),
      }
    : null;
  const members = doc.getCastMembers().map((m) => ({
    character: getAttr(m, "Character") ?? "",
    actor: getAttr(m, "Actor") ?? "",
  }));

  return pushCacheWarning(textResult(JSON.stringify({ narrator, members })), warning);
}
