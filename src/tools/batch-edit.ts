// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * batch_edit — runs an ordered list of edit operations against one document, all-or-nothing. Takes
 * a savepoint before running (see savepoint.ts/rollback.ts), then dispatches each operation to the
 * same handler function its own MCP tool uses. The first operation to fail triggers an immediate
 * rollback to the pre-batch state and stops the batch; no partial result is ever left in the cache.
 * On full success, the pre-batch savepoint is left in place so the whole batch can still be undone
 * afterward with a plain rollback call.
 *
 * Allowlisted to pure in-memory mutation tools only — never save_fdx/reload_fdx/close_fdx/new_file/
 * read_fdx, since a disk write or cache-lifecycle change can't be rolled back by this mechanism.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, errResult, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import { handleEditPar } from "./edit-par.ts";
import { handleEditDualDialogue } from "./edit-dual-dialogue.ts";
import { handleEditCast } from "./edit-cast.ts";
import { handleEditSceneArcBeats } from "./edit-scene-arc-beats.ts";
import { handleEditSmarttypeCharacters } from "./edit-smarttype-characters.ts";
import { handleEditSmarttypeExtensions } from "./edit-smarttype-extensions.ts";
import { handleEditSmarttypeLocations } from "./edit-smarttype-locations.ts";
import { handleEditSmarttypeSceneIntros } from "./edit-smarttype-scene-intros.ts";
import { handleEditSmarttypeTimesOfDay } from "./edit-smarttype-times-of-day.ts";
import { handleEditSmarttypeTransitions } from "./edit-smarttype-transitions.ts";
import { handleEditSpellCheck } from "./edit-spell-check.ts";
import { handleEditLocations } from "./edit-locations.ts";
import { handleEditTitlePage } from "./edit-title-page.ts";
import { handleEditCopyright } from "./edit-copyright.ts";
import { handleEditElementSettings } from "./edit-element-settings.ts";
import { handleEditHeaderAndFooter } from "./edit-header-and-footer.ts";
import { handleReplaceText } from "./replace-text.ts";
import { handleRenameCharacter } from "./rename-character.ts";

type OperationHandler = (args: Record<string, unknown> | undefined) => Promise<ToolResult>;

const ALLOWED_OPERATIONS: Record<string, OperationHandler> = {
  edit_par: handleEditPar,
  edit_dual_dialogue: handleEditDualDialogue,
  edit_cast: handleEditCast,
  edit_scene_arc_beats: handleEditSceneArcBeats,
  edit_smarttype_characters: handleEditSmarttypeCharacters,
  edit_smarttype_extensions: handleEditSmarttypeExtensions,
  edit_smarttype_locations: handleEditSmarttypeLocations,
  edit_smarttype_scene_intros: handleEditSmarttypeSceneIntros,
  edit_smarttype_times_of_day: handleEditSmarttypeTimesOfDay,
  edit_smarttype_transitions: handleEditSmarttypeTransitions,
  edit_spell_check: handleEditSpellCheck,
  edit_locations: handleEditLocations,
  edit_title_page: handleEditTitlePage,
  edit_copyright: handleEditCopyright,
  edit_element_settings: handleEditElementSettings,
  edit_header_and_footer: handleEditHeaderAndFooter,
  replace_text: handleReplaceText,
  rename_character: handleRenameCharacter,
};

const ALLOWED_TOOL_NAMES = Object.keys(ALLOWED_OPERATIONS).join(", ");

export const batchEditTool: FdxTool = {
  name: "batch_edit",
  description:
    `Run an ordered list of edit operations against one document, all-or-nothing: if any operation fails, every operation in the batch is rolled back and the document is left exactly as it was before the call. Takes a savepoint automatically before running and leaves it in place afterward, win or lose, so rollback can undo the whole batch even after it succeeds. Each operation is {tool, args} — tool must be one of: ${ALLOWED_TOOL_NAMES} (never save_fdx/reload_fdx/close_fdx/new_file/read_fdx — a disk write can't be rolled back). path is supplied once for the whole batch and injected into every operation's args, overriding anything given there. After a successful batch, call save_fdx to persist changes to disk.`,
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      operations: {
        type: "array",
        description: "ordered list of {tool, args} operations to apply atomically",
        items: {
          type: "object",
          properties: {
            tool: { type: "string", description: `one of: ${ALLOWED_TOOL_NAMES}` },
            args: {
              type: "object",
              description: "arguments for that tool, same shape as calling it directly (path is supplied automatically)",
            },
          },
          required: ["tool", "args"],
        },
      },
    },
    required: ["path", "operations"],
  },
};

interface BatchOperation {
  tool: string;
  args: Record<string, unknown>;
}

export async function handleBatchEdit(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");

  const operations = arg<BatchOperation[]>(args, "operations");
  if (!Array.isArray(operations) || operations.length === 0) {
    return errResult("operations is required and must be a non-empty array");
  }

  for (let i = 0; i < operations.length; i++) {
    const tool = operations[i]!.tool;
    if (!ALLOWED_OPERATIONS[tool]) {
      return errResult(
        `failed to validate batch: operation ${i} names an unsupported tool "${tool}" — allowed: ${ALLOWED_TOOL_NAMES}`,
      );
    }
  }

  const savepointResult = documentCache.setSavepoint(path);
  if (!savepointResult.ok) {
    return errResult(`failed to start batch: ${savepointResult.reason}; call read_fdx first`);
  }

  const results: Array<{ tool: string; result: string }> = [];
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i]!;
    const handler = ALLOWED_OPERATIONS[op.tool]!;
    const opResult = await handler({ ...op.args, path });
    const resultText = opResult.content.map((c) => c.text).join("\n");

    if (opResult.isError) {
      documentCache.rollback(path);
      const body = {
        path,
        failedAtIndex: i,
        failedTool: op.tool,
        error: resultText,
        results,
        message: `Batch failed at operation ${i + 1} (${op.tool}): ${resultText} All changes rolled back — the document is unchanged from before this batch call.`,
      };
      return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }], isError: true };
    }

    results.push({ tool: op.tool, result: resultText });
  }

  const body = {
    path,
    operationsApplied: operations.length,
    results,
    message: `Successfully applied ${operations.length} operation(s) atomically. A savepoint from before this batch is still available — call rollback to undo the whole batch. File updated in cache — call save_fdx to persist changes to disk.`,
  };
  return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
}
