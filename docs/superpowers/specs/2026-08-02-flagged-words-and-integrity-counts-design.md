# Flagged words + document integrity counts (wishlist items 6+12, folded)

**Date:** 2026-08-02
**Status:** Approved

## Problem

`F:\Vault\mcp\fdx-mcp-server\wishlist.md` items 6 and 12, folded into one effort per the user's
direction — item 6's integrity counts land as bullet 2 of item 12's own "Wanted" list ("a count of
flagged words on whatever integrity call comes out of item 6"), and item 6 itself is scoped as an
extension to the existing `get_script_stats` tool rather than a new one.

**Item 6:** `CLAUDE.md` in the field project requires checking `AdornmentStyle` and `WinVoice`
counts before and after any sweep, and forbids raw regex over the XML because it merges runs and
destroys attributes. The server exposes no way to count either, so following the first rule means
breaking the spirit of the second — the only way to check was shelling out to PowerShell and
regexing the raw file.

**Item 12:** `AdornmentStyle="-1"` is Final Draft's unknown-word marker (the on-screen squiggle),
discovered by accident while investigating a `replace_text` run-boundary skip. That means every
misspelling in a script is already marked in the file, and there's no way to ask for them — finding
them today means calling `get_par_runs` on every paragraph one at a time. The server already owns
both halves of this (`get_spell_check_lists`/`edit_spell_check` read/maintain the ignore list; the
adornments live in the document) and connects neither.

## Scope

### 1. `get_script_stats` gains integrity counts (item 6)

`ScriptStats` (`src/tools/breakdown.ts`) gains five fields, computed by `buildScriptStats`:

```typescript
export interface ScriptStats {
  totalPages: number;
  sceneCount: number;
  actBreakCount: number;
  paragraphCount: number;
  byType: Record<string, number>;
  adornmentStyleCount: number;   // new
  winVoiceCount: number;         // new
  totalTextRuns: number;         // new
  curlyQuoteCount: number;       // new
  flaggedWordCount: number;      // new
}
```

- **`adornmentStyleCount`**: every `<Text>` element anywhere in the document (not scoped to top-level
  body paragraphs — includes `TitlePage`, nested `DualDialogue`, everywhere) that carries an
  `AdornmentStyle` attribute at all, any value. A new recursive helper (`countAdornedRuns` or
  similar, in `breakdown.ts`) walks the whole `<FinalDraft>` root once and computes this alongside
  `totalTextRuns` and `flaggedWordCount` in the same pass, since all three need the same traversal.
- **`totalTextRuns`**: every `<Text>` element anywhere in the document, styled or not. The
  denominator `adornmentStyleCount`/`flaggedWordCount` are implicitly compared against.
- **`flaggedWordCount`**: the subset of the above where `AdornmentStyle === "-1"` specifically —
  Final Draft's unknown-word marker. This is item 12 bullet 2, done here since the traversal is
  already in hand. **Raw count, not filtered by the ignore list** — this field is a before/after
  invariant ("did the count change"), a different purpose from `get_flagged_words`' `excludeIgnoreList`
  (which answers "what should I actually go fix").
- **`winVoiceCount`**: every `<Actor>` element under the top-level `<Actors>` block carrying a
  `WinVoice` attribute. A separate, much smaller traversal (`findChild(root, "Actors")` then
  `findChildren(actors, "Actor")`), not part of the general walk.
- **`curlyQuoteCount`**: occurrences of `“ ” ‘ ’` in text-node content, counted across a walk of the
  whole document tree. This **excludes `<Actors>` by construction, not by special-casing it** —
  `WinVoice`/`MacVoice` are attribute values, not text-node content, and `<Actor>` elements have no
  text-node children, so a walk that only ever inspects text nodes never touches them. No exclusion
  logic is needed; the design just doesn't look at attribute values in the first place.

`get_script_stats`'s tool description gets one clause added describing the new fields; no behavior
change to existing fields.

### 2. `get_flagged_words` — new read-only tool (item 12, bullet 1)

```typescript
interface FlaggedWordsArgs {
  path: string;
  excludeIgnoreList?: boolean;  // default false
}

interface FlaggedWord {
  word: string;
  paragraphId: string;
  paragraphType: string;
  page: number | null;
}
```

Scans **top-level body paragraphs only** (`doc.getParagraphElements()`) — the same scope
`find_par`/`replace_text`/`rename_character`'s cue-paragraph handling already use; nested
`DualDialogue` paragraphs are out of scope, consistent with that existing boundary rather than a new
one invented for this tool. For each paragraph, `getParagraphRuns` (existing export from
`src/fdx/paragraph.ts`) is reused to get `{content, attrs}` per run; a run whose `attrs.AdornmentStyle`
is exactly `"-1"` becomes a `FlaggedWord` with `word: content`.

`page` is found the same backward-scan way `find_par` already computes `sceneHeading`/`page` for a
hit (`findContainingSectionIndex` + that section's `SceneProperties.Page`) — `null` when the flagged
run is before any section heading or that section carries no page.

`excludeIgnoreList=true` filters out any `word` that case-insensitively matches an entry in
`doc.getIgnoredWords()` (existing accessor) — matching the case-insensitive-by-default convention
every other `find`/`match` parameter in this codebase already uses.

**Response** (JSON):

```json
{
  "flaggedWords": [
    { "word": "satys", "paragraphId": "b67c1840", "paragraphType": "Dialogue", "page": 14 }
  ],
  "count": 1
}
```

Empty result is `flaggedWords: [], count: 0` — not an error, matching every other "no matches" tool
in this codebase (`find_par`, etc.).

**Explicitly out of scope for this pass:** item 12's third "Wanted" bullet (a bulk add to the ignore
list) is covered separately, in section 3 below — it's a different tool (`edit_spell_check`), listed
here only to note it's not forgotten.

### 3. `edit_spell_check` bulk add (item 12, bullet 3)

Adds `values?: string[]` to `edit_spell_check`'s existing `action=create`, alongside the existing
single `value?: string`. When `values` is given (non-empty), `handleEditSpellCheck` loops the
*existing* `editSmartList` function (from `src/tools/smart-type-ops.ts`, unchanged) once per word,
threading the working list through each call, then writes the final list back once. **No changes to
the shared `editSmartList` engine itself** — this is a loop inside `edit-spell-check.ts`'s own
handler, so the six `edit_smarttype_*` tools (which share that engine) are completely unaffected,
scoped exactly to what item 12 bullet 3 asked for rather than generalized to every list-editing tool
that happens to share the underlying code.

If `values` is given, `value` is ignored (if also present). If neither is given for `action=create`,
the existing "create requires a non-empty value" error path is unchanged (surfaces on the first/only
loop iteration, or directly if `values` is absent — no new error message needed, the existing one
already covers it per-word).

Success message: `"Successfully created N ignore word(s)."` when `values` was used (plural-aware),
vs. the existing "Successfully created spell-check ignore words." single-value message — a small,
backward-compatible wording branch.

## Out of scope

- Generalizing bulk-create to the six `edit_smarttype_*` tools — not requested; see section 3.
- `get_flagged_words` scanning nested `DualDialogue` paragraphs — consistent with the existing
  top-level-only boundary the rest of the codebase already has.
- Any change to what `AdornmentStyle="-1"` *means* or how Final Draft assigns it — this is read-only
  surfacing of an existing marker, not new spell-checking logic.
- A "fix all flagged words" or auto-correct capability — item 12 only asks for visibility and a bulk
  ignore-list add, not automated correction.

## Documentation

- `CHANGELOG.md`: new version entry; bump `package.json` alongside it.
- `TOOLS.md`: `get_script_stats`'s row description updated for the five new fields; new row for
  `get_flagged_words`; `edit_spell_check`'s row updated for `values`.
- `src/tools/context-data.ts`: `get_script_stats`'s catalog entry updated to match; new
  `get_flagged_words` entry; `edit_spell_check`'s entry updated for `values`.
- `README.md`: checked per this repo's doc-sync rule; a clause likely fits the existing "Document
  integrity" bullet, drafted at implementation time rather than assumed.

## Testing

**`get_script_stats`:**
- A document with styled runs (`AdornmentStyle` present, non-`-1`) and flagged runs
  (`AdornmentStyle="-1"`) reports `adornmentStyleCount` including both, `flaggedWordCount` only the
  `-1` ones.
- `totalTextRuns` counts every `<Text>` element, styled and unstyled.
- `winVoiceCount` counts only `<Actor>` rows with `WinVoice` present, ignoring rows without it.
- `curlyQuoteCount` counts curly quotes in paragraph text but ignores a `WinVoice`/`MacVoice`
  attribute value that happens to contain a curly-quote-lookalike byte (mirrors the existing
  `replace_text` hazard test's fixture pattern for this).
- Existing fields (`totalPages`, `sceneCount`, `actBreakCount`, `paragraphCount`, `byType`) are
  unaffected — `breakdown.test.ts`'s existing coverage stays green.

**`get_flagged_words`:**
- A flagged run (`AdornmentStyle="-1"`) is reported with correct `word`/`paragraphId`/`paragraphType`.
- `page` is correctly resolved via the containing section, `null` when there is none.
- `excludeIgnoreList=true` filters out a flagged word already in the ignore list, case-insensitively.
- No flagged words returns `{flaggedWords: [], count: 0}`, not an error.
- A run inside a nested `DualDialogue` paragraph is not reported (out-of-scope boundary confirmed).

**`edit_spell_check`:**
- `action=create` with `values: [...]` adds every word in one call.
- `values` takes precedence over `value` when both are given.
- Existing single-`value` behavior (all current tests) is unchanged.
- `uppercase`/`dedup` post-processing still applies correctly after a bulk add.

Full `bun test` stays green throughout.
