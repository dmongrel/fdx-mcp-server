# `rename_character` (wishlist Phase D)

**Date:** 2026-08-02
**Status:** Approved

## Problem

`F:\Vault\mcp\fdx-mcp-server\wishlist.md` item 13: a character's name lives in five independent
places — Character-cue paragraphs, the SmartType Characters dictionary, `<Cast>` Member rows,
`CharacterArcBeat` entries in Scene Headings' `SceneProperties`, and `<CharacterHighlighting>` — and
nothing ties them together. A real rename in the field required four separate tool calls plus a raw
XML grep to discover the fifth location existed at all; fixing a subset silently half-works (cue-only
gets re-suggested by the dictionary next time the author types the old name; cue-plus-dictionary
leaves Cast rows that no longer match anything). `edit_smarttype_characters`'s existing cross-reference
warning on `action=remove` already does the right thing for two of the five locations (Cast, arc
beats) — this phase extends that same warning to a third, and adds the one-call operation that does
all five together.

## Scope

### 1. New tool: `rename_character(path, from, to, cs?)`

Validation: `path` required and must be `.fdx`; `from`/`to` required and, after trimming, must
differ (case-insensitive unless `cs=true`) — error `from and to must be different` otherwise. `cs`
defaults to `false`, matching every other `find`/`replace`-shaped tool in this codebase.

If none of the five locations below contain anything matching `from`, the call errors:
`"<from>" not found anywhere (cue paragraphs, SmartType Characters, Cast, arc beats, or CharacterHighlighting)`.
Otherwise it succeeds, having touched whichever locations had something to touch, and reports each
location's outcome individually — a location with nothing to do for `from` is reported as
`"not found"` for that location specifically, not treated as a partial failure.

**Location 1 — Character-cue paragraphs.** Run-preserving substring replace of `from` with `to`,
scoped to `parType="Character"`, across the whole document (no section scoping — this is a
whole-script operation by design; `replace_text` remains the tool for a scoped substitution).
Case-insensitive unless `cs=true`. This reuses `replace_text`'s existing per-run substitution
logic rather than reimplementing it — see "Shared helper extraction" below. A cue carrying a
trailing extension (`"GROG (V.O.)"`) is handled correctly by plain substring replace, same as
`replace_text` already handles it: matches what actually happened in the field session that raised
this item.

**Location 2 — SmartType Characters list.** If `to` (case-insensitive unless `cs`) is already
present in the list, remove `from`'s entry (the merge case — the dictionary only needs one entry for
the surviving name). Otherwise, if `from` is present, rename it to `to` in place (reusing
`editSmartList`'s existing `edit` action from `smart-type-ops.ts`). If `from` isn't in the list at
all, this location reports `"not found"`.

**Location 3 — `<Cast>` Member rows.** If a row exists for `from` and none for `to`, rename that
row's `Character` attribute to `to` (actor assignment carries over unchanged). If rows exist for
*both* `from` and `to` (a true merge — two actors cast to what turns out to be one character), drop
`from`'s row, keep `to`'s row and its actor untouched, and add a warning naming the discarded actor
assignment. If no row exists for `from`, this location reports `"not found"`.

**Location 4 — `CharacterArcBeat` entries.** For every scene (`SceneProperties` > `SceneArcBeats`)
carrying a `from` beat: if that same scene does *not* also carry a `to` beat, rename the `from`
beat's `Name` to `to` (its nested notes move with it, untouched — only the `Name` attribute
changes). If that scene *already* has a `to` beat too, leave `from`'s beat and its notes exactly as
they are, and add a warning naming that scene — arc beats carry authored notes as nested
`<Paragraph>` children, so unlike Cast/Highlighting (a single attribute), silently dropping one here
would destroy content, not just a preference. If no scene has a `from` beat, this location reports
`"not found"`.

**Location 5 — `<CharacterHighlighting>`.** New `FdxDocument` accessors, mirroring the existing
`getCastElement`/`getCastMembers` pattern:

```typescript
getCharacterHighlightingElement(create = false): XmlElement | undefined
getHighlightedCharacters(): XmlElement[]  // all <Character Name="..." Color="..." Visible="..."/> rows
```

If an entry exists for `from` and none for `to`, rename its `Name` attribute to `to` (`Color`/
`Visible` carry over unchanged). If entries exist for both, keep whichever one has `Visible="Yes"`
(FinalDraft's actual on/off toggle for whether the highlight is showing — used instead of matching
the specific `Color="#RRRRGGGGBBBB"` placeholder string the wishlist reports, since that string
can't be verified against a local fixture and `Visible` is the more robust signal for "is this a
real assignment"); if both or neither are `Visible="Yes"`, keep `to`'s entry. The dropped entry's
row is removed entirely. If neither `from` nor `to` has an entry, this location reports `"not found"`.

### 2. Shared helper extraction: `runPreservingReplace`

`replace_text`'s core loop (iterate scoped paragraphs, count/replace occurrences per `<Text>` run,
track run-boundary skips) is extracted from `src/tools/replace-text.ts` into an exported function:

```typescript
export interface RunPreservingReplaceOptions {
  find: string;
  replace: string;
  caseSensitive: boolean;
  parType?: string;
  startIndex?: number;
  endIndex?: number;
}
export interface RunPreservingReplaceResult {
  totalReplaced: number;
  touched: boolean;
  skipped: Array<{ id: string; count: number }>;
}
export function runPreservingReplace(doc: FdxDocument, opts: RunPreservingReplaceOptions): RunPreservingReplaceResult
```

`handleReplaceText` becomes a thin wrapper: parse args, resolve section scoping into
`startIndex`/`endIndex`, call `runPreservingReplace`, format the message from the result — identical
behavior, no test changes expected beyond confirming nothing regressed. `rename_character` calls the
same function with `parType: "Character"` and no scoping (whole document).

### 3. Response shape

JSON, reporting every location's outcome plus accumulated warnings:

```json
{
  "from": "BATTERED TROOP",
  "to": "BATTERED ROMULAN TROOP",
  "cueParagraphs": { "paragraphsTouched": 2, "occurrencesReplaced": 2, "skipped": [] },
  "smartTypeCharacters": "renamed",
  "castMember": "removed (merged into existing \"BATTERED ROMULAN TROOP\" row)",
  "arcBeats": { "renamed": 1, "conflictingScenes": [] },
  "characterHighlighting": "not found",
  "warnings": [
    "Dropped Cast row for \"BATTERED TROOP\" (actor \"Voice A\") — \"BATTERED ROMULAN TROOP\" already had actor \"Voice B\"."
  ],
  "message": "Successfully renamed \"BATTERED TROOP\" to \"BATTERED ROMULAN TROOP\". File updated in cache — call save_fdx to persist changes to disk."
}
```

`cueParagraphs`/`arcBeats` are structured (they can each apply to multiple paragraphs/scenes);
`smartTypeCharacters`/`castMember`/`characterHighlighting` are single-location outcomes so a short
status string is sufficient — `"renamed"`, `"removed (merged into existing \"<to>\" row)"`, `"kept
\"<from>\"'s entry, renamed to \"<to>\" (was the visible assignment)"`, or `"not found"`.

### 4. Extend the cross-reference warning (wishlist item 3)

`countCharacterReferences` in `src/tools/breakdown.ts` gains a third count:

```typescript
export function countCharacterReferences(doc: FdxDocument, name: string, cs: boolean): { cast: number; arcBeats: number; highlighting: number }
```

`edit-smarttype-characters.ts`'s `crossRefCheck` (fires on `action=remove`) is updated to include it:

> `Warning: 1 Cast member(s), 1 arc beat(s), and 1 CharacterHighlighting entr(y/ies) still reference this name.`

(singular/plural handling for the highlighting count, matching the existing cast/arcBeats phrasing
style).

## Out of scope

- Scoping `rename_character` to a single scene — `edit_scene_arc_beats` already offers scene
  scoping for arc beats specifically; this tool is deliberately whole-script.
- Merging `CharacterArcBeat` notes when a scene has both names' beats — left as two entries with a
  warning, per Location 4 above.
- Touching `<Actors>` — off-limits per `edit_cast`'s existing guard against its binary
  voice-synthesis blob; `rename_character` never reads or writes it.
- A `merge_character` alias/separate tool — per the wishlist's own framing, a merge is just a rename
  where `to` happens to already exist; `rename_character` handles both without a separate entry
  point.

## Documentation

- `CHANGELOG.md`: new version entry; bump `package.json` alongside it.
- `TOOLS.md`: new row for `rename_character`; `edit_smarttype_characters`'s row description updated
  if its cross-reference warning wording is part of that row's text (check at implementation time).
- `README.md`: checked per this repo's doc-sync rule in `CLAUDE.md` — likely no change needed (it
  doesn't enumerate individual tools today), confirmed at implementation time rather than assumed.
- `src/tools/context-data.ts`: new `rename_character` entry in the `get_context`/`search_actions`
  tool catalog; `edit_smarttype_characters`'s mirrored description (if the codebase has one there
  beyond the crossRefCheck logic itself — the tool descriptions in this file don't currently mention
  the cross-reference warning's exact wording, so likely no change needed there either, confirmed at
  implementation time).

## Testing

- `runPreservingReplace` extraction: `replace-text.test.ts` stays green unchanged (behavior-preserving
  refactor) — this is the regression check that the extraction didn't alter `replace_text`'s behavior.
- New `rename-character.test.ts`:
  - Plain rename touching only cue paragraphs (no dictionary/Cast/arc-beat/highlighting entries).
  - Merge case for SmartType Characters (both `from` and `to` present → `from` removed).
  - Merge case for Cast (both rows present → `from` dropped, warning present, `to`'s actor
    unchanged).
  - Arc-beat rename (single scene, `from` only) and arc-beat conflict (scene has both → `from`
    untouched, warning present, notes intact).
  - `<CharacterHighlighting>` rename (only `from` present), merge preferring the visible entry in
    both directions (from visible/to sentinel, and from sentinel/to visible), and merge where
    neither/both are visible (falls back to keeping `to`).
  - `from`/`to` identical (after trim, case-insensitive unless `cs`) errors.
  - `from` not found anywhere errors, naming all five locations checked.
  - `cs=true` behavior for at least cue paragraphs and one dictionary/list location.
  - Full `bun test` stays green throughout.
