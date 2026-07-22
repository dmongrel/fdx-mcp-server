// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * edit_spell_check — Add, change, remove, or fix entries in the spell-check ignore-words list.
 * Mirrors Go's tools/edit_spell_check.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import { getCachedFdx, hasFdxExtension, pushCacheWarning, textResult, errResult } from "./shared.ts";
import { editSmartList, actionPastTense, type SmartListEdit } from "./smart-type-ops.ts";

export const editSpellCheckTool: FdxTool = {
  name: "edit_spell_check",
  description:
    "Add, change, remove, or fix entries in the spell-check ignore-words list (a single list of any-case words). action=create appends value; action=edit replaces the first word equal to find (case-insensitive unless cs=true) with replace; action=remove deletes the first word equal to find; action=fix just cleans the list. Optional uppercase and dedup flags post-process the list, which is always alphabetized case-insensitively. Ignore-ranges are preserved untouched. After editing, call save_fdx to persist changes to disk.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      action: { type: "string", description: "create, edit, remove, or fix" },
      find: { type: "string", description: "(edit/remove) the existing word to change or delete" },
      replace: { type: "string", description: "(edit) the word to replace the found entry with" },
      value: { type: "string", description: "(create) the new word to add to the list" },
      cs: { type: "boolean", description: "(edit/remove) match find case-sensitively (default false)" },
      uppercase: { type: "boolean", description: "uppercase every word after the change" },
      dedup: { type: "boolean", description: "remove duplicate words (exact, case-sensitive match) after the change" },
    },
    required: ["path", "action"],
  },
};

export async function handleEditSpellCheck(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = args?.path as string | undefined;
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");

  const action = args?.action as string | undefined;

  let warning: string;
  let doc;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Fold any stray nested words into the single canonical list first.
  doc.consolidateSpellCheckWords();

  const e: SmartListEdit = {
    action,
    find: args?.find as string | undefined,
    replace: args?.replace as string | undefined,
    value: args?.value as string | undefined,
    cs: args?.cs as boolean | undefined,
    uppercase: args?.uppercase as boolean | undefined,
    dedup: args?.dedup as boolean | undefined,
  };

  const result = editSmartList(doc.getIgnoredWords(), e);
  if (!result.ok) {
    return errResult(`failed to ${action} ignore word: ${result.reason}`);
  }
  doc.setIgnoredWords(result.list);

  const dirtyWarning = documentCache.touchDirty(path, doc);

  let out = textResult(
    `Successfully ${actionPastTense(action ?? "")} spell-check ignore words. File updated in cache — call save_fdx to persist changes to disk.`,
  );
  out = pushCacheWarning(out, warning);
  out = pushCacheWarning(out, dirtyWarning);
  return out;
}

