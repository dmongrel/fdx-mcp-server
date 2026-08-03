// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * Static data backing get_context and search_actions: the formatting rules, plus the tool
 * roster derived from registry.ts (the single list the server actually registers over MCP) so
 * the two stay in sync automatically instead of drifting as separately hand-maintained lists.
 */

import { tools } from "./registry.ts";

export interface ContextRule {
  title: string;
  content: string;
}

export interface ToolInfo {
  name: string;
  description: string;
}

export const contextRules: ContextRule[] = [
  {
    title: "File Extension",
    content:
      "Only .fdx files are supported. All tools validate the file extension (case-insensitive) before processing.",
  },
  {
    title: "Cache Dependency",
    content:
      "Most read and edit tools require 'read_fdx' to be called first to populate the server cache. Tools that do NOT require it are: get_context, list_types, search_actions, new_file, save_fdx, get_cache_status, close_fdx, reload_fdx.",
  },
  {
    title: "Persistence",
    content:
      "After any edit operation (edit_par, edit_copyright, edit_smarttype_characters, etc.), call 'save_fdx' to persist changes to disk. Edits are applied in cache only until then.",
  },
  {
    title: "Versioned Saves and the Cache",
    content:
      "A versioned save (save_fdx with the default version bump) writes a NEW path, re-caches the document there clean, and leaves the previous path cached and dirty. This is expected: the old path's in-memory copy genuinely differs from the file on disk at that path, and the server never writes back to it. Under versioning every superseded path stays dirty for the rest of the session. Track the dirty flag on your CURRENT path only — a dirty flag on a superseded version is normal and means nothing was lost; the content is on disk under the newer name. Because each versioned save mints a new path, a sequence of saves on one document fills the 4-slot cache by the fourth save and begins evicting. Eviction warnings naming a superseded version are expected noise. To avoid them, call close_fdx on the previous path after a versioned save; it will require force=true, which is safe precisely because the content was written to the new path.",
  },
  {
    title: "Batch Edits and Savepoints",
    content:
      "batch_edit runs an ordered list of edit operations against one document, all-or-nothing: if any operation fails, every operation in the batch is rolled back and the document is left exactly as it was before the call. It takes a savepoint automatically before running and leaves it in place afterward, win or lose — so rollback can undo the whole batch even after it succeeds, if you change your mind. savepoint/rollback are the same mechanism, callable directly around any sequence of individual edit_* calls — one level only, and a new savepoint (manual or from the next batch_edit call) always overwrites whatever was there. Neither touches disk; save_fdx is still a separate, explicit step.",
  },
  {
    title: "Paragraph Structure",
    content:
      "A paragraph has a Type (e.g., Scene Heading, Action, Dialogue), an Id (UUID), and optional Text runs with styling. Paragraphs are ordered sequentially in the document.",
  },
  {
    title: "Dialogue Sequence",
    content:
      "Speaking requires a strict chain: Character -> [Parenthetical] -> Dialogue. A Dialogue paragraph is invalid unless preceded immediately by Character or Parenthetical. create_dialogue creates a valid group in one call instead of two or three separate edit_par creates that leave the document in an invalid intermediate state in between.",
  },
  {
    title: "Scene Establishment",
    content:
      "A Scene Heading must be followed immediately by an Action paragraph. Never follow a Scene Heading directly with dialogue or transitions.",
  },
  {
    title: "Transitions",
    content:
      "Transitions (e.g., CUT TO:) are right-aligned and must always be followed immediately by a new Scene Heading.",
  },
  {
    title: "SmartType Lists",
    content:
      "Character names, extensions, scene intros, locations, times of day, and transitions are stored in auto-complete dictionaries. Edits auto-alphabetize case-insensitively; optional uppercase and dedup flags post-process the list.",
  },
  {
    title: "Element Settings",
    content:
      "Each paragraph type has exactly one ElementSettings record defining its formatting (font, alignment, indentation, spacing). A type may exist only once — create is rejected if it exists; edit/remove rejected if it does not.",
  },
  {
    title: "Title Page Layout",
    content:
      "The title page follows a standard layout: copyright (optional), top spacing, title, subtitle, by-line ('Written by'), author, based-on block (optional), bottom spacing, contact block. The target paragraph count is 48 to prevent overflow.",
  },
  {
    title: "Copyright Block",
    content:
      "The copyright occupies the first two title-page paragraphs. Use edit_copyright for dedicated management; edit_title_page can also set it via copyrightOwner/copyrightYear fields.",
  },
  {
    title: "Header/Footer Locations",
    content:
      "Headers and footers exist in two locations: 'body' (script body, default) and 'titlePage'. Dynamic labels include Page #, Date, Time, and Script Title. Each part must set either text or label, not both.",
  },
  {
    title: "Dual Dialogue",
    content:
      "Side-by-side dialogue is nested inside a wrapper paragraph with a <DualDialogue> child; edit_dual_dialogue action=create always builds this wrapper with Type='General', but a wrapper Final Draft's own UI authors may instead carry the first contained paragraph's type (e.g. Type='Character') — don't filter on wrapper type to find dual-dialogue blocks. Use edit_dual_dialogue to create (move paragraphs into wrapper) or remove (delete wrapper, optionally extract contents).",
  },
  {
    title: "Section Boundaries",
    content:
      "A 'section' starts at any section-heading paragraph (Scene Heading, Act Break, etc.) and extends until the next section heading. Use get_section to retrieve a section's heading and all following paragraphs.",
  },
  {
    title: "Scene Color",
    content:
      "Final Draft's scene color is a 12-hex-digit value, #RRRRGGGGBBBB — each RGB channel doubled to 4 hex digits (e.g. #6363A7A7EFEF), not the usual 6-digit web format. edit_scene_properties(id, color=...) sets it on an existing paragraph, creating its SceneProperties block if needed; edit_par action=create also accepts a color parameter for a new Scene Heading. Neither tool validates the format — send it in Final Draft's own form.",
  },
  {
    title: "UUID Generation",
    content:
      "New paragraphs created by edit_par or edit_dual_dialogue receive fresh UUIDs via generateUUID(), returned directly in the create response ({id, ...} as JSON) — no separate lookup needed. Existing paragraph IDs must be preserved when editing or moving content.",
  },
  {
    title: "Analysis Tools — Combining Them",
    content:
      "get_script_stats, get_scene_index, get_character_appearances, get_page_map, get_scene_properties, and get_scene_arc_beats are all read-only and return JSON; get_fdx_breakdown instead writes a combined report to a targetPath file (text/html/pdf). Quick scan: call get_script_stats first before deeper inspection. Scene navigation: get_scene_index for the full catalog, then get_scene_properties(id) for one scene's typed metadata, then get_section(id) to read/edit its actual paragraphs. Character tracking: get_character_appearances(character=name) to see where they appear, cross-referenced with get_scene_arc_beats — a character with appearances but no arc beats may be an untracked role. Pagination-aware editing: check get_page_map before an edit_par insert to see whether it would split content across a page boundary. Full report: get_fdx_breakdown(targetPath, asType='text'|'html'|'pdf') writes a single combined document to disk instead of returning it inline. Production metadata: get_revisions, get_tag_data, and get_display_boards expose Revisions/TagData/DisplayBoards verbatim as JSON; they are informational only — there is no edit_* tool for them.",
  },
];


/** The tool roster shown by get_context/search_actions, derived from the actual MCP registry. */
export const contextTools: ToolInfo[] = tools.map((t) => ({ name: t.name, description: t.description }));

function buildGetContextText(): string {
  const parts: string[] = [];
  parts.push("=== Formatting Rules & Constraints ===\n\n");
  for (const r of contextRules) {
    parts.push(`## ${r.title}\n${r.content}\n\n`);
  }
  parts.push("=== Available Tools ===\n\n");
  for (const t of contextTools) {
    parts.push(`- \`${t.name}\`: ${t.description}\n`);
  }
  return parts.join("");
}

// Built once at module load — every get_context call returns this cached string.
export const getContextText = buildGetContextText();

export const searchActionsText = `Available tools: ${contextTools.map((t) => t.name).join(", ")}`;
