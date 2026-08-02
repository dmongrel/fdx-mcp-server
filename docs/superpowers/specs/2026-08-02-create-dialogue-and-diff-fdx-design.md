# `create_dialogue` + `diff_fdx` (wishlist Phase F + G)

**Date:** 2026-08-02
**Status:** Approved

## Problem

`F:\Vault\mcp\fdx-mcp-server\wishlist.md` items 9 and 11 — both `[anticipated]` (reasoned from tool
descriptions, not yet hit in a real session), unrelated to each other, but small enough that one
combined spec covers both without either needing its own document.

**Item 9:** `get_context` states the rule — Dialogue is invalid unless immediately preceded by
Character or Parenthetical. Adding a new speech today means two (or three) separate `edit_par`
creates, and between them the document sits in a state the server itself defines as invalid. Nothing
checks this.

**Item 11:** Versioned saves accumulate `Screenplay_v1.fdx` through `_vN`. Confirming what one save
actually changed relative to the last means external tooling today; comparing paragraph counts tells
you *how many* things changed, not *which*.

## Scope

### 1. `create_dialogue` (item 9)

New tool. Builds 2–3 new paragraphs — Character, an optional Parenthetical, Dialogue — and splices
them in contiguously at one anchor position, in a single synchronous in-memory operation.

```typescript
interface CreateDialogueArgs {
  path: string;
  character: string;       // Character cue text, e.g. "GROG" or "GROG (V.O.)"
  dialogue: string;
  parenthetical?: string;
  beforeParId?: string;    // same anchor semantics as edit_par action=create
  afterParId?: string;
}
```

Plain strings only for `character`/`parenthetical`/`dialogue` — no styled `textRuns`. If styling is
needed afterward, `edit_par action=edit` (which already accepts `textRuns`) is the existing tool for
that; duplicating that surface here isn't warranted for a tool whose whole point is inserting plain
new speech quickly.

**Validity is structural, not a separate check.** The tool only ever constructs
`Character → [Parenthetical] → Dialogue`, in that exact order, contiguously. There's no runtime
"does this satisfy the chain rule" validation step because it's impossible for the tool to produce
anything that doesn't — the same reasoning `edit_locations` uses for offset-splicing rather than
validating after the fact.

**No batch/savepoint machinery.** Considered building this as a thin wrapper generating a
`batch_edit` operation list (reusing Phase E's work directly) — rejected because it doesn't fit:
each paragraph's insertion anchor depends on the *previous* paragraph's freshly-minted id (the
Parenthetical goes after the Character that was just created; the Dialogue goes after whichever of
those was created last), and `batch_edit`'s operations are static args resolved upfront, with no way
to reference a prior operation's result. `create_dialogue` also has no failure mode that occurs
*after* mutation starts — the only things that can go wrong (a bad `beforeParId`/`afterParId`
anchor, a missing required field) are checkable before touching the document at all, so there is
nothing to roll back. It gets its own direct implementation: the same `buildParagraphElement`/
anchor-resolution mechanics `edit_par`'s create branch already uses, generalized to insert several
paragraphs instead of one.

**SmartType refresh:** `character`'s text is added to the SmartType Characters list, exactly like
`edit_par action=create type=Character` already does (reusing the existing `addSmartTypeValue`
helper). `parenthetical`/`dialogue` text never feeds a SmartType list, same as today.

**Response** (JSON, matching the `{id, ...}` pattern `edit_par`/`edit_dual_dialogue action=create`
already established):

```json
{
  "characterId": "...",
  "parentheticalId": null,
  "dialogueId": "...",
  "message": "Successfully created a Character/Dialogue group. File updated in cache — call save_fdx to persist changes to disk."
}
```

`parentheticalId` is `null` when no `parenthetical` was given.

**Explicitly out of scope:** validating that the insertion point doesn't disrupt some *other*,
pre-existing chain nearby (e.g. inserting between an existing Character and its Dialogue, which
would leave that original Dialogue now preceded by this group's last paragraph instead of its own
Character). Nothing in this codebase audits surrounding structural context today — `edit_par`'s
single-paragraph create doesn't either — and that's a materially different, open-ended problem from
the one this item raised (a multi-step *create* process leaving a transient invalid state). Flagged
here so it isn't silently assumed to be covered.

### 2. `diff_fdx` (item 11)

New tool.

```typescript
interface DiffFdxArgs {
  pathA: string;  // baseline
  pathB: string;  // comparison
}
```

Loads both via the existing `getCachedFdx` (from `shared.ts`) — the same helper every other tool
already uses, which auto-loads from disk on a cache miss. No new cache capability is needed: the
wishlist's note that this "needs two documents cached at once, which interacts with the 4-slot
limit" is already handled by existing infrastructure (the 4-slot LRU cache already holds whatever's
been loaded, `diff_fdx` just loads two paths like any tool loads one, and reports whichever
eviction warnings result the same way every other tool does).

**Diff key: paragraph `id`**, scoped to top-level body paragraphs
(`doc.getParagraphElements()`, the same scope every other paragraph-oriented tool in this codebase
uses — nested `DualDialogue` paragraphs are out of scope, consistent with existing convention).
Ids are stable UUIDs preserved across edits and saves (including versioned ones — the exact
workflow that motivated this item), so id-based matching is correct for the stated use case.

- **`added`**: paragraph id present in B, not in A.
- **`removed`**: paragraph id present in A, not in B.
- **`modified`**: id present in both, but `(type, text)` differs between A and B. Reports both
  `before` and `after`.
- Everything else (id in both, identical `(type, text)`) is **not** individually listed — folded
  into a single `unchangedCount`.

**Comparison granularity is `(type, text)` only** — not run-level styling/`AdornmentStyle`. That's a
different, already-covered concern (the integrity-count tooling from wishlist items 6/12); this tool
answers "which paragraphs changed," not "did a run's formatting change while its text stayed the
same." **Reordering is not detected** — a paragraph whose `(type, text)` is identical in both files
is `unchanged` regardless of whether its position shifted; detecting pure reordering needs
position-aware diffing (e.g. an LCS), which isn't what "added, removed, and modified paragraphs by
id" asks for.

**Response** (JSON):

```json
{
  "pathA": "...",
  "pathB": "...",
  "added": [{ "id": "...", "type": "Dialogue", "text": "..." }],
  "removed": [{ "id": "...", "type": "Action", "text": "..." }],
  "modified": [
    { "id": "...", "before": { "type": "Dialogue", "text": "..." }, "after": { "type": "Dialogue", "text": "..." } }
  ],
  "unchangedCount": 1774,
  "message": "3 added, 1 removed, 2 modified, 1774 unchanged."
}
```

Read-only — never mutates either document, never marks either dirty.

## Out of scope

- `create_dialogue` supporting more than one Character/[Parenthetical]/Dialogue turn per call (e.g.
  an interjected Parenthetical mid-speech, or multiple speakers) — the wishlist's concrete example is
  one new speech; a generic N-paragraph sequence validator is speculative generality YAGNI would
  reject.
- `create_dialogue` validating the document beyond the paragraphs it itself creates (see "Explicitly
  out of scope" above).
- `diff_fdx` diffing run-level attributes, detecting reordering, or diffing anything below the
  top-level body-paragraph list (title page, SmartType lists, Cast, etc.).
- A `merge`/three-way-diff mode — two-file diff only, matching the wishlist's literal ask.

## Documentation

- `CHANGELOG.md`: new version entry; bump `package.json` alongside it.
- `TOOLS.md`: two new rows (`create_dialogue`, `diff_fdx`).
- `src/tools/context-data.ts`: new catalog entries for both; `create_dialogue` also gets a mention
  alongside the existing "Dialogue Sequence" rule in `contextRules`, since it's the direct answer to
  that rule's own constraint.
- `README.md`: checked per this repo's doc-sync rule; a bullet each fits the existing Features list
  style, drafted at implementation time.

## Testing

**`create_dialogue`:**
- Character + Dialogue only (no parenthetical): both paragraphs created, contiguous, correct types,
  `parentheticalId: null`.
- Character + Parenthetical + Dialogue: all three created, contiguous, in order.
- `character` text added to the SmartType Characters list.
- `beforeParId`/`afterParId` anchor the group correctly (mirror `edit_par`'s existing anchor tests).
- An unknown anchor id errors, nothing is created.
- Missing required fields (`character`, `dialogue`) error.
- Full `bun test` stays green throughout.

**`diff_fdx`:**
- Identical documents: `added`/`removed`/`modified` all empty, `unchangedCount` matches paragraph
  count.
- A paragraph only in B: appears in `added`.
- A paragraph only in A: appears in `removed`.
- A paragraph with the same id but changed text: appears in `modified` with correct `before`/`after`.
- A paragraph with the same id and changed type (but same text, or vice versa): still `modified`.
- A paragraph that only moved position (identical `type`/`text`): not reported anywhere, counted in
  `unchangedCount`.
- Loading `pathB` doesn't disturb `pathA`'s cache entry (and vice versa) when both fit in the 4-slot
  cache; an eviction triggered by loading either path surfaces its warning the same way any other
  tool's does.
- Full `bun test` stays green throughout.
