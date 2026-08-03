# Nested-Paragraph Skip Reporting — Design Spec

Wishlist item 17 in `F:\Vault\mcp\fdx-mcp-server\wishlist.md`, "The typo index cannot see inside
dual dialogue" (remaining half — the mutation half, `rename_character`, was fixed in 0.0.18 and
its handoff, `rename-character-misses-dual-dialogue.md`, is resolved and moved to `done/`).

## Problem

`find_par`, `replace_text`, `get_flagged_words`, `get_placeholders`, and
`get_character_appearances` all operate on `doc.getParagraphElements()` — top-level body
paragraphs only. Paragraphs nested inside a `<DualDialogue>` block are silently out of scope for
all five. For a search or a read-only report, that's a visible limitation in principle but an
invisible one in practice: nothing in a response tells a caller that a region of the document
wasn't looked at, so a whole-script sweep that skips a `DualDialogue` reads as complete when it
isn't. Live verification (2026-08-02, `Star Trek Empires` pilot) confirmed this concretely:
`find_par parType="Character" textContent="FIRST OFFICER"` returned 11 hits against a document
that actually contains 12 (the twelfth nested inside a `DualDialogue`), and
`get_character_appearances` attributed a whole scene's dialogue to the wrong speaker around a
`DualDialogue` interruption, with the nested pair credited to nobody.

This item's ask is narrower than fixing all of that: report how many nested paragraphs were out of
scope, so the gap is visible in the output instead of only in documentation. It does not ask any of
the five tools to actually descend into `DualDialogue` blocks — that remains a separate, larger
change (per the wishlist item's own "cheapest first" framing), and `get_character_appearances`'s
attribution logic in particular would need real thought about how two simultaneous speeches map
onto a single sequential "current speaker" walk before descending safely.

## Reporting mechanism

A plain-text warning, prepended to the response via the existing `pushWarning` helper (already
used for cache warnings and duplicate-id warnings elsewhere in this codebase) — not a new JSON
field. `find_par` returns a bare JSON array today; adding a field there would change its response
shape for every existing caller. `replace_text`, `get_flagged_words`, `get_placeholders`, and
`get_character_appearances` already return JSON objects, where a new field would be additive and
safe — but using one mechanism uniformly across all five tools is simpler than two, and
`pushWarning` already no-ops on an empty string, so a document (or scope) with no `DualDialogue`
gets zero output change, not even an empty field.

## Shared helpers

Two small, pure functions — no new files.

**`src/fdx/paragraph.ts`**, next to `expandDualDialogue`:

```typescript
/** Counts paragraphs `expandDualDialogue` would add to `paragraphs` — i.e. how many nested
 *  paragraphs are out of scope for a caller that only looks at the given (unexpanded) list. */
export function countNestedParagraphs(paragraphs: XmlElement[]): number {
  return expandDualDialogue(paragraphs).length - paragraphs.length;
}
```

**`src/tools/shared.ts`**, next to `pushWarning`:

```typescript
/** The warning text for countNestedParagraphs' result, or "" when there's nothing to report
 *  (pushWarning no-ops on an empty string). */
export function skippedNestedWarning(count: number): string {
  return count > 0
    ? `${count} paragraph(s) nested inside a DualDialogue block were not scanned by this call.`
    : "";
}
```

A call site becomes one line at the end of a handler:
`result = pushWarning(result, skippedNestedWarning(countNestedParagraphs(paragraphs)));`

## Per-tool wiring

The count reflects each call's *actual queried scope*, not always the whole document — the message
says "not scanned by this call," so it should describe what that call covered.

- **`find_par`**: already computes `[startIndex, endIndex)` over top-level paragraphs (whole
  document, or one scene via `id`). Count against `paragraphs.slice(startIndex, endIndex)`.
- **`replace_text`**: same existing `[startIndex, endIndex)` scoping (whole document, or one scene
  via `id`). Same slice-based count.
- **`get_flagged_words`**: no scoping parameter exists. Count against the whole document's
  top-level paragraph list.
- **`get_placeholders`**: same — whole document, no scoping parameter.
- **`get_character_appearances`**: same — whole document, no scoping parameter. This tool's gap is
  qualitatively sharper than the other four (misattribution around a `DualDialogue` interruption,
  not just an omission), but this item only asks for a count; the count itself is the honest
  signal that a scene's numbers may not be fully trustworthy near a `DualDialogue` block. No
  attribution-logic change is in scope here.

## Testing

Each of the five tools gets:

- A fixture containing a `<DualDialogue>` block within the call's scope, asserting the warning
  text appears with the correct count as the first `content` block, ahead of the existing JSON
  body (matching how `pushCacheWarning` already prepends).
- A fixture with no `DualDialogue` at all, asserting no such warning block is present — the
  response is byte-for-byte identical to today's for the overwhelming majority of scripts.
- For `find_par` and `replace_text` specifically: a scoped call (via `id`) where the
  `DualDialogue` sits *outside* the requested scene, asserting the count is `0` (no warning) even
  though the document as a whole contains nested paragraphs elsewhere — proving the count reflects
  the query's actual scope, not the whole document.

## Docs to sync

All five tools' descriptions (in their own files and mirrored in `src/tools/context-data.ts`) get
one added clause noting a call may prepend a note when paragraphs nested inside a `DualDialogue`
block were out of scope. Per the project's standing rule, `README.md`, `CHANGELOG.md`, and
`TOOLS.md` are checked/updated alongside these description changes, even though no input schema
itself changes for any of the five tools.
