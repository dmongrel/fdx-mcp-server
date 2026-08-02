# Placeholder-Aware Counting — Design Spec

Wishlist item 10: `F:\Vault\mcp\fdx-mcp-server\wishlist.md`, "Placeholder-aware counting."

## Problem

Some projects insert `[FIX - ...]`-style General paragraphs as drafting placeholders and delete
them as fixes land. While any are present, paragraph and page counts from `get_script_stats` are
inflated and unusable as a stable baseline — the tool has no way to say so, and no way to exclude
them. Listing them today means a substring `find_par` call that also catches legitimate bracketed
text (e.g. `(O.S.)`-style parentheticals aren't bracket-square, but nothing stops false positives
in principle); there is no precise, purpose-built way to enumerate them, and no way to remove a
batch of them without hand-assembling ids.

## Placeholder detection rule

A paragraph is a **placeholder** when its full text, trimmed, is entirely wrapped by a single
`[...]` pair — anchored at both ends: `/^\[[\s\S]*\]$/` applied to `paragraphText(p).trim()`.

- Matches: `"[FIX - move this scene earlier]"`.
- Does not match: `"INT. CAVE - DAY [FIX - check slug]"` (real content precedes the bracket) or
  `""` (empty paragraphs never match — the regex requires at least the two brackets).
- Applies regardless of the paragraph's `Type` attribute. Projects are not guaranteed to use
  `General` specifically, and matching on content alone is simpler and more robust than
  special-casing a type.
- This is a whole-paragraph check, not a per-run check — a placeholder split across multiple
  `<Text>` runs (e.g. one run styled, one not) is still a match as long as the *joined* text
  (what `paragraphText` already returns) satisfies the pattern.

This rule lives as one small shared helper in `src/tools/breakdown.ts` (`isPlaceholderParagraph`),
next to the other paragraph-classification helpers already there (`getSceneProperties`, etc.), and
is used by both `get_script_stats` and the new `get_placeholders` tool below.

## `get_script_stats` changes

**`ScriptStats` gains one new field:**

```typescript
placeholderCount: number;
```

Always computed, unconditionally — a placeholder count is useful context even for a caller who
isn't excluding them, the same way `flaggedWordCount` is always present today.

**New optional tool input: `excludePlaceholders?: boolean` (default `false`).**

When `true`, `buildScriptStats` computes `paragraphCount`, `byType`, `sceneCount`, and
`actBreakCount` as if placeholder paragraphs were never in the document — they're skipped in the
per-paragraph tally loop entirely. `placeholderCount` itself is still reported (it's the count of
what was excluded, so it stays meaningful either way).

`totalPages` is **not** adjusted by `excludePlaceholders`, under either value. `totalPages` is
read from the highest `SceneProperties.Page` value already stamped into the document by Final
Draft's own pagination, computed from whatever paragraphs existed at last save — a placeholder's
prior presence already shaped that number. There is nothing to "recover": recomputing pagination
without the placeholder is a Final-Draft-side operation this server does not perform, and
pretending to correct `totalPages` here would misrepresent a number the tool doesn't actually
control.

**`buildScriptStats` signature:**

```typescript
export function buildScriptStats(doc: FdxDocument, opts?: { excludePlaceholders?: boolean }): ScriptStats
```

The new second parameter is optional and defaults to no exclusion, so the two existing call sites
(`breakdown-report.ts`'s combined-report path, and `breakdown.test.ts`'s existing assertions) are
unaffected by omitting it.

## New tool: `get_placeholders`

Read-only, modeled directly on `get_flagged_words` (same shape, same section/page lookup):

```json
{
  "placeholders": [
    { "id": "par17", "type": "General", "text": "[FIX - move this scene earlier]", "page": 14 }
  ],
  "count": 1
}
```

- Input: `path` (required). No filter options — the detection rule is fixed and unambiguous, so
  there's nothing to parametrize (unlike `get_flagged_words`'s `excludeIgnoreList`, which reflects
  a genuinely optional user list).
- Scoped to top-level body paragraphs only (`doc.getParagraphElements()`), matching every other
  paragraph-oriented tool's established convention — nested `DualDialogue` paragraphs are out of
  scope.
- `page` is resolved the same way `get_flagged_words` and `find_par` already do: scan backward via
  `findContainingSectionIndex` for the nearest preceding section-type paragraph, read its
  `SceneProperties.Page`; `null` when the hit is before any section heading.
- Uses the same `isPlaceholderParagraph` helper as `get_script_stats`, so the two tools can never
  disagree about what counts as a placeholder.

## Bulk removal — composition, not a new tool

`get_placeholders` returns ids; `batch_edit` (shipped, wishlist item 7) already runs an ordered
list of `edit_par action=remove` operations atomically, with automatic rollback if any one fails.
Chaining `get_placeholders` → `batch_edit` (one `edit_par` remove per id) covers "bulk remove once
the author has applied them" without new mutation code. No new tool is needed for this part of the
original wishlist item.

## Testing

- `isPlaceholderParagraph`: whole-bracket text matches; text with a bracket plus surrounding
  content does not; empty text does not; matches regardless of paragraph `Type`.
- `buildScriptStats`: `placeholderCount` reflects the number of placeholder paragraphs present with
  `excludePlaceholders` omitted/false, and all other fields (`paragraphCount`, `byType`,
  `sceneCount`, `actBreakCount`, `totalPages`) are unaffected by placeholders in that mode; with
  `excludePlaceholders: true`, those same four fields exclude placeholders while `placeholderCount`
  and `totalPages` stay as they were.
- `get_placeholders`: reports id/type/text/page for a whole-bracket paragraph; a paragraph with a
  bracket plus surrounding text is not reported; a placeholder before any section heading gets a
  null page; no placeholders returns an empty list, not an error.

## Docs to sync

Per this project's standing rule, any tool add/schema-change updates `README.md`, `CHANGELOG.md`,
and `TOOLS.md` together, plus `src/tools/context-data.ts`'s mirrored catalog entry:

- `TOOLS.md`: new row for `get_placeholders`; update `get_script_stats`'s row for the new field and
  param; bump the tool-count header.
- `CHANGELOG.md`: new version entry; bump `package.json`.
- `README.md`: the "Document integrity" feature bullet (already touched last phase for
  `get_flagged_words`) gets a placeholder-counting clause.
- `context-data.ts`: new `get_placeholders` catalog entry; update `get_script_stats`'s entry.
