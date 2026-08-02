# Batch edits + savepoints (wishlist Phase E)

**Date:** 2026-08-02
**Status:** Approved

## Problem

`F:\Vault\mcp\fdx-mcp-server\wishlist.md` items 7 and 8. Every edit is its own round trip against
the shared 4-slot document cache. Running several edits in parallel risks interleaving; running them
serially is slow, and neither gives any guarantee that a sequence of edits either all lands or none
does. `reload_fdx` is the only undo today, and it discards **every** unsaved edit back to the last
disk state — if the sixth of eight planned changes turns out wrong, the first five die with it too.
The field workaround was saving often, which is safe but burns cache slots (a slot per save, per
`get_context`'s existing Versioned Saves and the Cache section) and litters the folder with
versions.

Item 8 is explicitly framed as related to item 7 ("item 7 is the mitigation"), and both are solved
by the same underlying primitive: a way to snapshot a document's current in-memory state and restore
it later. This phase builds that primitive once and exposes it two ways — automatically inside a new
`batch_edit` tool, and manually via two new standalone tools.

## Scope

### 1. Savepoint storage: `LruCache` extension

`src/fdx/cache.ts`'s `CacheEntry` gains an optional field:

```typescript
interface CacheEntry {
  doc: FdxDocument;
  dirty: boolean;
  savepoint?: { xml: string; dirty: boolean };
}
```

Two new `LruCache` methods:

```typescript
/** Snapshots the entry's current document (serialized) and dirty flag, overwriting any existing
 *  savepoint for this path. Single level — there is never more than one savepoint per path. */
setSavepoint(path: string): { ok: true } | { ok: false; reason: string };

/** Restores the entry's document and dirty flag from its savepoint. The savepoint itself is left
 *  in place afterward (rollback is not destructive to the savepoint — calling it twice in a row
 *  restores the same state both times). */
rollback(path: string): { ok: true } | { ok: false; reason: string };
```

`setSavepoint` fails (`{ ok: false }`) when nothing is cached for `path`. `rollback` fails when
nothing is cached for `path`, or when the entry has no savepoint. Both failure reasons are
distinguishable strings the calling tool surfaces directly (`"nothing cached for path"` vs. `"no
savepoint set for path"`).

`rollback` reconstructs the document via `FdxDocument.parse(savepoint.xml, path)` — the same
serialize/parse round-trip `document.test.ts` already verifies is lossless — and does **not** re-run
`dedupSmartTypeLists()`/`consolidateSpellCheckWords()` the way `reload_fdx` does after reading from
an external (disk) source: a savepoint is a snapshot of trusted in-memory state, not untrusted disk
content, so it's restored exactly as it was, whatever that was.

A savepoint is tied to its exact cache key (`path`). It is not migrated when a versioned `save_fdx`
re-caches the document under a new path — the old path's entry (and its savepoint, if any) is
untouched, consistent with how dirty flags already behave across a versioned save. Eviction from the
4-slot cache discards the whole entry, savepoint included, same as it already discards unsaved edits
today — no new eviction-warning wording for this; the existing warning already covers "unsaved edits
are gone."

### 2. `savepoint(path)` and `rollback(path)` — standalone tools

```typescript
export const savepointTool: FdxTool = {
  name: "savepoint",
  description: "Captures the current in-memory state of a cached document (content and dirty flag) as a single rollback point, overwriting any previous savepoint for this path. Call rollback to restore it. Does not touch disk. One level only. batch_edit takes its own savepoint automatically before running, which overwrites whatever savepoint (if any) was set here.",
  ...
};

export const rollbackTool: FdxTool = {
  name: "rollback",
  description: "Restores a document to its last savepoint — set explicitly by savepoint, or automatically by batch_edit right before its operations ran — discarding any edits made since. Errors if no savepoint exists for this path. Does not touch disk; call save_fdx afterward if you want the rollback persisted.",
  ...
};
```

Both take just `path`. `handleSavepoint` calls `documentCache.setSavepoint(path)` and reports success
or the failure reason as an error. `handleRollback` calls `documentCache.rollback(path)` the same
way, and on success reports that the document was restored (mentioning that disk is untouched, so
the message doesn't read as if a save happened).

### 3. `batch_edit(path, operations)` — the primary tool

```typescript
interface BatchOperation {
  tool: string;
  args: Record<string, unknown>;
}
```

Input: `path` (required), `operations` (required, non-empty array of `{tool, args}`).

**Allowlist**, validated against every operation *before* touching the document or taking a
savepoint (so a malformed batch fails cheaply, with nothing to roll back):

```
edit_par, edit_dual_dialogue, edit_cast, edit_scene_arc_beats,
edit_smarttype_characters, edit_smarttype_extensions, edit_smarttype_locations,
edit_smarttype_scene_intros, edit_smarttype_times_of_day, edit_smarttype_transitions,
edit_spell_check, edit_locations, edit_title_page, edit_copyright,
edit_element_settings, edit_header_and_footer, replace_text, rename_character
```

Deliberately excludes every disk/cache-lifecycle tool (`save_fdx`, `reload_fdx`, `close_fdx`,
`new_file`, `read_fdx`) and every read-only tool. The exclusion is structural (an allowlist, not a
denylist) specifically because a disk write can't be rolled back — including `save_fdx` in a batch
that later fails would leave a file on disk that the in-memory rollback can't undo, silently
breaking the "all-or-nothing" guarantee. An operation naming a tool outside the allowlist is a
validation error naming the bad operation's index and tool name; nothing runs.

**Execution:**

1. Validate every operation's `tool` is in the allowlist (see above). Any failure here returns an
   error immediately — no savepoint taken, no document touched.
2. `documentCache.setSavepoint(path)` (errors if nothing is cached for `path` — same as any other
   tool requiring a prior `read_fdx`).
3. For each operation in order: call its handler with `{ ...operation.args, path }` (the batch's
   `path` always wins, overriding anything the caller put in `operation.args.path` — this is what
   makes "a batch is scoped to one document" a structural guarantee rather than a convention the
   caller has to get right).
4. If an operation's result has `isError: true`: call `documentCache.rollback(path)` immediately,
   stop running further operations, and return an error reporting which operation (0-based index and
   tool name) failed, its error text, and the results of whichever earlier operations in this batch
   already ran (informational — moot after rollback, but useful for understanding what almost
   happened).
5. If every operation succeeds: return a success report with each operation's result text, in order.
   **The savepoint taken in step 2 is left in place**, not cleared — so a caller who inspects the
   result and decides they don't like the batch after all can still call `rollback` to undo the
   entire thing, success or not.

**Response shape**, JSON in both outcomes:

Success:
```json
{
  "path": "...",
  "operationsApplied": 3,
  "results": [
    { "tool": "edit_par", "result": "Successfully edited paragraph in script. ..." },
    { "tool": "replace_text", "result": "Replaced 2 occurrence(s) of \"...\" with \"...\". ..." },
    { "tool": "rename_character", "result": "{\"from\":...}" }
  ],
  "message": "Successfully applied 3 operation(s) atomically. A savepoint from before this batch is still available — call rollback to undo the whole batch. File updated in cache — call save_fdx to persist changes to disk."
}
```

Failure:
```json
{
  "path": "...",
  "failedAtIndex": 2,
  "failedTool": "edit_par",
  "error": "failed to edit paragraph: paragraph not found",
  "results": [
    { "tool": "edit_par", "result": "Successfully edited paragraph in script. ..." },
    { "tool": "replace_text", "result": "Replaced 2 occurrence(s) of \"...\" with \"...\". ..." }
  ],
  "message": "Batch failed at operation 3 (edit_par): failed to edit paragraph: paragraph not found. All changes rolled back — the document is unchanged from before this batch call."
}
```
(`isError: true` on the failure response.)

Each operation's `result` field is that operation's own response content, joined (its handlers
already return varied shapes — some plain sentences, some JSON strings — batch_edit doesn't attempt
to parse or normalize them, just captures the text as-is; a caller wanting structured detail on one
operation already knows how to parse that tool's own response format).

### 4. `get_cache_status` gains `hasSavepoint`

`CacheEntryInfo` (`src/fdx/cache.ts`) gains `hasSavepoint: boolean`, reported per entry in
`get_cache_status`'s existing JSON output — same philosophy as the existing `dirty` flag, cheap to
add, and lets a caller check whether a savepoint exists before relying on `rollback` succeeding.

### 5. `get_context` documentation

A new rule, alongside the existing "Versioned Saves and the Cache" section:

> ## Batch Edits and Savepoints
> `batch_edit` runs an ordered list of edit operations against one document, all-or-nothing: if any
> operation fails, every operation in the batch is rolled back and the document is left exactly as
> it was before the call. It takes a savepoint automatically before running and leaves it in place
> afterward, win or lose — so `rollback` can undo the whole batch even after it succeeds, if you
> change your mind. `savepoint`/`rollback` are the same mechanism, callable directly around any
> sequence of individual edit_* calls — one level only, and a new savepoint (manual or from the next
> `batch_edit` call) always overwrites whatever was there. Neither touches disk; `save_fdx` is still
> a separate, explicit step.

## Out of scope

- A savepoint stack (multiple undo levels) — "even one level would be enough" per the wishlist;
  single-level keeps the mechanism (and its mental model) simple.
- Batch preview/dry-run — not requested; `replace_text preview` already covers previewing the one
  operation type most likely to need it.
- Cross-document batches — a batch is scoped to one `path`, structurally enforced by injecting it
  into every operation's args.
- Including `save_fdx` (or any disk-touching tool) in a batch — see the allowlist rationale above.
- Migrating a savepoint across a versioned `save_fdx`'s path change — the old path's entry (and any
  savepoint on it) is simply left alone, consistent with existing dirty-flag behavior there.

## Documentation

- `CHANGELOG.md`: new version entry; bump `package.json` alongside it.
- `TOOLS.md`: three new rows (`batch_edit`, `savepoint`, `rollback`); `get_cache_status`'s row
  description updated to mention `hasSavepoint`.
- `src/tools/context-data.ts`: new catalog entries for the three tools, plus the new "Batch Edits and
  Savepoints" rule from section 5 above.
- `README.md`: checked per this repo's doc-sync rule; likely a new bullet under Features (batch
  edits are a headline capability), confirmed and drafted at implementation time rather than assumed.

## Testing

- `src/fdx/cache.test.ts` (already exists) gains cases for `setSavepoint`/`rollback` directly:
  round-trips content and dirty flag; fails cleanly on an uncached path; fails cleanly on rollback
  with no savepoint; a second `setSavepoint` overwrites the first; `rollback` is non-destructive
  (callable twice with the same result).
- `savepoint.test.ts`/`rollback.test.ts` (or one combined file) for the two standalone tools' error
  messages and success paths.
- `batch-edit.test.ts`:
  - Rejects an operation naming a tool outside the allowlist, before touching the document (assert
    nothing changed and no savepoint was taken/consumed).
  - Rejects a disk/cache-lifecycle tool name (`save_fdx`) explicitly, confirming the allowlist
    boundary.
  - A successful multi-operation batch (e.g. `edit_par` then `replace_text`) applies all of them in
    order and reports each result.
  - A batch whose `operations[i].args.path` differs from the batch's `path` is silently overridden
    to the batch's `path` (assert the operation actually targeted the batch's document, not
    whatever it tried to specify).
  - A failing operation mid-batch rolls back every earlier operation in the same batch (assert the
    document matches its pre-batch state exactly, e.g. via `doc.serialize()` equality).
  - After a successful batch, the pre-batch savepoint is still present — a subsequent `rollback`
    call undoes the whole successful batch.
  - After a failed (rolled-back) batch, calling `rollback` again is a no-op (already at that state).
- `get-cache-status.test.ts`: `hasSavepoint` reflects `true`/`false` correctly before and after
  `savepoint`/`rollback`/eviction.
- Full `bun test` stays green throughout.
