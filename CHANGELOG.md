# Changelog

All notable changes to this project are documented in this file.

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
