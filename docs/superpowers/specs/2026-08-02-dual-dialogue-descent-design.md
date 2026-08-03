# Dual-Dialogue Descent and Addressability — Design Spec

Fixes the defect in `F:\Vault\mcp\fdx-mcp-server\rename-character-misses-dual-dialogue.md`, and
closes the "addressable nested paragraphs" half of wishlist item 17 in
`F:\Vault\mcp\fdx-mcp-server\wishlist.md`.

## Problem

`rename_character` renames Character-cue paragraphs via a run-preserving substring replace scoped
to `doc.getParagraphElements()` — top-level body paragraphs only. A Character cue living inside a
`<DualDialogue>` block is invisible to that scan. The tool still reports full success (empty
`skipped`, a count naming every location touched), producing a script with the name correctly
renamed everywhere except one cue that silently disagrees — exactly the half-renamed state
`rename_character` exists to prevent.

Worse, there is currently no way to repair it afterward: `get_par_runs` on that nested paragraph's
id returns `"paragraph id not found"` even though the paragraph genuinely exists in the file, and
`edit_par action=edit` has the identical blind spot. The only recovery path is hand-editing in
Final Draft, which this project's own rules forbid.

## Scope

Three call sites change. Nothing else does — `find_par`, `replace_text`, `get_flagged_words`,
`get_placeholders`, and every other paragraph-oriented tool keep their documented top-level-only
scope exactly as today; widening those is wishlist item 17's cheaper, separate "report what was
skipped" ask, not this fix.

1. `get_par_runs` — `id`, `ids`, and `sectionId` lookup modes all see nested paragraphs.
2. `edit_par` — `action=edit` reaches nested paragraphs by id. `action=create`'s anchor lookup and
   `action=remove`'s existence check are unchanged (still top-level only); removing a single nested
   paragraph, or anchoring a create against one, stays out of scope for this fix.
3. `rename_character` — Location 1 (Character-cue paragraphs) descends into `<DualDialogue>`
   blocks. The other four locations (SmartType Characters, Cast, arc beats, CharacterHighlighting)
   are untouched by this change; none of them involve nested `Paragraph` elements.

## Shared helper

One new pure function in `src/fdx/paragraph.ts`:

```typescript
/**
 * Expands each paragraph in `paragraphs` that wraps a <DualDialogue> into itself followed by its
 * nested Paragraph children, in order. Paragraphs without a DualDialogue pass through unchanged.
 * Final Draft's format never nests a DualDialogue inside another, so this only descends one level.
 */
export function expandDualDialogue(paragraphs: XmlElement[]): XmlElement[]
```

It operates on an arbitrary array, not a `FdxDocument` method, so it works identically on the full
top-level paragraph list or a section slice — one implementation serves all three fix points below.

## Fix point 1: `get_par_runs`

- `id`/`ids` modes: look up against `expandDualDialogue(doc.getParagraphElements())` instead of the
  bare top-level list.
- `sectionId` mode: section start/end are still found against the *unexpanded* top-level list
  (section boundaries are always top-level — a section heading can never itself be a nested
  paragraph), then the resulting slice is passed through `expandDualDialogue` before mapping to
  response bodies. A scene-wide styled-run audit (`get_par_runs sectionId=...`) now surfaces runs
  living inside a `DualDialogue` in that scene, closing the same blind spot for the bulk case that
  the id case had.

No response shape changes — a nested paragraph's body is `{id, type, runs}`, identical in shape to
a top-level one.

## Fix point 2: `edit_par action=edit`

The `edit` branch's paragraph lookup becomes `expandDualDialogue(doc.getParagraphElements())`.
Since a nested paragraph is a real `XmlElement` living inside the tree (a child of `<DualDialogue>`,
itself a child of the wrapper `Paragraph`, itself a child of `<Content>`), mutating it in place via
the existing `setParagraphType`/`setParagraphAlignment`/`setParagraphTextRuns` calls works with no
special-cased write path — the object reference found by the expanded lookup *is* the node in the
tree.

`action=create`'s `beforeParId`/`afterParId` anchor resolution and `action=remove`'s existence
check both keep using the plain (unexpanded) `doc.getParagraphElements()`. This is deliberate: the
wrapper-removal guard (`action=remove` on a `DualDialogue`-holding paragraph redirects the caller to
`edit_dual_dialogue`) is untouched, and removing or anchoring against a single nested paragraph is
a structural question (does the wrapper collapse if it empties out? where does a new sibling go?)
with no requester behind it right now — left for a future ask if one ever surfaces.

## Fix point 3: `rename_character` descent

`runPreservingReplace` (`src/tools/replace-text.ts`, shared with `replace_text`) gains one new
optional field on its options:

```typescript
includeNested?: boolean; // default false
```

When set, the function's paragraph list becomes `expandDualDialogue(doc.getParagraphElements())`
instead of the bare list; everything downstream (`parType` filtering, per-run replace, `skipped`
accounting) is unmodified code operating on ordinary `Paragraph` elements, since a nested cue is
structurally identical to a top-level one. Default `false` means `replace_text`'s own call site is
byte-for-byte unchanged — this is purely an opt-in for `rename_character`.

`rename_character`'s Location 1 call passes `includeNested: true`. Nested-cue hits land in the same
`cueParagraphs.paragraphsTouched` / `.occurrencesReplaced` / `.skipped` fields already returned —
no new response field. This matches the handoff's framing directly: "a rename that claims five
locations should reach all of them" — a nested cue is just a cue, and the caller shouldn't need to
know or care where it physically lives in the XML.

## Testing

Every new test fixture needs a `<DualDialogue>` wrapper built the same way
`edit-dual-dialogue.test.ts` already constructs one: a `Paragraph Type="General"` holding a
`<DualDialogue>` with two or more nested `Paragraph` elements (typically a `Character`/`Dialogue`
pair per side).

- `expandDualDialogue`: a paragraph list with a wrapper in the middle expands to
  `[..., wrapper, nested1, nested2, ...]`; a list with no wrapper passes through unchanged; a
  wrapper with an empty `<DualDialogue>` (no nested paragraphs) contributes just itself.
- `get_par_runs`: `id` of a nested paragraph returns its runs (not `paragraph id not found`);
  `ids` mixing one top-level and one nested id returns both, in the given order; `sectionId`
  spanning a scene that contains a `DualDialogue` includes the nested paragraphs' bodies.
- `edit_par action=edit` on a nested paragraph's id changes its text/type, and reloading the
  document (or reading via `get_par_runs`) confirms the change persisted in the tree — not just in
  a copy. `action=create` with `beforeParId`/`afterParId` pointing at a nested id still fails the
  same way it does today (anchor not found among top-level paragraphs) — a regression guard that
  this fix didn't accidentally widen create's scope. `action=remove` on a nested paragraph's id
  still fails with `paragraph not found` for the same reason.
- `rename_character`: a name appearing both in a top-level cue and inside a `DualDialogue`'s nested
  Character cue — after rename, `find_par`-equivalent inspection of the raw paragraph list (not
  `find_par` itself, which stays top-level-only) confirms both are renamed, and the response's
  `cueParagraphs.paragraphsTouched` count includes the nested hit. A repeat of the original
  handoff's repro shape: `rename_character` renames a name that exists in exactly one nested cue
  and nowhere at the top level — before this fix that would report `"not found"` for cue
  paragraphs despite the name existing in the file; after, it's found and renamed.

## Docs to sync

`get_par_runs` and `edit_par`'s tool descriptions (in their own files and mirrored in
`src/tools/context-data.ts`) get a clause noting they now reach paragraphs nested inside
`DualDialogue` blocks (edit_par: edit only). `rename_character`'s description gets a clause that
Location 1 now covers nested Character cues too. Per the project's standing rule, `README.md`,
`CHANGELOG.md`, and `TOOLS.md` are checked/updated alongside the schema-adjacent description
changes, even though no input schema itself changes (all three tools gain capability, not new
parameters).
