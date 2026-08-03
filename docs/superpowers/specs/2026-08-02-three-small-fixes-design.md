# Three Small Fixes — Design Spec

Wishlist items 15, 16, and 19 in `F:\Vault\mcp\fdx-mcp-server\wishlist.md`. Three independent,
small fixes bundled into one spec/plan since none of them warrant a spec of their own.

## Item 15: `get_flagged_words` mislabels `AdornmentStyle="-1"`

`AdornmentStyle="-1"` is Final Draft's proofing flag, covering spelling *and* grammar (repeated
words, spacing) — not just spelling. Calling it an "unknown-word marker" is technically wrong in a
way a future caller would trust when deciding whether a flag is worth chasing.

**Fix:** replace "unknown-word marker" with the wishlist's own suggested phrasing everywhere it
appears in a living document (i.e. not `CHANGELOG.md`, which records what was true at each past
release and is never retroactively edited):

> Final Draft's proofing flag (spelling and grammar both, so expect repeated-word and spacing hits
> alongside genuine typos)

Nine occurrences across six files, found by grepping the codebase for "unknown-word":

1. `src/tools/get-flagged-words.ts` — file header comment
2. `src/tools/get-flagged-words.ts` — `getFlaggedWordsTool.description`
3. `src/tools/get-script-stats.ts` — `getScriptStatsTool.description`
4. `src/tools/breakdown.ts` — a code comment near the integrity-counting logic
5. `src/tools/context-data.ts` — the mirrored `get_flagged_words` entry
6. `src/tools/context-data.ts` — the mirrored `get_script_stats` entry
7. `TOOLS.md` — the `get_flagged_words` row
8. `TOOLS.md` — the `get_script_stats` row
9. `README.md` — the "Document integrity" feature bullet's "unknown-word (spellcheck squiggle)
   hit" clause

No test changes — this is a pure text/wording fix with no observable behavior change. Verified by
grepping for "unknown-word" after the change and confirming zero hits outside `CHANGELOG.md`.

## Item 16: cross-reference warning doesn't count cue paragraphs

`edit_smarttype_characters action=remove`'s warning (`crossRefCheck` in
`edit-smarttype-characters.ts`, backed by `countCharacterReferences` in `breakdown.ts`) already
names Cast rows, arc beats, and CharacterHighlighting entries still referencing a name being
removed — but not Character-cue paragraphs, the fifth and most numerous location a name lives.

**Fix:** `countCharacterReferences`'s return type gains two new fields, both counted over
top-level Character-type paragraphs only (matching every other paragraph-scanning tool's
established scope):

- `cueParagraphsExact` — paragraphs whose full text equals `name` exactly (respecting the existing
  `cs` case-sensitivity flag), matching the exact-attribute-comparison semantics `cast`/`arcBeats`/
  `highlighting` already use.
- `cueParagraphsSubstringOnly` — paragraphs where `name` appears as a substring of the paragraph's
  text but the paragraph doesn't qualify as an exact match (e.g. `"ETHNEN (V.O.)"` when removing
  `"ETHNEN"`) — still unmistakably a reference to the character, just not a bare cue.

`crossRefCheck`'s warning message reports the exact count always (when nonzero, alongside the
other three), and appends the substring-only count parenthetically only when it's nonzero:

> `Warning: 2 Cast member(s), 1 arc beat(s), 1 CharacterHighlighting entry(ies), and 25 cue
> paragraph(s) (plus 2 more containing the name as part of a longer cue, e.g. with an extension)
> still reference this name.`

When `cueParagraphsSubstringOnly` is `0`, the parenthetical clause is omitted entirely — no `(plus
0 more...)` noise.

The warning-suppression condition (`if (cast === 0 && arcBeats === 0 && highlighting === 0) return
""`) also gains the two new fields, so a removal whose *only* remaining reference is a cue
paragraph still triggers a warning instead of silently reporting nothing.

## Item 19: `edit_scene_properties` missing from `batch_edit`'s allowlist

`batch_edit`'s `ALLOWED_OPERATIONS` map lists every pure in-memory mutation tool except the one
shipped last phase, `edit_scene_properties`. It's exactly the shape of tool `batch_edit` exists
for (a color sweep across many scenes), and today it requires a manual `savepoint` in front of a
sequence of individual calls instead of one atomic batch.

**Fix:** one import and one map entry in `batch-edit.ts`:

```typescript
import { handleEditSceneProperties } from "./edit-scene-properties.ts";
```

```typescript
const ALLOWED_OPERATIONS: Record<string, OperationHandler> = {
  // ...existing entries...
  edit_scene_properties: handleEditSceneProperties,
};
```

No other logic in `batch-edit.ts` changes — the allowlist is a plain lookup map, and every other
piece of batch machinery (savepoint-before, rollback-on-failure, dispatch-by-name) already works
generically for any handler with the `OperationHandler` signature.

## Testing

- **Item 15:** no new tests; a post-change grep for "unknown-word" confirms it survives only in
  `CHANGELOG.md`.
- **Item 16:** new test cases for `countCharacterReferences` (or `crossRefCheck` directly, whichever
  the existing test file already targets): an exact-match-only cue, a substring-only cue (with an
  extension), both present together (counts don't double-count a paragraph in both fields), and a
  removal whose only remaining reference is a substring-only cue (still triggers a non-empty
  warning). A regression test confirms the existing cast/arcBeats/highlighting-only warning text is
  unchanged when there are zero cue references of either kind.
- **Item 19:** a `batch_edit` test running an `edit_scene_properties` operation as one step in a
  batch (confirms it dispatches and the scene's `Color` is set), and a second test where
  `edit_scene_properties` succeeds but a later operation in the same batch fails, confirming the
  whole batch — including the scene-properties change — rolls back, matching the existing
  regression pattern already used for other allowlisted tools in `batch-edit.test.ts`.

## Docs to sync

Item 15 *is* a doc-sync change by definition. Items 16 and 19 don't change any tool's input schema
or add/remove a tool, but per the project's standing rule their tool description strings (in
`edit-smarttype-characters.ts` for item 16 — the warning behavior is documented in the tool's own
description; `batch-edit.ts` for item 19 — its description names the allowlisted tools) are checked
and updated if they reference the changed behavior, alongside `CHANGELOG.md` and a `package.json`
version bump for the phase as a whole.
