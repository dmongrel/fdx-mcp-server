# Changelog

All notable changes to this project are documented in this file.

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
