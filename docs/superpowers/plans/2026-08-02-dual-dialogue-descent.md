# Dual-Dialogue Descent and Addressability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the defect where `rename_character` silently leaves Character cues inside
`<DualDialogue>` blocks unrenamed while reporting full success, and give `get_par_runs`/
`edit_par action=edit` a way to read and repair those nested paragraphs, which today are
completely unaddressable ("paragraph id not found" even though the paragraph exists in the file).

**Architecture:** One new pure helper, `expandDualDialogue`, in `src/fdx/paragraph.ts` — it takes
a paragraph array and expands any `<DualDialogue>`-wrapping paragraph into itself followed by its
nested `Paragraph` children. Three call sites opt into it (`get_par_runs`, `edit_par action=edit`,
and `rename_character`'s cue-paragraph rename via a new `includeNested` flag on the shared
`runPreservingReplace`). Nothing else changes — every other paragraph-oriented tool
(`find_par`, `replace_text`, `get_flagged_words`, `get_placeholders`, etc.) keeps its documented
top-level-only scope.

**Tech Stack:** TypeScript, Bun test runner, existing `FdxDocument`/XML helpers — no new
dependencies.

## Global Constraints

- `expandDualDialogue` descends exactly one level — Final Draft's format never nests a
  `DualDialogue` inside another.
- `get_par_runs`: all three lookup modes (`id`, `ids`, `sectionId`) see nested paragraphs.
  `sectionId`'s section start/end are still located against the *unexpanded* top-level list
  (section headings are always top-level); only the resulting slice is expanded.
- `edit_par`: only `action=edit` reaches nested paragraphs. `action=create`'s
  `beforeParId`/`afterParId` anchor lookup and `action=remove`'s existence check stay on the
  unexpanded top-level list — this is deliberate, not an oversight, and must not change.
- `rename_character`: nested-cue renames fold into the existing `cueParagraphs.paragraphsTouched` /
  `.occurrencesReplaced` / `.skipped` fields — no new response field.
- `runPreservingReplace`'s new `includeNested` option defaults to `false`, so `replace_text`'s
  existing call site and behavior are byte-for-byte unchanged.

---

### Task 1: `expandDualDialogue` helper

**Files:**
- Modify: `src/fdx/paragraph.ts`
- Test: `src/fdx/paragraph.test.ts`

**Interfaces:**
- Produces: `export function expandDualDialogue(paragraphs: XmlElement[]): XmlElement[]` — consumed
  by Tasks 2, 3, and 4.

- [ ] **Step 1: Write the failing tests**

Add to `src/fdx/paragraph.test.ts`, after the existing `spliceParagraphText` tests (new `describe`
block, same file):

```typescript
import { expandDualDialogue } from "./paragraph.ts";

describe("expandDualDialogue", () => {
  test("expands a wrapper into itself followed by its nested paragraphs", () => {
    const doc = docWithParagraph(`
      <Paragraph Type="Action" id="a1"><Text>Before.</Text></Paragraph>
      <Paragraph Type="General" id="wrap1">
        <DualDialogue>
          <Paragraph Type="Character" id="c1"><Text>ALICE</Text></Paragraph>
          <Paragraph Type="Dialogue" id="d1"><Text>Hi.</Text></Paragraph>
        </DualDialogue>
      </Paragraph>
      <Paragraph Type="Action" id="a2"><Text>After.</Text></Paragraph>
    `);
    const top = doc.getParagraphElements();
    const expanded = expandDualDialogue(top);
    expect(expanded.map((p) => p.attrs.find(([k]) => k === "id")?.[1])).toEqual([
      "a1",
      "wrap1",
      "c1",
      "d1",
      "a2",
    ]);
  });

  test("a paragraph list with no wrapper passes through unchanged", () => {
    const doc = docWithParagraph(`
      <Paragraph Type="Action" id="a1"><Text>Only.</Text></Paragraph>
    `);
    const top = doc.getParagraphElements();
    expect(expandDualDialogue(top)).toEqual(top);
  });

  test("a wrapper with no nested paragraphs contributes just itself", () => {
    const doc = docWithParagraph(`
      <Paragraph Type="General" id="wrap1"><DualDialogue/></Paragraph>
    `);
    const top = doc.getParagraphElements();
    const expanded = expandDualDialogue(top);
    expect(expanded).toHaveLength(1);
    expect(expanded[0]!.attrs.find(([k]) => k === "id")?.[1]).toBe("wrap1");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/fdx/paragraph.test.ts`
Expected: FAIL — `expandDualDialogue` is not exported from `./paragraph.ts` (module resolution or
type error).

- [ ] **Step 3: Implement the helper**

In `src/fdx/paragraph.ts`, update the import line to add `findChild`:

```typescript
import { type XmlElement, type XmlNode, createElement, findChild, findChildren, getAttr, setAttr, setTextContent, textContent } from "./xml.ts";
```

Add the function after `getParagraphRuns` (or any other top-level function — placement within the
file doesn't matter, just keep it near the other paragraph-array helpers):

```typescript
/**
 * Expands each paragraph in `paragraphs` that wraps a <DualDialogue> into itself followed by its
 * nested Paragraph children, in order. Paragraphs without a DualDialogue pass through unchanged.
 * Final Draft's format never nests a DualDialogue inside another, so this only descends one level.
 */
export function expandDualDialogue(paragraphs: XmlElement[]): XmlElement[] {
  const result: XmlElement[] = [];
  for (const p of paragraphs) {
    result.push(p);
    const dd = findChild(p, "DualDialogue");
    if (dd) result.push(...findChildren(dd, "Paragraph"));
  }
  return result;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/fdx/paragraph.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/fdx/paragraph.ts src/fdx/paragraph.test.ts
git commit -m "Add expandDualDialogue helper for addressing nested paragraphs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `get_par_runs` reaches nested paragraphs (id, ids, sectionId)

**Files:**
- Modify: `src/tools/get-par-runs.ts`
- Test: `src/tools/get-par-runs.test.ts`

**Interfaces:**
- Consumes: `expandDualDialogue` from Task 1; `handleEditDualDialogue` from
  `./edit-dual-dialogue.ts` (test-only, to build a real `<DualDialogue>` fixture).

- [ ] **Step 1: Write the failing tests**

`src/tools/get-par-runs.test.ts` already has a `freshDoc(key)` helper (loads
`examples/Grog The Caveman.fdx` into `documentCache` under a unique path, returns
`{path, doc}`) and imports `handleEditPar`. Add this import alongside the existing ones:

```typescript
import { handleEditDualDialogue } from "./edit-dual-dialogue.ts";
```

The fixture's known ids (already used the same way in `edit-dual-dialogue.test.ts`):
`"a3049b85-f812-4aaa-9532-9f53f774f758"` (Character "GROG"),
`"bbee1c41-6ca4-4ae2-bb0e-4c2769f23a16"` (Parenthetical "(shouting)"),
`"b5437965-e39f-4236-a0c0-641860dcfb96"` (Dialogue "Ook, move!").

Add to `describe("get_par_runs", ...)`:

```typescript
describe("get_par_runs with nested DualDialogue paragraphs", () => {
  const CHARACTER_ID = "a3049b85-f812-4aaa-9532-9f53f774f758";
  const PARENTHETICAL_ID = "bbee1c41-6ca4-4ae2-bb0e-4c2769f23a16";
  const DIALOGUE_ID = "b5437965-e39f-4236-a0c0-641860dcfb96";

  async function withDualDialogue(key: string) {
    const { path } = freshDoc(key);
    await handleEditDualDialogue({
      path,
      action: "create",
      ids: [CHARACTER_ID, PARENTHETICAL_ID, DIALOGUE_ID],
    });
    return path;
  }

  test("id resolves a nested paragraph instead of failing", async () => {
    const path = await withDualDialogue("nested-id");
    const result = await handleGetParRuns({ path, id: CHARACTER_ID });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0]!.text);
    expect(body.id).toBe(CHARACTER_ID);
    expect(body.type).toBe("Character");
  });

  test("ids mixing a top-level and a nested id returns both, in order", async () => {
    const path = await withDualDialogue("nested-ids");
    const doc = documentCache.get(path)!;
    const topLevelId = getParagraphId(doc.getParagraphElements()[0]!);
    const result = await handleGetParRuns({ path, ids: [topLevelId, DIALOGUE_ID] });
    expect(result.isError).toBeFalsy();
    const bodies = JSON.parse(result.content[0]!.text);
    expect(bodies.map((b: { id: string }) => b.id)).toEqual([topLevelId, DIALOGUE_ID]);
  });

  test("sectionId spanning a DualDialogue includes its nested paragraphs", async () => {
    const path = await withDualDialogue("nested-section");
    const doc = documentCache.get(path)!;
    // The first Scene Heading is the section containing the moved paragraphs.
    const sceneHeading = doc.getParagraphElements().find((p) => getParagraphType(p) === "Scene Heading");
    const sectionId = getParagraphId(sceneHeading!);
    const result = await handleGetParRuns({ path, sectionId });
    expect(result.isError).toBeFalsy();
    const bodies = JSON.parse(result.content[0]!.text) as Array<{ id: string }>;
    const ids = bodies.map((b) => b.id);
    expect(ids).toContain(CHARACTER_ID);
    expect(ids).toContain(PARENTHETICAL_ID);
    expect(ids).toContain(DIALOGUE_ID);
  });
});
```

`src/tools/get-par-runs.test.ts` currently imports only `getParagraphId` from
`../fdx/paragraph.ts`. Change that import line to also bring in `getParagraphType`:

```typescript
import { getParagraphId, getParagraphType } from "../fdx/paragraph.ts";
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/get-par-runs.test.ts`
Expected: FAIL — `id` and `ids` cases return `"paragraph id not found: ..."` errors; `sectionId`
case's returned ids don't contain `CHARACTER_ID`/`PARENTHETICAL_ID`/`DIALOGUE_ID`.

- [ ] **Step 3: Implement the fix**

In `src/tools/get-par-runs.ts`, add the import:

```typescript
import { expandDualDialogue } from "../fdx/paragraph.ts";
```

Change the body of `handleGetParRuns` from:

```typescript
  const paragraphs = doc.getParagraphElements();

  if (id !== undefined) {
    const para = paragraphs.find((p) => getParagraphId(p) === id);
    if (!para) return errResult(`paragraph id not found: ${id}`);
    return pushCacheWarning(textResult(JSON.stringify(toBody(para), null, 2)), warning);
  }

  if (ids !== undefined) {
    const bodies: ParRunsBody[] = [];
    for (const wantId of ids) {
      const para = paragraphs.find((p) => getParagraphId(p) === wantId);
      if (!para) return errResult(`paragraph id not found: ${wantId}`);
      bodies.push(toBody(para));
    }
    return pushCacheWarning(textResult(JSON.stringify(bodies)), warning);
  }

  const idx = findSectionIndex(paragraphs, sectionId!);
  if (idx === -1) return errResult(`section id not found: ${sectionId}`);
  const end = findSectionEnd(paragraphs, idx);
  const bodies = paragraphs.slice(idx, end).map(toBody);
  return pushCacheWarning(textResult(JSON.stringify(bodies)), warning);
```

to:

```typescript
  const paragraphs = doc.getParagraphElements();

  if (id !== undefined) {
    const addressable = expandDualDialogue(paragraphs);
    const para = addressable.find((p) => getParagraphId(p) === id);
    if (!para) return errResult(`paragraph id not found: ${id}`);
    return pushCacheWarning(textResult(JSON.stringify(toBody(para), null, 2)), warning);
  }

  if (ids !== undefined) {
    const addressable = expandDualDialogue(paragraphs);
    const bodies: ParRunsBody[] = [];
    for (const wantId of ids) {
      const para = addressable.find((p) => getParagraphId(p) === wantId);
      if (!para) return errResult(`paragraph id not found: ${wantId}`);
      bodies.push(toBody(para));
    }
    return pushCacheWarning(textResult(JSON.stringify(bodies)), warning);
  }

  const idx = findSectionIndex(paragraphs, sectionId!);
  if (idx === -1) return errResult(`section id not found: ${sectionId}`);
  const end = findSectionEnd(paragraphs, idx);
  const bodies = expandDualDialogue(paragraphs.slice(idx, end)).map(toBody);
  return pushCacheWarning(textResult(JSON.stringify(bodies)), warning);
```

Note `findSectionIndex`/`findSectionEnd` still run against the unexpanded `paragraphs` (section
boundaries are always top-level) — only the final slice passed to `.map(toBody)` is expanded.

Also update the tool's `description` string to mention this:

```typescript
  description:
    "Read-Only. Retrieve one or more paragraphs' <Text> runs, with each run's full attribute set (AdornmentStyle, Font, Color, Size, RevisionID, etc.) preserved — unlike get_par, which returns flattened plain text and discards run boundaries and attributes. Use this before edit_par when a paragraph may contain styled runs, so the attrs can be passed back unchanged. Pass exactly one of: id (single paragraph, returns one object), ids (array, returns an array in the given order — a missing id fails the whole call), or sectionId (every paragraph in that section, heading included, returns an array in document order) — useful for a pre-sweep audit of where styled runs are before running replace_text or edit_par across a scene. All three modes also reach paragraphs nested inside a <DualDialogue> block.",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/get-par-runs.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/tools/get-par-runs.ts src/tools/get-par-runs.test.ts
git commit -m "get_par_runs: reach paragraphs nested inside DualDialogue

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `edit_par action=edit` reaches nested paragraphs

**Files:**
- Modify: `src/tools/edit-par.ts`
- Test: `src/tools/edit-par.test.ts`

**Interfaces:**
- Consumes: `expandDualDialogue` from Task 1; `handleEditDualDialogue` from
  `./edit-dual-dialogue.ts` (test-only).

- [ ] **Step 1: Write the failing tests**

`src/tools/edit-par.test.ts` has the same `freshDoc(key)` pattern as `get-par-runs.test.ts`. Add
the import:

```typescript
import { handleEditDualDialogue } from "./edit-dual-dialogue.ts";
```

Add to `describe("edit_par", ...)`:

```typescript
describe("edit_par with nested DualDialogue paragraphs", () => {
  const CHARACTER_ID = "a3049b85-f812-4aaa-9532-9f53f774f758";
  const PARENTHETICAL_ID = "bbee1c41-6ca4-4ae2-bb0e-4c2769f23a16";
  const DIALOGUE_ID = "b5437965-e39f-4236-a0c0-641860dcfb96";

  async function withDualDialogue(key: string) {
    const { path } = freshDoc(key);
    await handleEditDualDialogue({
      path,
      action: "create",
      ids: [CHARACTER_ID, PARENTHETICAL_ID, DIALOGUE_ID],
    });
    return path;
  }

  test("action=edit changes a nested paragraph's text, persisted in the tree", async () => {
    const path = await withDualDialogue("nested-edit");
    const result = await handleEditPar({
      path,
      action: "edit",
      id: DIALOGUE_ID,
      textRuns: [{ content: "Move it now!" }],
    });
    expect(result.isError).toBeFalsy();

    const doc = documentCache.get(path)!;
    const dd = doc.getParagraphElements().find((p) => getParagraphId(p) !== DIALOGUE_ID && p.children.some((c) => c.type === "element" && c.name === "DualDialogue"));
    expect(dd).toBeDefined();
    const nested = (dd!.children.find((c) => c.type === "element" && c.name === "DualDialogue") as { children: unknown[] })
      .children as Array<{ attrs: Array<[string, string]> }>;
    const nestedDialogue = nested.find((p) => p.attrs.some(([k, v]) => k === "id" && v === DIALOGUE_ID));
    expect(nestedDialogue).toBeDefined();
  });

  test("action=create with beforeParId pointing at a nested id still fails (anchor lookup stays top-level-only)", async () => {
    const path = await withDualDialogue("nested-create-anchor");
    const result = await handleEditPar({
      path,
      action: "create",
      type: "Action",
      beforeParId: DIALOGUE_ID,
      textRuns: [{ content: "New action line." }],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("anchor paragraph not found");
  });

  test("action=remove on a nested id still fails (removal stays top-level-only)", async () => {
    const path = await withDualDialogue("nested-remove");
    const result = await handleEditPar({ path, action: "remove", id: DIALOGUE_ID });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("paragraph not found");
  });
});
```

The first test reaches into the tree manually (rather than calling `get_par_runs`, to keep this
task's tests independent of Task 2's changes landing first or not) — it locates the wrapper
paragraph, then its `<DualDialogue>`'s nested children, and confirms the dialogue paragraph's text
was actually changed in place.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/edit-par.test.ts`
Expected: FAIL — the first test fails because `action=edit` on `DIALOGUE_ID` returns
`"paragraph not found"` (not found among top-level paragraphs), so the edit never happens. The
second and third tests should already pass against current behavior (they're regression guards) —
confirm they pass even before the fix, so Step 4 doesn't accidentally break them.

- [ ] **Step 3: Implement the fix**

In `src/tools/edit-par.ts`, add the import:

```typescript
import { expandDualDialogue } from "../fdx/paragraph.ts";
```

Change only the `action === "edit"` branch, from:

```typescript
  if (action === "edit") {
    if (!id) return errResult("failed to edit paragraph: id is required");
    const matches = paragraphs.filter((p) => getParagraphId(p) === id);
    if (matches.length === 0) return errResult("failed to edit paragraph: paragraph not found");
```

to:

```typescript
  if (action === "edit") {
    if (!id) return errResult("failed to edit paragraph: id is required");
    const addressable = expandDualDialogue(paragraphs);
    const matches = addressable.filter((p) => getParagraphId(p) === id);
    if (matches.length === 0) return errResult("failed to edit paragraph: paragraph not found");
```

The rest of the `edit` branch (`dupWarning`, `setParagraphType`, `setParagraphAlignment`,
`setParagraphTextRuns`, etc.) is unchanged — it already just operates on `para`, the found
`XmlElement`, regardless of where it lives in the tree.

The `action === "create"` and `action === "remove"` branches are **not** touched — they keep using
`paragraphs` (the plain top-level list from `doc.getParagraphElements()` earlier in the function),
which is exactly what the two new regression-guard tests confirm stays true.

Also update the tool's `description` string — find the existing description and append one clause
about `action=edit`:

```typescript
  description:
    "Create a new paragraph, edit an existing one, or remove one in a loaded screenplay. For create, use beforeParId or afterParId (each a paragraph id) to control insertion position (falls back to append). Returns {id, type, message} as JSON on success, so the new paragraph is immediately addressable without a follow-up lookup. For edit, provide id (the paragraph id) and the fields to update — this also reaches a paragraph nested inside a <DualDialogue> block. For remove, provide id and the paragraph is deleted; the response reports its type so a caller can confirm what was removed. remove refuses a dual-dialogue wrapper paragraph (one holding a <DualDialogue> block) rather than silently deleting every paragraph nested inside it — use edit_dual_dialogue action=remove instead (extract=true keeps the nested paragraphs, extract=false discards them along with the wrapper); remove and create's beforeParId/afterParId anchoring do not reach paragraphs nested inside a DualDialogue. After editing, call save_fdx to persist changes to disk.",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/edit-par.test.ts`
Expected: PASS, all three new tests.

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/tools/edit-par.ts src/tools/edit-par.test.ts
git commit -m "edit_par: action=edit reaches paragraphs nested inside DualDialogue

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `rename_character` descends into `DualDialogue` for cue renaming

**Files:**
- Modify: `src/tools/replace-text.ts`
- Modify: `src/tools/rename-character.ts`
- Test: `src/tools/rename-character.test.ts`

**Interfaces:**
- Consumes: `expandDualDialogue` from Task 1.
- Produces: `RunPreservingReplaceOptions.includeNested?: boolean` — a new optional field other
  callers (there are none besides `replace_text` and `rename_character` today) may use in the
  future.

- [ ] **Step 1: Write the failing test**

`src/tools/rename-character.test.ts` builds its own hand-crafted `.fdx` via the `fixture({content, ...})` helper already in the file — no need for `handleEditDualDialogue` here, since this file's
established pattern is raw XML content strings (see `CUE_CONTENT`). Add a new content constant and
test after the existing `"renames Character-cue paragraphs..."` test:

```typescript
const NESTED_CUE_CONTENT = `
  <Paragraph Type="Action" id="a1"><Text>Setup.</Text></Paragraph>
  <Paragraph Type="General" id="wrap1">
    <DualDialogue>
      <Paragraph Type="Character" id="c1"><Text>OLD NAME</Text></Paragraph>
      <Paragraph Type="Dialogue" id="d1"><Text>Line one.</Text></Paragraph>
      <Paragraph Type="Character" id="c2"><Text>OTHER PERSON</Text></Paragraph>
      <Paragraph Type="Dialogue" id="d2"><Text>Line two.</Text></Paragraph>
    </DualDialogue>
  </Paragraph>
`;
```

```typescript
  test("renames a Character cue nested inside a DualDialogue block", async () => {
    const path = fixture({ content: NESTED_CUE_CONTENT });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    const b = body(result) as { cueParagraphs: { paragraphsTouched: number; occurrencesReplaced: number } };
    expect(b.cueParagraphs.paragraphsTouched).toBe(1);
    expect(b.cueParagraphs.occurrencesReplaced).toBe(1);

    const doc = documentCache.get(path)!;
    const wrapper = doc.getParagraphElements().find((p) => p.children.some((c) => c.type === "element" && c.name === "DualDialogue"))!;
    const dd = wrapper.children.find((c) => c.type === "element" && c.name === "DualDialogue") as { children: Array<{ attrs: Array<[string, string]>; children: Array<{ type: string; value?: string }> }> };
    const nestedCharacterPara = dd.children.find((p) => p.attrs.some(([k, v]) => k === "id" && v === "c1"))!;
    const textEl = nestedCharacterPara.children.find((c) => c.type === "element") as { children: Array<{ value?: string }> };
    expect(textEl.children[0]!.value).toBe("NEW NAME");
  });

  test("a name that exists only inside a DualDialogue is found and renamed (the original handoff repro)", async () => {
    const path = fixture({ content: NESTED_CUE_CONTENT });
    const result = await rename(path, "OTHER PERSON", "SOMEONE NEW");
    expect(result.isError).toBeFalsy();
    const b = body(result) as { cueParagraphs: { paragraphsTouched: number } };
    expect(b.cueParagraphs.paragraphsTouched).toBe(1);
  });
```

The second test is the direct regression guard for the handoff: before this fix, a name that
exists *only* inside a `DualDialogue` and nowhere at the top level would report `cueParagraphs`
as untouched (0 paragraphs) despite the name being right there in the file.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/rename-character.test.ts`
Expected: FAIL — both new tests see `cueParagraphs.paragraphsTouched` as `0`, and the nested
Character paragraph's text is still `"OLD NAME"` in the raw tree.

- [ ] **Step 3: Add `includeNested` to `runPreservingReplace`**

In `src/tools/replace-text.ts`, add the import:

```typescript
import { getParagraphId, getParagraphType, paragraphText, expandDualDialogue } from "../fdx/paragraph.ts";
```

Add the new field to `RunPreservingReplaceOptions`:

```typescript
export interface RunPreservingReplaceOptions {
  find: string;
  replace: string;
  caseSensitive: boolean;
  parType?: string;
  startIndex?: number;
  endIndex?: number;
  preview?: boolean;
  includeNested?: boolean;
}
```

Change the start of `runPreservingReplace` from:

```typescript
export function runPreservingReplace(doc: FdxDocument, opts: RunPreservingReplaceOptions): RunPreservingReplaceResult {
  const { find, replace, caseSensitive, parType, preview } = opts;
  const paragraphs = doc.getParagraphElements();
  const startIndex = opts.startIndex ?? 0;
```

to:

```typescript
export function runPreservingReplace(doc: FdxDocument, opts: RunPreservingReplaceOptions): RunPreservingReplaceResult {
  const { find, replace, caseSensitive, parType, preview, includeNested } = opts;
  const paragraphs = includeNested ? expandDualDialogue(doc.getParagraphElements()) : doc.getParagraphElements();
  const startIndex = opts.startIndex ?? 0;
```

Nothing else in the function changes — `replace_text`'s call site never sets `includeNested`, so
`opts.includeNested` is `undefined`, `includeNested ? ... : ...` takes the `false` branch, and
`paragraphs` is exactly `doc.getParagraphElements()` as before.

- [ ] **Step 4: Pass `includeNested: true` from `rename_character`**

In `src/tools/rename-character.ts`, change:

```typescript
  const replaceResult = runPreservingReplace(doc, { find: from, replace: to, caseSensitive: cs, parType: "Character" });
```

to:

```typescript
  const replaceResult = runPreservingReplace(doc, {
    find: from,
    replace: to,
    caseSensitive: cs,
    parType: "Character",
    includeNested: true,
  });
```

Also update the tool's `description` string — the current text says cue paragraphs are renamed via
"run-preserving substring replace, like replace_text"; append a clause:

```typescript
  description:
    "Rename (or merge) a character across every place its name is stored: Character-cue paragraphs (run-preserving substring replace, like replace_text, including cues nested inside a DualDialogue block), the SmartType Characters dictionary, Cast Member rows, CharacterArcBeat entries in every scene's SceneProperties, and CharacterHighlighting. A merge (to already exists somewhere) drops from's entry there rather than creating a duplicate — except a scene where both from and to already have separate arc beats, which is left untouched (with a warning) since arc beats carry authored notes that a drop would destroy. Errors if from isn't found in any of the five locations. Returns a JSON report of what was touched in each location, plus any warnings. Never touches <Actors>. After editing, call save_fdx to persist changes to disk.",
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/tools/rename-character.test.ts`
Expected: PASS, both new tests.

- [ ] **Step 6: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions — in particular, `replace-text.test.ts` should show zero behavior
change, since `includeNested` defaults to `false` there.

```bash
git add src/tools/replace-text.ts src/tools/rename-character.ts src/tools/rename-character.test.ts
git commit -m "rename_character: descend into DualDialogue for cue renaming

Fixes the defect in rename-character-misses-dual-dialogue.md: a
Character cue nested inside a DualDialogue block was invisible to
the cue-paragraph rename, while the tool still reported full
success. Adds includeNested to the shared runPreservingReplace
(defaulting to false, so replace_text is unaffected) and sets it
for rename_character's Location 1 call.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Documentation sync

**Files:**
- Modify: `src/tools/context-data.ts`
- Modify: `TOOLS.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: the three updated tool descriptions from Tasks 2, 3, and 4 (verbatim strings, already
  written in those tasks).

- [ ] **Step 1: Update `src/tools/context-data.ts`**

Find and update the three mirrored catalog entries (`get_par_runs`, `edit_par`,
`rename_character`) so their `description` fields match the tool files' own descriptions exactly,
character for character, as written in Tasks 2 (Step 3), 3 (Step 3), and 4 (Step 4).

- [ ] **Step 2: Run the full suite**

Run: `bun test`
Expected: PASS, no regressions.

- [ ] **Step 3: Update `TOOLS.md`**

Update the `get_par_runs`, `edit_par`, and `rename_character` rows' Description columns to match
the new tool descriptions. No Parameters-column changes — no input schema changed in this plan, so
the tool-count header line stays the same.

- [ ] **Step 4: Bump `package.json` and add a `CHANGELOG.md` entry**

Check `package.json`'s current `"version"` first (this plan doesn't know what phase came before
it) and bump the patch number by one. Add a new entry at the top of `CHANGELOG.md`, above the
previous most-recent entry, using that same new version number and today's date:

```markdown
### Fixed

- **`rename_character`** no longer silently skips Character cues nested inside a `<DualDialogue>` block — it now descends into them for the cue-paragraph rename, and a nested-only match is found and renamed instead of reporting "not found". Previously this produced a script half-renamed with no warning.

### Changed

- **`get_par_runs`** (`id`, `ids`, and `sectionId` modes) and **`edit_par`** (`action=edit` only) can now read/edit paragraphs nested inside a `<DualDialogue>` block by id — previously these returned `"paragraph id not found"` even though the paragraph existed in the file, leaving no way to repair a dual-dialogue-related mistake without hand-editing the XML.
```

- [ ] **Step 5: Check `README.md`**

Search `README.md` for any existing mention of `rename_character`, `get_par_runs`, `edit_par`, or
dual dialogue (the "Dual dialogue support" and "Character tracking" bullets under `## Features`).
If either bullet's wording would now be inaccurate or incomplete given this fix, update it; if not
(the existing wording is general enough — e.g. "rename or merge a character across every place its
name is stored" already implies completeness), leave it as-is. Do not add a new bullet purely to
restate what the CHANGELOG already covers.

- [ ] **Step 6: Run the full suite again and commit**

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/tools/context-data.ts TOOLS.md CHANGELOG.md package.json README.md
git commit -m "Sync docs for dual-dialogue descent and addressability fix

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## After the plan: wishlist, handoff, and push

Once all five tasks are committed:

1. In `F:\Vault\mcp\fdx-mcp-server\wishlist.md`, mark item 17 as handled for its "addressable
   nested paragraphs" half — the item's remaining ask (reporting skip counts for
   `get_flagged_words`/`get_placeholders`) is explicitly **not** covered by this plan and should
   stay open, so do not mark the whole item DONE. Add a short note under item 17 pointing at the
   version this landed in, and referencing that the `rename_character` handoff is resolved.
2. Move `F:\Vault\mcp\fdx-mcp-server\rename-character-misses-dual-dialogue.md` into
   `F:\Vault\mcp\fdx-mcp-server\done\`, per this project's standing rule that a resolved handoff
   moves to `done/` once implemented.
3. Push this phase's commits to `origin/master` — no tag, no publish unless separately requested,
   matching the established pattern for every prior phase.
