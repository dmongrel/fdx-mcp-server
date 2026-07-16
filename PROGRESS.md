# fdx-mcp-server — Tool Porting Progress

Tracking port of all tools from the Go implementation (`G:\_GoProjects\fdx-mcp-server`)
to this TypeScript/Bun project. Source of truth for each tool's behavior is the Go
source under `tools/*.go` and the shared data model in `fdx/fdx.go`.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done (implemented + tested + wired into src/index.ts)

## Phase 0 — Core infrastructure (blocking almost everything below)

- [ ] `.fdx` XML data model (ported from `fdx/fdx.go`) — paragraphs, title page, element settings, SmartType lists, headers/footers, dual dialogue, spell check, macros, revisions, tag data, display boards, scene properties
- [ ] XML parse (read_fdx) / serialize (save_fdx) round-trip
- [ ] In-memory LRU cache (max 4 entries) keyed by file path, with dirty-flag tracking
- [ ] UUID generation helper for new paragraphs
- [ ] Shared paragraph/section traversal helpers (used by get_section*, find_par, breakdown tools)

## Phase 1 — Cache & file lifecycle

- [x] `read_fdx` (implemented, not wired/tested yet — agent picking up Phase 2-5 will wire+test)
- [x] `save_fdx` (implemented, not wired/tested yet)
- [x] `new_file` (implemented, not wired/tested yet)
- [x] `get_cache_status` (implemented, not wired/tested yet)
- [~] `close_fdx` (agent: phase2-5 owner)
- [~] `reload_fdx` (agent: phase2-5 owner)

## Phase 2 — Paragraph read/write

- [~] `get_par` (agent: phase2-5 owner)
- [~] `edit_par` (agent: phase2-5 owner)
- [~] `find_par` (agent: phase2-5 owner)
- [~] `read_full_file` (agent: phase2-5 owner)
- [~] `list_types` (agent: phase2-5 owner)

## Phase 3 — Sections

- [~] `get_section` (agent: phase2-5 owner)
- [~] `get_section_list` (agent: phase2-5 owner)
- [~] `get_section_par_list` (agent: phase2-5 owner)

## Phase 4 — Title page & copyright

- [~] `get_title_page` (agent: phase2-5 owner)
- [~] `edit_title_page` (agent: phase2-5 owner)
- [~] `get_copyright` (agent: phase2-5 owner)
- [~] `edit_copyright` (agent: phase2-5 owner)

## Phase 5 — Element settings & header/footer

- [~] `get_element_settings` (agent: phase2-5 owner)
- [~] `edit_element_settings` (agent: phase2-5 owner)
- [~] `get_header_and_footer` (agent: phase2-5 owner)
- [~] `edit_header_and_footer` (agent: phase2-5 owner)

## Phase 6 — SmartType dictionaries [~] (agent: Phase 6-9 owner, starting now)

- [~] `get_characters` / `edit_characters`
- [~] `get_extensions` / `edit_extensions`
- [~] `get_scene_intros` / `edit_scene_intros`
- [~] `get_locations` / `edit_locations`
- [~] `get_times_of_day` / `edit_times_of_day`
- [~] `get_transitions` / `edit_transitions`
- [~] `get_spell_check_lists` / `edit_spell_check`

## Phase 7 — Dual dialogue

- [ ] `get_dual_dialogue`
- [ ] `edit_dual_dialogue`

## Phase 8 — Macros (read-only)

- [ ] `get_macro_alias_list`
- [ ] `get_macro_alias`

## Phase 9 — Analysis suite (read-only, JSON)

- [ ] `get_script_stats`
- [ ] `get_scene_index`
- [ ] `get_character_appearances`
- [ ] `get_page_map`
- [ ] `get_scene_properties`
- [ ] `get_scene_arc_beats`
- [ ] `get_fdx_breakdown`
- [ ] `get_revisions`
- [ ] `get_tag_data`
- [ ] `get_display_boards`

## Already done (prior session)

- [x] `get_context`
- [x] `search_actions`

## Notes / decisions log

- (agent: append notes here as you make porting decisions, e.g. deviations from Go behavior, TS-specific tradeoffs)
