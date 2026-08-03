# Changelog

All notable changes to this project are documented in this file.

## [0.0.21] - 2026-08-02

### Fixed

- **`get_flagged_words`**, **`get_script_stats`**, and `get_context`'s formatting rules no longer call `AdornmentStyle="-1"` an "unknown-word marker" — it's Final Draft's proofing flag, covering spelling and grammar both, so repeated-word and spacing hits appear alongside genuine typos.

### Changed

- **`edit_smarttype_characters`**'s cross-reference warning (on `action=remove`) now also counts Character-cue paragraphs still referencing the removed name — previously it named Cast rows, arc beats, and CharacterHighlighting entries but not the fifth and most numerous location a name lives.
- **`batch_edit`** adds `edit_scene_properties` to its allowlist of tools it can run as one step in an atomic batch.

## [0.0.20] - 2026-08-02

### Added

- **`edit_scene_properties`** tool — sets `Color` and/or `Title` on a paragraph's `SceneProperties` block, creating the block if it doesn't exist yet (a paragraph created through `edit_par` previously had no route to acquire one). Neither value is format-validated; `get_context` now documents Final Draft's actual `#RRRRGGGGBBBB` color format.

### Changed

- **`edit_par action=create`** accepts an optional `color` parameter, setting `SceneProperties.Color` on the newly created paragraph in the same call instead of a create-then-`edit_scene_properties` sequence.

## [0.0.19] - 2026-08-02

### Changed

- **`find_par`**, **`replace_text`**, **`get_flagged_words`**, **`get_placeholders`**, and **`get_character_appearances`** now prepend a warning reporting how many paragraphs nested inside a `<DualDialogue>` block were out of scope for that call, when the queried scope contains any. None of these tools descend into `DualDialogue` blocks — this makes the existing blind spot visible in the output instead of only in documentation.

## [0.0.18] - 2026-08-02

### Fixed

- **`rename_character`** no longer silently skips Character cues nested inside a `<DualDialogue>` block — it now descends into them for the cue-paragraph rename, and a nested-only match is found and renamed instead of reporting "not found". Previously this produced a script half-renamed with no warning.

### Changed

- **`get_par_runs`** (`id`, `ids`, and `sectionId` modes) and **`edit_par`** (`action=edit` only) can now read/edit paragraphs nested inside a `<DualDialogue>` block by id — previously these returned `"paragraph id not found"` even though the paragraph existed in the file, leaving no way to repair a dual-dialogue-related mistake without hand-editing the XML.

## [0.0.17] - 2026-08-02

### Changed

- **`get_context`** now checks for a newer published version on every call instead of once at server startup. A long-lived server process (one that isn't restarted often by its MCP client) previously could never learn about an update published after it started; since `get_context` is normally called once per conversation, checking there instead keeps the notice current without adding a noticeable amount of network traffic.

## [0.0.16] - 2026-08-02

### Added

- **`get_placeholders`** tool — lists every paragraph whose full text is entirely one `[...]` span (a drafting placeholder like `[FIX - ...]`), regardless of paragraph type, as `{id, type, text, page}` per hit. Combine with `batch_edit` and `edit_par action=remove` to bulk-clear them once applied.

### Changed

- **`get_script_stats`** now reports `placeholderCount` (always) and accepts `excludePlaceholders=true` to exclude whole-bracket placeholder paragraphs from `paragraphCount`, `byType`, `sceneCount`, and `actBreakCount` — a stable baseline while placeholders are still present, without deleting anything. `totalPages` is unaffected either way.

## [0.0.15] - 2026-08-02

### Added

- **`get_flagged_words`** tool — surfaces every `<Text>` run carrying `AdornmentStyle="-1"` (Final Draft's unknown-word marker, the on-screen squiggle) as `{word, paragraphId, paragraphType, page}` per hit, a ready-made typo index instead of calling `get_par_runs` on every paragraph one at a time. Pass `excludeIgnoreList=true` to filter out words already in the spell-check ignore list.

### Changed

- **`get_script_stats`** now reports document integrity counts: `adornmentStyleCount`, `winVoiceCount`, `totalTextRuns`, `curlyQuoteCount`, and `flaggedWordCount` (the `AdornmentStyle="-1"` subset of `adornmentStyleCount`). Useful for confirming nothing was altered by a sweep — compare the counts before and after.
- **`edit_spell_check`** `action=create` now accepts `values` (an array) to add many ignore words in one call, instead of one `edit_spell_check` call per word.

## [0.0.14] - 2026-08-02

### Added

- **`create_dialogue`** tool — creates a Character/[Parenthetical]/Dialogue group as one atomic, contiguous insertion, so a new speech no longer leaves the document in the invalid intermediate state two or three separate `edit_par` creates would (Dialogue is invalid unless immediately preceded by Character or Parenthetical). `character`'s text is added to the SmartType Characters list, same as `edit_par action=create type=Character`.
- **`diff_fdx`** tool — diffs two documents' top-level body paragraphs by id: added, removed, and modified (type and/or text, reported before/after). Confirming what a versioned save actually changed no longer means external tooling or a paragraph-count comparison.

## [0.0.13] - 2026-08-02

### Added

- **`batch_edit`** tool — runs an ordered list of edit operations against one document, all-or-nothing. Validates every operation's tool name against a fixed allowlist of in-memory mutation tools before touching anything (never `save_fdx`/`reload_fdx`/`close_fdx`/`new_file`/`read_fdx` — a disk write can't be rolled back). Takes a savepoint automatically before running; the first operation to fail rolls back everything and stops, and a fully successful batch leaves the savepoint in place so the whole thing can still be undone afterward with `rollback`.
- **`savepoint`/`rollback`** tools — a single-level, per-document snapshot of in-memory content and dirty state, independent of disk. `savepoint` captures it (overwriting any previous one); `rollback` restores it, repeatably. The same mechanism `batch_edit` uses internally, exposed directly for use around any sequence of individual `edit_*` calls.

### Changed

- **`get_cache_status`** now reports `hasSavepoint` per cached document.

## [0.0.12] - 2026-08-02

### Added

- **`replace_text` gains a `preview` option.** `preview=true` reports what would be matched — and what would be skipped for spanning a run boundary — without changing anything: each occurrence is marked with `«...»` in its paragraph's text (original document casing preserved), and skip-only paragraphs are surfaced up front instead of only being discoverable after a real run. Same call shape as a normal `replace_text` call, so preview-then-commit is a two-line workflow.

## [0.0.11] - 2026-08-02

Most of the changes across 0.0.9–0.0.11 were requested by an AI agent working on an actual
production screenplay (not a hypothetical use case) — friction hit in real editing sessions,
recorded as it came up, and worked through here roughly in the order it was raised.

### Added

- **`rename_character`** tool — renames or merges a character across all five places a name is stored: Character-cue paragraphs (run-preserving substring replace), the SmartType Characters dictionary, `<Cast>` Member rows, `CharacterArcBeat` entries in every scene's `SceneProperties`, and `<CharacterHighlighting>` (a location nothing in the codebase touched before this). A merge — `to` already exists somewhere — drops `from`'s entry there rather than creating a duplicate, except a scene where both names already have separate arc beats, left untouched (with a warning) since arc beats carry authored notes a drop would destroy. Returns a JSON report of what happened in each location.

### Changed

- **`edit_smarttype_characters`'s cross-reference warning on `action=remove`** now also checks `<CharacterHighlighting>`, not just Cast and arc beats.

## [0.0.10] - 2026-08-02

### Changed

- **`edit_par`/`edit_dual_dialogue` `action=create` now return the new paragraph's/wrapper's id** as JSON (`{id, type, message}` / `{id, message}`) instead of a plain sentence, so a caller can address what it just created without a fragile text-matching lookup — including an empty paragraph, which has no text to match on at all. `action=edit`/`action=remove` are unchanged.
- **`find_par` now reports each hit's containing scene and page.** Output is a JSON array; every hit carries `sceneId`, `sceneHeading`, and `page` (all `null` when the hit is before any section heading), found by scanning backward for the nearest preceding section heading — no more guessing which scene a match belongs to from page numbers.
- **`get_section` now includes each paragraph's id**, returning a JSON array of `{id, type, text}`. It absorbs `get_section_par_list`, which is removed — every edit workflow needed both back to back and joined them by position. Omitting `id` now starts at the first section in the document (matching `get_section_par_list`'s old default) rather than document index 0.
- **`get_par_runs` accepts a batch of paragraphs** via `ids` (an array, in the given order) or `sectionId` (every paragraph in a section, heading included), returning a JSON array — a pre-sweep audit of styled runs no longer needs one call per paragraph. `id` (single paragraph) is unchanged.

### Removed

- **`get_section_par_list`** — folded into `get_section` (see above).

## [0.0.9] - 2026-08-02

### Changed

- **`save_fdx`'s description now documents that a versioned save leaves the previous path cached and dirty**, pointing to `get_context`'s Versioned Saves and the Cache section rather than only explaining the mechanism there. Completes item 2 of the versioned-save-cache-semantics handoff (item 1, the `get_context` section itself, shipped in 0.0.8's predecessor).

## [0.0.8] - 2026-08-01

### Fixed

- **`edit_par action=remove` no longer silently discards a dual-dialogue block.** A dual-dialogue wrapper paragraph (a `<Paragraph>` holding a `<DualDialogue>` with several nested Character/Dialogue paragraphs) is a single top-level paragraph, so removing it deleted every paragraph nested inside with no indication anything beyond the one addressed id had been touched — two calls silently removed eight paragraphs from a real script. `remove` now refuses a dual-dialogue wrapper outright, pointing the caller at `edit_dual_dialogue action=remove` (which already handles `extract=true`/`extract=false` correctly). For an ordinary paragraph, the success message now names the type that was removed.

## [0.0.7] - 2026-07-31

### Fixed

- **`parseSlugline` (used by `get_scene_index`, `get_locations`, `edit_locations`, and `edit_par`'s SmartType refresh) no longer matches time-of-day against the TimesOfDay SmartType dictionary.** The dictionary is an autocomplete history FinalDraft never prunes, so a stale entry that happened to equal a location's last word (e.g. a room literally named "BRIDGE") got sliced off as a phantom time-of-day, inventing a fake location out of what remained — while a genuine time of day missing from the dictionary (e.g. "ALERT") stayed glued to the location, fragmenting one room into several differently-keyed locations. The split is now structural: whatever follows the last occurrence of the document's declared TimesOfDay separator (default `" - "`) is the time of day, dictionary membership or not.
- **`get_scene_index`'s `location` no longer carries a trailing separator** (e.g. `"BRIDGE -"` for `"INT. BRIDGE - DAY"`), matching what `get_locations` already returned. Both now go through the same `parseSlugline` — previously `edit-par.ts` carried its own near-duplicate copy (which also matched the dictionary case-insensitively, one more way the two could silently disagree).

## [0.0.6] - 2026-07-31

### Changed

- **Renamed the six SmartType dictionary tool pairs** for clarity: `get_characters`/`edit_characters`, `get_extensions`/`edit_extensions`, `get_locations`/`edit_locations`, `get_scene_intros`/`edit_scene_intros`, `get_times_of_day`/`edit_times_of_day`, and `get_transitions`/`edit_transitions` are now `get_smarttype_*`/`edit_smarttype_*`. Same behavior — these tools only ever read/wrote FinalDraft's autocomplete dictionary, never the actual script, and the old names didn't make that clear.

### Added

- **`get_locations`/`edit_locations`** (new tools, taking over the names freed by the rename above) — report actual location usage parsed from Scene Heading text (scene ids, page, count per location) and rename a location across every Scene Heading that uses it, splicing just the location segment of each slugline while preserving intro token, separators, time-of-day, and run styling. Keeps the SmartType Locations list in sync on rename, and warns (without blocking) when the old name is left orphaned there.

## [0.0.5] - 2026-07-31

### Added

- **`find_duplicate_ids`/`fix_duplicate_ids`** tools — detect and repair top-level body paragraphs that share the same id. FinalDraft's copy/paste sometimes duplicates a paragraph's id instead of minting a new one, and every id-addressed tool (`get_par`, `edit_par`, `edit_scene_arc_beats`, `get_section_par_list`) silently resolves a duplicated id to its first match, so a caller addressing a later paragraph edits the wrong one without any error. `find_duplicate_ids` reports the groups; `fix_duplicate_ids` (`action=report` to preview, `action=fix` to apply) keeps each group's first occurrence (document order) untouched and mints fresh uuids for the rest, preserving each paragraph's original `id`/`Id`/`ID` attribute-name casing.
- **`get_par`/`edit_par`** now warn (without blocking) when the id they resolve matches more than one paragraph, pointing the caller at `find_duplicate_ids`/`fix_duplicate_ids`.

## [0.0.4] - 2026-08-01

### Added

- **`get_cast`/`edit_cast`** tools — read and write `<Cast>` `<Member Character="..." Actor="..."/>` rows: create, edit (actor and/or character), remove, and `action=fix` (drops rows whose character has neither a Character-cue paragraph nor a SmartType Characters entry — the orphan cleanup a character rename otherwise leaves behind). Deliberately never reads or writes the sibling `<Actors>` block: its rows carry a binary voice-synthesis blob in `WinVoice`/`MacVoice` that must round-trip untouched, so an `actor` value is always the caller-supplied name of an existing Actor row, never invented or retargeted.
- **`edit_scene_arc_beats`** tool — rename or remove `CharacterArcBeat` entries in Scene Headings' `SceneProperties` (the write half of the existing read-only `get_scene_arc_beats`), optionally scoped to one scene. Fixes the case where a character rename updates cue paragraphs but leaves a stale arc-beat name double-counting one role.
- **`edit_characters action=remove`** now warns (without blocking) when Cast `Member` rows or `CharacterArcBeat` entries still reference the name being dropped from the SmartType Characters list — the exact silent-orphan failure mode this release's Cast/arc-beat tools were built to clean up after.

## [0.0.3] - 2026-07-31

### Added

- **`get_par_runs`** tool — reads a paragraph's `<Text>` runs with their full attribute sets (`AdornmentStyle`, `Font`, `Color`, `Size`, `RevisionID`, ...) intact, instead of the flattened plain text `get_par` returns.
- **`replace_text`** tool — run-preserving find/replace across paragraphs, substituting inside each `<Text>` run's own content so run boundaries and attributes are never lost. Matches that only exist by spanning a run boundary are left alone and reported as skipped rather than silently merged. Scoping mirrors `find_par` (`parType`, `id`, `caseSensitive`).

### Changed

- **`edit_par`**'s `textRuns[].attrs` now accepts arbitrary passthrough `<Text>` attributes (not just `style`), so a paragraph with styled runs can be edited without destroying that styling.

### Fixed

- **`edit_par` no longer requires `type` on `action=edit`.** Omitting it now defaults to the paragraph's existing type instead of erroring; `action=create` still requires an explicit, valid type.

## [0.0.2] - 2026-07-23

### Fixed

- **Broken update check.** `check-update.ts` queried the GitHub Releases API (`/releases/latest`), but `publish.yml` only pushes a git tag and publishes to npm — it never creates a GitHub Release, so the endpoint 404'd and the check silently failed open (no update ever reported, regardless of version). Switched it to query the npm registry (`registry.npmjs.org/fdx-mcp-server/latest`) instead, since that's the actual source of truth for what's installable.

## [0.0.1] - 2026-07-22

Version reset to mark the switch to real npm registry publishing.

### Changed

- Replaced the broken `release-please` GitHub Actions workflow (it targeted a `main` branch that never existed in this repo — the only branch has always been `master`, so it never actually ran) with a simple workflow that publishes to the npm registry whenever a `v*` tag is pushed.
- The npm package is now published to [npmjs.com](https://npmjs.com) directly, so `npm install -g fdx-mcp-server` and `npm update -g fdx-mcp-server` install a pre-built tarball from the registry — no local git clone/build step, which is what caused the Windows npm/node-tar `ENOENT` race with the old `github:dmongrel/fdx-mcp-server`-based install.
- Deleted the pre-registry `v0.1.0`/`v1.0.0` git tags and GitHub Releases and restarted version numbering at `0.0.1` for the first real npm publish.
