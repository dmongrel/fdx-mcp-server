// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * The single list of every tool the server registers over MCP. get_context and search_actions
 * build their rosters from this same array (see context-data.ts), so a tool added here is
 * automatically discoverable through both — the previous roster was a separately hand-maintained
 * list that silently fell out of sync as tools were added and descriptions were revised.
 */

import type { FdxTool } from "./shared.ts";
import { getContextTool } from "./get-context-tool.ts";
import { searchActionsTool } from "./search-actions-tool.ts";
import { readFdxTool } from "./read-fdx.ts";
import { saveFdxTool } from "./save-fdx.ts";
import { newFileTool } from "./new-file.ts";
import { getCacheStatusTool } from "./get-cache-status.ts";
import { closeFdxTool } from "./close-fdx.ts";
import { reloadFdxTool } from "./reload-fdx.ts";
import { savepointTool } from "./savepoint.ts";
import { rollbackTool } from "./rollback.ts";
import { batchEditTool } from "./batch-edit.ts";
import { getParTool } from "./get-par.ts";
import { findDuplicateIdsTool } from "./find-duplicate-ids.ts";
import { fixDuplicateIdsTool } from "./fix-duplicate-ids.ts";
import { getParRunsTool } from "./get-par-runs.ts";
import { editParTool } from "./edit-par.ts";
import { createDialogueTool } from "./create-dialogue.ts";
import { diffFdxTool } from "./diff-fdx.ts";
import { findParTool } from "./find-par.ts";
import { replaceTextTool } from "./replace-text.ts";
import { readFullFileTool } from "./read-full-file.ts";
import { listTypesTool } from "./list-types.ts";
import { getSmarttypeCharactersTool } from "./get-smarttype-characters.ts";
import { editSmarttypeCharactersTool } from "./edit-smarttype-characters.ts";
import { renameCharacterTool } from "./rename-character.ts";
import { getCastTool } from "./get-cast.ts";
import { editCastTool } from "./edit-cast.ts";
import { getSmarttypeExtensionsTool } from "./get-smarttype-extensions.ts";
import { editSmarttypeExtensionsTool } from "./edit-smarttype-extensions.ts";
import { getSmarttypeLocationsTool } from "./get-smarttype-locations.ts";
import { editSmarttypeLocationsTool } from "./edit-smarttype-locations.ts";
import { getLocationsTool } from "./get-locations.ts";
import { editLocationsTool } from "./edit-locations.ts";
import { getSmarttypeSceneIntrosTool } from "./get-smarttype-scene-intros.ts";
import { editSmarttypeSceneIntrosTool } from "./edit-smarttype-scene-intros.ts";
import { getSmarttypeTimesOfDayTool } from "./get-smarttype-times-of-day.ts";
import { editSmarttypeTimesOfDayTool } from "./edit-smarttype-times-of-day.ts";
import { getSmarttypeTransitionsTool } from "./get-smarttype-transitions.ts";
import { editSmarttypeTransitionsTool } from "./edit-smarttype-transitions.ts";
import { getSpellCheckListsTool } from "./get-spell-check-lists.ts";
import { editSpellCheckTool } from "./edit-spell-check.ts";
import { getSectionTool } from "./get-section.ts";
import { getSectionListTool } from "./get-section-list.ts";
import { getDualDialogueTool } from "./get-dual-dialogue.ts";
import { editDualDialogueTool } from "./edit-dual-dialogue.ts";
import { getTitlePageTool } from "./get-title-page.ts";
import { editTitlePageTool } from "./edit-title-page.ts";
import { getCopyrightTool } from "./get-copyright.ts";
import { editCopyrightTool } from "./edit-copyright.ts";
import { getMacroAliasListTool } from "./get-macro-alias-list.ts";
import { getMacroAliasTool } from "./get-macro-alias.ts";
import { getElementSettingsTool } from "./get-element-settings.ts";
import { editElementSettingsTool } from "./edit-element-settings.ts";
import { getHeaderAndFooterTool } from "./get-header-and-footer.ts";
import { editHeaderAndFooterTool } from "./edit-header-and-footer.ts";
import { getScriptStatsTool } from "./get-script-stats.ts";
import { getFlaggedWordsTool } from "./get-flagged-words.ts";
import { getPlaceholdersTool } from "./get-placeholders.ts";
import { getSceneIndexTool } from "./get-scene-index.ts";
import { getCharacterAppearancesTool } from "./get-character-appearances.ts";
import { getPageMapTool } from "./get-page-map.ts";
import { getScenePropertiesTool } from "./get-scene-properties.ts";
import { editScenePropertiesTool } from "./edit-scene-properties.ts";
import { getSceneArcBeatsTool } from "./get-scene-arc-beats.ts";
import { editSceneArcBeatsTool } from "./edit-scene-arc-beats.ts";
import { getRevisionsTool } from "./get-revisions.ts";
import { getTagDataTool } from "./get-tag-data.ts";
import { getDisplayBoardsTool } from "./get-display-boards.ts";
import { getFdxBreakdownTool } from "./get-fdx-breakdown.ts";
import { convertToPdfTool } from "./convert-to-pdf.ts";

const readFileTool: FdxTool = {
  name: "read_file",
  description:
    "Read the contents of a file at the given path. Generic, whole-file text reader — not aware of the .fdx format. Do not use on .fdx files; use read_fdx and the other fdx-* tools instead, since hand-editing screenplay XML risks corrupting run boundaries and attributes that this tool cannot preserve.",
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
};

const writeFileTool: FdxTool = {
  name: "write_file",
  description:
    "Write content to a file, creating it if it does not exist. Generic, whole-file text writer — not aware of the .fdx format. Do not use on .fdx files; use edit_par and the other edit_* tools instead, since overwriting screenplay XML by hand risks merging runs and destroying attributes like AdornmentStyle.",
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
};

export const tools: FdxTool[] = [
  getContextTool,
  searchActionsTool,
  readFdxTool,
  saveFdxTool,
  newFileTool,
  getCacheStatusTool,
  closeFdxTool,
  reloadFdxTool,
  savepointTool,
  rollbackTool,
  batchEditTool,
  getParTool,
  findDuplicateIdsTool,
  fixDuplicateIdsTool,
  getParRunsTool,
  editParTool,
  createDialogueTool,
  diffFdxTool,
  findParTool,
  replaceTextTool,
  readFullFileTool,
  listTypesTool,
  getSmarttypeCharactersTool,
  editSmarttypeCharactersTool,
  renameCharacterTool,
  getCastTool,
  editCastTool,
  getSmarttypeExtensionsTool,
  editSmarttypeExtensionsTool,
  getSmarttypeLocationsTool,
  editSmarttypeLocationsTool,
  getLocationsTool,
  editLocationsTool,
  getSmarttypeSceneIntrosTool,
  editSmarttypeSceneIntrosTool,
  getSmarttypeTimesOfDayTool,
  editSmarttypeTimesOfDayTool,
  getSmarttypeTransitionsTool,
  editSmarttypeTransitionsTool,
  getSpellCheckListsTool,
  editSpellCheckTool,
  getSectionTool,
  getSectionListTool,
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
  getFlaggedWordsTool,
  getPlaceholdersTool,
  getSceneIndexTool,
  getCharacterAppearancesTool,
  getPageMapTool,
  getScenePropertiesTool,
  editScenePropertiesTool,
  getSceneArcBeatsTool,
  editSceneArcBeatsTool,
  getRevisionsTool,
  getTagDataTool,
  getDisplayBoardsTool,
  getFdxBreakdownTool,
  convertToPdfTool,
  readFileTool,
  writeFileTool,
];
