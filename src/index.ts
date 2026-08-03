// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * fdx-mcp-server
 * A Model Context Protocol (MCP) server built for Bun, compatible with Deno.
 * Uses stdio transport (JSON-RPC 2.0 over stdin/stdout).
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { tools } from "./tools/registry.ts";
import { handleGetContext } from "./tools/get-context.ts";
import { handleSearchActions } from "./tools/search-actions.ts";
import { handleReadFdx } from "./tools/read-fdx.ts";
import { handleSaveFdx } from "./tools/save-fdx.ts";
import { handleNewFile } from "./tools/new-file.ts";
import { handleGetCacheStatus } from "./tools/get-cache-status.ts";
import { handleCloseFdx } from "./tools/close-fdx.ts";
import { handleReloadFdx } from "./tools/reload-fdx.ts";
import { handleSavepoint } from "./tools/savepoint.ts";
import { handleRollback } from "./tools/rollback.ts";
import { handleBatchEdit } from "./tools/batch-edit.ts";
import { handleGetPar } from "./tools/get-par.ts";
import { handleFindDuplicateIds } from "./tools/find-duplicate-ids.ts";
import { handleFixDuplicateIds } from "./tools/fix-duplicate-ids.ts";
import { handleGetParRuns } from "./tools/get-par-runs.ts";
import { handleEditPar } from "./tools/edit-par.ts";
import { handleCreateDialogue } from "./tools/create-dialogue.ts";
import { handleDiffFdx } from "./tools/diff-fdx.ts";
import { handleFindPar } from "./tools/find-par.ts";
import { handleReplaceText } from "./tools/replace-text.ts";
import { handleReadFullFile } from "./tools/read-full-file.ts";
import { handleListTypes } from "./tools/list-types.ts";
import { handleGetSmarttypeCharacters } from "./tools/get-smarttype-characters.ts";
import { handleEditSmarttypeCharacters } from "./tools/edit-smarttype-characters.ts";
import { handleRenameCharacter } from "./tools/rename-character.ts";
import { handleGetCast } from "./tools/get-cast.ts";
import { handleEditCast } from "./tools/edit-cast.ts";
import { handleGetSmarttypeExtensions } from "./tools/get-smarttype-extensions.ts";
import { handleEditSmarttypeExtensions } from "./tools/edit-smarttype-extensions.ts";
import { handleGetSmarttypeLocations } from "./tools/get-smarttype-locations.ts";
import { handleEditSmarttypeLocations } from "./tools/edit-smarttype-locations.ts";
import { handleGetLocations } from "./tools/get-locations.ts";
import { handleEditLocations } from "./tools/edit-locations.ts";
import { handleGetSmarttypeSceneIntros } from "./tools/get-smarttype-scene-intros.ts";
import { handleEditSmarttypeSceneIntros } from "./tools/edit-smarttype-scene-intros.ts";
import { handleGetSmarttypeTimesOfDay } from "./tools/get-smarttype-times-of-day.ts";
import { handleEditSmarttypeTimesOfDay } from "./tools/edit-smarttype-times-of-day.ts";
import { handleGetSmarttypeTransitions } from "./tools/get-smarttype-transitions.ts";
import { handleEditSmarttypeTransitions } from "./tools/edit-smarttype-transitions.ts";
import { handleGetSpellCheckLists } from "./tools/get-spell-check-lists.ts";
import { handleEditSpellCheck } from "./tools/edit-spell-check.ts";
import { handleGetSection } from "./tools/get-section.ts";
import { handleGetSectionList } from "./tools/get-section-list.ts";
import { handleGetDualDialogue } from "./tools/get-dual-dialogue.ts";
import { handleEditDualDialogue } from "./tools/edit-dual-dialogue.ts";
import { handleGetTitlePage } from "./tools/get-title-page.ts";
import { handleEditTitlePage } from "./tools/edit-title-page.ts";
import { handleGetCopyright } from "./tools/get-copyright.ts";
import { handleEditCopyright } from "./tools/edit-copyright.ts";
import { handleGetMacroAliasList } from "./tools/get-macro-alias-list.ts";
import { handleGetMacroAlias } from "./tools/get-macro-alias.ts";
import { handleGetElementSettings } from "./tools/get-element-settings.ts";
import { handleEditElementSettings } from "./tools/edit-element-settings.ts";
import { handleGetHeaderAndFooter } from "./tools/get-header-and-footer.ts";
import { handleEditHeaderAndFooter } from "./tools/edit-header-and-footer.ts";
import { handleGetScriptStats } from "./tools/get-script-stats.ts";
import { handleGetFlaggedWords } from "./tools/get-flagged-words.ts";
import { handleGetPlaceholders } from "./tools/get-placeholders.ts";
import { handleGetSceneIndex } from "./tools/get-scene-index.ts";
import { handleGetCharacterAppearances } from "./tools/get-character-appearances.ts";
import { handleGetPageMap } from "./tools/get-page-map.ts";
import { handleGetSceneProperties } from "./tools/get-scene-properties.ts";
import { handleEditSceneProperties } from "./tools/edit-scene-properties.ts";
import { handleGetSceneArcBeats } from "./tools/get-scene-arc-beats.ts";
import { handleEditSceneArcBeats } from "./tools/edit-scene-arc-beats.ts";
import { handleGetRevisions } from "./tools/get-revisions.ts";
import { handleGetTagData } from "./tools/get-tag-data.ts";
import { handleGetDisplayBoards } from "./tools/get-display-boards.ts";
import { handleGetFdxBreakdown } from "./tools/get-fdx-breakdown.ts";
import { handleConvertToPdf } from "./tools/convert-to-pdf.ts";

/* ------------------------------------------------------------------ */
/*  MCP Server instance                                               */
/* ------------------------------------------------------------------ */

const server = new Server(
  { name: "fdx-mcp-server", version: "0.0.1" },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Portable file I/O that works in Bun, Deno, and Node
async function readFile(path: string): Promise<string> {
  if (typeof Bun !== "undefined") {
    return await Bun.file(path).text();
  }
  // Deno runtime check
  const deno = (globalThis as Record<string, unknown>).Deno as
    | { readTextFileSync(path: string): string }
    | undefined;
  if (deno) {
    return deno.readTextFileSync(path);
  }
  const { readFile: readFileNode } = await import("node:fs/promises");
  return await readFileNode(path, "utf8");
}

async function writeFile(path: string, content: string): Promise<void> {
  if (typeof Bun !== "undefined") {
    await Bun.write(path, content);
    return;
  }
  const deno = (globalThis as Record<string, unknown>).Deno as
    | { writeTextFile(path: string, content: string): Promise<void> }
    | undefined;
  if (deno) {
    await deno.writeTextFile(path, content);
    return;
  }
  const { writeFile: writeFileNode } = await import("node:fs/promises");
  await writeFileNode(path, content, "utf8");
}

/* ------------------------------------------------------------------ */
/*  Request handlers                                                  */
/* ------------------------------------------------------------------ */

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

/**
 * Handlers with no arguments/simple sync signatures are wired directly into this map; the
 * file-lifecycle tools (read_fdx, save_fdx, ...) take an args object and may be async, so they
 * are dispatched the same way — TypeScript's structural typing lets both shapes share the map
 * since every handler ultimately resolves to the same result shape.
 */
type HandlerResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };
const toolHandlers: Record<
  string,
  (args: Record<string, unknown> | undefined) => HandlerResult | Promise<HandlerResult>
> = {
  get_context: () => handleGetContext(),
  search_actions: () => handleSearchActions(),
  read_fdx: (args) => handleReadFdx(args),
  save_fdx: (args) => handleSaveFdx(args),
  new_file: (args) => handleNewFile(args),
  get_cache_status: () => handleGetCacheStatus(),
  close_fdx: (args) => handleCloseFdx(args),
  reload_fdx: (args) => handleReloadFdx(args),
  savepoint: (args) => handleSavepoint(args),
  rollback: (args) => handleRollback(args),
  batch_edit: (args) => handleBatchEdit(args),
  get_par: (args) => handleGetPar(args),
  find_duplicate_ids: (args) => handleFindDuplicateIds(args),
  fix_duplicate_ids: (args) => handleFixDuplicateIds(args),
  get_par_runs: (args) => handleGetParRuns(args),
  edit_par: (args) => handleEditPar(args),
  create_dialogue: (args) => handleCreateDialogue(args),
  diff_fdx: (args) => handleDiffFdx(args),
  find_par: (args) => handleFindPar(args),
  replace_text: (args) => handleReplaceText(args),
  read_full_file: (args) => handleReadFullFile(args),
  list_types: (args) => handleListTypes(args),
  get_smarttype_characters: (args) => handleGetSmarttypeCharacters(args),
  edit_smarttype_characters: (args) => handleEditSmarttypeCharacters(args),
  rename_character: (args) => handleRenameCharacter(args),
  get_cast: (args) => handleGetCast(args),
  edit_cast: (args) => handleEditCast(args),
  get_smarttype_extensions: (args) => handleGetSmarttypeExtensions(args),
  edit_smarttype_extensions: (args) => handleEditSmarttypeExtensions(args),
  get_smarttype_locations: (args) => handleGetSmarttypeLocations(args),
  edit_smarttype_locations: (args) => handleEditSmarttypeLocations(args),
  get_locations: (args) => handleGetLocations(args),
  edit_locations: (args) => handleEditLocations(args),
  get_smarttype_scene_intros: (args) => handleGetSmarttypeSceneIntros(args),
  edit_smarttype_scene_intros: (args) => handleEditSmarttypeSceneIntros(args),
  get_smarttype_times_of_day: (args) => handleGetSmarttypeTimesOfDay(args),
  edit_smarttype_times_of_day: (args) => handleEditSmarttypeTimesOfDay(args),
  get_smarttype_transitions: (args) => handleGetSmarttypeTransitions(args),
  edit_smarttype_transitions: (args) => handleEditSmarttypeTransitions(args),
  get_spell_check_lists: (args) => handleGetSpellCheckLists(args),
  edit_spell_check: (args) => handleEditSpellCheck(args),
  get_section: (args) => handleGetSection(args),
  get_section_list: (args) => handleGetSectionList(args),
  get_dual_dialogue: (args) => handleGetDualDialogue(args),
  edit_dual_dialogue: (args) => handleEditDualDialogue(args),
  get_title_page: (args) => handleGetTitlePage(args),
  edit_title_page: (args) => handleEditTitlePage(args),
  get_copyright: (args) => handleGetCopyright(args),
  edit_copyright: (args) => handleEditCopyright(args),
  get_macro_alias_list: (args) => handleGetMacroAliasList(args),
  get_macro_alias: (args) => handleGetMacroAlias(args),
  get_element_settings: (args) => handleGetElementSettings(args),
  edit_element_settings: (args) => handleEditElementSettings(args),
  get_header_and_footer: (args) => handleGetHeaderAndFooter(args),
  edit_header_and_footer: (args) => handleEditHeaderAndFooter(args),
  get_script_stats: (args) => handleGetScriptStats(args),
  get_flagged_words: (args) => handleGetFlaggedWords(args),
  get_placeholders: (args) => handleGetPlaceholders(args),
  get_scene_index: (args) => handleGetSceneIndex(args),
  get_character_appearances: (args) => handleGetCharacterAppearances(args),
  get_page_map: (args) => handleGetPageMap(args),
  get_scene_properties: (args) => handleGetSceneProperties(args),
  edit_scene_properties: (args) => handleEditSceneProperties(args),
  get_scene_arc_beats: (args) => handleGetSceneArcBeats(args),
  edit_scene_arc_beats: (args) => handleEditSceneArcBeats(args),
  get_revisions: (args) => handleGetRevisions(args),
  get_tag_data: (args) => handleGetTagData(args),
  get_display_boards: (args) => handleGetDisplayBoards(args),
  get_fdx_breakdown: (args) => handleGetFdxBreakdown(args),
  convert_to_pdf: (args) => handleConvertToPdf(args),
};

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const handler = toolHandlers[name];
  if (handler) {
    return await handler(args as Record<string, unknown> | undefined);
  }

  if (name === "read_file") {
    const filePath = args?.path as string | undefined;
    if (!filePath) {
      return {
        content: [{ type: "text", text: "Error: 'path' argument is required." }],
      };
    }

    try {
      const content = await readFile(filePath);
      return {
        content: [{ type: "text", text: content }],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error reading file: ${message}` }],
        isError: true,
      };
    }
  }

  if (name === "write_file") {
    const filePath = args?.path as string | undefined;
    const content = args?.content as string | undefined;

    if (!filePath || content === undefined) {
      return {
        content: [
          {
            type: "text",
            text: "Error: 'path' and 'content' arguments are required.",
          },
        ],
      };
    }

    try {
      await writeFile(filePath, content);
      return {
        content: [
          {
            type: "text",
            text: `Successfully wrote ${content.length} bytes to ${filePath}.`,
          },
        ],
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error writing file: ${message}` }],
        isError: true,
      };
    }
  }

  // Unknown tool
  return {
    content: [
      {
        type: "text",
        text: `Unknown tool: ${name}. Available tools: ${tools.map((t) => t.name).join(", ")}`,
      },
    ],
    isError: true,
  };
});

/* ------------------------------------------------------------------ */
/*  Start                                                             */
/* ------------------------------------------------------------------ */

const transport = new StdioServerTransport();
server.connect(transport).catch(console.error);

