# Five Small Fixes — Design Spec

Wishlist items 20–24 in `F:\Vault\mcp\fdx-mcp-server\wishlist.md`, raised 2026-08-02 against
0.0.21/0.0.22. Five small, independent fixes bundled into one spec/plan, grouped by the code they
touch: duplicate-id tools (20, 21), a doc-only fix (22), and `get_fdx_breakdown`'s character
frequency section (23, 24).

## Item 20: `find_duplicate_ids`/`fix_duplicate_ids` don't report the DualDialogue blind spot

Both tools operate on `doc.getParagraphElements()` — top-level body paragraphs only, the same
scope every other paragraph-scanning tool has. Items 15–19 already established the pattern for
surfacing that blind spot: `find_par`, `replace_text`, `get_flagged_words`, `get_placeholders`,
and `get_character_appearances` all prepend `skippedNestedWarning(countNestedParagraphs(...))` via
`pushWarning` when the scope contains any nested paragraphs. `find_duplicate_ids` and
`fix_duplicate_ids` never got the same treatment.

**Fix:** in `find-duplicate-ids.ts` and `fix-duplicate-ids.ts`, compute
`skippedNestedWarning(countNestedParagraphs(doc.getParagraphElements()))` once per call and apply
it via `pushWarning` to every return path:

- `find_duplicate_ids`: both the "No duplicate paragraph ids found" result and the JSON-groups
  result.
- `fix_duplicate_ids`: the "nothing to fix" result, the `action=report` result, and the
  `action=fix` result.

`pushWarning` composes with the existing `pushCacheWarning` calls (both no-op on an empty string,
so chaining `pushWarning(pushCacheWarning(result, cacheWarning), skipWarning)` is safe regardless
of which, if either, warning is non-empty).

## Item 21: `fix_duplicate_ids action=report` previews a `newId` that `action=fix` won't assign

`report` and `fix` each independently call `planDuplicateIdFixes(doc)`, which mints a fresh
`generateUuid()` per duplicate on every call — so `report`'s `newId` is never the id `fix` actually
writes. Per the design discussion, the fix is to stop promising an id `report` can't deliver on,
rather than adding server-side state to make the promise true.

**Fix:** `action=report`'s output stops including `newId`. Concretely, `planDuplicateIdFixes`
keeps minting a `newId` internally (needed unconditionally by `applyDuplicateIdFixes`, and `fix`'s
own response still reports the real, just-written `newId`s) — the trim happens only in
`fix-duplicate-ids.ts`'s `action=report` branch, stripping `newId` from each reassignment before
serializing:

```typescript
if (action === "report") {
  const preview = plan.map((g) => ({
    id: g.id,
    keptIndex: g.keptIndex,
    reassigned: g.reassigned.map(({ newId, ...rest }) => rest),
  }));
  return pushWarning(pushCacheWarning(textResult(JSON.stringify(preview, null, 2)), warning), skipWarning);
}
```

`fixDuplicateIdsTool.description` gains a clause: `action=report`'s preview omits `newId` since
ids are freshly minted at `action=fix` time, not previewable in advance.

## Item 22: `get_context`'s Dual Dialogue rule overstates the wrapper's `Type`

The rule says side-by-side dialogue is nested inside a `Type='General'` wrapper. That's only true
of wrappers the server itself builds via `edit_dual_dialogue action=create`; a wrapper Final
Draft's own UI authors carries the first contained paragraph's type instead (observed as
`Type="Character"` in real files).

**Fix:** one sentence added to the existing "Dual Dialogue" rule in `context-data.ts`'s
`contextRules`:

> Side-by-side dialogue is nested inside a wrapper paragraph with a `<DualDialogue>` child;
> `edit_dual_dialogue action=create` always builds this wrapper with `Type='General'`, but a
> wrapper Final Draft's own UI authors may instead carry the first contained paragraph's type
> (e.g. `Type='Character'`) — don't filter on wrapper type to find dual-dialogue blocks. Use
> `edit_dual_dialogue` to create (move paragraphs into wrapper) or remove (delete wrapper,
> optionally extract contents).

No behavior change; text-only.

## Items 23 & 24: `get_fdx_breakdown`'s Character Frequency section

**Item 23 — missing skip warning.** `CHARACTER FREQUENCY` is built from `d.rankedChars`, itself
derived from `buildCharacterAppearances(doc)` — the same top-level-only scan
`get_character_appearances` warns about. `get_fdx_breakdown` never surfaces that warning, in the
tool's own response or in the rendered report file.

**Fix:** `BreakdownData` (in `breakdown-report.ts`) gains one field:

```typescript
skippedNestedCount: number;
```

set in `buildBreakdownData` via `countNestedParagraphs(doc.getParagraphElements())`. All three
renderers emit `skippedNestedWarning(d.skippedNestedCount)` (or equivalent phrasing) near the
Character Frequency section when it's non-empty:

- **Text** (`renderBreakdownText`): one line directly under the `CHARACTER FREQUENCY (top 10)`
  heading, before the character rows.
- **HTML** (`renderBreakdownHtml`): a `<p class="note">` (new, minimal style rule) inside the
  `#characters` section, before the table.
- **PDF** (`renderBreakdownPdf`): one `l.line(...)` call directly after
  `l.heading("Character Frequency")`, before the bar rows.

`handleGetFdxBreakdown` (in `get-fdx-breakdown.ts`) also prepends the same warning to its own
short confirmation message via `pushWarning`, so the blind spot is visible before the caller even
opens the file — matching how `get_character_appearances` surfaces it inline today.

**Item 24 — name column overflow.** `pad(s, width)` in `breakdown-report.ts` returns `s` unchanged
when `s.length >= width`, so a character name at or past the 14-char column width runs directly
into the following number with no separating space (`CAPTAIN IRIKOV121 appearances...`). `pad` is
reused by other columns (paragraph-type counts at width 20, act labels at width 38) that don't
overflow today only because their content happens to stay under those widths.

**Fix:** `pad` guarantees a minimum one-space gap unconditionally:

```typescript
function pad(s: string, width: number): string {
  return s.length >= width ? s + " " : s + " ".repeat(width - s.length);
}
```

Every existing call site keeps its current output for content under `width` (unchanged branch);
content at or over `width` now gets exactly one trailing space instead of zero. No call site needs
its own overflow guard.

## Testing

- **Item 20:** `find-duplicate-ids.test.ts`/`fix-duplicate-ids.test.ts` gain a case with a
  DualDialogue block present and a duplicate id only among top-level paragraphs — confirms the
  skip-count warning is prepended and the existing group-detection output is unchanged. A
  regression case with no DualDialogue block confirms no warning is added (empty string no-ops).
- **Item 21:** a test asserting `action=report`'s JSON output has no `newId` key anywhere in
  `reassigned` entries, alongside the existing fields; a second test confirms `action=fix`'s output
  is unaffected (still reports real `newId`s) and that two consecutive `report` calls can return
  different underlying `newId`-bearing plans internally without it being observable (since it's
  stripped) — i.e. no test should assert report's now-absent `newId` matches anything.
- **Item 22:** no test — pure prose change in `context-data.ts`; covered structurally by the
  existing `registry.test.ts`/`get-context.test.ts` parity checks, which don't inspect rule prose
  content.
- **Item 23:** a `get-fdx-breakdown.test.ts` case with a DualDialogue block in the fixture,
  asserting the tool's own result text contains the skip-count warning, and that the written report
  file (checked for `asType='text'` and `asType='html'`) contains it too. A `breakdown-pdf.test.ts`
  case asserts `renderBreakdownPdf` includes an extra line (or the page's text content, if
  practical to introspect via `pdf-lib`) when `skippedNestedCount > 0` — falling back to just
  verifying the renderer doesn't throw and produces one additional line-height's worth of content
  if extracting PDF text is impractical. A regression case with `skippedNestedCount === 0` (no
  DualDialogue in the fixture) confirms no warning line appears anywhere.
- **Item 24:** direct tests of `pad` (if exported) or of `renderBreakdownText`'s character-frequency
  output with a character name ≥14 chars, asserting at least one space precedes the appearance
  count. A regression case with a short name confirms existing padding/alignment is unchanged.

## Docs to sync

- Item 20: no schema change; no doc sync needed beyond `CHANGELOG.md`.
- Item 21: `fixDuplicateIdsTool.description` changes (documented above) — check
  `context-data.ts`'s mirrored roster entry, which per the item-in-progress registry refactor is
  now *derived* from `fix-duplicate-ids.ts`'s own description automatically, so no separate edit is
  needed there. `TOOLS.md`'s row is likewise regenerated from the same registry (see the roster-fix
  commit earlier this session) — regenerate rather than hand-edit.
- Item 22: `get_context`'s own text changes by definition; nothing else references this rule's
  wording.
- Item 23: `getFdxBreakdownTool.description` is unchanged (the tool's documented scope already
  covers "character frequency"; adding a warning to its output isn't a schema or documented-behavior
  change). No sync needed beyond `CHANGELOG.md`.
- Item 24: no schema change; no doc sync needed beyond `CHANGELOG.md`.
- `CHANGELOG.md` gets one combined "Fixed" entry for the phase (matching the `three-small-fixes`
  precedent), and `package.json` gets a patch version bump alongside it.
