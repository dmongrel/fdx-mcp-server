/**
 * fdx-mcp-server
 * A Model Context Protocol (MCP) server built for Bun, compatible with Deno.
 * Uses stdio transport (JSON-RPC 2.0 over stdin/stdout).
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  InitializeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { getContextTool, handleGetContext } from "./tools/get-context.ts";
import { searchActionsTool, handleSearchActions } from "./tools/search-actions.ts";
import { readFdxTool, handleReadFdx } from "./tools/read-fdx.ts";
import { saveFdxTool, handleSaveFdx } from "./tools/save-fdx.ts";
import { newFileTool, handleNewFile } from "./tools/new-file.ts";
import { getCacheStatusTool, handleGetCacheStatus } from "./tools/get-cache-status.ts";
import { closeFdxTool, handleCloseFdx } from "./tools/close-fdx.ts";
import { reloadFdxTool, handleReloadFdx } from "./tools/reload-fdx.ts";
import { getParTool, handleGetPar } from "./tools/get-par.ts";
import { editParTool, handleEditPar } from "./tools/edit-par.ts";
import { findParTool, handleFindPar } from "./tools/find-par.ts";
import { readFullFileTool, handleReadFullFile } from "./tools/read-full-file.ts";
import { listTypesTool, handleListTypes } from "./tools/list-types.ts";
import { getCharactersTool, handleGetCharacters } from "./tools/get-characters.ts";
import { editCharactersTool, handleEditCharacters } from "./tools/edit-characters.ts";
import { getExtensionsTool, handleGetExtensions } from "./tools/get-extensions.ts";
import { editExtensionsTool, handleEditExtensions } from "./tools/edit-extensions.ts";
import { getLocationsTool, handleGetLocations } from "./tools/get-locations.ts";
import { editLocationsTool, handleEditLocations } from "./tools/edit-locations.ts";
import { getSceneIntrosTool, handleGetSceneIntros } from "./tools/get-scene-intros.ts";
import { editSceneIntrosTool, handleEditSceneIntros } from "./tools/edit-scene-intros.ts";
import { getTimesOfDayTool, handleGetTimesOfDay } from "./tools/get-times-of-day.ts";
import { editTimesOfDayTool, handleEditTimesOfDay } from "./tools/edit-times-of-day.ts";
import { getTransitionsTool, handleGetTransitions } from "./tools/get-transitions.ts";
import { editTransitionsTool, handleEditTransitions } from "./tools/edit-transitions.ts";
import { getSpellCheckListsTool, handleGetSpellCheckLists } from "./tools/get-spell-check-lists.ts";
import { editSpellCheckTool, handleEditSpellCheck } from "./tools/edit-spell-check.ts";
import { getSectionTool, handleGetSection } from "./tools/get-section.ts";
import { getSectionListTool, handleGetSectionList } from "./tools/get-section-list.ts";
import { getSectionParListTool, handleGetSectionParList } from "./tools/get-section-par-list.ts";
import { getDualDialogueTool, handleGetDualDialogue } from "./tools/get-dual-dialogue.ts";
import { editDualDialogueTool, handleEditDualDialogue } from "./tools/edit-dual-dialogue.ts";
import { getTitlePageTool, handleGetTitlePage } from "./tools/get-title-page.ts";
import { editTitlePageTool, handleEditTitlePage } from "./tools/edit-title-page.ts";
import { getCopyrightTool, handleGetCopyright } from "./tools/get-copyright.ts";
import { editCopyrightTool, handleEditCopyright } from "./tools/edit-copyright.ts";
import { getMacroAliasListTool, handleGetMacroAliasList } from "./tools/get-macro-alias-list.ts";
import { getMacroAliasTool, handleGetMacroAlias } from "./tools/get-macro-alias.ts";
import { getElementSettingsTool, handleGetElementSettings } from "./tools/get-element-settings.ts";
import { editElementSettingsTool, handleEditElementSettings } from "./tools/edit-element-settings.ts";
import { getHeaderAndFooterTool, handleGetHeaderAndFooter } from "./tools/get-header-and-footer.ts";
import { editHeaderAndFooterTool, handleEditHeaderAndFooter } from "./tools/edit-header-and-footer.ts";
import { getScriptStatsTool, handleGetScriptStats } from "./tools/get-script-stats.ts";
import { getSceneIndexTool, handleGetSceneIndex } from "./tools/get-scene-index.ts";
import { getCharacterAppearancesTool, handleGetCharacterAppearances } from "./tools/get-character-appearances.ts";
import { getPageMapTool, handleGetPageMap } from "./tools/get-page-map.ts";
import { getScenePropertiesTool, handleGetSceneProperties } from "./tools/get-scene-properties.ts";
import { getSceneArcBeatsTool, handleGetSceneArcBeats } from "./tools/get-scene-arc-beats.ts";
import { getRevisionsTool, handleGetRevisions } from "./tools/get-revisions.ts";
import { getTagDataTool, handleGetTagData } from "./tools/get-tag-data.ts";
import { getDisplayBoardsTool, handleGetDisplayBoards } from "./tools/get-display-boards.ts";
import { getFdxBreakdownTool, handleGetFdxBreakdown } from "./tools/get-fdx-breakdown.ts";

/* ------------------------------------------------------------------ */
/*  MCP Server instance                                               */
/* ------------------------------------------------------------------ */

const server = new Server(
  { name: "fdx-mcp-server", version: "0.1.0" },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Portable file I/O that works in both Bun and Deno
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
  throw new Error("Unsupported runtime — requires Bun or Deno.");
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
  throw new Error("Unsupported runtime — requires Bun or Deno.");
}

/* ------------------------------------------------------------------ */
/*  Tool definitions                                                  */
/* ------------------------------------------------------------------ */

interface FdxTool {
  name: string;
  description: string;
  inputSchema: object;
}

const tools: FdxTool[] = [
  getContextTool,
  searchActionsTool,
  readFdxTool,
  saveFdxTool,
  newFileTool,
  getCacheStatusTool,
  closeFdxTool,
  reloadFdxTool,
  getParTool,
  editParTool,
  findParTool,
  readFullFileTool,
  listTypesTool,
  getCharactersTool,
  editCharactersTool,
  getExtensionsTool,
  editExtensionsTool,
  getLocationsTool,
  editLocationsTool,
  getSceneIntrosTool,
  editSceneIntrosTool,
  getTimesOfDayTool,
  editTimesOfDayTool,
  getTransitionsTool,
  editTransitionsTool,
  getSpellCheckListsTool,
  editSpellCheckTool,
  getSectionTool,
  getSectionListTool,
  getSectionParListTool,
  getDualDialogueTool,
  editDualDialogueTool,
  getTitlePageTool,
  editTitlePageTool,
  getCopyrightTool,
  editCopyrightTool,
  getMacroAliasListTool,
  getMacroAliasTool,
  getElementSettingsTool,
  editElementSettingsTool,
  getHeaderAndFooterTool,
  editHeaderAndFooterTool,
  getScriptStatsTool,
  getSceneIndexTool,
  getCharacterAppearancesTool,
  getPageMapTool,
  getScenePropertiesTool,
  getSceneArcBeatsTool,
  getRevisionsTool,
  getTagDataTool,
  getDisplayBoardsTool,
  getFdxBreakdownTool,
  {
    name: "read_file",
    description: "Read the contents of a file at the given path.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative path to the file.",
        },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file, creating it if it does not exist.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Absolute or relative path for the output file.",
        },
        content: {
          type: "string",
          description: "Text content to write.",
        },
      },
      required: ["path", "content"],
    },
  },
];

/* ------------------------------------------------------------------ */
/*  Request handlers                                                  */
/* ------------------------------------------------------------------ */

server.setRequestHandler(InitializeRequestSchema, () => ({
  protocolVersion: "2025-03-26",
  capabilities: {
    tools: {},
  },
}));

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
  get_par: (args) => handleGetPar(args),
  edit_par: (args) => handleEditPar(args),
  find_par: (args) => handleFindPar(args),
  read_full_file: (args) => handleReadFullFile(args),
  list_types: (args) => handleListTypes(args),
  get_characters: (args) => handleGetCharacters(args),
  edit_characters: (args) => handleEditCharacters(args),
  get_extensions: (args) => handleGetExtensions(args),
  edit_extensions: (args) => handleEditExtensions(args),
  get_locations: (args) => handleGetLocations(args),
  edit_locations: (args) => handleEditLocations(args),
  get_scene_intros: (args) => handleGetSceneIntros(args),
  edit_scene_intros: (args) => handleEditSceneIntros(args),
  get_times_of_day: (args) => handleGetTimesOfDay(args),
  edit_times_of_day: (args) => handleEditTimesOfDay(args),
  get_transitions: (args) => handleGetTransitions(args),
  edit_transitions: (args) => handleEditTransitions(args),
  get_spell_check_lists: (args) => handleGetSpellCheckLists(args),
  edit_spell_check: (args) => handleEditSpellCheck(args),
  get_section: (args) => handleGetSection(args),
  get_section_list: (args) => handleGetSectionList(args),
  get_section_par_list: (args) => handleGetSectionParList(args),
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
  get_scene_index: (args) => handleGetSceneIndex(args),
  get_character_appearances: (args) => handleGetCharacterAppearances(args),
  get_page_map: (args) => handleGetPageMap(args),
  get_scene_properties: (args) => handleGetSceneProperties(args),
  get_scene_arc_beats: (args) => handleGetSceneArcBeats(args),
  get_revisions: (args) => handleGetRevisions(args),
  get_tag_data: (args) => handleGetTagData(args),
  get_display_boards: (args) => handleGetDisplayBoards(args),
  get_fdx_breakdown: (args) => handleGetFdxBreakdown(args),
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
