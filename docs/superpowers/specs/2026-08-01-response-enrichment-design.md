# Response enrichment (wishlist Phase A)

**Date:** 2026-08-01
**Status:** Approved

## Problem

`F:\Vault\mcp\fdx-mcp-server\wishlist.md` records friction from real editing sessions where a tool's
response didn't carry information the caller immediately needed next, forcing an extra round trip
(or, in one case, a text-matching hack that fails outright on an empty paragraph). Four items are
grouped here because each is a self-contained "enrich or merge a response shape" change with no
new mutation semantics, no atomicity/undo concerns, and no structural validation — those are later
phases (see wishlist grouping discussion). This phase addresses wishlist items **1, 2, 3, 4, and 14**
(items 2 and 3 are one change per the wishlist's own note).

## Scope

### 1. `edit_par`/`edit_dual_dialogue`, `action=create` return the new id

Item 1 (hit twice: placeholder paragraphs identified only by fragile text-matching, and an empty
`Character` cue that had no text to match on at all).

Scoped strictly to `action=create`. The success response's main content block becomes a JSON string
in place of today's plain sentence:

```json
{"id": "b67c1840-...", "type": "Character", "message": "Successfully created paragraph in script. File updated in cache — call save_fdx to persist changes to disk."}
```

`edit_dual_dialogue action=create` returns the same shape keyed on the new wrapper paragraph's id
(no `type` field — the wrapper's type is always `"General"` and not informative here).

`action=edit`/`action=remove` on both tools are unchanged — still plain-text sentences. Cache/dirty/
duplicate-id warnings still prepend as separate plain-text content blocks via the existing
`pushWarning`/`pushCacheWarning` helpers; those helpers are untouched, since `ToolResult.content` is
already an array and a JSON main block coexists with plain-text warning blocks ahead of it with no
mechanism change.

### 2+3. `find_par` reports containing scene and page per hit

Item 2 (no way to find which scene a paragraph belongs to — seven guesses across two rounds in the
field) and item 3 (no position information on hits at all), folded into one change per the
wishlist's own note that they're the same fix.

Output becomes a JSON array (replacing today's `\n---\n`-joined plain-text lines). Each hit:

```json
{
  "id": "b67c1840",
  "type": "Dialogue",
  "text": "Keep an eye on that Singularity Class.",
  "sceneId": "9b39ca8c",
  "sceneHeading": "INT. BRIDGE - DAY",
  "page": 14
}
```

`sceneId`/`sceneHeading`/`page` are found by scanning backward from the hit's paragraph index to the
nearest preceding section-type paragraph (any section type, not just Scene Heading — matches
`isSectionType`/`findSectionIndex`'s existing definition of a section) and reading that paragraph's
own `SceneProperties.Page` — the same technique `buildLocationAppearances`/`buildCharacterAppearances`
already use scanning forward, just walked backward from an arbitrary index instead of accumulated
during a single forward pass. A hit before any section heading gets all three fields `null`. A page
value absent from `SceneProperties` (or unparseable) is also `null`, not `0` — `0` is a valid-looking
page number and would misrepresent "unknown" as "page zero".

No matches returns `[]` (JSON empty array) instead of the string `"No paragraph found"`.

### 4. `get_section` includes ids; `get_section_par_list` is removed

Item 4 (`get_section` and `get_section_par_list` return type/text and ids respectively; every edit
workflow needs both and joins them by position).

`get_section` returns a JSON array of `{id, type, text}` per paragraph in the section — same range
logic as today (heading through the paragraph before the next section heading, inclusive of the
heading itself). `get_section_par_list` becomes a strict subset of this and is deleted outright:

- `src/tools/get-section-par-list.ts` and `get-section-par-list.test.ts` removed.
- Import and registration removed from `src/index.ts` (tool list and dispatch map).
- Entry removed from `context-data.ts`'s static tool catalog (used by `get_context`/`search_actions`).
- Two prose references updated to point at `get_section` instead: `get_context`'s "Scene navigation"
  workflow guidance (`context-data.ts` line ~104), and `find_duplicate_ids`'s description, which
  currently lists `get_section_par_list` among the tools that resolve a duplicated id to its first
  match.
- `TOOLS.md`'s row for `get_section_par_list` removed; the tool count in its header line (currently
  57) decremented accordingly, then re-verified against the actual registered count once `get_par_runs`
  (unchanged tool count) and the removal are both in.

### 5. `get_par_runs` accepts a set of paragraphs

Item 14 (auditing styled runs before a sweep means one call per paragraph today).

Adds `ids?: string[]` and `sectionId?: string` alongside the existing `id?: string`. Exactly one of
the three must be supplied; zero or more than one is an error
(`exactly one of id, ids, or sectionId is required`).

- `id` (existing): unchanged. Single object back, e.g. `{"id":..., "type":..., "runs":[...]}`.
- `ids`: looks up each id in the *given* order, not document order (callers may want runs back
  matching a list they already have); a missing id fails the whole call the same way the existing
  single-`id` lookup fails today (`paragraph id not found: <id>`) rather than silently omitting it
  from the result.
- `sectionId`: reuses `findSectionIndex`/`findSectionEnd` (the same section-range helpers
  `get_section` uses) to collect every paragraph in that section, heading included, and returns them
  in document order.

Both `ids` and `sectionId` return a JSON array of `{id, type, runs}` objects.

## Out of scope

- Batch/atomic multi-edit calls, savepoints/rollback (wishlist items 7, 8 — later phase).
- `replace_text preview` (item 5 — later phase).
- Document integrity counts, flagged-word surfacing, placeholder-aware counting (items 6, 10, 12 —
  Phase B, next).
- `rename_character` (item 13 — Phase D).
- Dialogue-chain-aware multi-paragraph create (item 9), `diff_fdx` (item 11) — later, unscoped
  phases.
- Changing `edit_par`/`edit_dual_dialogue` response shape for `action=edit`/`action=remove` — only
  `action=create` changes shape in this phase.
- README changes — it doesn't enumerate individual tools or a tool count, so nothing there needs
  updating for this phase.

## Testing

- `edit-par.test.ts`/`edit-dual-dialogue.test.ts`: `action=create` returns parseable JSON containing
  the new id (and, for `edit_par`, the created type); `action=edit`/`action=remove` responses are
  unchanged plain text.
- `find-par.test.ts`: JSON array shape; a hit inside a scene carries correct `sceneId`/
  `sceneHeading`/`page`; a hit before any section heading carries all three as `null`; a page-less
  section carries `page: null`; no matches returns `[]`.
- `get-section.test.ts`: JSON array with ids; range boundaries (heading through next-heading-
  exclusive) unchanged from today's coverage, just re-asserted against the new shape.
- `get-section-par-list.test.ts` deleted along with the tool.
- `get-par-runs.test.ts`: new cases for `ids` (found, and one-missing-fails-whole-call),
  `sectionId` (matches `get_section`'s range for the same id), and the "zero or multiple selectors"
  error case; existing single-`id` case re-asserted unchanged.
- Full `bun test` stays green throughout; `context-data.test.ts`'s "every tool has a unique,
  non-empty name/description" check continues to pass with `get_section_par_list` removed from the
  catalog.

## Documentation

- `CHANGELOG.md`: new version entry covering all five changes (grouped as one release).
- `TOOLS.md`: `get_section_par_list` row removed, `get_par_runs`/`find_par`/`get_section` parameter
  columns updated for their new optional params, tool count in the header re-verified.
- `package.json` version bumped (patch) alongside the changelog entry, per project convention.
