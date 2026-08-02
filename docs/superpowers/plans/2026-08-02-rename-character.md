# rename_character Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement wishlist Phase D (item 13, plus item 3's cross-reference extension) per
`docs/superpowers/specs/2026-08-02-rename-character-design.md`: a single `rename_character(path, from, to, cs?)`
tool that renames or merges a character across all five places a name is stored, plus extending
`edit_smarttype_characters`'s existing cross-reference warning to a third location.

**Architecture:** One new tool file (`rename-character.ts`) built on top of two small,
independently-useful extractions/additions: `runPreservingReplace` (pulled out of `replace-text.ts`
so cue-paragraph renaming reuses tested logic instead of duplicating it) and two new
`FdxDocument` accessors for `<CharacterHighlighting>` (mirroring the existing `getCastElement`/
`getCastMembers` pattern). `breakdown.ts`'s `countCharacterReferences` and
`edit-smarttype-characters.ts`'s cross-reference warning both grow a third count using the new
accessors.

**Tech Stack:** TypeScript, Bun test runner, existing MCP tool-registration pattern in `src/index.ts`.

## Global Constraints

- Bun-first, Deno-compatible — no Bun/Node-only APIs beyond what's already in the codebase.
- Every `ToolResult.content` entry is `{ type: "text"; text: string }` — JSON output is a `text`
  block containing `JSON.stringify(...)`.
- Match existing file conventions: SPDX header, top-of-file doc comment.
- `bun test` must stay green after every task.
- Never touch `<Actors>` (binary voice-synthesis data) — `rename_character` only ever reads/writes
  `Character` attribute values on `<Cast>` `Member` rows, never `<Actors>`.
- `from`/`to` matching is case-insensitive unless `cs=true`, consistent with every other
  `find`/`replace`-shaped tool in this codebase (`edit_smarttype_*`, `edit_spell_check`,
  `edit_locations`).

---

### Task 1: Extract `runPreservingReplace` from `replace_text`

**Files:**
- Modify: `src/tools/replace-text.ts`
- Test: `src/tools/replace-text.test.ts` (no changes expected — this is the regression check)

**Interfaces:**
- Produces: `runPreservingReplace(doc: FdxDocument, opts: RunPreservingReplaceOptions): RunPreservingReplaceResult`,
  exported from `src/tools/replace-text.ts`, where:
  ```typescript
  export interface RunPreservingReplaceOptions {
    find: string;
    replace: string;
    caseSensitive: boolean;
    parType?: string;
    startIndex?: number;
    endIndex?: number;
  }
  export interface RunPreservingReplaceResult {
    totalReplaced: number;
    paragraphsTouched: number;
    touched: boolean;
    skipped: Array<{ id: string; count: number }>;
  }
  ```
  `paragraphsTouched` counts distinct paragraphs with at least one in-run replacement (new field —
  `replace_text` doesn't currently report this, but `rename_character`'s response needs it).

This is a pure refactor: no new test is written first, since there's no new behavior — the existing
`replace-text.test.ts` suite is the correctness check, both before and after.

- [ ] **Step 1: Confirm the starting point is green**

Run: `bun test src/tools/replace-text.test.ts`
Expected: PASS (7 tests) — establishes the baseline before refactoring.

- [ ] **Step 2: Extract the core loop**

In `src/tools/replace-text.ts`, replace the body of `handleReplaceText` from the `const paragraphs = doc.getParagraphElements();` line through the `const skippedCount = ...` loop's closing brace with a call to a new exported function. The full file becomes:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * replace_text — run-preserving find/replace across a loaded screenplay's paragraph text.
 * Substitutes inside each <Text> run's own content, leaving run boundaries and every run
 * attribute (AdornmentStyle, Font, Color, Size, RevisionID, ...) untouched. A match that only
 * exists when spanning two runs is left alone and reported as skipped rather than merged.
 *
 * The core substitution loop is exported as runPreservingReplace so other tools (rename_character)
 * can reuse it instead of duplicating run-preserving substring replace.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { findChildren, textContent, setTextContent } from "../fdx/xml.ts";
import { getParagraphId, getParagraphType, paragraphText } from "../fdx/paragraph.ts";
import { findSectionIndex, findSectionEnd } from "../fdx/sections.ts";

export const replaceTextTool: FdxTool = {
  name: "replace_text",
  description:
    "Find and replace text across paragraphs in a loaded screenplay, substituting inside each <Text> run's own content so run boundaries and every run attribute (AdornmentStyle, Font, Color, Size, RevisionID, ...) are preserved. A match that only exists by spanning two runs is left unreplaced and reported as skipped. Optionally scope to a section (id) and/or a paragraph type (parType). After editing, call save_fdx to persist changes to disk.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      find: { type: "string", description: "the text to search for" },
      replace: { type: "string", description: "the text to replace matches with" },
      parType: { type: "string", description: "restrict replacement to paragraphs of this type" },
      id: {
        type: "string",
        description: "id is the scene id (the id of the Scene Heading paragraph) to scope the replacement to",
      },
      caseSensitive: { type: "boolean", description: "whether matching should be case-sensitive" },
    },
    required: ["path", "find", "replace"],
  },
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Counts non-overlapping occurrences of `needle` in `haystack`. */
function countOccurrences(haystack: string, needle: string, caseSensitive: boolean): number {
  if (needle === "") return 0;
  const h = caseSensitive ? haystack : haystack.toLowerCase();
  const n = caseSensitive ? needle : needle.toLowerCase();
  let count = 0;
  let idx = 0;
  for (;;) {
    const found = h.indexOf(n, idx);
    if (found === -1) break;
    count++;
    idx = found + n.length;
  }
  return count;
}

function replaceAllOccurrences(haystack: string, find: string, replace: string, caseSensitive: boolean): string {
  if (caseSensitive) return haystack.split(find).join(replace);
  return haystack.replace(new RegExp(escapeRegExp(find), "gi"), replace);
}

export interface RunPreservingReplaceOptions {
  find: string;
  replace: string;
  caseSensitive: boolean;
  parType?: string;
  startIndex?: number;
  endIndex?: number;
}

export interface RunPreservingReplaceResult {
  totalReplaced: number;
  paragraphsTouched: number;
  touched: boolean;
  skipped: Array<{ id: string; count: number }>;
}

/**
 * Substitutes `find` with `replace` inside each <Text> run's own content across the paragraphs in
 * [startIndex, endIndex) (defaults to the whole document), optionally restricted to `parType`. A
 * match that only exists by spanning two runs is left unreplaced and counted in `skipped` instead.
 */
export function runPreservingReplace(doc: FdxDocument, opts: RunPreservingReplaceOptions): RunPreservingReplaceResult {
  const { find, replace, caseSensitive, parType } = opts;
  const paragraphs = doc.getParagraphElements();
  const startIndex = opts.startIndex ?? 0;
  const endIndex = opts.endIndex ?? paragraphs.length;

  let totalReplaced = 0;
  let paragraphsTouched = 0;
  const skipped: Array<{ id: string; count: number }> = [];
  let touched = false;

  for (let i = startIndex; i < endIndex; i++) {
    const para = paragraphs[i]!;
    if (parType && getParagraphType(para) !== parType) continue;

    const naiveTotal = countOccurrences(paragraphText(para), find, caseSensitive);
    if (naiveTotal === 0) continue;

    let perRunReplaced = 0;
    for (const run of findChildren(para, "Text")) {
      const content = textContent(run);
      const count = countOccurrences(content, find, caseSensitive);
      if (count === 0) continue;
      setTextContent(run, replaceAllOccurrences(content, find, replace, caseSensitive));
      perRunReplaced += count;
    }

    if (perRunReplaced > 0) {
      totalReplaced += perRunReplaced;
      paragraphsTouched++;
      touched = true;
    }

    const skippedCount = naiveTotal - perRunReplaced;
    if (skippedCount > 0) skipped.push({ id: getParagraphId(para), count: skippedCount });
  }

  return { totalReplaced, paragraphsTouched, touched, skipped };
}

export async function handleReplaceText(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  const find = arg<string>(args, "find");
  const replace = arg<string>(args, "replace");
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");
  if (!find) return errResult("find is required");
  if (replace === undefined) return errResult("replace is required");

  const parType = arg<string>(args, "parType");
  const sceneId = arg<string>(args, "id");
  const caseSensitive = Boolean(args?.caseSensitive);

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const paragraphs = doc.getParagraphElements();
  let startIndex = 0;
  let endIndex = paragraphs.length;

  if (sceneId) {
    const idx = findSectionIndex(paragraphs, sceneId);
    if (idx === -1) return errResult(`section id not found: ${sceneId}`);
    startIndex = idx;
    endIndex = findSectionEnd(paragraphs, idx);
  }

  const { totalReplaced, touched, skipped } = runPreservingReplace(doc, {
    find,
    replace,
    caseSensitive,
    parType,
    startIndex,
    endIndex,
  });

  let msg = `Replaced ${totalReplaced} occurrence(s) of "${find}" with "${replace}".`;
  if (skipped.length > 0) {
    const skippedTotal = skipped.reduce((sum, s) => sum + s.count, 0);
    const detail = skipped.map((s) => `${s.id} (${s.count})`).join(", ");
    msg += ` ${skippedTotal} occurrence(s) skipped because they only match by spanning a run boundary — inspect with get_par_runs: ${detail}.`;
  }

  let dirtyWarning = "";
  if (touched) {
    dirtyWarning = documentCache.touchDirty(path, doc);
    msg += " File updated in cache — call save_fdx to persist changes to disk.";
  }

  return pushCacheWarning(pushCacheWarning(textResult(msg), dirtyWarning), warning);
}
```

- [ ] **Step 3: Run tests to confirm nothing regressed**

Run: `bun test src/tools/replace-text.test.ts`
Expected: PASS (7 tests, unchanged) — confirms the extraction preserved behavior exactly.

Run: `bun test`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add src/tools/replace-text.ts
git commit -m "Extract runPreservingReplace from replace_text for reuse

rename_character (next) needs the same run-preserving substring
replace for Character-cue paragraphs. Pure refactor: handleReplaceText
now calls the extracted function; behavior and messages are unchanged,
verified by the existing replace-text.test.ts suite staying green.
Adds paragraphsTouched to the result, unused by replace_text itself
but needed by rename_character's structured report."
```

---

### Task 2: `<CharacterHighlighting>` accessors on `FdxDocument`

**Files:**
- Modify: `src/fdx/document.ts`
- Modify: `src/fdx/document.test.ts`

**Interfaces:**
- Produces: `getCharacterHighlightingElement(create = false): XmlElement | undefined` and
  `getHighlightedCharacters(): XmlElement[]` (all `<Character Name="..." Color="..." Visible="..."/>`
  rows under `<CharacterHighlighting>`), mirroring the existing `getCastElement`/`getCastMembers`
  pair.

- [ ] **Step 1: Write the failing tests**

Add to `src/fdx/document.test.ts`, inside the existing `describe("FdxDocument", ...)` block (after
whichever test is currently last — check the file's actual last test before inserting, since it may
have grown since this plan was written; append after it, don't guess a line number):

```typescript
  test("getHighlightedCharacters returns [] when CharacterHighlighting is empty", () => {
    const doc = FdxDocument.parse(fixture);
    expect(doc.getCharacterHighlightingElement()).toBeDefined();
    expect(doc.getHighlightedCharacters()).toEqual([]);
  });

  test("getCharacterHighlightingElement(true) creates the block when absent", () => {
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content/>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    expect(doc.getCharacterHighlightingElement()).toBeUndefined();
    const created = doc.getCharacterHighlightingElement(true);
    expect(created).toBeDefined();
    expect(doc.getHighlightedCharacters()).toEqual([]);
  });

  test("getHighlightedCharacters returns each Character row", () => {
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content/>
  <CharacterHighlighting>
    <Character Name="GROG" Color="#0000FFFF0000" Visible="Yes"/>
    <Character Name="OOK" Color="#RRRRGGGGBBBB" Visible="No"/>
  </CharacterHighlighting>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const rows = doc.getHighlightedCharacters();
    expect(rows.length).toBe(2);
    expect(rows[0]!.attrs.find(([k]) => k === "Name")?.[1]).toBe("GROG");
  });
```

(The Grog fixture's `<CharacterHighlighting/>` is present but empty, per `examples/Grog The Caveman.fdx:734` — that's what the first new test relies on.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/fdx/document.test.ts`
Expected: FAIL — `getCharacterHighlightingElement is not a function`.

- [ ] **Step 3: Implement**

In `src/fdx/document.ts`, add after the existing Cast section (after `getCastMembers()`'s closing
brace, before the `SmartType dictionaries` section comment):

```typescript
  /* ---------------------------------------------------------------- */
  /*  CharacterHighlighting (top-level)                                */
  /* ---------------------------------------------------------------- */

  getCharacterHighlightingElement(create = false): XmlElement | undefined {
    let ch = findChild(this.root, "CharacterHighlighting");
    if (!ch && create) {
      ch = createElement("CharacterHighlighting");
      this.root.children.push(ch);
    }
    return ch;
  }

  /** All <Character Name="..." Color="..." Visible="..."/> rows under <CharacterHighlighting>. */
  getHighlightedCharacters(): XmlElement[] {
    const ch = this.getCharacterHighlightingElement();
    return ch ? findChildren(ch, "Character") : [];
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/fdx/document.test.ts`
Expected: PASS (all existing + 3 new).

Run: `bun test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/fdx/document.ts src/fdx/document.test.ts
git commit -m "Add FdxDocument accessors for <CharacterHighlighting>

getCharacterHighlightingElement/getHighlightedCharacters mirror the
existing getCastElement/getCastMembers pattern. Groundwork for
extending the cross-reference warning (Task 3) and rename_character
(Task 4) — nothing in the codebase touched this block before."
```

---

### Task 3: Extend the cross-reference warning to `<CharacterHighlighting>`

**Files:**
- Modify: `src/tools/breakdown.ts`
- Modify: `src/tools/edit-smarttype-characters.ts`
- Modify: `src/tools/edit-smarttype-characters.test.ts`

**Interfaces:**
- Consumes: `getHighlightedCharacters` (`src/fdx/document.ts`, Task 2).
- Produces: `countCharacterReferences(doc, name, cs): { cast: number; arcBeats: number; highlighting: number }`
  — same name, one more field.

- [ ] **Step 1: Write the failing test**

In `src/tools/edit-smarttype-characters.test.ts`, extend `fixtureWithReferences()`'s XML to add a
`<CharacterHighlighting>` entry for the same name, and update the warning-text assertion:

```typescript
function fixtureWithReferences(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-edit-characters-refs-"));
  const path = join(dir, "script.fdx");
  const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Scene Heading" id="sh1">
      <Text>INT. STRONGHOLD</Text>
      <SceneProperties>
        <SceneArcBeats>
          <CharacterArcBeat Name="DANAERIAN COMMANDER"/>
        </SceneArcBeats>
      </SceneProperties>
    </Paragraph>
  </Content>
  <SmartType>
    <Characters>
      <Character>DANAERIAN COMMANDER</Character>
    </Characters>
  </SmartType>
  <Cast>
    <Member Actor="Man 1" Character="DANAERIAN COMMANDER"/>
  </Cast>
  <CharacterHighlighting>
    <Character Name="DANAERIAN COMMANDER" Color="#0000FFFF0000" Visible="Yes"/>
  </CharacterHighlighting>
</FinalDraft>`;
  writeFileSync(path, source, "utf-8");
  return path;
}
```

and change the existing assertion:

```typescript
  test("remove warns when Cast/arc-beat rows still reference the removed name", async () => {
    const path = fixtureWithReferences();
    await handleReadFdx({ path });
    const result = await handleEditSmarttypeCharacters({ path, action: "remove", find: "DANAERIAN COMMANDER" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain(
      "Warning: 1 Cast member(s), 1 arc beat(s), and 1 CharacterHighlighting entry(ies) still reference this name.",
    );
  });
```

(Rename the test to `"remove warns when Cast/arc-beat/highlighting rows still reference the removed name"` while editing it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/tools/edit-smarttype-characters.test.ts`
Expected: FAIL — current message reads `"Warning: 1 Cast member(s) and 1 arc beat(s) still reference this name."`, missing the highlighting clause.

- [ ] **Step 3: Implement**

In `src/tools/breakdown.ts`, change `countCharacterReferences`:

```typescript
export function countCharacterReferences(doc: FdxDocument, name: string, cs: boolean): { cast: number; arcBeats: number; highlighting: number } {
  const match = (v: string) => (cs ? v === name : v.toLowerCase() === name.toLowerCase());

  const cast = doc.getCastMembers().filter((m) => match(getAttr(m, "Character") ?? "")).length;

  let arcBeats = 0;
  for (const p of doc.getParagraphElements()) {
    const sp = findChild(p, "SceneProperties");
    const arcBeatsEl = sp && findChild(sp, "SceneArcBeats");
    if (!arcBeatsEl) continue;
    arcBeats += findChildren(arcBeatsEl, "CharacterArcBeat").filter((b) => match(getAttr(b, "Name") ?? "")).length;
  }

  const highlighting = doc.getHighlightedCharacters().filter((c) => match(getAttr(c, "Name") ?? "")).length;

  return { cast, arcBeats, highlighting };
}
```

In `src/tools/edit-smarttype-characters.ts`, change `crossRefCheck`:

```typescript
function crossRefCheck(doc: FdxDocument, name: string, cs: boolean): string {
  const { cast, arcBeats, highlighting } = countCharacterReferences(doc, name, cs);
  if (cast === 0 && arcBeats === 0 && highlighting === 0) return "";
  return `Warning: ${cast} Cast member(s), ${arcBeats} arc beat(s), and ${highlighting} CharacterHighlighting entry(ies) still reference this name.`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/edit-smarttype-characters.test.ts`
Expected: PASS (all existing + updated test).

Run: `bun test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/breakdown.ts src/tools/edit-smarttype-characters.ts src/tools/edit-smarttype-characters.test.ts
git commit -m "Extend the Characters cross-reference warning to CharacterHighlighting

Wishlist item 3: edit_smarttype_characters action=remove already
warned about live Cast/arc-beat references left behind by a removal;
now also checks CharacterHighlighting, the third location a name can
be silently orphaned in."
```

---

### Task 4: `rename_character` tool

**Files:**
- Create: `src/tools/rename-character.ts`
- Create: `src/tools/rename-character.test.ts`

**Interfaces:**
- Consumes: `runPreservingReplace` (`src/tools/replace-text.ts`, Task 1), `getCharacterHighlightingElement`/
  `getHighlightedCharacters` (`src/fdx/document.ts`, Task 2), `editSmartList` (`src/tools/smart-type-ops.ts`,
  existing export), `getCastElement`/`getCastMembers` (`src/fdx/document.ts`, existing).
- Produces: `renameCharacterTool: FdxTool`, `handleRenameCharacter(args): Promise<ToolResult>`.

- [ ] **Step 1: Write the failing tests**

Create `src/tools/rename-character.test.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleRenameCharacter } from "./rename-character.ts";
import { documentCache } from "../fdx/cache.ts";

/** Builds a minimal .fdx with only the blocks a given test needs. */
function fixture(opts: {
  content?: string;
  characters?: string[];
  cast?: Array<{ character: string; actor: string }>;
  characterHighlighting?: Array<{ name: string; color: string; visible: string }>;
}): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-rename-character-"));
  const path = join(dir, "script.fdx");
  const charactersXml = opts.characters?.length
    ? `<Characters>${opts.characters.map((c) => `<Character>${c}</Character>`).join("")}</Characters>`
    : "";
  const castXml = opts.cast?.length
    ? `<Cast>${opts.cast.map((m) => `<Member Actor="${m.actor}" Character="${m.character}"/>`).join("")}</Cast>`
    : "";
  const highlightingXml = opts.characterHighlighting?.length
    ? `<CharacterHighlighting>${opts.characterHighlighting
        .map((h) => `<Character Name="${h.name}" Color="${h.color}" Visible="${h.visible}"/>`)
        .join("")}</CharacterHighlighting>`
    : "";
  const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>${opts.content ?? ""}</Content>
  <SmartType>${charactersXml}</SmartType>
  ${castXml}
  ${highlightingXml}
</FinalDraft>`;
  writeFileSync(path, source, "utf-8");
  return path;
}

async function rename(path: string, from: string, to: string, cs?: boolean) {
  await handleReadFdx({ path });
  return handleRenameCharacter({ path, from, to, cs });
}

function body(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[result.content.length - 1]!.text);
}

const CUE_CONTENT = `
  <Paragraph Type="Character" id="c1"><Text>OLD NAME</Text></Paragraph>
  <Paragraph Type="Dialogue" id="d1"><Text>Hello there.</Text></Paragraph>
  <Paragraph Type="Character" id="c2"><Text>OLD NAME (V.O.)</Text></Paragraph>
  <Paragraph Type="Dialogue" id="d2"><Text>Voice over line.</Text></Paragraph>
`;

describe("rename_character", () => {
  test("path/from/to are required", async () => {
    expect((await handleRenameCharacter({ from: "A", to: "B" })).isError).toBe(true);
    const path = fixture({});
    await handleReadFdx({ path });
    expect((await handleRenameCharacter({ path, to: "B" })).isError).toBe(true);
    expect((await handleRenameCharacter({ path, from: "A" })).isError).toBe(true);
  });

  test("from and to must differ", async () => {
    const path = fixture({ content: CUE_CONTENT });
    const result = await rename(path, "OLD NAME", "OLD NAME");
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("must be different");
  });

  test("errors when from is not found anywhere", async () => {
    const path = fixture({ content: CUE_CONTENT });
    const result = await rename(path, "ZZZ_NOT_A_CHARACTER", "SOMEONE ELSE");
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found anywhere");
  });

  test("renames Character-cue paragraphs, preserving extensions, and reports the other locations as not found", async () => {
    const path = fixture({ content: CUE_CONTENT });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    const b = body(result);
    expect(b.cueParagraphs).toEqual({ paragraphsTouched: 2, occurrencesReplaced: 2, skipped: [] });
    expect(b.smartTypeCharacters).toBe("not found");
    expect(b.castMember).toBe("not found");
    expect(b.characterHighlighting).toBe("not found");

    const doc = documentCache.get(path)!;
    const texts = doc.getParagraphElements().map((p) => p.children.find((c) => c.type === "element" && c.name === "Text"));
    expect(doc.serialize()).toContain("NEW NAME");
    expect(doc.serialize()).toContain("NEW NAME (V.O.)");
    expect(doc.serialize()).not.toContain("OLD NAME");
  });

  test("renames the SmartType Characters entry when to is not already present", async () => {
    const path = fixture({ characters: ["OLD NAME"] });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    expect(body(result).smartTypeCharacters).toBe("renamed");
    const doc = documentCache.get(path)!;
    expect(doc.getSmartTypeList("Character")!.values).toEqual(["NEW NAME"]);
  });

  test("merges SmartType Characters entries when to already exists", async () => {
    const path = fixture({ characters: ["OLD NAME", "NEW NAME"] });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    expect(body(result).smartTypeCharacters).toContain("removed");
    const doc = documentCache.get(path)!;
    expect(doc.getSmartTypeList("Character")!.values).toEqual(["NEW NAME"]);
  });

  test("renames the Cast Member row when to has no row", async () => {
    const path = fixture({ cast: [{ character: "OLD NAME", actor: "Voice A" }] });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    expect(body(result).castMember).toBe("renamed");
    const doc = documentCache.get(path)!;
    const members = doc.getCastMembers();
    expect(members.length).toBe(1);
    expect(members[0]!.attrs.find(([k]) => k === "Character")?.[1]).toBe("NEW NAME");
    expect(members[0]!.attrs.find(([k]) => k === "Actor")?.[1]).toBe("Voice A");
  });

  test("merges Cast rows when to already has one: drops from's row, keeps to's actor, warns", async () => {
    const path = fixture({
      cast: [
        { character: "OLD NAME", actor: "Voice A" },
        { character: "NEW NAME", actor: "Voice B" },
      ],
    });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    const b = body(result);
    expect(b.castMember).toContain("removed");
    expect((b.warnings as string[]).some((w) => w.includes("Voice A") && w.includes("Voice B"))).toBe(true);

    const doc = documentCache.get(path)!;
    const members = doc.getCastMembers();
    expect(members.length).toBe(1);
    expect(members[0]!.attrs.find(([k]) => k === "Actor")?.[1]).toBe("Voice B");
  });

  test("renames CharacterArcBeat entries across scenes", async () => {
    const path = fixture({
      content: `
        <Paragraph Type="Scene Heading" id="sh1"><Text>INT. A</Text>
          <SceneProperties><SceneArcBeats><CharacterArcBeat Name="OLD NAME"/></SceneArcBeats></SceneProperties>
        </Paragraph>
        <Paragraph Type="Scene Heading" id="sh2"><Text>INT. B</Text>
          <SceneProperties><SceneArcBeats><CharacterArcBeat Name="OLD NAME"/></SceneArcBeats></SceneProperties>
        </Paragraph>
      `,
    });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    expect(body(result).arcBeats).toEqual({ renamed: 2, conflictingScenes: [] });
  });

  test("leaves a scene's arc beat untouched when both from and to already have one there", async () => {
    const path = fixture({
      content: `
        <Paragraph Type="Scene Heading" id="sh1"><Text>INT. A</Text>
          <SceneProperties><SceneArcBeats>
            <CharacterArcBeat Name="OLD NAME"/>
            <CharacterArcBeat Name="NEW NAME"/>
          </SceneArcBeats></SceneProperties>
        </Paragraph>
        <Paragraph Type="Scene Heading" id="sh2"><Text>INT. B</Text>
          <SceneProperties><SceneArcBeats><CharacterArcBeat Name="OLD NAME"/></SceneArcBeats></SceneProperties>
        </Paragraph>
      `,
    });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    const b = body(result);
    expect(b.arcBeats).toEqual({ renamed: 1, conflictingScenes: ["sh1"] });
    expect((b.warnings as string[]).some((w) => w.includes("sh1"))).toBe(true);

    const doc = documentCache.get(path)!;
    const sh1 = doc.getParagraphElements().find((p) => p.attrs.find(([k]) => k === "id")?.[1] === "sh1")!;
    const names = sh1.children
      .find((c) => c.type === "element" && c.name === "SceneProperties")!
      .children.find((c) => c.type === "element" && c.name === "SceneArcBeats")!
      .children.filter((c) => c.type === "element" && c.name === "CharacterArcBeat")
      .map((c) => c.attrs.find(([k]) => k === "Name")?.[1]);
    expect(names.sort()).toEqual(["NEW NAME", "OLD NAME"]);
  });

  test("renames the CharacterHighlighting entry when to has none", async () => {
    const path = fixture({ characterHighlighting: [{ name: "OLD NAME", color: "#0000FFFF0000", visible: "Yes" }] });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    expect(body(result).characterHighlighting).toBe("renamed");
    const doc = documentCache.get(path)!;
    const rows = doc.getHighlightedCharacters();
    expect(rows.length).toBe(1);
    expect(rows[0]!.attrs.find(([k]) => k === "Name")?.[1]).toBe("NEW NAME");
    expect(rows[0]!.attrs.find(([k]) => k === "Color")?.[1]).toBe("#0000FFFF0000");
  });

  test("highlighting merge: keeps from's visible entry over to's sentinel, renamed to to", async () => {
    const path = fixture({
      characterHighlighting: [
        { name: "OLD NAME", color: "#0000FFFF0000", visible: "Yes" },
        { name: "NEW NAME", color: "#RRRRGGGGBBBB", visible: "No" },
      ],
    });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    expect(body(result).characterHighlighting).toContain("visible assignment");
    const doc = documentCache.get(path)!;
    const rows = doc.getHighlightedCharacters();
    expect(rows.length).toBe(1);
    expect(rows[0]!.attrs.find(([k]) => k === "Name")?.[1]).toBe("NEW NAME");
    expect(rows[0]!.attrs.find(([k]) => k === "Color")?.[1]).toBe("#0000FFFF0000");
  });

  test("highlighting merge: keeps to's entry when it's the visible one", async () => {
    const path = fixture({
      characterHighlighting: [
        { name: "OLD NAME", color: "#RRRRGGGGBBBB", visible: "No" },
        { name: "NEW NAME", color: "#0000FFFF0000", visible: "Yes" },
      ],
    });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    expect(body(result).characterHighlighting).toContain("removed");
    const doc = documentCache.get(path)!;
    const rows = doc.getHighlightedCharacters();
    expect(rows.length).toBe(1);
    expect(rows[0]!.attrs.find(([k]) => k === "Color")?.[1]).toBe("#0000FFFF0000");
  });

  test("highlighting merge: keeps to's entry when neither is visible", async () => {
    const path = fixture({
      characterHighlighting: [
        { name: "OLD NAME", color: "#RRRRGGGGBBBB", visible: "No" },
        { name: "NEW NAME", color: "#RRRRGGGGBBBB", visible: "No" },
      ],
    });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    const doc = documentCache.get(path)!;
    expect(doc.getHighlightedCharacters().length).toBe(1);
  });

  test("cs=true prevents a case-insensitive match", async () => {
    const path = fixture({ content: CUE_CONTENT });
    const result = await rename(path, "old name", "NEW NAME", true);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found anywhere");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/rename-character.test.ts`
Expected: FAIL — `Cannot find module './rename-character.ts'`.

- [ ] **Step 3: Implement**

Create `src/tools/rename-character.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * rename_character — renames or merges a character across all five places a name is stored:
 * Character-cue paragraphs, the SmartType Characters dictionary, Cast Member rows, CharacterArcBeat
 * entries in every scene's SceneProperties, and CharacterHighlighting. A merge (to already exists
 * somewhere) drops from's entry there rather than creating a duplicate, except a scene where both
 * from and to already have separate arc beats — arc beats carry authored notes as nested
 * paragraphs, so that scene is left untouched (with a warning) rather than destroying one side's
 * notes. Never touches <Actors> (binary voice-synthesis data) — only Cast's Character attribute.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { getAttr, setAttr, findChild, findChildren, type XmlElement } from "../fdx/xml.ts";
import { getParagraphId } from "../fdx/paragraph.ts";
import { editSmartList } from "./smart-type-ops.ts";
import { runPreservingReplace } from "./replace-text.ts";

export const renameCharacterTool: FdxTool = {
  name: "rename_character",
  description:
    "Rename (or merge) a character across every place its name is stored: Character-cue paragraphs (run-preserving substring replace, like replace_text), the SmartType Characters dictionary, Cast Member rows, CharacterArcBeat entries in every scene's SceneProperties, and CharacterHighlighting. A merge (to already exists somewhere) drops from's entry there rather than creating a duplicate — except a scene where both from and to already have separate arc beats, which is left untouched (with a warning) since arc beats carry authored notes that a drop would destroy. Errors if from isn't found in any of the five locations. Returns a JSON report of what was touched in each location, plus any warnings. Never touches <Actors>. After editing, call save_fdx to persist changes to disk.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      from: { type: "string", description: "the existing character name to rename (or merge away)" },
      to: { type: "string", description: "the new character name (or the existing name to merge into)" },
      cs: { type: "boolean", description: "match from/to case-sensitively (default false)" },
    },
    required: ["path", "from", "to"],
  },
};

function matchName(value: string, target: string, cs: boolean): boolean {
  return cs ? value === target : value.toLowerCase() === target.toLowerCase();
}

export async function handleRenameCharacter(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");

  const fromArg = arg<string>(args, "from");
  const toArg = arg<string>(args, "to");
  if (!fromArg) return errResult("from is required");
  if (!toArg) return errResult("to is required");
  const from = fromArg.trim();
  const to = toArg.trim();
  if (from === "") return errResult("from must not be empty");
  if (to === "") return errResult("to must not be empty");
  const cs = Boolean(args?.cs);
  if (matchName(from, to, cs)) return errResult("from and to must be different");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const warnings: string[] = [];
  let anyTouched = false;

  // Location 1: Character-cue paragraphs.
  const replaceResult = runPreservingReplace(doc, { find: from, replace: to, caseSensitive: cs, parType: "Character" });
  if (replaceResult.touched) anyTouched = true;

  // Location 2: SmartType Characters list.
  const charList = doc.getSmartTypeList("Character");
  const charValues = charList?.values ?? [];
  const fromInList = charValues.some((v) => matchName(v, from, cs));
  const toInList = charValues.some((v) => matchName(v, to, cs));
  let smartTypeCharacters: string;
  if (!fromInList) {
    smartTypeCharacters = "not found";
  } else if (toInList) {
    const result = editSmartList(charValues, { action: "remove", find: from, cs });
    doc.setSmartTypeList("Character", result.ok ? result.list : charValues);
    smartTypeCharacters = `removed (merged into existing "${to}" entry)`;
    anyTouched = true;
  } else {
    const result = editSmartList(charValues, { action: "edit", find: from, replace: to, cs });
    doc.setSmartTypeList("Character", result.ok ? result.list : charValues);
    smartTypeCharacters = "renamed";
    anyTouched = true;
  }

  // Location 3: Cast Member rows.
  const members = doc.getCastMembers();
  const fromMember = members.find((m) => matchName(getAttr(m, "Character") ?? "", from, cs));
  const toMember = members.find((m) => matchName(getAttr(m, "Character") ?? "", to, cs));
  let castMember: string;
  if (!fromMember) {
    castMember = "not found";
  } else if (toMember) {
    const cast = doc.getCastElement()!;
    const idx = cast.children.indexOf(fromMember);
    if (idx !== -1) cast.children.splice(idx, 1);
    const droppedActor = getAttr(fromMember, "Actor") ?? "";
    const keptActor = getAttr(toMember, "Actor") ?? "";
    warnings.push(`Dropped Cast row for "${from}" (actor "${droppedActor}") — "${to}" already had actor "${keptActor}".`);
    castMember = `removed (merged into existing "${to}" row)`;
    anyTouched = true;
  } else {
    setAttr(fromMember, "Character", to);
    castMember = "renamed";
    anyTouched = true;
  }

  // Location 4: CharacterArcBeat entries.
  let arcBeatsRenamed = 0;
  const conflictingScenes: string[] = [];
  for (const p of doc.getParagraphElements()) {
    const sp = findChild(p, "SceneProperties");
    const arcBeatsEl = sp && findChild(sp, "SceneArcBeats");
    if (!arcBeatsEl) continue;
    const beats = findChildren(arcBeatsEl, "CharacterArcBeat");
    const fromBeat = beats.find((b) => matchName(getAttr(b, "Name") ?? "", from, cs));
    if (!fromBeat) continue;
    const toBeat = beats.find((b) => matchName(getAttr(b, "Name") ?? "", to, cs));
    if (toBeat) {
      conflictingScenes.push(getParagraphId(p));
      continue;
    }
    setAttr(fromBeat, "Name", to);
    arcBeatsRenamed++;
    anyTouched = true;
  }
  if (conflictingScenes.length > 0) {
    warnings.push(
      `Scene(s) ${conflictingScenes.join(", ")} already have an arc beat for "${to}"; left "${from}"'s beat and notes untouched there — consolidate manually if desired.`,
    );
  }

  // Location 5: CharacterHighlighting.
  const highlighted = doc.getHighlightedCharacters();
  const fromHi = highlighted.find((c) => matchName(getAttr(c, "Name") ?? "", from, cs));
  const toHi = highlighted.find((c) => matchName(getAttr(c, "Name") ?? "", to, cs));
  let characterHighlighting: string;
  if (!fromHi) {
    characterHighlighting = "not found";
  } else if (toHi) {
    const ch = doc.getCharacterHighlightingElement()!;
    const fromVisible = getAttr(fromHi, "Visible") === "Yes";
    const toVisible = getAttr(toHi, "Visible") === "Yes";
    if (fromVisible && !toVisible) {
      const idx = ch.children.indexOf(toHi as XmlElement);
      if (idx !== -1) ch.children.splice(idx, 1);
      setAttr(fromHi, "Name", to);
      characterHighlighting = `kept "${from}"'s entry (was the visible assignment), renamed to "${to}"`;
    } else {
      const idx = ch.children.indexOf(fromHi as XmlElement);
      if (idx !== -1) ch.children.splice(idx, 1);
      characterHighlighting = `removed (kept existing "${to}" entry)`;
    }
    anyTouched = true;
  } else {
    setAttr(fromHi, "Name", to);
    characterHighlighting = "renamed";
    anyTouched = true;
  }

  if (!anyTouched) {
    return errResult(
      `"${from}" not found anywhere (cue paragraphs, SmartType Characters, Cast, arc beats, or CharacterHighlighting)`,
    );
  }

  const dirtyWarning = documentCache.touchDirty(path, doc);
  const responseBody = {
    from,
    to,
    cueParagraphs: {
      paragraphsTouched: replaceResult.paragraphsTouched,
      occurrencesReplaced: replaceResult.totalReplaced,
      skipped: replaceResult.skipped,
    },
    smartTypeCharacters,
    castMember,
    arcBeats: { renamed: arcBeatsRenamed, conflictingScenes },
    characterHighlighting,
    warnings,
    message: `Successfully renamed "${from}" to "${to}". File updated in cache — call save_fdx to persist changes to disk.`,
  };

  return pushCacheWarning(pushCacheWarning(textResult(JSON.stringify(responseBody, null, 2)), dirtyWarning), warning);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/rename-character.test.ts`
Expected: PASS (16 tests).

Run: `bun test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/rename-character.ts src/tools/rename-character.test.ts
git commit -m "Add rename_character tool

Wishlist item 13: a single call renaming or merging a character
across all five places a name is stored (cue paragraphs, SmartType
Characters, Cast, arc beats, CharacterHighlighting), reporting what
happened in each location plus any merge-conflict warnings. Not yet
registered as an MCP tool (Task 5)."
```

---

### Task 5: Register the tool and sync documentation

**Files:**
- Modify: `src/index.ts`
- Modify: `src/tools/context-data.ts`
- Modify: `TOOLS.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Check: `README.md` (per this repo's `CLAUDE.md` doc-sync rule — expected to need no change, confirm rather than assume)

**Interfaces:** none new — wiring and docs only.

- [ ] **Step 1: Register in `src/index.ts`**

Add the import near the other `edit_*`/character-related tool imports (alongside
`editSmarttypeCharactersTool`):

```typescript
import { renameCharacterTool, handleRenameCharacter } from "./tools/rename-character.ts";
```

Add `renameCharacterTool,` to the tool-list array (near `editSmarttypeCharactersTool,`), and
`rename_character: (args) => handleRenameCharacter(args),` to the dispatch map (near
`edit_smarttype_characters:`).

- [ ] **Step 2: Add the `context-data.ts` catalog entry**

In `src/tools/context-data.ts`, insert into the `contextTools` array, near the
`edit_smarttype_characters` entry:

```typescript
  {
    name: "rename_character",
    description:
      "Rename (or merge) a character across every place its name is stored: cue paragraphs, SmartType Characters, Cast, arc beats, and CharacterHighlighting. Returns a JSON report of what was touched in each location.",
  },
```

- [ ] **Step 3: Run the full suite**

Run: `bun test`
Expected: all PASS — confirms registration didn't break `context-data.test.ts`'s
"every tool has a unique, non-empty name/description" check or anything in `index.ts`.

- [ ] **Step 4: Update `TOOLS.md`**

Add a new row near the `edit_smarttype_characters` row:

```
| rename_character           | path, from, to, cs?                                                                                                                                                                                                                                                                   | Rename (or merge) a character across every place its name is stored: Character-cue paragraphs, the SmartType Characters dictionary, Cast Member rows, CharacterArcBeat entries, and CharacterHighlighting. Returns a JSON report of what was touched in each location, plus any warnings. After editing, call save_fdx to persist changes to disk. |
```

Increment the tool count header line by 1 (from whatever `TOOLS.md` currently says at the top —
check its current value before editing, since it may have changed since this plan was written).

- [ ] **Step 5: Update `CHANGELOG.md`**

Add a new version section above the current top entry:

```markdown
## [<next-patch-version>] - 2026-08-02

### Added

- **`rename_character`** tool — renames or merges a character across all five places a name is stored: Character-cue paragraphs (run-preserving substring replace), the SmartType Characters dictionary, `<Cast>` Member rows, `CharacterArcBeat` entries in every scene's `SceneProperties`, and `<CharacterHighlighting>` (a location nothing in the codebase touched before this). A merge — `to` already exists somewhere — drops `from`'s entry there rather than creating a duplicate, except a scene where both names already have separate arc beats, left untouched (with a warning) since arc beats carry authored notes a drop would destroy. Returns a JSON report of what happened in each location.

### Changed

- **`edit_smarttype_characters`'s cross-reference warning on `action=remove`** now also checks `<CharacterHighlighting>`, not just Cast and arc beats.
```

Determine `<next-patch-version>` from `package.json`'s current version at implementation time
(increment the patch number by 1).

- [ ] **Step 6: Bump `package.json`**

Set `"version"` to the same `<next-patch-version>` used in the changelog entry.

- [ ] **Step 7: Check `README.md`**

Read `README.md` and confirm whether it enumerates individual tools or a tool count anywhere (per
this repo's `CLAUDE.md` doc-sync rule, this must be checked, not assumed). If it doesn't — as of
this plan's writing it doesn't — no change is needed; note that explicitly in the commit message
rather than silently skipping the file.

- [ ] **Step 8: Run the full suite one more time**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/index.ts src/tools/context-data.ts TOOLS.md CHANGELOG.md package.json
git commit -m "Register rename_character; update TOOLS.md/CHANGELOG.md; bump version

README.md checked per the doc-sync rule in CLAUDE.md — it doesn't
enumerate individual tools, so no change needed there."
```

## Self-Review Notes

- **Spec coverage:** all five locations (Task 4), the cross-reference extension (Task 3), and the
  `<CharacterHighlighting>` accessors (Task 2) map directly to spec sections 1/4, and the shared
  helper extraction (Task 1) matches spec section 2. Documentation requirements map to Task 5.
- **Type consistency:** `RunPreservingReplaceResult` (Task 1) is consumed by `rename-character.ts`
  (Task 4) using exactly the field names defined in Task 1 (`totalReplaced`, `paragraphsTouched`,
  `skipped`) — checked against both task's code blocks.
- **`editSmartList` reuse:** confirmed its existing signature (`editSmartList(list, edit): { ok: true; list: string[] } | { ok: false; reason: string }`)
  matches how Task 4 calls it (`ok` is always `true` here since `from`'s presence in the list was
  already checked before calling, but the `result.ok ? result.list : charValues` fallback keeps the
  code safe against that assumption being wrong without crashing).
