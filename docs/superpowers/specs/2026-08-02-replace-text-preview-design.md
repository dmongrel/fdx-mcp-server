# `replace_text preview` (wishlist Phase C)

**Date:** 2026-08-02
**Status:** Approved

## Problem

`F:\Vault\mcp\fdx-mcp-server\wishlist.md` item 5: `replace_text` mutates immediately and reports a
count afterward. Before running several substitutions against an author's screenplay, a caller
wants to know exactly what each one would touch — the actual list, before anything changes — not a
count after the fact. The field session that raised this got there by reading `get_scene_index` and
counting occurrences by hand, which only worked because the script was small enough to eyeball; it
doesn't scale and isn't a real check, just a guess that happened to be right.

The same gap also hides run-spanning matches. `replace_text` already skips a match that only exists
by spanning two `<Text>` runs and reports it — but only after attempting the whole substitution, so
a caller has no way to know what's fixable until the fixable part has already been changed.

## Scope

### `preview` param on `replace_text`

Adds `preview?: boolean` (default `false`) to the existing tool — same name, same other params
(`find`, `replace`, `parType`, `id`, `caseSensitive`), same scoping rules. Not a separate tool: the
wishlist's own framing is "same call shape, so preview then commit is a two-line workflow," and nothing
about preview mode changes what `find`/`parType`/`id`/`caseSensitive` mean.

When `preview=true`:

- **No mutation.** No `<Text>` run is written, no cache-dirty flag is set, no `save_fdx` is needed
  afterward.
- **Response is JSON** (mutate-mode's response is unchanged — still the existing plain-text
  sentence, so no regression for the current callers of `replace_text`):

  ```json
  {
    "preview": true,
    "find": "Singularity",
    "replace": "Anomaly",
    "matches": [
      { "id": "b67c1840", "type": "Dialogue", "text": "Keep an eye on that «Singularity» Class starship.", "wouldReplace": 1, "skipped": 0 }
    ],
    "totalMatches": 1,
    "totalSkipped": 0,
    "message": "Preview: 1 occurrence(s) across 1 paragraph(s) would be replaced. Nothing was changed — call again with preview=false (or omit preview) to apply."
  }
  ```

- **Match marking.** Each occurrence in a paragraph's `text` field is wrapped in `«...»` (double
  angle quotes / guillemets), chosen over `[[...]]`-style brackets because screenplay text
  legitimately contains square brackets (this project's own `[FIX - ...]` placeholder convention,
  editorial notes) where guillemets essentially never appear. The wrapped substring preserves the
  *original document casing* at that occurrence, not the literal `find` string — so a
  case-insensitive search for `"grog"` against text containing `"Grog"` marks it as `«Grog»`, not
  `«grog»`.
- **Per-paragraph fields:** `wouldReplace` is the count of occurrences that fall entirely within a
  single `<Text>` run (i.e. would actually be substituted); `skipped` is the count that only exist
  by spanning a run boundary (i.e. would be left alone and reported the same way mutate-mode already
  reports skips). A paragraph whose *only* occurrence spans a run boundary still appears in `matches`
  — with `wouldReplace: 0, skipped: 1` — so the second half of the wishlist ask (surface skips
  up front) is met without a separate list; one entry per paragraph covers both cases.
- **Top-line summary:** `totalMatches` / `totalSkipped` sum `wouldReplace`/`skipped` across every
  listed paragraph, giving the same at-a-glance total the mutate-mode success sentence already gives
  (`"Replaced N occurrence(s)..."`), just phrased as a hypothetical.
- **Zero matches is not an error**, in either mode — consistent with mutate-mode's existing
  behavior (`"Replaced 0 occurrence(s)..."` is a normal, non-error result today). Preview mode
  returns `matches: []`, `totalMatches: 0`, `totalSkipped: 0`, and a message saying so.

### Implementation approach

`runPreservingReplace` (already extracted from `replace_text` for `rename_character`'s reuse) grows
one more option:

```typescript
export interface RunPreservingReplaceOptions {
  find: string;
  replace: string;
  caseSensitive: boolean;
  parType?: string;
  startIndex?: number;
  endIndex?: number;
  preview?: boolean;   // new
}

export interface PreviewMatch {
  id: string;
  type: string;
  text: string;         // paragraph text with every occurrence wrapped in «...»
  wouldReplace: number;
  skipped: number;
}

export interface RunPreservingReplaceResult {
  totalReplaced: number;
  paragraphsTouched: number;
  touched: boolean;
  skipped: Array<{ id: string; count: number }>;
  previewMatches?: PreviewMatch[];   // new, populated only when preview=true
}
```

Single scan loop serves both modes: the existing per-run counting logic (`countOccurrences` against
each `<Text>` run, to distinguish fixable occurrences from run-spanning ones) is unchanged; the only
branch is that `setTextContent` (the actual mutation) is skipped when `preview` is true, and a
`PreviewMatch` entry is pushed instead of accumulating into `totalReplaced`/`paragraphsTouched`/
`skipped`. `rename_character` (the other caller of `runPreservingReplace`) is unaffected — it never
passes `preview`, so its behavior is unchanged.

`handleReplaceText` branches once, near the end, on whether `preview` was requested: preview builds
and returns the JSON body above; non-preview keeps its existing plain-text message path byte-for-byte.

## Out of scope

- No changes to `rename_character`'s use of `runPreservingReplace` — it never sets `preview`.
- No preview mode for `edit_par`, `edit_dual_dialogue`, or any other mutating tool — this is scoped
  to the one tool the wishlist item names.
- No persistence of a preview result for later "commit" — per the wishlist's own framing, "preview
  then commit is a two-line workflow": the caller re-issues the same call with `preview` omitted (or
  `false`) once satisfied. Nothing needs to remember the preview happened.

## Documentation

- `CHANGELOG.md`: new version entry; bump `package.json` alongside it.
- `TOOLS.md`: `replace_text`'s row parameters gain `preview?`; description updated.
- `src/tools/context-data.ts`: no mirrored `replace_text` entry exists there today (confirmed by
  checking — unlike several other tools) — none is added, consistent with not introducing a mirror
  that didn't exist before this change and would need to be kept in sync going forward.
- `README.md`: checked per this repo's doc-sync rule; likely no change (it doesn't enumerate
  individual tools), confirmed at implementation time rather than assumed.

## Testing

- `replace-text.test.ts` gains preview-mode cases:
  - Preview leaves the document unmutated (paragraph text unchanged after the call, no dirty-cache
    warning).
  - A single-run match is marked with `«...»`, preserving original casing for a case-insensitive
    search.
  - Multiple occurrences in one paragraph are all marked.
  - A run-spanning match appears with `wouldReplace: 0, skipped: 1` and is *not* silently omitted.
  - A paragraph with both a fixable and a run-spanning occurrence reports both counts correctly.
  - `parType`/`id`/`caseSensitive` scoping behaves identically to mutate-mode (reuse the same
    scoping test patterns already in the file).
  - Zero matches returns `matches: []` without erroring.
  - Mutate-mode (`preview` omitted, and `preview: false`) is unaffected — existing tests continue to
    pass unchanged, confirming the shared-loop refactor didn't alter non-preview behavior.
- Full `bun test` stays green throughout.
