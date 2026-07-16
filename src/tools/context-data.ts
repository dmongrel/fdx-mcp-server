/**
 * Static data backing get_context and search_actions: the formatting rules
 * and the full tool catalog, ported verbatim from the Go implementation's
 * tools/get_context.go.
 */

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
      "After any edit operation (edit_par, edit_copyright, edit_characters, etc.), call 'save_fdx' to persist changes to disk. Edits are applied in cache only until then.",
  },
  {
    title: "Paragraph Structure",
    content:
      "A paragraph has a Type (e.g., Scene Heading, Action, Dialogue), an Id (UUID), and optional Text runs with styling. Paragraphs are ordered sequentially in the document.",
  },
  {
    title: "Dialogue Sequence",
    content:
      "Speaking requires a strict chain: Character -> [Parenthetical] -> Dialogue. A Dialogue paragraph is invalid unless preceded immediately by Character or Parenthetical.",
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
      "Side-by-side dialogue is nested inside a Type='General' wrapper paragraph with a <DualDialogue> child. Use edit_dual_dialogue to create (move paragraphs into wrapper) or remove (delete wrapper, optionally extract contents).",
  },
  {
    title: "Section Boundaries",
    content:
      "A 'section' starts at any section-heading paragraph (Scene Heading, Act Break, etc.) and extends until the next section heading. Use get_section to retrieve a section's heading and all following paragraphs.",
  },
  {
    title: "UUID Generation",
    content:
      "New paragraphs created by edit_par or edit_dual_dialogue receive fresh UUIDs via generateUUID(). Existing paragraph IDs must be preserved when editing or moving content.",
  },
  {
    title: "Analysis Tools — Combining Them",
    content:
      "get_script_stats, get_scene_index, get_character_appearances, get_page_map, get_scene_properties, get_scene_arc_beats, and get_fdx_breakdown are all read-only and return JSON (except get_fdx_breakdown's html/pdf modes). Quick scan: call get_script_stats first before deeper inspection. Scene navigation: get_scene_index for the full catalog, then get_scene_properties(id) for one scene's typed metadata, then get_section(id) to read/edit its actual paragraphs. Character tracking: get_character_appearances(character=name) to see where they appear, cross-referenced with get_scene_arc_beats — a character with appearances but no arc beats may be an untracked role. Pagination-aware editing: check get_page_map before an edit_par insert to see whether it would split content across a page boundary. Full report: get_fdx_breakdown(asType='text'|'html'|'pdf') for a single combined document. Production metadata: get_revisions, get_tag_data, and get_display_boards expose Revisions/TagData/DisplayBoards verbatim as JSON; they are informational only — there is no edit_* tool for them.",
  },
];

export const contextTools: ToolInfo[] = [
  {
    name: "edit_copyright",
    description:
      'Add, replace, or remove the title page\'s copyright block — always the first two title-page paragraphs. action=set adds a copyright when none exists and replaces it when one does; provide owner (required), and optionally year (defaults to the current year) and allRightsReserved (defaults to true). The tool emits exactly "Copyright © <year> <owner>." and, when allRightsReserved, "All Rights Reserved." — the owner is title-cased and the fixed wording/format cannot be overridden. action=remove blanks the block. After editing, call save_fdx to persist changes to disk.',
  },
  {
    name: "edit_characters",
    description:
      "Add, change, remove, or fix entries in the SmartType Characters list (character names). action=create appends value; action=edit replaces the first entry equal to find (case-insensitive unless cs=true) with replace; action=remove deletes the first entry equal to find; action=fix just cleans the list. Optional uppercase and dedup flags post-process the list, which is always alphabetized case-insensitively after any change. After editing, call save_fdx to persist changes to disk.",
  },
  {
    name: "edit_dual_dialogue",
    description:
      "Restructure dual dialogue (side-by-side speech). action=create moves the top-level paragraphs named by ids (in order) into a new wrapper paragraph holding a <DualDialogue>, inserted where the first of them was — edit the paragraphs' content beforehand with edit_par. action=remove deletes the wrapper named by id; pass extract=true to move the contained paragraphs back to the top level first, or extract=false to delete the wrapper and its contents. After editing, call save_fdx to persist changes to disk.",
  },
  {
    name: "edit_element_settings",
    description:
      "Create, edit, or remove the ElementSettings (formatting style) for a paragraph type. There is no positioning — a type may exist only once, so action=create is rejected if the type already exists and action=edit/remove is rejected if it does not. For edit, only supplied (non-empty) fields change; the rest of the record is preserved. For remove, the record for the given type is deleted. The ParagraphSpec type is always kept equal to the element type. After editing, call save_fdx to persist changes to disk.",
  },
  {
    name: "edit_header_and_footer",
    description:
      "Create, edit, or remove a HeaderAndFooter in the script body (location='body', default) or the title page (location='titlePage'). Use action=create only when none exists at that location; action=edit requires one to exist. Supply headerParts and/or footerParts (each an ordered list of {text} or {label} pieces, where label is one of Page #, Date, Time, Script Title) to replace that header/footer's content wholesale. Tag attributes (headerVisible, footerVisible, headerFirstPage, footerFirstPage, startingPage) are applied when non-empty. action=remove resets the header/footer at that location to a blank (new-document) header/footer. After editing, call save_fdx to persist changes to disk.",
  },
  {
    name: "edit_par",
    description:
      "Create a new paragraph, edit an existing one, or remove one in a loaded screenplay. For create, use beforeParId or afterParId (each a paragraph id) to control insertion position (falls back to append). For edit, provide id (the paragraph id) and the fields to update. For remove, provide id and the paragraph is deleted. After editing, call save_fdx to persist changes to disk.",
  },
  {
    name: "edit_spell_check",
    description:
      "Add, change, remove, or fix entries in the spell-check ignore-words list (a single list of any-case words). action=create appends value; action=edit replaces the first word equal to find (case-insensitive unless cs=true) with replace; action=remove deletes the first entry equal to find; action=fix just cleans the list. Optional uppercase and dedup flags post-process the list, which is always alphabetized case-insensitively. Ignore-ranges are preserved untouched. After editing, call save_fdx to persist changes to disk.",
  },
  {
    name: "edit_title_page",
    description:
      "Create, edit, or remove the title page of a screenplay. Use action=create only when no title page exists (requires title and author); it builds the full standard layout. Use action=edit to update an existing title page (a brand-new file from new_file already ships one, so use edit there). Use action=remove to reset the title page to a blank (new-document) title page. After editing, call save_fdx to persist changes to disk.",
  },
  {
    name: "edit_extensions",
    description:
      "Add, change, remove, or fix entries in the SmartType Extensions list (character extensions like '(V.O.)', '(O.S.)').action=create appends value; action=edit replaces the first entry equal to find (case-insensitive unless cs=true) with replace; action=remove deletes the first entry equal to find; action=fix just cleans the list. Optional uppercase and dedup flags post-process the list, which is always alphabetized case-insensitively after any change. After editing, call save_fdx to persist changes to disk.",
  },
  {
    name: "edit_locations",
    description:
      "Add, change, remove, or fix entries in the SmartType Locations list (scene locations).action=create appends value; action=edit replaces the first entry equal to find (case-insensitive unless cs=true) with replace; action=remove deletes the first entry equal to find; action=fix just cleans the list. Optional uppercase and dedup flags post-process the list, which is always alphabetized case-insensitively after any change. After editing, call save_fdx to persist changes to disk.",
  },
  {
    name: "edit_scene_intros",
    description:
      "Add, change, remove, or fix entries in the SmartType SceneIntros list (scene heading prefixes like 'INT.', 'EXT.', 'INT./EXT.'). Pass separator to set the single container Separator attribute (may be sent alone).action=create appends value; action=edit replaces the first entry equal to find (case-insensitive unless cs=true) with replace; action=remove deletes the first entry equal to find; action=fix just cleans the list. Optional uppercase and dedup flags post-process the list, which is always alphabetized case-insensitively after any change. After editing, call save_fdx to persist changes to disk.",
  },
  {
    name: "edit_times_of_day",
    description:
      "Add, change, remove, or fix entries in the SmartType TimesOfDay list (time-of-day suffixes like 'DAY', 'NIGHT', 'DAWN - LATER'). Pass separator to set the single container Separator attribute (may be sent alone).action=create appends value; action=edit replaces the first entry equal to find (case-insensitive unless cs=true) with replace; action=remove deletes the first entry equal to find; action=fix just cleans the list. Optional uppercase and dedup flags post-process the list, which is always alphabetized case-insensitively after any change. After editing, call save_fdx to persist changes to disk.",
  },
  {
    name: "edit_transitions",
    description:
      "Add, change, remove, or fix entries in the SmartType Transitions list (transitions like 'CUT TO:', 'FADE IN:', 'SMASH CUT TO:').action=create appends value; action=edit replaces the first entry equal to find (case-insensitive unless cs=true) with replace; action=remove deletes the first entry equal to find; action=fix just cleans the list. Optional uppercase and dedup flags post-process the list, which is always alphabetized case-insensitively after any change. After editing, call save_fdx to persist changes to disk.",
  },
  {
    name: "find_par",
    description: "Read-Only. Search for a paragraph by text content.",
  },
  {
    name: "get_characters",
    description:
      "Read-Only. Retrieve the SmartType Characters list (character names) as newline-joined entries in document order, or an empty message if none exist.",
  },
  {
    name: "get_context",
    description:
      "Call this tool before processing any file to get the exact formatting rules, constraints, and structural requirements. Returns a list of all available tools with their full descriptions.",
  },
  {
    name: "get_dual_dialogue",
    description:
      "Read-Only. Read nested dual-dialogue paragraphs from a loaded screenplay — returns each wrapper's id, its contained paragraph ids, and the text content of every column paragraph.",
  },
  {
    name: "get_copyright",
    description:
      "Read-Only. Retrieve the title page's copyright block (the first two title-page paragraphs). Returns the 'Copyright © <year> <owner>.' line, plus 'All Rights Reserved.' when present; if there is no copyright, reports that none was found.",
  },
  {
    name: "get_element_settings",
    description:
      "Read-Only. Retrieve the ElementSettings (formatting style) for a given paragraph type — font, alignment, indentation, spacing, behavior, and outline settings. Returns an error if the type does not exist.",
  },
  {
    name: "get_extensions",
    description:
      "Read-Only. Retrieve the SmartType Extensions list (character extensions like '(V.O.)', '(O.S.)') as newline-joined entries in document order, or an empty message if none exist.",
  },
  {
    name: "get_header_and_footer",
    description:
      "Read-Only. Retrieve header and/or footer content. location selects which HeaderAndFooter(s) to read ('body', 'title', or 'all' (default)); element selects which part(s) to render ('header', 'footer', or 'all' (default)). Returns the selected content as concatenated text plus dynamic-label tag values (e.g. [Page #]) in document order.",
  },
  {
    name: "get_locations",
    description:
      "Read-Only. Retrieve the SmartType Locations list (scene locations) as newline-joined entries in document order, or an empty message if none exist.",
  },
  {
    name: "get_par",
    description:
      "Read-Only. Retrieve a single paragraph by its id from a loaded screenplay — returns type, alignment, text content, and all formatting attributes.",
  },
  {
    name: "get_scene_intros",
    description:
      "Read-Only. Retrieve the SmartType SceneIntros list (scene heading prefixes like 'INT.', 'EXT.') as newline-joined entries in document order, or an empty message if none exist. Reports the effective separator on a leading line when present.",
  },
  {
    name: "get_section",
    description:
      "Read-Only. Retrieve a section: its heading paragraph (any section type) plus all following paragraphs up to the next section heading of any type (exclusive). Returns each paragraph's id, type, and text.",
  },
  {
    name: "get_section_list",
    description:
      "Read-Only. List all section headings (any section type) in document order with their ids, types, and text; pass type to list only paragraphs of that exact type instead.",
  },
  {
    name: "get_section_par_list",
    description:
      "Read-Only. Retrieve all paragraph ids within a section, starting from a specific section id (the heading itself is included).",
  },
  {
    name: "get_spell_check_lists",
    description:
      "Read-Only. Retrieve the spell-check ignore-words list as newline-joined entries in document order, or an empty message if none exist. Ignore-ranges are not included — only the word list.",
  },
  {
    name: "get_times_of_day",
    description:
      "Read-Only. Retrieve the SmartType TimesOfDay list (time-of-day suffixes like 'DAY', 'NIGHT') as newline-joined entries in document order, or an empty message if none exist. Reports the effective separator on a leading line when present.",
  },
  {
    name: "get_title_page",
    description:
      "Read-Only. Retrieve the title page as plain text — concatenates all paragraphs from top to bottom, including copyright (if any), title, author, contact block, and spacing.",
  },
  {
    name: "get_transitions",
    description:
      "Read-Only. Retrieve the SmartType Transitions list (transitions like 'CUT TO:', 'FADE IN:') as newline-joined entries in document order, or an empty message if none exist.",
  },
  {
    name: "list_types",
    description:
      "List all known FinalDraft paragraph types by class (section / other), alphabetized within each class. Use this to discover valid paragraph type values for edit_par and element settings lookups.",
  },
  {
    name: "new_file",
    description:
      "Create a brand-new blank FinalDraft screenplay at the given path with standard title page layout, default formatting styles, and header/footer configuration. Pass version=false to overwrite an existing file; otherwise appends _v# before .fdx. No read_fdx needed — call save_fdx after creation.",
  },
  {
    name: "read_fdx",
    description:
      "Load a FinalDraft .fdx file into the server's LRU cache (max 4 entries) for subsequent tool calls. Silent operation — returns no content. All other read and edit tools depend on this being called first with the target file path.",
  },
  {
    name: "read_full_file",
    description:
      "Concatenate the title page and all body paragraphs of a loaded screenplay into plain text, preserving paragraph order but not formatting.",
  },
  {
    name: "save_fdx",
    description:
      "Save FinalDraft data back to disk with optional version bump (filename _v# suffix increments). Runs consolidateSpellCheckWords to fold any stray nested <Word>s into the canonical top-level list. After editing, always call save_fdx to persist changes.",
  },
  {
    name: "search_actions",
    description:
      "List all available MCP tools and their names — useful for discovering what operations are supported without needing an fdx file loaded.",
  },
  {
    name: "get_macro_alias_list",
    description:
      "Read-Only. Retrieve the list of all macros defined in a loaded screenplay. Each entry shows Element, Name, Shortcut, Text, and Transition attributes. Aliases (if present) are listed under their parent macro.",
  },
  {
    name: "get_macro_alias",
    description:
      "Read-Only. Retrieve a specific macro by matching one or more of its attributes (Element, Name, Shortcut, Text, Transition). At least one attribute must be supplied. All supplied attributes must match for a hit.",
  },
  {
    name: "get_script_stats",
    description:
      "Read-Only. Retrieve high-level document metrics as JSON: total pages, scene count, act break count, total paragraph count, and a per-paragraph-type breakdown. Call this first for a quick overview before deeper inspection.",
  },
  {
    name: "get_scene_index",
    description:
      "Read-Only. Retrieve the full scene catalog as JSON: for every section-type heading, its id, type, text, page, length (eighths of a page), color, and — for Scene Headings — the parsed intro/location/timeOfDay. Pass type to filter to one section type.",
  },
  {
    name: "get_character_appearances",
    description:
      "Read-Only. Retrieve, as JSON, each character's scene-by-scene appearance counts (Character/Parenthetical/Dialogue paragraphs attributed to that speaker). Pass character to filter to one name (case-insensitive); omit for every character sorted by total count descending.",
  },
  {
    name: "get_page_map",
    description:
      "Read-Only. Retrieve the pagination map as JSON: each page number and the 0-based paragraph index range on it, derived from SceneProperties page values. Check this before edit_par inserts to see whether two paragraphs share a page.",
  },
  {
    name: "get_scene_properties",
    description:
      "Read-Only. Retrieve one paragraph's SceneProperties as JSON — Color, Length (raw and parsed eighths-of-a-page), Page, and Title. Errors if the paragraph has no SceneProperties block.",
  },
  {
    name: "get_scene_arc_beats",
    description:
      "Read-Only. Retrieve the CharacterArcBeat data tracked in each Scene Heading's SceneProperties, as JSON: for every scene with at least one arc beat, its id/text and the characters with beats there. Scenes with no arc beats are omitted.",
  },
  {
    name: "get_fdx_breakdown",
    description:
      "Read-Only. Retrieve a combined script-breakdown report — document overview, paragraph-type breakdown, act structure, scene catalog, character frequency, pagination map, arc-beat summary, scene-length analysis, and production flags. Pass asType='text' (default, 80-column plain text), 'html' (standalone styled page), or 'pdf' (base64-encoded document).",
  },
  {
    name: "get_revisions",
    description:
      "Read-Only. Retrieve the document's <Revisions> block as JSON — the active revision-color set and the ordered list of color-coded revision swatches. Returns an empty object if the document has no Revisions block.",
  },
  {
    name: "get_tag_data",
    description:
      "Read-Only. Retrieve the document's <TagData> block as JSON — the production tag categories (Props, Vehicles, Camera, Cast Members, etc.) available for production breakdown. Returns an empty object if the document has no TagData block.",
  },
  {
    name: "get_display_boards",
    description:
      "Read-Only. Retrieve the document's <DisplayBoards> block as JSON — Beat Board and Story Map layout data (viewport, zoom, lanes). Editor-UI state with no effect on screenplay content. Returns an empty object if the document has no DisplayBoards block.",
  },
  {
    name: "get_cache_status",
    description:
      "Read-Only. Retrieve the server's 4-slot document cache contents as JSON: capacity, count, and each cached document's path and dirty flag (unsaved edits from an edit_* tool), most-recently-used first. Check before loading another file to see what is cached and at risk of eviction.",
  },
  {
    name: "close_fdx",
    description:
      "Deliberately release a document from the cache, freeing a slot. Refuses if it has unsaved edits unless force=true is passed. Not an error if the path was not cached.",
  },
  {
    name: "reload_fdx",
    description:
      "Force a fresh re-parse of an .fdx file from disk, replacing the cached copy — use to intentionally discard unsaved edits or pick up external changes to the file. Refuses if the cached copy has unsaved edits unless force=true is passed.",
  },
];

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
