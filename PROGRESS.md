# fdx-mcp-server — Tool Porting Progress

Tracking port of all tools from the Go implementation (`G:\_GoProjects\fdx-mcp-server`)
to this TypeScript/Bun project. Source of truth for each tool's behavior is the Go
source under `tools/*.go` and the shared data model in `fdx/fdx.go`.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done (implemented + tested + wired into src/index.ts)

## Phase 0 — Core infrastructure (blocking almost everything below)

- [x] `.fdx` XML data model — implemented as a generic, order-preserving XML tree (`src/fdx/xml.ts`) plus a thin `FdxDocument` wrapper (`src/fdx/document.ts`) rather than a full 1:1 port of every Go struct in `fdx/fdx.go`. Blocks this server doesn't yet expose a typed tool for (revisions, macros, tag data, page layout, watermarking, ...) simply stay untouched in the generic tree and round-trip losslessly; later phases add focused typed accessors directly on `FdxDocument` as each tool is ported (title page, element settings, header/footer, dual dialogue, etc. still to come from Phase 2 owners). SmartType (6 lists) and top-level SpellCheckIgnoreLists/IgnoredWords are already modeled with typed accessors + dedup/consolidate logic (see Notes below).
- [x] XML parse (read_fdx) / serialize (save_fdx) round-trip — `src/fdx/xml.ts` (`parseXml`/`serializeXml`), tested in `src/fdx/xml.test.ts` and `src/fdx/document.test.ts` against the real fixture in `examples/`.
- [x] In-memory LRU cache (max 4 entries) keyed by file path, with dirty-flag tracking — `src/fdx/cache.ts` (`LruCache`/`documentCache`), tested in `src/fdx/cache.test.ts` (port of Go's `cache_test.go` cases: dirty tracking, eviction warnings, removeIf, MRU ordering).
- [x] UUID generation helper — `src/fdx/uuid.ts` (`generateUuid` via `crypto.randomUUID()`, `fdxDateTimeNow()` for DocumentRef stamps).
- [x] Shared paragraph/section traversal helpers (used by get_section*, find_par, breakdown tools) — built by the Phase 2/3 owner: `src/fdx/paragraph.ts` (paragraphText/buildParagraphElement/etc.) and `src/fdx/sections.ts` (isSectionType/findSectionIndex/findSectionEnd), backed by `list-types.ts`'s sectionTypes/otherTypes catalog.

## Phase 1 — Cache & file lifecycle

- [x] `read_fdx` — `src/tools/read-fdx.ts` + `read-fdx.test.ts`, wired into `src/index.ts`.
- [x] `save_fdx` — `src/tools/save-fdx.ts` + `save-fdx.test.ts`, wired in. **Deviation**: Go's `save_fdx` accepts an optional `data` param with a full FinalDraft struct inline; this port always saves the cached document for `path` (no inline-data path), since FinalDraft is modeled as a generic XML tree here rather than a JSON-reflectable struct. See inline comment in save-fdx.ts.
- [x] `new_file` — `src/tools/new-file.ts` + `new-file.test.ts`, wired in. Template copied verbatim from Go's `tools/resources/NewFile.fdx` to `src/fdx/resources/NewFile.fdx`; id re-minting and DocumentRef stamping ported and tested against the same fixture ids Go's test uses.
- [x] `get_cache_status` — `src/tools/get-cache-status.ts` + test, wired in.
- [x] `close_fdx` — `src/tools/close-fdx.ts` + test, wired in.
- [x] `reload_fdx` — `src/tools/reload-fdx.ts` + test, wired in.

Phase 0 + Phase 1 all implemented, tested, and wired by this agent (`bun test`: 61 pass / 0 fail; `bun run typecheck`: clean, as of this note). `src/index.ts`'s dispatch was refactored from an if-chain to a name->handler map to keep adding tools cheap.

## Phase 2 — Paragraph read/write

- [x] `get_par` — `src/tools/get-par.ts` + test, wired in.
- [x] `edit_par` — `src/tools/edit-par.ts` + test, wired in. Includes SmartType refresh (Character/Scene Heading -> Characters/SceneIntros/Locations/TimesOfDay) via a ported `parseSlugline`.
- [x] `find_par` — `src/tools/find-par.ts` + test, wired in.
- [x] `read_full_file` — `src/tools/read-full-file.ts` + test, wired in.
- [x] `list_types` — `src/tools/list-types.ts` + test, wired in. `sectionTypes`/`otherTypes`/`knownType`/`isSectionType` are the shared source of truth also used by `src/fdx/sections.ts` (Phase 3) and `edit_par`.

Added `src/fdx/paragraph.ts` (paragraphText/buildParagraphElement/setParagraphTextRuns/get-set
Type-Id-Alignment helpers) and `src/fdx/sections.ts` (isSectionType/findSectionIndex/findSectionEnd)
as shared Paragraph-element helpers, plus `FdxDocument.getTitlePageElement/getTitlePageContentElement/getTitlePageParagraphs`
in `src/fdx/document.ts` (needed by read_full_file, reused by Phase 4). All implemented, tested, wired
by phase2-5 owner. `bun test`: all green; `bun run typecheck`: clean.

## Phase 3 — Sections

- [x] `get_section` — `src/tools/get-section.ts` + test, wired in.
- [x] `get_section_list` — `src/tools/get-section-list.ts` + test, wired in.
- [x] `get_section_par_list` — `src/tools/get-section-par-list.ts` + test, wired in.

All 3 implemented/tested/wired by phase2-5 owner using the `src/fdx/sections.ts` helpers built in
Phase 2. `bun test`: 159 pass / 0 fail; `bun run typecheck`: clean.

## Phase 4 — Title page & copyright

- [x] `get_title_page` — `src/tools/get-title-page.ts` + test, wired in.
- [x] `edit_title_page` — `src/tools/edit-title-page.ts` + test, wired in. Full create/edit/remove parity with Go's edit_title_page.go (standard-layout builder, in-place single-line overwrites, wholesale contact/based-on block rebuilds, `enforceTitlePageLength` 48-line trim, `remove` resets to the NewFile.fdx baseline TitlePage subtree).
- [x] `get_copyright` — `src/tools/get-copyright.ts` + test, wired in.
- [x] `edit_copyright` — `src/tools/edit-copyright.ts` + test, wired in.

Added `src/fdx/title-page.ts` (tpParagraph/tpBlock/blankParagraphs/setParagraphText, the
copyright-block builders, buildBasedOnParagraphs/buildContactParagraphs, buildTitlePage,
editExistingTitlePage, enforceTitlePageLength) as the shared title-page engine, plus
`FdxDocument.setTitlePageParagraphs`/`replaceTitlePageElement` in `src/fdx/document.ts`. All
implemented, tested, wired by phase2-5 owner. `bun test`: 206 pass / 0 fail; `bun run typecheck`: clean.

## Phase 5 — Element settings & header/footer

- [x] `get_element_settings` — `src/tools/get-element-settings.ts` + test, wired in.
- [x] `edit_element_settings` — `src/tools/edit-element-settings.ts` + test, wired in.
- [x] `get_header_and_footer` — `src/tools/get-header-and-footer.ts` + test, wired in.
- [x] `edit_header_and_footer` — `src/tools/edit-header-and-footer.ts` + test, wired in.

Added `src/fdx/element-settings.ts` (elementSettingTypes catalog/knownElementSettingType,
buildElementSettingsElement/applyElementSettingsFields) and `src/fdx/header-footer.ts`
(buildHeaderParagraph/headerParagraphParts/renderHeaderAndFooter/titlePageHfExists/
buildHeaderAndFooterElement/applyHeaderFooterAttrs+Parts/validateHeaderFooterParts) as the shared
engines, plus `FdxDocument` accessors: `getElementSettingsElements/findElementSettingsElement/
addElementSettingsElement/removeElementSettingsElement` and `getBodyHeaderAndFooterElement/
setBodyHeaderAndFooterElement/removeBodyHeaderAndFooterElement/getTitlePageHeaderAndFooterElement/
setTitlePageHeaderAndFooterElement` in `src/fdx/document.ts`. Also added
`serializeNodeStandalone` to `src/fdx/xml.ts` (renders a single XmlElement subtree, used by
get_element_settings) — additive export, safe for the other agents' code. `remove` mirrors Go
exactly for both tools: edit_element_settings just deletes the record, while
edit_header_and_footer resets the targeted HeaderAndFooter to the NewFile.fdx baseline (a
HeaderAndFooter is a singleton FinalDraft always writes, never truly absent). All implemented,
tested, wired by phase2-5 owner.

**This closes out the phase2-5 owner's full assigned scope (Phases 1 remainder through 5).**
Final status: `bun test`: 234 pass / 0 fail across 46 files (re-run 3x, stable — no cache-eviction
flakiness); `bun run typecheck`: clean.

## Phase 6 — SmartType dictionaries [x] (agent: Phase 6-9 owner)

- [x] `get_characters` / `edit_characters`
- [x] `get_extensions` / `edit_extensions`
- [x] `get_scene_intros` / `edit_scene_intros`
- [x] `get_locations` / `edit_locations`
- [x] `get_times_of_day` / `edit_times_of_day`
- [x] `get_transitions` / `edit_transitions`
- [x] `get_spell_check_lists` / `edit_spell_check`

All 7 pairs implemented, tested (bun test), and wired into `src/index.ts`. Shared engine ported
from Go's `tools/smart_type_ops.go` into `src/tools/smart-type-ops.ts` (`editSmartList`,
`applyCleanups`, `dedupList`, `sortListCI`, `actionPastTense`, plus `runSmartListGet`/
`runSmartListEdit` and `makeSmartListGetTool`/`makeSmartListEditTool`/`makeSmartSeparatorEditTool`
factories used by each of the 12 thin per-list tool files). Added `FdxDocument.setSmartTypeSeparator`
(setter counterpart to the existing getter) and `FdxDocument.getIgnoredRangeCount` in
`src/fdx/document.ts` to support these tools. `edit_spell_check`/`get_spell_check_lists` reuse the
same `editSmartList`/`actionPastTense` cleanup engine directly (not the SmartType-specific
get/edit runners, since IgnoredWords isn't one of the 6 SmartType leaves) — mirrors Go's
`spell_check_ops.go` sharing the same underlying primitives as `smart_type_ops.go`.

## Phase 7 — Dual dialogue [x] (agent: Phase 6-9 owner)

- [x] `get_dual_dialogue` — `src/tools/get-dual-dialogue.ts` + test.
- [x] `edit_dual_dialogue` — `src/tools/edit-dual-dialogue.ts` + test.

Both implemented, tested, wired into `src/index.ts`. Operates directly on the top-level
`Content` children array (same convention `edit_par.ts` established: splice/indexOf by paragraph
id) — action=create builds a `<Paragraph Type="General">` wrapper with a nested `<DualDialogue>`
holding the moved paragraph elements verbatim (so their own attributes/Text runs/SceneProperties
survive untouched), inserted at the position of the earliest moved paragraph. action=remove
deletes the wrapper, or (extract=true) splices its nested `<Paragraph>` children back into the
top level in place of the wrapper. No new `FdxDocument` accessors were needed — `findChild`/
`findChildren` from `xml.ts` plus the existing `getParagraphElements()`/`getContentElement()` and
`paragraph.ts` helpers (`getParagraphId`, `getParagraphType`, `paragraphText`) were sufficient.

## Phase 8 — Macros (read-only) [x] (agent: Phase 6-9 owner)

- [x] `get_macro_alias_list` — `src/tools/get-macro-alias-list.ts` + test.
- [x] `get_macro_alias` — `src/tools/get-macro-alias.ts` + test.

Both implemented, tested, wired into `src/index.ts`. Added `src/tools/macro-data.ts` (`getMacros`,
`formatMacro`, `MacroInfo`) as the shared read helper — reads `<Macros><Macro>` (with optional
nested `<Alias>`/`<ActivateIn>`) straight out of the generic XML tree via `findChild`/
`findChildren`/`getAttr`, no new typed `FdxDocument` accessor needed since these tools are
read-only and the block is small. Matches Go's exact attribute-match semantics: `element`/
`transition` match case-insensitively, `name`/`shortcut`/`text` match exact/case-sensitively.

## Phase 9 — Analysis suite (read-only, JSON) [x]

- [x] `get_script_stats` — `src/tools/get-script-stats.ts` + test.
- [x] `get_scene_index` — `src/tools/get-scene-index.ts` + test.
- [x] `get_character_appearances` — `src/tools/get-character-appearances.ts` + test.
- [x] `get_page_map` — `src/tools/get-page-map.ts` + test.
- [x] `get_scene_properties` — `src/tools/get-scene-properties.ts` + test.
- [x] `get_scene_arc_beats` — `src/tools/get-scene-arc-beats.ts` + test.
- [x] `get_fdx_breakdown` — `src/tools/get-fdx-breakdown.ts` + `get-fdx-breakdown.test.ts`, wired
      in. Data aggregation + text/html renderers ported into `src/tools/breakdown-report.ts`
      (`buildBreakdownData`, `renderBreakdownText`, `renderBreakdownHtml`; own test file
      `breakdown-report.test.ts`), reusing the `build*` functions already in `src/tools/breakdown.ts`.
      PDF rendering ported into `src/tools/breakdown-pdf.ts` using the **pdf-lib** dependency
      (added to `package.json`/`bun.lock` — pure JS, no native bindings, works unmodified under
      Bun and Deno; Go's version used `gofpdf/v2` which has no TS equivalent). Base64 encoding
      uses the standard `Uint8Array.prototype.toBase64()` method (available in this Bun version)
      rather than Node's `Buffer`, to stay Deno-portable.
- [x] `get_revisions` — `src/tools/get-revisions.ts` + test.
- [x] `get_tag_data` — `src/tools/get-tag-data.ts` + test.
- [x] `get_display_boards` — `src/tools/get-display-boards.ts` + test.

**All of Phase 9 is now complete.** `bun test`: 287 pass / 0 fail across 58 files; `bun run typecheck`: clean.

9 of 10 tools implemented, tested, wired into `src/index.ts`. Added `src/tools/breakdown.ts` — the
shared analysis engine ported from Go's `tools/breakdown.go`: `parseSceneLength`, `parseSlugline`
(note: TimeOfDay suffix matching is **exact/case-sensitive** here, mirroring breakdown.go's
`findEntry(list, candidate, cs=true)` call — this differs from `edit-par.ts`'s own local
`parseSlugline` copy, which matches case-insensitively; not this agent's file to fix, flagging for
whoever reconciles it), `buildSceneIndex`, `buildCharacterAppearances` (+ `characterCueName`
longest-prefix matching), `rankCharacters`, `buildPageMap`, `buildScriptStats`, `buildArcBeatData`,
and `getScenePropertiesById`. Skipped Go's fused single-pass `buildAnalysis` (a perf optimization
for `get_fdx_breakdown` calling all five builders at once) since nothing here needs it yet — each
thin tool calls only the one `build*` function it needs, per "don't over-engineer." SceneProperties/
SceneArcBeats/CharacterArcBeat are read directly off the generic XML tree in `breakdown.ts`
(`findChild(p, "SceneProperties")` etc.) rather than needing new typed `FdxDocument` accessors,
since our XML model already exposes nested elements/attrs generically (much simpler than Go's
`,innerxml` + on-demand-unmarshal approach for `SceneProperties.ArcBeats()`). `get_revisions`/
`get_tag_data`/`get_display_boards` each read their top-level block directly via `findChild`/
`findChildren`/`getAttr` and hand-build the same camelCased JSON shape Go's struct tags produce
(manually verified field-by-field against `fdx/fdx.go`'s `Revisions`/`TagData`/`DisplayBoards`
structs), returning `{}` when the block is absent.

## Already done (prior session)

- [x] `get_context`
- [x] `search_actions`

## Notes / decisions log

- (agent: append notes here as you make porting decisions, e.g. deviations from Go behavior, TS-specific tradeoffs)
- **Phase 0 modeling approach**: instead of transliterating every Go struct in `fdx/fdx.go` into a TS interface up front, the FinalDraft document is parsed into a generic, order-preserving XML node tree (`src/fdx/xml.ts`: `XmlElement`/`XmlText`/`XmlComment`, hand-rolled parser — no external XML dependency needed since FinalDraft output uses only the 5 standard entities and never CDATA). `FdxDocument` (`src/fdx/document.ts`) wraps that tree and exposes typed accessors only for the parts a tool actually needs to read/mutate (so far: DocumentRef timestamp, Content>Paragraph list, the 6 SmartType dictionaries + their Separator attrs, and the top-level SpellCheckIgnoreLists/IgnoredWords list incl. DualDialogue-nested consolidation). Everything else — Revisions, Macros, TagData, PageLayout, Watermarking, etc. — simply lives untouched inside the generic tree and round-trips byte-equivalent (modulo re-encoding) through parse -> serialize with no code written for it yet. This satisfies TOOLS.md's "round-trips losslessly, edited only where a tool exists" contract without needing ~1000 lines of struct definitions before any tool could be built. Later phases should add further typed accessors directly to `FdxDocument` following the same pattern (e.g. Phase 4 adds TitlePage accessors, Phase 5 adds ElementSettings/HeaderAndFooter accessors) rather than building a parallel full-model file.
- **save_fdx** deviates from Go: no inline `data` parameter support (see Phase 1 note above) — always persists the cached document for `path`.
- **Multi-agent workspace note**: this repo was being edited concurrently by other agents/sessions working Phase 2-5 and Phase 6-9 in the same working tree (observed `src/tools/smart-type-ops.ts` appear mid-session, and `src/fdx/document.ts` gained a `setSmartTypeSeparator` method not authored by this agent). No conflicts were resolved by force; this agent only touched files it owns (Phase 0/1 pieces) plus additive accessors on `FdxDocument` that the other agents' code already depends on.
