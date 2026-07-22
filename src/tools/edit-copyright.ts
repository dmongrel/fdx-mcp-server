// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * edit_copyright — add, replace, or remove the title page's copyright block (always the first
 * two title-page paragraphs). Mirrors Go's tools/edit_copyright.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { setCopyrightBlock, clearCopyrightBlock, copyrightAllRights } from "../fdx/title-page.ts";

export const editCopyrightTool: FdxTool = {
  name: "edit_copyright",
  description:
    'Add, replace, or remove the title page\'s copyright block — always the first two title-page paragraphs. action=set adds a copyright when none exists and replaces it when one does; provide owner (required), and optionally year (defaults to the current year) and allRightsReserved (defaults to true). The tool emits exactly "Copyright © <year> <owner>." and, when allRightsReserved, "All Rights Reserved." — the owner is title-cased and the fixed wording/format cannot be overridden. action=remove blanks the block. After editing, call save_fdx to persist changes to disk.',
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      action: { type: "string", description: "set (add or replace the copyright) or remove" },
      owner: { type: "string", description: "copyright holder name (required for set); title-cased automatically" },
      year: { type: "string", description: "copyright year; defaults to the current year when omitted" },
      allRightsReserved: {
        type: "boolean",
        description: "include the 'All Rights Reserved.' second line; defaults to true",
      },
    },
    required: ["path", "action"],
  },
};

export async function handleEditCopyright(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  const action = arg<string>(args, "action");
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");
  if (!action) return errResult("action is required");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const paragraphs = doc.getTitlePageParagraphs();

  if (action === "set") {
    const owner = arg<string>(args, "owner");
    if (!owner?.trim()) return errResult("set requires an owner");
    const year = arg<string>(args, "year") ?? "";
    const allRightsReserved = copyrightAllRights(arg<boolean>(args, "allRightsReserved"));
    doc.setTitlePageParagraphs(setCopyrightBlock(paragraphs, owner, year, allRightsReserved));
  } else if (action === "remove") {
    if (!clearCopyrightBlock(paragraphs)) {
      return pushCacheWarning(textResult("No copyright statement was found."), warning);
    }
    doc.setTitlePageParagraphs(paragraphs);
  } else {
    return errResult("action must be 'set' or 'remove'");
  }

  const dirtyWarning = documentCache.touchDirty(path, doc);
  const past = action === "remove" ? "removed" : "set";
  const result = pushCacheWarning(
    pushCacheWarning(textResult(`Successfully ${past} the copyright. File updated in cache — call save_fdx to persist changes to disk.`), dirtyWarning),
    warning,
  );
  return result;
}

