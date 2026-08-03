# Nested-Paragraph Skip Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `find_par`, `replace_text`, `get_flagged_words`, `get_placeholders`, and
`get_character_appearances` each report how many paragraphs nested inside a `<DualDialogue>` block
were out of scope for that call, so the blind spot is visible in the output instead of only in
documentation.

**Architecture:** Two tiny pure helpers — `countNestedParagraphs` (in `src/fdx/paragraph.ts`, built
on the existing `expandDualDialogue`) and `skippedNestedWarning` (in `src/tools/shared.ts`, built
on the existing `pushWarning`) — wired into five call sites. No tool gains or loses a parameter; no
JSON response shape changes. A document (or scope) with no `DualDialogue` produces byte-for-byte
identical output to today, since `pushWarning` no-ops on an empty string.

**Tech Stack:** TypeScript, Bun test runner, existing `FdxDocument`/XML helpers — no new
dependencies.

## Global Constraints

- The count reflects each call's actual queried scope (a scoped scene via `id`, where that
  parameter exists), not always the whole document.
- The warning message, exactly: `` `${count} paragraph(s) nested inside a DualDialogue block were
  not scanned by this call.` `` — only added when `count > 0`.
- No tool's input schema or JSON response shape changes. The warning is an additional prepended
  text block, same mechanism as existing cache warnings.
- None of the five tools gain the ability to actually read/match nested paragraphs — this plan is
  reporting only. Descending remains explicitly out of scope (a separate, larger future change).

---

### Task 1: Shared helpers

**Files:**
- Modify: `src/fdx/paragraph.ts`
- Modify: `src/tools/shared.ts`
- Test: `src/fdx/paragraph.test.ts`
- Test: `src/tools/shared.test.ts` (create — check first whether it already exists)

**Interfaces:**
- Produces: `export function countNestedParagraphs(paragraphs: XmlElement[]): number` — consumed by
  all five tool tasks below.
- Produces: `export function skippedNestedWarning(count: number): string` — consumed by all five
  tool tasks below.

- [ ] **Step 1: Write the failing test for `countNestedParagraphs`**

Add to `src/fdx/paragraph.test.ts`, in the existing `describe("expandDualDialogue", ...)` block's
file (as a new sibling `describe`, after that block's closing `});`):

```typescript
import { expandDualDialogue, countNestedParagraphs } from "./paragraph.ts";
```

(Add `countNestedParagraphs` to the existing `expandDualDialogue` import line at the top of the
file — don't add a second import statement.)

```typescript
describe("countNestedParagraphs", () => {
  test("counts nested paragraphs inside a wrapper", () => {
    const doc = docWithParagraph(`
      <Paragraph Type="Action" id="a1"><Text>Before.</Text></Paragraph>
      <Paragraph Type="General" id="wrap1">
        <DualDialogue>
          <Paragraph Type="Character" id="c1"><Text>ALICE</Text></Paragraph>
          <Paragraph Type="Dialogue" id="d1"><Text>Hi.</Text></Paragraph>
        </DualDialogue>
      </Paragraph>
    `);
    const top = doc.getParagraphElements();
    expect(countNestedParagraphs(top)).toBe(2);
  });

  test("returns 0 for a list with no wrapper", () => {
    const doc = docWithParagraph(`<Paragraph Type="Action" id="a1"><Text>Only.</Text></Paragraph>`);
    const top = doc.getParagraphElements();
    expect(countNestedParagraphs(top)).toBe(0);
  });
});
```

- [ ] **Step 2: Write the failing test for `skippedNestedWarning`**

Check whether `src/tools/shared.test.ts` already exists (`ls src/tools/shared.test.ts`). If it does
not, create it:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { skippedNestedWarning } from "./shared.ts";

describe("skippedNestedWarning", () => {
  test("returns empty string for a zero count", () => {
    expect(skippedNestedWarning(0)).toBe("");
  });

  test("formats a nonzero count", () => {
    expect(skippedNestedWarning(3)).toBe(
      "3 paragraph(s) nested inside a DualDialogue block were not scanned by this call.",
    );
  });

  test("formats a count of 1 without special-casing pluralization", () => {
    expect(skippedNestedWarning(1)).toBe(
      "1 paragraph(s) nested inside a DualDialogue block were not scanned by this call.",
    );
  });
});
```

If `src/tools/shared.test.ts` already exists, add this `describe` block to the end of the existing
file instead of creating a new one, matching whatever import style is already there.

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test src/fdx/paragraph.test.ts src/tools/shared.test.ts`
Expected: FAIL — `countNestedParagraphs` and `skippedNestedWarning` are not exported yet.

- [ ] **Step 4: Implement `countNestedParagraphs`**

In `src/fdx/paragraph.ts`, add directly after the `expandDualDialogue` function:

```typescript
/** Counts paragraphs expandDualDialogue would add to `paragraphs` — i.e. how many nested
 *  paragraphs are out of scope for a caller that only looks at the given (unexpanded) list. */
export function countNestedParagraphs(paragraphs: XmlElement[]): number {
  return expandDualDialogue(paragraphs).length - paragraphs.length;
}
```

- [ ] **Step 5: Implement `skippedNestedWarning`**

In `src/tools/shared.ts`, add directly after `pushWarning`:

```typescript
/** The warning text for a countNestedParagraphs result, or "" when there's nothing to report
 *  (pushWarning no-ops on an empty string). */
export function skippedNestedWarning(count: number): string {
  return count > 0
    ? `${count} paragraph(s) nested inside a DualDialogue block were not scanned by this call.`
    : "";
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test src/fdx/paragraph.test.ts src/tools/shared.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/fdx/paragraph.ts src/tools/shared.ts src/fdx/paragraph.test.ts src/tools/shared.test.ts
git commit -m "Add countNestedParagraphs and skippedNestedWarning helpers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `find_par` reports skipped nested paragraphs

**Files:**
- Modify: `src/tools/find-par.ts`
- Test: `src/tools/find-par.test.ts`

**Interfaces:**
- Consumes: `countNestedParagraphs`, `skippedNestedWarning` from Task 1;
  `handleEditDualDialogue` from `./edit-dual-dialogue.ts` (test-only).

- [ ] **Step 1: Write the failing tests**

`src/tools/find-par.test.ts` already has a `freshDoc(key)` helper (loads
`examples/Grog The Caveman.fdx` into `documentCache`, returns `{path, doc}`) and a `hits(result)`
helper that parses `content[content.length - 1]!.text` as JSON. Add this import:

```typescript
import { handleEditDualDialogue } from "./edit-dual-dialogue.ts";
```

Add a new `describe` block at the end of the file:

```typescript
describe("find_par with a DualDialogue in the document", () => {
  const CHARACTER_ID = "a3049b85-f812-4aaa-9532-9f53f774f758";
  const PARENTHETICAL_ID = "bbee1c41-6ca4-4ae2-bb0e-4c2769f23a16";
  const DIALOGUE_ID = "b5437965-e39f-4236-a0c0-641860dcfb96";
  const FIRST_SCENE_ID = "6e39d99f-6972-42f8-bdc8-3f0dbe546280";

  async function withDualDialogue(key: string) {
    const { path } = freshDoc(key);
    await handleEditDualDialogue({
      path,
      action: "create",
      ids: [CHARACTER_ID, PARENTHETICAL_ID, DIALOGUE_ID],
    });
    return path;
  }

  test("whole-document search reports the skipped-nested count", async () => {
    const path = await withDualDialogue("skip-warning");
    const result = await handleFindPar({ path, textContent: "does not matter" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain(
      "2 paragraph(s) nested inside a DualDialogue block were not scanned by this call.",
    );
  });

  test("a scene-scoped search that does not include the DualDialogue reports no skip", async () => {
    const path = await withDualDialogue("skip-scoped-out");
    const result = await handleFindPar({ path, textContent: "does not matter", id: FIRST_SCENE_ID });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).not.toContain("nested inside a DualDialogue");
  });

  test("no DualDialogue in scope means no warning", async () => {
    const { path } = freshDoc("no-dual-dialogue");
    const result = await handleFindPar({ path, textContent: "does not matter" });
    expect(result.content[0]!.text).not.toContain("nested inside a DualDialogue");
  });
});
```

`CHARACTER_ID`/`PARENTHETICAL_ID`/`DIALOGUE_ID` are three consecutive paragraphs already deep in
the fixture (a "GROG" Character/Parenthetical/Dialogue group, per `edit-dual-dialogue.test.ts`),
contained in the scene at index 33 of the fixture's top-level paragraph list — not the first scene
(`FIRST_SCENE_ID`, index 0), which is why the second test's scoped search reports no skip: the
`DualDialogue` sits in a different, later scene.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/find-par.test.ts`
Expected: FAIL — the first test's response contains no such warning text yet.

- [ ] **Step 3: Implement the fix**

In `src/tools/find-par.ts`, change the import line:

```typescript
import { getParagraphId, getParagraphType, paragraphText } from "../fdx/paragraph.ts";
```

to:

```typescript
import { getParagraphId, getParagraphType, paragraphText, countNestedParagraphs } from "../fdx/paragraph.ts";
import { skippedNestedWarning } from "./shared.ts";
```

Note `skippedNestedWarning` needs its own import line since it's already importing several names
from `./shared.ts` on the existing `import { arg, textResult, errResult, getCachedFdx,
pushCacheWarning } from "./shared.ts";` line — add it to that existing line instead of a new one:

```typescript
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, skippedNestedWarning } from "./shared.ts";
```

(Do not add the separate `skippedNestedWarning` import shown above — fold it into the existing
`./shared.ts` import line. Only the `../fdx/paragraph.ts` import line actually needs a new import
statement change, adding `countNestedParagraphs` to what's already imported there.)

Change the return statement from:

```typescript
  return pushCacheWarning(textResult(JSON.stringify(hits)), warning);
```

to:

```typescript
  const skipped = countNestedParagraphs(paragraphs.slice(startIndex, endIndex));
  let result = textResult(JSON.stringify(hits));
  result = pushWarning(result, skippedNestedWarning(skipped));
  return pushCacheWarning(result, warning);
```

This also needs `pushWarning` added to the same `./shared.ts` import line:

```typescript
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, pushWarning, skippedNestedWarning } from "./shared.ts";
```

Also update the tool's `description` string — append one clause:

```typescript
  description:
    "Read-Only. Search for a paragraph by text content. Returns a JSON array of hits, each carrying id, type, text, and the containing section's sceneId/sceneHeading/page (all null when the hit is before any section heading) — no separate lookup needed to place a match in the document. When the searched scope contains a DualDialogue block, a warning is prepended reporting how many nested paragraphs were not scanned.",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/find-par.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/tools/find-par.ts src/tools/find-par.test.ts
git commit -m "find_par: report skipped-nested paragraph count

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `replace_text` reports skipped nested paragraphs

**Files:**
- Modify: `src/tools/replace-text.ts`
- Test: `src/tools/replace-text.test.ts`

**Interfaces:**
- Consumes: `countNestedParagraphs`, `skippedNestedWarning` from Task 1;
  `handleEditDualDialogue` from `./edit-dual-dialogue.ts` (test-only).

- [ ] **Step 1: Write the failing tests**

`src/tools/replace-text.test.ts` has the same `freshDoc(key)` pattern. Add the import:

```typescript
import { handleEditDualDialogue } from "./edit-dual-dialogue.ts";
```

Add at the end of the file:

```typescript
describe("replace_text with a DualDialogue in the document", () => {
  const CHARACTER_ID = "a3049b85-f812-4aaa-9532-9f53f774f758";
  const PARENTHETICAL_ID = "bbee1c41-6ca4-4ae2-bb0e-4c2769f23a16";
  const DIALOGUE_ID = "b5437965-e39f-4236-a0c0-641860dcfb96";
  const FIRST_SCENE_ID = "6e39d99f-6972-42f8-bdc8-3f0dbe546280";

  async function withDualDialogue(key: string) {
    const { path } = freshDoc(key);
    await handleEditDualDialogue({
      path,
      action: "create",
      ids: [CHARACTER_ID, PARENTHETICAL_ID, DIALOGUE_ID],
    });
    return path;
  }

  test("whole-document call reports the skipped-nested count", async () => {
    const path = await withDualDialogue("skip-warning");
    const result = await handleReplaceText({ path, find: "zzz-not-present-zzz", replace: "y" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain(
      "2 paragraph(s) nested inside a DualDialogue block were not scanned by this call.",
    );
  });

  test("preview mode also reports the skipped-nested count", async () => {
    const path = await withDualDialogue("skip-warning-preview");
    const result = await handleReplaceText({ path, find: "zzz-not-present-zzz", replace: "y", preview: true });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain(
      "2 paragraph(s) nested inside a DualDialogue block were not scanned by this call.",
    );
  });

  test("a scene-scoped call that does not include the DualDialogue reports no skip", async () => {
    const path = await withDualDialogue("skip-scoped-out");
    const result = await handleReplaceText({
      path,
      find: "zzz-not-present-zzz",
      replace: "y",
      id: FIRST_SCENE_ID,
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).not.toContain("nested inside a DualDialogue");
  });
});
```

`find` is deliberately a string that matches nothing, so the assertion focuses purely on the
warning text rather than mixing in replace-count assertions.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/replace-text.test.ts`
Expected: FAIL — none of the three new tests see the warning text.

- [ ] **Step 3: Implement the fix**

In `src/tools/replace-text.ts`, change the import line:

```typescript
import { getParagraphId, getParagraphType, paragraphText, expandDualDialogue } from "../fdx/paragraph.ts";
```

to:

```typescript
import { getParagraphId, getParagraphType, paragraphText, expandDualDialogue, countNestedParagraphs } from "../fdx/paragraph.ts";
```

And the existing `./shared.ts` import line:

```typescript
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, hasFdxExtension } from "./shared.ts";
```

to:

```typescript
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, pushWarning, hasFdxExtension, skippedNestedWarning } from "./shared.ts";
```

Change the body of `handleReplaceText` from:

```typescript
  const result = runPreservingReplace(doc, { find, replace, caseSensitive, parType, startIndex, endIndex, preview });

  if (preview) {
    const matches = result.previewMatches ?? [];
    const totalMatches = matches.reduce((sum, m) => sum + m.wouldReplace, 0);
    const totalSkipped = matches.reduce((sum, m) => sum + m.skipped, 0);
    const paragraphsWithReplacements = matches.filter((m) => m.wouldReplace > 0).length;
    const skipNote = totalSkipped > 0 ? `; ${totalSkipped} occurrence(s) would be skipped (span a run boundary)` : "";
    const body = {
      preview: true,
      find,
      replace,
      matches,
      totalMatches,
      totalSkipped,
      message: `Preview: ${totalMatches} occurrence(s) across ${paragraphsWithReplacements} paragraph(s) would be replaced${skipNote}. Nothing was changed — call again with preview=false (or omit preview) to apply.`,
    };
    return pushCacheWarning(textResult(JSON.stringify(body, null, 2)), warning);
  }

  let msg = `Replaced ${result.totalReplaced} occurrence(s) of "${find}" with "${replace}".`;
  if (result.skipped.length > 0) {
    const skippedTotal = result.skipped.reduce((sum, s) => sum + s.count, 0);
    const detail = result.skipped.map((s) => `${s.id} (${s.count})`).join(", ");
    msg += ` ${skippedTotal} occurrence(s) skipped because they only match by spanning a run boundary — inspect with get_par_runs: ${detail}.`;
  }

  let dirtyWarning = "";
  if (result.touched) {
    dirtyWarning = documentCache.touchDirty(path, doc);
    msg += " File updated in cache — call save_fdx to persist changes to disk.";
  }

  return pushCacheWarning(pushCacheWarning(textResult(msg), dirtyWarning), warning);
```

to:

```typescript
  const result = runPreservingReplace(doc, { find, replace, caseSensitive, parType, startIndex, endIndex, preview });
  const skippedNested = countNestedParagraphs(paragraphs.slice(startIndex, endIndex));

  if (preview) {
    const matches = result.previewMatches ?? [];
    const totalMatches = matches.reduce((sum, m) => sum + m.wouldReplace, 0);
    const totalSkipped = matches.reduce((sum, m) => sum + m.skipped, 0);
    const paragraphsWithReplacements = matches.filter((m) => m.wouldReplace > 0).length;
    const skipNote = totalSkipped > 0 ? `; ${totalSkipped} occurrence(s) would be skipped (span a run boundary)` : "";
    const body = {
      preview: true,
      find,
      replace,
      matches,
      totalMatches,
      totalSkipped,
      message: `Preview: ${totalMatches} occurrence(s) across ${paragraphsWithReplacements} paragraph(s) would be replaced${skipNote}. Nothing was changed — call again with preview=false (or omit preview) to apply.`,
    };
    let previewResult = textResult(JSON.stringify(body, null, 2));
    previewResult = pushWarning(previewResult, skippedNestedWarning(skippedNested));
    return pushCacheWarning(previewResult, warning);
  }

  let msg = `Replaced ${result.totalReplaced} occurrence(s) of "${find}" with "${replace}".`;
  if (result.skipped.length > 0) {
    const skippedTotal = result.skipped.reduce((sum, s) => sum + s.count, 0);
    const detail = result.skipped.map((s) => `${s.id} (${s.count})`).join(", ");
    msg += ` ${skippedTotal} occurrence(s) skipped because they only match by spanning a run boundary — inspect with get_par_runs: ${detail}.`;
  }

  let dirtyWarning = "";
  if (result.touched) {
    dirtyWarning = documentCache.touchDirty(path, doc);
    msg += " File updated in cache — call save_fdx to persist changes to disk.";
  }

  let finalResult = textResult(msg);
  finalResult = pushWarning(finalResult, skippedNestedWarning(skippedNested));
  return pushCacheWarning(pushCacheWarning(finalResult, dirtyWarning), warning);
```

Also update the tool's `description` string:

```typescript
  description:
    "Find and replace text across paragraphs in a loaded screenplay, substituting inside each <Text> run's own content so run boundaries and every run attribute (AdornmentStyle, Font, Color, Size, RevisionID, ...) are preserved. A match that only exists by spanning two runs is left unreplaced and reported as skipped. Optionally scope to a section (id) and/or a paragraph type (parType). Pass preview=true to see what would be matched — each occurrence marked with «...» in its paragraph's text, original document casing preserved — without changing anything; call again with preview omitted (or false) to apply. When the scope contains a DualDialogue block, a warning is prepended reporting how many nested paragraphs were not scanned. After editing, call save_fdx to persist changes to disk.",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/replace-text.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/tools/replace-text.ts src/tools/replace-text.test.ts
git commit -m "replace_text: report skipped-nested paragraph count

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `get_flagged_words` reports skipped nested paragraphs

**Files:**
- Modify: `src/tools/get-flagged-words.ts`
- Test: `src/tools/get-flagged-words.test.ts`

**Interfaces:**
- Consumes: `countNestedParagraphs`, `skippedNestedWarning` from Task 1.

- [ ] **Step 1: Write the failing test**

`src/tools/get-flagged-words.test.ts` builds its own hand-crafted `.fdx` via the `fixture(bodyXml,
ignoredWords)` helper already in the file (raw XML content strings, not `handleEditDualDialogue`).
Add at the end of the file:

```typescript
describe("get_flagged_words with a DualDialogue in the document", () => {
  test("reports the skipped-nested count", async () => {
    const path = fixture(`
      <Paragraph Type="Action" id="a1"><Text>Setup.</Text></Paragraph>
      <Paragraph Type="General" id="wrap1">
        <DualDialogue>
          <Paragraph Type="Character" id="c1"><Text>ALICE</Text></Paragraph>
          <Paragraph Type="Dialogue" id="d1"><Text>Hi.</Text></Paragraph>
        </DualDialogue>
      </Paragraph>
    `);
    await handleReadFdx({ path });
    const result = await handleGetFlaggedWords({ path });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain(
      "2 paragraph(s) nested inside a DualDialogue block were not scanned by this call.",
    );
  });

  test("no DualDialogue means no warning", async () => {
    const path = fixture(`<Paragraph Type="Action" id="a1"><Text>Plain.</Text></Paragraph>`);
    await handleReadFdx({ path });
    const result = await handleGetFlaggedWords({ path });
    expect(result.content[0]!.text).not.toContain("nested inside a DualDialogue");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/get-flagged-words.test.ts`
Expected: FAIL — the first new test sees no such warning.

- [ ] **Step 3: Implement the fix**

In `src/tools/get-flagged-words.ts`, change:

```typescript
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, getParagraphType, getParagraphRuns } from "../fdx/paragraph.ts";
```

to:

```typescript
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, pushWarning, skippedNestedWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, getParagraphType, getParagraphRuns, countNestedParagraphs } from "../fdx/paragraph.ts";
```

Change the final two lines from:

```typescript
  const body = { flaggedWords, count: flaggedWords.length };
  return pushCacheWarning(textResult(JSON.stringify(body, null, 2)), warning);
```

to:

```typescript
  const body = { flaggedWords, count: flaggedWords.length };
  let result = textResult(JSON.stringify(body, null, 2));
  result = pushWarning(result, skippedNestedWarning(countNestedParagraphs(paragraphs)));
  return pushCacheWarning(result, warning);
```

Also update the tool's `description` string:

```typescript
  description:
    'Read-Only. Surfaces every <Text> run carrying AdornmentStyle="-1" — Final Draft\'s unknown-word marker — as {word, paragraphId, paragraphType, page} per hit. Scoped to top-level body paragraphs (nested DualDialogue paragraphs are out of scope, same as find_par/replace_text — a warning is prepended reporting how many were skipped when the document contains any). Pass excludeIgnoreList=true to filter out words already in the spell-check ignore list.',
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/get-flagged-words.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/tools/get-flagged-words.ts src/tools/get-flagged-words.test.ts
git commit -m "get_flagged_words: report skipped-nested paragraph count

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: `get_placeholders` reports skipped nested paragraphs

**Files:**
- Modify: `src/tools/get-placeholders.ts`
- Test: `src/tools/get-placeholders.test.ts`

**Interfaces:**
- Consumes: `countNestedParagraphs`, `skippedNestedWarning` from Task 1.

- [ ] **Step 1: Write the failing test**

`src/tools/get-placeholders.test.ts` has the same `fixture(bodyXml)` pattern (no ignore-words
parameter, otherwise identical shape). Add at the end of the file:

```typescript
describe("get_placeholders with a DualDialogue in the document", () => {
  test("reports the skipped-nested count", async () => {
    const path = fixture(`
      <Paragraph Type="Action" id="a1"><Text>Setup.</Text></Paragraph>
      <Paragraph Type="General" id="wrap1">
        <DualDialogue>
          <Paragraph Type="Character" id="c1"><Text>ALICE</Text></Paragraph>
          <Paragraph Type="Dialogue" id="d1"><Text>Hi.</Text></Paragraph>
        </DualDialogue>
      </Paragraph>
    `);
    await handleReadFdx({ path });
    const result = await handleGetPlaceholders({ path });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain(
      "2 paragraph(s) nested inside a DualDialogue block were not scanned by this call.",
    );
  });

  test("no DualDialogue means no warning", async () => {
    const path = fixture(`<Paragraph Type="Action" id="a1"><Text>Plain.</Text></Paragraph>`);
    await handleReadFdx({ path });
    const result = await handleGetPlaceholders({ path });
    expect(result.content[0]!.text).not.toContain("nested inside a DualDialogue");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/get-placeholders.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the fix**

In `src/tools/get-placeholders.ts`, change:

```typescript
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, getParagraphType, paragraphText } from "../fdx/paragraph.ts";
```

to:

```typescript
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, pushWarning, skippedNestedWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, getParagraphType, paragraphText, countNestedParagraphs } from "../fdx/paragraph.ts";
```

Change the final two lines from:

```typescript
  const body = { placeholders, count: placeholders.length };
  return pushCacheWarning(textResult(JSON.stringify(body, null, 2)), warning);
```

to:

```typescript
  const body = { placeholders, count: placeholders.length };
  let result = textResult(JSON.stringify(body, null, 2));
  result = pushWarning(result, skippedNestedWarning(countNestedParagraphs(paragraphs)));
  return pushCacheWarning(result, warning);
```

Also update the tool's `description` string:

```typescript
  description:
    'Read-Only. Lists every paragraph whose full text (trimmed) is entirely one [...] span — a drafting placeholder like "[FIX - ...]" — regardless of paragraph type, as {id, type, text, page} per hit. Scoped to top-level body paragraphs (nested DualDialogue paragraphs are out of scope, same as find_par/get_flagged_words — a warning is prepended reporting how many were skipped when the document contains any). Combine with batch_edit and edit_par action=remove to bulk-clear placeholders once applied; see also get_script_stats\'s placeholderCount and excludePlaceholders.',
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/get-placeholders.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/tools/get-placeholders.ts src/tools/get-placeholders.test.ts
git commit -m "get_placeholders: report skipped-nested paragraph count

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: `get_character_appearances` reports skipped nested paragraphs

**Files:**
- Modify: `src/tools/get-character-appearances.ts`
- Test: `src/tools/get-character-appearances.test.ts`

**Interfaces:**
- Consumes: `countNestedParagraphs`, `skippedNestedWarning` from Task 1;
  `handleEditDualDialogue` from `./edit-dual-dialogue.ts` (test-only).

This tool is whole-document only (no scene-scoping parameter), and its two response shapes differ
by whether `character` is given (a single object) or omitted (an array) — the warning applies the
same way regardless, since it's a prepended text block, not a JSON field.

- [ ] **Step 1: Write the failing tests**

`src/tools/get-character-appearances.test.ts` currently has no `freshDoc`/temp-file helper — its
existing tests call `handleReadFdx({ path: FIXTURE_PATH })` directly against the shared fixture
path. Add these imports:

```typescript
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { handleEditDualDialogue } from "./edit-dual-dialogue.ts";
```

Add a `freshCopy()` helper (matching the pattern already used in several other test files, e.g.
`edit-spell-check.test.ts`) and a new `describe` block at the end of the file:

```typescript
function freshCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-get-character-appearances-"));
  const path = join(dir, "script.fdx");
  copyFileSync(FIXTURE_PATH, path);
  return path;
}

describe("get_character_appearances with a DualDialogue in the document", () => {
  const CHARACTER_ID = "a3049b85-f812-4aaa-9532-9f53f774f758";
  const PARENTHETICAL_ID = "bbee1c41-6ca4-4ae2-bb0e-4c2769f23a16";
  const DIALOGUE_ID = "b5437965-e39f-4236-a0c0-641860dcfb96";

  test("whole-document call reports the skipped-nested count", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    await handleEditDualDialogue({
      path,
      action: "create",
      ids: [CHARACTER_ID, PARENTHETICAL_ID, DIALOGUE_ID],
    });
    const result = await handleGetCharacterAppearances({ path });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain(
      "2 paragraph(s) nested inside a DualDialogue block were not scanned by this call.",
    );
  });

  test("no DualDialogue means no warning", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleGetCharacterAppearances({ path });
    expect(result.content[0]!.text).not.toContain("nested inside a DualDialogue");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/get-character-appearances.test.ts`
Expected: FAIL — the first new test sees no such warning. The existing tests in the file (using
`FIXTURE_PATH` directly, not a fresh copy) continue to pass unaffected, since the shared fixture has
no `DualDialogue` and this task doesn't touch them.

- [ ] **Step 3: Implement the fix**

In `src/tools/get-character-appearances.ts`, change:

```typescript
import { arg, getCachedFdx, pushCacheWarning, textResult, errResult } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { buildCharacterAppearances, rankCharacters } from "./breakdown.ts";
```

to:

```typescript
import { arg, getCachedFdx, pushCacheWarning, pushWarning, textResult, errResult, skippedNestedWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { buildCharacterAppearances, rankCharacters } from "./breakdown.ts";
import { countNestedParagraphs } from "../fdx/paragraph.ts";
```

Change the handler body from:

```typescript
  const appearances = buildCharacterAppearances(doc);
  const ranked = rankCharacters(appearances);

  const want = ((arg<string>(args, "character")) ?? "").trim();
  if (want !== "") {
    const hit = ranked.find((r) => r.name.toLowerCase() === want.toLowerCase());
    if (!hit) {
      return pushCacheWarning(textResult(`no appearances found for character: ${want}`), warning);
    }
    const entry = { character: hit.name, total: hit.total, appearances: appearances.get(hit.name) ?? [] };
    return pushCacheWarning(textResult(JSON.stringify(entry)), warning);
  }

  const ordered = ranked.map((r) => ({
    character: r.name,
    total: r.total,
    appearances: appearances.get(r.name) ?? [],
  }));
  return pushCacheWarning(textResult(JSON.stringify(ordered)), warning);
```

to:

```typescript
  const appearances = buildCharacterAppearances(doc);
  const ranked = rankCharacters(appearances);
  const skippedWarning = skippedNestedWarning(countNestedParagraphs(doc.getParagraphElements()));

  const want = ((arg<string>(args, "character")) ?? "").trim();
  if (want !== "") {
    const hit = ranked.find((r) => r.name.toLowerCase() === want.toLowerCase());
    if (!hit) {
      let notFoundResult = textResult(`no appearances found for character: ${want}`);
      notFoundResult = pushWarning(notFoundResult, skippedWarning);
      return pushCacheWarning(notFoundResult, warning);
    }
    const entry = { character: hit.name, total: hit.total, appearances: appearances.get(hit.name) ?? [] };
    let oneResult = textResult(JSON.stringify(entry));
    oneResult = pushWarning(oneResult, skippedWarning);
    return pushCacheWarning(oneResult, warning);
  }

  const ordered = ranked.map((r) => ({
    character: r.name,
    total: r.total,
    appearances: appearances.get(r.name) ?? [],
  }));
  let allResult = textResult(JSON.stringify(ordered));
  allResult = pushWarning(allResult, skippedWarning);
  return pushCacheWarning(allResult, warning);
```

Also update the tool's `description` string:

```typescript
  description:
    "Read-Only. Retrieve, as JSON, each character's scene-by-scene appearance counts (Character/Parenthetical/Dialogue paragraphs attributed to that speaker). Pass character to filter to one name (case-insensitive); omit for every character sorted by total count descending. Scoped to top-level body paragraphs — a warning is prepended reporting how many paragraphs nested inside a DualDialogue block were not scanned when the document contains any; speaker attribution around a DualDialogue interruption may also be inaccurate.",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/get-character-appearances.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/tools/get-character-appearances.ts src/tools/get-character-appearances.test.ts
git commit -m "get_character_appearances: report skipped-nested paragraph count

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Documentation sync

**Files:**
- Modify: `src/tools/context-data.ts`
- Modify: `TOOLS.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: the five updated tool descriptions from Tasks 2–6 (verbatim strings, already written
  in those tasks).

- [ ] **Step 1: Update `src/tools/context-data.ts`**

Four of the five tools already have a catalog entry in `contextTools`; `replace_text` is a
pre-existing gap — it's a registered tool (`src/index.ts` imports and lists `replaceTextTool`) with
no entry here at all, discovered while writing this plan, unrelated to this task's own change but
directly blocking "update `replace_text`'s mirrored entry" since there's nothing to update. Add it
alongside fixing the other four.

Change the `find_par` entry (around line 195) from:

```typescript
  {
    name: "find_par",
    description:
      "Read-Only. Search for a paragraph by text content. Returns a JSON array of hits, each carrying id, type, text, and the containing section's sceneId/sceneHeading/page.",
  },
```

to:

```typescript
  {
    name: "find_par",
    description:
      "Read-Only. Search for a paragraph by text content. Returns a JSON array of hits, each carrying id, type, text, and the containing section's sceneId/sceneHeading/page. Scoped to top-level body paragraphs — a warning is prepended reporting how many nested inside a DualDialogue block were not scanned, when the searched scope contains any.",
  },
```

Add a new `replace_text` entry directly after it:

```typescript
  {
    name: "replace_text",
    description:
      "Find and replace text across paragraphs, substituting inside each <Text> run's own content so run boundaries and attributes are preserved. A match spanning two runs is left unreplaced and reported as skipped. Pass preview=true to see matches without changing anything. Scoped to top-level body paragraphs — a warning is prepended reporting how many nested inside a DualDialogue block were not scanned, when the scope contains any.",
  },
```

Change the `get_flagged_words` entry (around line 340) from:

```typescript
  {
    name: "get_flagged_words",
    description:
      'Read-Only. Surfaces every <Text> run carrying AdornmentStyle="-1" — Final Draft\'s unknown-word marker — as {word, paragraphId, paragraphType, page} per hit. Scoped to top-level body paragraphs (nested DualDialogue paragraphs are out of scope, same as find_par/replace_text). Pass excludeIgnoreList=true to filter out words already in the spell-check ignore list.',
  },
```

to:

```typescript
  {
    name: "get_flagged_words",
    description:
      'Read-Only. Surfaces every <Text> run carrying AdornmentStyle="-1" — Final Draft\'s unknown-word marker — as {word, paragraphId, paragraphType, page} per hit. Scoped to top-level body paragraphs (nested DualDialogue paragraphs are out of scope, same as find_par/replace_text — a warning is prepended reporting how many were skipped when the document contains any). Pass excludeIgnoreList=true to filter out words already in the spell-check ignore list.',
  },
```

Change the `get_placeholders` entry from:

```typescript
  {
    name: "get_placeholders",
    description:
      'Read-Only. Lists every paragraph whose full text (trimmed) is entirely one [...] span — a drafting placeholder like "[FIX - ...]" — regardless of paragraph type, as {id, type, text, page} per hit. Scoped to top-level body paragraphs (nested DualDialogue paragraphs are out of scope, same as find_par/get_flagged_words). Combine with batch_edit and edit_par action=remove to bulk-clear placeholders once applied; see also get_script_stats\'s placeholderCount and excludePlaceholders.',
  },
```

to:

```typescript
  {
    name: "get_placeholders",
    description:
      'Read-Only. Lists every paragraph whose full text (trimmed) is entirely one [...] span — a drafting placeholder like "[FIX - ...]" — regardless of paragraph type, as {id, type, text, page} per hit. Scoped to top-level body paragraphs (nested DualDialogue paragraphs are out of scope, same as find_par/get_flagged_words — a warning is prepended reporting how many were skipped when the document contains any). Combine with batch_edit and edit_par action=remove to bulk-clear placeholders once applied; see also get_script_stats\'s placeholderCount and excludePlaceholders.',
  },
```

Change the `get_character_appearances` entry from:

```typescript
  {
    name: "get_character_appearances",
    description:
      "Read-Only. Retrieve, as JSON, each character's scene-by-scene appearance counts (Character/Parenthetical/Dialogue paragraphs attributed to that speaker). Pass character to filter to one name (case-insensitive); omit for every character sorted by total count descending.",
  },
```

to:

```typescript
  {
    name: "get_character_appearances",
    description:
      "Read-Only. Retrieve, as JSON, each character's scene-by-scene appearance counts (Character/Parenthetical/Dialogue paragraphs attributed to that speaker). Pass character to filter to one name (case-insensitive); omit for every character sorted by total count descending. Scoped to top-level body paragraphs — a warning is prepended reporting how many nested inside a DualDialogue block were not scanned when the document contains any; speaker attribution around a DualDialogue interruption may also be inaccurate.",
  },
```

- [ ] **Step 2: Run the full suite**

Run: `bun test`
Expected: PASS, no regressions.

- [ ] **Step 3: Update `TOOLS.md`**

Update the Description column (only) of these five rows — Parameters columns are unchanged, no
input schema changed in this plan, so the tool-count header line also stays the same.

`find_par` row: append ` Scoped to top-level body paragraphs — a warning is prepended reporting how
many nested inside a DualDialogue block were not scanned, when the searched scope contains any.` to
the end of its existing Description text.

`replace_text` row: append ` Scoped to top-level body paragraphs — a warning is prepended reporting
how many nested inside a DualDialogue block were not scanned, when the scope contains any.` before
the existing trailing `After editing, call save_fdx to persist changes to disk.` sentence (i.e.
insert it as the second-to-last sentence, keeping the save_fdx reminder last, matching this
project's convention of ending mutation-tool descriptions with that reminder).

`get_flagged_words` row: change `(nested DualDialogue paragraphs are out of scope, same as
find_par/replace_text)` to `(nested DualDialogue paragraphs are out of scope, same as
find_par/replace_text — a warning is prepended reporting how many were skipped when the document
contains any)`.

`get_placeholders` row: change `(nested DualDialogue paragraphs are out of scope, same as
find_par/get_flagged_words)` to `(nested DualDialogue paragraphs are out of scope, same as
find_par/get_flagged_words — a warning is prepended reporting how many were skipped when the
document contains any)`.

`get_character_appearances` row: append ` Scoped to top-level body paragraphs — a warning is
prepended reporting how many nested inside a DualDialogue block were not scanned when the document
contains any; speaker attribution around a DualDialogue interruption may also be inaccurate.` to
the end of its existing Description text.

These match the exact clauses used in each tool's own file and `context-data.ts` entry from Step 1,
so all three documents stay in sync using identical wording.

- [ ] **Step 4: Bump `package.json` and add a `CHANGELOG.md` entry**

Check `package.json`'s current `"version"` first and bump the patch number by one. Add a new entry
at the top of `CHANGELOG.md`, above the previous most-recent entry, using that version and today's
date:

```markdown
### Changed

- **`find_par`**, **`replace_text`**, **`get_flagged_words`**, **`get_placeholders`**, and **`get_character_appearances`** now prepend a warning reporting how many paragraphs nested inside a `<DualDialogue>` block were out of scope for that call, when the queried scope contains any. None of these tools descend into `DualDialogue` blocks — this makes the existing blind spot visible in the output instead of only in documentation.
```

- [ ] **Step 5: Check `README.md`**

Search for the existing "Dual dialogue support" and "Search & navigation" bullets under
`## Features`. If either bullet's wording would now be inaccurate or incomplete, update it; if the
existing wording is general enough already, leave it as-is rather than restating what the
CHANGELOG covers.

- [ ] **Step 6: Rebuild `dist/`, run the full suite again, and commit**

`dist/` is intentionally tracked in this repo (per `.gitignore`'s comment) — rebuild it so the
published bundle matches these changes:

```bash
bun run build
```

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/tools/context-data.ts TOOLS.md CHANGELOG.md package.json README.md dist/index.js
git commit -m "Sync docs for nested-paragraph skip reporting (wishlist item 17)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## After the plan: wishlist and push

Once all seven tasks are committed, mark wishlist item 17 as fully **DONE** in
`F:\Vault\mcp\fdx-mcp-server\wishlist.md` (format: `— **DONE** (<version>, 2026-08-02)` appended to
its `## 17.` heading) — this closes out the item's remaining half; the mutation half
(`rename_character`) was already resolved in a prior phase. Do not push yet if item 18's plan is
being implemented in the same session — push once at the end of the full session, per this
project's established pattern of one push per phase (or, if the user asks for both items pushed
together, push after both are committed).
