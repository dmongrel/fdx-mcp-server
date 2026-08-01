# Real-usage location tools + SmartType tool renames

**Date:** 2026-07-31
**Status:** Approved

## Problem

`get_locations`/`edit_locations` only ever touched the SmartType Locations dictionary — the
autocomplete list FinalDraft offers while typing a slugline. That list is disconnected from the
script: it can contain stale names no scene uses anymore, and it says nothing about which scenes
use which location or how often. There was no way to see actual location usage or rename a
location across every Scene Heading that uses it without hand-editing each paragraph.

The same "dictionary, not actual usage" ambiguity exists for the other five SmartType categories
(Characters, Extensions, SceneIntros, TimesOfDay, Transitions), all built from the same
`smart-type-ops.ts` factory. Only Locations gets real-usage tooling in this pass; the other five
are renamed for clarity but keep their current (dictionary-only) behavior.

## Scope

1. Rename all six SmartType dictionary tool pairs to make it unambiguous that they operate on the
   autocomplete dictionary, not the script:

   | Old | New |
   |---|---|
   | `get_characters` / `edit_characters` | `get_smarttype_characters` / `edit_smarttype_characters` |
   | `get_extensions` / `edit_extensions` | `get_smarttype_extensions` / `edit_smarttype_extensions` |
   | `get_locations` / `edit_locations` | `get_smarttype_locations` / `edit_smarttype_locations` |
   | `get_scene_intros` / `edit_scene_intros` | `get_smarttype_scene_intros` / `edit_smarttype_scene_intros` |
   | `get_times_of_day` / `edit_times_of_day` | `get_smarttype_times_of_day` / `edit_smarttype_times_of_day` |
   | `get_transitions` / `edit_transitions` | `get_smarttype_transitions` / `edit_smarttype_transitions` |

   Pure rename: tool name string, exported `*Tool`/`handle*` identifiers, source file name, and the
   colocated `.test.ts` file name. No behavior change. `edit_smarttype_characters` keeps its
   existing Cast/arc-beat cross-reference warning on `action=remove`.

2. New `get_locations` (takes over the name freed by the rename) — read-only, backed by actual
   Scene Heading text via the existing `parseSlugline` helper in `breakdown.ts`, restricted to
   `Type === "Scene Heading"` paragraphs (other section types like Act Break don't carry real
   locations, and `parseSlugline` would misparse them as if they did — Go's `buildSceneIndex`
   applies it to every section type, but that behavior stays scoped to `get_scene_index`; these new
   tools deliberately narrow to Scene Heading only).

   Groups scenes by parsed location (exact-string match — sluglines are conventionally uppercase,
   so case variants are rare and, when they occur, are themselves worth surfacing as distinct
   entries rather than silently merged). Returns JSON:

   ```json
   [{ "location": "KITCHEN", "count": 3, "scenes": [{ "id": "...", "text": "INT. KITCHEN - DAY", "page": 4 }] }]
   ```

   Sorted by `count` descending, then location alphabetically (case-insensitive) — mirrors
   `get_character_appearances`/`rankCharacters`. Optional `location` param filters to one location
   (case-insensitive exact match), returning just that group; no match is a friendly "not found"
   message (not an error), matching `get_character_appearances`'s convention for an unknown name.

3. New `edit_locations` (takes over the name freed by the rename) — rename only. A location isn't
   a freestanding dictionary entry here; it only exists as a substring of some Scene Heading's text,
   so `create`/`remove` don't have a sensible meaning the way they do for a dictionary list. Params:
   `path, find, replace, cs?` (default case-insensitive, matching the SmartType edit tools'
   convention).

   For every Scene Heading paragraph whose parsed location matches `find`:
   - Recompute the exact character offsets of the location segment within the paragraph's full
     text (same walk `parseSlugline` does, but tracking `start`/`end` instead of discarding them).
   - If that range falls entirely inside one `<Text>` run, splice `replace` into just that run's
     content — every other run, and that run's own attributes, are untouched.
   - If the range spans more than one run (sluglines are essentially never styled, but a caller
     could have hand-crafted one), collapse that paragraph's runs into a single plain run holding
     the full new text, and note in the response which paragraph(s) this happened to.
   - No match anywhere is an error (`location not found in any Scene Heading: <find>`), consistent
     with `edit_par`/`replace_text` erroring on a miss.

   After a successful rename: add `replace` to the SmartType Locations list if not already present
   (mirrors `edit_par`'s existing SmartType refresh on a Scene Heading edit). Then check whether
   `find` is still referenced by any Scene Heading; if not, and `find` is still sitting in the
   SmartType Locations list, append a non-blocking warning suggesting
   `edit_smarttype_locations action=remove` to clean up the now-orphaned dictionary entry — the
   same pattern already used for Cast/arc-beat orphans on `edit_smarttype_characters`.

4. Documentation sync: `src/tools/context-data.ts` (the `get_context` tool catalog), `TOOLS.md`,
   and `README.md`'s Features list all get updated for the 6 renames + 2 new tools.

## Out of scope

- Real-usage read/rename tools for the other five SmartType categories (Characters, Extensions,
  SceneIntros, TimesOfDay, Transitions). `get_character_appearances` already exists as a
  real-usage read tool for characters; character-cue renames go through `edit_par`/`replace_text`.
- `create`/`remove` semantics for `edit_locations` — see above.
- Touching `parseSlugline` itself, or `get_scene_index`'s existing (all-section-types) use of it.

## Testing

- `duplicate-ids`-style unit tests for the new slugline-offset helper (single run, multi-run,
  no-match, `find`/`replace` case variants).
- Tool-level tests for `get_locations`/`edit_locations` mirroring `get-character-appearances.test.ts`
  and `edit-par.test.ts` conventions (inline fixtures with 2+ scenes sharing a location, a styled
  run case, and the orphan-warning case).
- Renamed files keep their existing test coverage verbatim (just renamed); `bun test` must stay
  green throughout.
