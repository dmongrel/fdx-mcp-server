# create_dialogue + diff_fdx Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement wishlist Phase F + G per
`docs/superpowers/specs/2026-08-02-create-dialogue-and-diff-fdx-design.md`: `create_dialogue` (item
9), an atomic Character/[Parenthetical]/Dialogue group creator, and `diff_fdx` (item 11), a
paragraph-level id-based diff between two documents.

**Architecture:** Two independent new tools, no shared code between them beyond the usual
`shared.ts`/`fdx/*` helpers. `create_dialogue` generalizes `edit_par`'s create-branch mechanics to
several contiguous paragraphs; `diff_fdx` is a straightforward two-map comparison over
`getParagraphElements()`.

**Tech Stack:** TypeScript, Bun test runner, existing MCP tool-registration pattern in `src/index.ts`.

## Global Constraints

- Bun-first, Deno-compatible — no Bun/Node-only APIs beyond what's already in the codebase.
- `bun test` must stay green after every task.
- `create_dialogue` never validates surrounding document context beyond the paragraphs it itself
  creates (see spec's "Explicitly out of scope").
- `diff_fdx` never mutates either document.
- Every `ToolResult.content` entry is `{ type: "text"; text: string }`.

---

### Task 1: `create_dialogue` tool

**Files:**
- Create: `src/tools/create-dialogue.ts`
- Create: `src/tools/create-dialogue.test.ts`

**Interfaces:**
- Consumes: `buildParagraphElement`, `getParagraphId` (`src/fdx/paragraph.ts`, existing exports),
  `addSmartTypeValue` (`src/tools/edit-par.ts`, existing export), `generateUuid` (`src/fdx/uuid.ts`).
- Produces: `createDialogueTool: FdxTool`, `handleCreateDialogue(args): Promise<ToolResult>`.

- [ ] **Step 1: Write the failing tests**

Create `src/tools/create-dialogue.test.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleCreateDialogue } from "./create-dialogue.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, getParagraphType, paragraphText } from "../fdx/paragraph.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");
const FIXTURE_SOURCE = readFileSync(FIXTURE_PATH, "utf-8");

function freshDoc(key: string): { path: string; doc: FdxDocument } {
  const path = join(import.meta.dir, `create-dialogue-${key}.fdx`);
  const doc = FdxDocument.parse(FIXTURE_SOURCE, path);
  documentCache.set(path, doc);
  return { path, doc };
}

describe("create_dialogue", () => {
  test("path, character, and dialogue are required", async () => {
    expect((await handleCreateDialogue({ character: "X", dialogue: "y" })).isError).toBe(true);
    const { path } = freshDoc("missing-fields");
    expect((await handleCreateDialogue({ path, dialogue: "y" })).isError).toBe(true);
    expect((await handleCreateDialogue({ path, character: "X" })).isError).toBe(true);
  });

  test("creates a contiguous Character/Dialogue pair with no parenthetical", async () => {
    const { path, doc } = freshDoc("pair-only");
    const before = doc.getParagraphElements().length;

    const result = await handleCreateDialogue({ path, character: "ZZZ NEW SPEAKER", dialogue: "Hello there." });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[result.content.length - 1]!.text);
    expect(body.parentheticalId).toBeNull();
    expect(typeof body.characterId).toBe("string");
    expect(typeof body.dialogueId).toBe("string");

    const after = doc.getParagraphElements();
    expect(after.length).toBe(before + 2);
    const charIdx = after.findIndex((p) => getParagraphId(p) === body.characterId);
    const dialogueIdx = after.findIndex((p) => getParagraphId(p) === body.dialogueId);
    expect(dialogueIdx).toBe(charIdx + 1);
    expect(getParagraphType(after[charIdx]!)).toBe("Character");
    expect(paragraphText(after[charIdx]!)).toBe("ZZZ NEW SPEAKER");
    expect(getParagraphType(after[dialogueIdx]!)).toBe("Dialogue");
    expect(paragraphText(after[dialogueIdx]!)).toBe("Hello there.");
  });

  test("creates a contiguous Character/Parenthetical/Dialogue group", async () => {
    const { path, doc } = freshDoc("with-parenthetical");
    const before = doc.getParagraphElements().length;

    const result = await handleCreateDialogue({
      path,
      character: "ZZZ SPEAKER TWO",
      parenthetical: "(shouting)",
      dialogue: "Get down!",
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[result.content.length - 1]!.text);
    expect(typeof body.parentheticalId).toBe("string");

    const after = doc.getParagraphElements();
    expect(after.length).toBe(before + 3);
    const charIdx = after.findIndex((p) => getParagraphId(p) === body.characterId);
    const parenIdx = after.findIndex((p) => getParagraphId(p) === body.parentheticalId);
    const dialogueIdx = after.findIndex((p) => getParagraphId(p) === body.dialogueId);
    expect(parenIdx).toBe(charIdx + 1);
    expect(dialogueIdx).toBe(parenIdx + 1);
    expect(getParagraphType(after[parenIdx]!)).toBe("Parenthetical");
    expect(paragraphText(after[parenIdx]!)).toBe("(shouting)");
  });

  test("adds character's text to the SmartType Characters list", async () => {
    const { path, doc } = freshDoc("smarttype-refresh");
    await handleCreateDialogue({ path, character: "ZZZ THIRD SPEAKER", dialogue: "Hi." });
    const list = doc.getSmartTypeList("Character")!;
    expect(list.values).toContain("ZZZ THIRD SPEAKER");
  });

  test("beforeParId inserts the group immediately before the anchor", async () => {
    const { path, doc } = freshDoc("before-anchor");
    const anchor = doc.getParagraphElements()[2]!;
    const anchorId = getParagraphId(anchor);

    const result = await handleCreateDialogue({ path, character: "ZZZ BEFORE", dialogue: "x", beforeParId: anchorId });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[result.content.length - 1]!.text);

    const paragraphs = doc.getParagraphElements();
    const anchorIdx = paragraphs.findIndex((p) => getParagraphId(p) === anchorId);
    expect(getParagraphId(paragraphs[anchorIdx - 2]!)).toBe(body.characterId);
    expect(getParagraphId(paragraphs[anchorIdx - 1]!)).toBe(body.dialogueId);
  });

  test("afterParId inserts the group immediately after the anchor", async () => {
    const { path, doc } = freshDoc("after-anchor");
    const anchor = doc.getParagraphElements()[2]!;
    const anchorId = getParagraphId(anchor);

    const result = await handleCreateDialogue({ path, character: "ZZZ AFTER", dialogue: "x", afterParId: anchorId });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[result.content.length - 1]!.text);

    const paragraphs = doc.getParagraphElements();
    const anchorIdx = paragraphs.findIndex((p) => getParagraphId(p) === anchorId);
    expect(getParagraphId(paragraphs[anchorIdx + 1]!)).toBe(body.characterId);
    expect(getParagraphId(paragraphs[anchorIdx + 2]!)).toBe(body.dialogueId);
  });

  test("an unknown anchor id fails and creates nothing", async () => {
    const { path, doc } = freshDoc("bad-anchor");
    const before = doc.getParagraphElements().length;

    const result = await handleCreateDialogue({ path, character: "X", dialogue: "y", beforeParId: "does-not-exist" });
    expect(result.isError).toBe(true);
    expect(doc.getParagraphElements().length).toBe(before);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/create-dialogue.test.ts`
Expected: FAIL — `Cannot find module './create-dialogue.ts'`.

- [ ] **Step 3: Implement**

Create `src/tools/create-dialogue.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * create_dialogue — creates a Character/[Parenthetical]/Dialogue group as one atomic, contiguous
 * insertion, so a new speech never leaves the document in the invalid intermediate state that two
 * or three separate edit_par creates would (Dialogue is invalid unless immediately preceded by
 * Character or Parenthetical, per get_context's Dialogue Sequence rule). Validity is structural:
 * this tool only ever builds Character -> [Parenthetical] -> Dialogue, contiguously, in that order,
 * so there is no separate "check the rule" step.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { generateUuid } from "../fdx/uuid.ts";
import { buildParagraphElement, getParagraphId } from "../fdx/paragraph.ts";
import { addSmartTypeValue } from "./edit-par.ts";
import type { XmlElement } from "../fdx/xml.ts";

export const createDialogueTool: FdxTool = {
  name: "create_dialogue",
  description:
    "Create a Character/[Parenthetical]/Dialogue group as one atomic, contiguous insertion — a new speech in a single call, instead of two or three separate edit_par creates that leave the document in an invalid intermediate state in between (Dialogue is invalid unless immediately preceded by Character or Parenthetical). Use beforeParId or afterParId to control insertion position (falls back to append). character's text is added to the SmartType Characters list, same as edit_par action=create type=Character. Returns {characterId, parentheticalId, dialogueId, message} as JSON. After editing, call save_fdx to persist changes to disk.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      character: { type: "string", description: 'the Character cue text, e.g. "GROG" or "GROG (V.O.)"' },
      dialogue: { type: "string", description: "the Dialogue text" },
      parenthetical: {
        type: "string",
        description: "optional Parenthetical text, inserted between Character and Dialogue",
      },
      beforeParId: { type: "string", description: "the paragraph id to insert the group before" },
      afterParId: { type: "string", description: "the paragraph id to insert the group after" },
    },
    required: ["path", "character", "dialogue"],
  },
};

export async function handleCreateDialogue(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");

  const character = arg<string>(args, "character");
  const dialogue = arg<string>(args, "dialogue");
  const parenthetical = arg<string>(args, "parenthetical");
  if (!character) return errResult("character is required");
  if (!dialogue) return errResult("dialogue is required");

  const beforeParId = arg<string>(args, "beforeParId");
  const afterParId = arg<string>(args, "afterParId");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const content = doc.getContentElement(true)!;
  const paragraphs = doc.getParagraphElements();

  let insertPos: number;
  if (beforeParId) {
    const idx = paragraphs.findIndex((p) => getParagraphId(p) === beforeParId);
    if (idx === -1) return errResult("failed to create dialogue: anchor paragraph not found");
    insertPos = content.children.indexOf(paragraphs[idx]!);
  } else if (afterParId) {
    const idx = paragraphs.findIndex((p) => getParagraphId(p) === afterParId);
    if (idx === -1) return errResult("failed to create dialogue: anchor paragraph not found");
    insertPos = content.children.indexOf(paragraphs[idx]!) + 1;
  } else {
    insertPos = content.children.length;
  }

  const characterId = generateUuid();
  const dialogueId = generateUuid();
  const characterPara = buildParagraphElement("Character", characterId, undefined, [{ content: character }]);
  const dialoguePara = buildParagraphElement("Dialogue", dialogueId, undefined, [{ content: dialogue }]);

  const group: XmlElement[] = [characterPara];
  let parentheticalId: string | null = null;
  if (parenthetical) {
    parentheticalId = generateUuid();
    group.push(buildParagraphElement("Parenthetical", parentheticalId, undefined, [{ content: parenthetical }]));
  }
  group.push(dialoguePara);

  content.children.splice(insertPos, 0, ...group);

  addSmartTypeValue(doc, "Character", character);

  const dirtyWarning = documentCache.touchDirty(path, doc);
  const body = {
    characterId,
    parentheticalId,
    dialogueId,
    message:
      "Successfully created a Character/Dialogue group. File updated in cache — call save_fdx to persist changes to disk.",
  };
  return pushCacheWarning(pushCacheWarning(textResult(JSON.stringify(body, null, 2)), dirtyWarning), warning);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/create-dialogue.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the full suite**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tools/create-dialogue.ts src/tools/create-dialogue.test.ts
git commit -m "Add create_dialogue tool

Wishlist item 9: a Character/[Parenthetical]/Dialogue group created as
one atomic, contiguous insertion, so a new speech never leaves the
document in the invalid intermediate state two or three separate
edit_par creates would. Validity is structural -- the tool only ever
builds that exact contiguous order, no separate check needed. Not yet
registered as an MCP tool."
```

---

### Task 2: `diff_fdx` tool

**Files:**
- Create: `src/tools/diff-fdx.ts`
- Create: `src/tools/diff-fdx.test.ts`

**Interfaces:**
- Consumes: `getCachedFdx` (`src/tools/shared.ts`, existing export), `getParagraphId`/
  `getParagraphType`/`paragraphText` (`src/fdx/paragraph.ts`, existing exports).
- Produces: `diffFdxTool: FdxTool`, `handleDiffFdx(args): Promise<ToolResult>`.

- [ ] **Step 1: Write the failing tests**

Create `src/tools/diff-fdx.test.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleDiffFdx } from "./diff-fdx.ts";

function fixture(paragraphsXml: string): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-diff-fdx-"));
  const path = join(dir, "script.fdx");
  const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>${paragraphsXml}</Content>
</FinalDraft>`;
  writeFileSync(path, source, "utf-8");
  return path;
}

function body(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[result.content.length - 1]!.text);
}

const P1 = '<Paragraph Type="Scene Heading" id="p1"><Text>INT. CAVE - NIGHT</Text></Paragraph>';
const P2 = '<Paragraph Type="Action" id="p2"><Text>A fire crackles.</Text></Paragraph>';
const P3 = '<Paragraph Type="Character" id="p3"><Text>GROG</Text></Paragraph>';

describe("diff_fdx", () => {
  test("pathA and pathB are required", async () => {
    expect((await handleDiffFdx({ pathB: "b.fdx" })).isError).toBe(true);
    expect((await handleDiffFdx({ pathA: "a.fdx" })).isError).toBe(true);
  });

  test("identical documents report everything unchanged", async () => {
    const pathA = fixture(P1 + P2 + P3);
    const pathB = fixture(P1 + P2 + P3);
    const result = await handleDiffFdx({ pathA, pathB });
    expect(result.isError).toBeFalsy();
    const b = body(result);
    expect(b.added).toEqual([]);
    expect(b.removed).toEqual([]);
    expect(b.modified).toEqual([]);
    expect(b.unchangedCount).toBe(3);
  });

  test("a paragraph only in B is added", async () => {
    const pathA = fixture(P1 + P2);
    const pathB = fixture(P1 + P2 + P3);
    const b = body(await handleDiffFdx({ pathA, pathB }));
    expect(b.added).toEqual([{ id: "p3", type: "Character", text: "GROG" }]);
    expect(b.removed).toEqual([]);
  });

  test("a paragraph only in A is removed", async () => {
    const pathA = fixture(P1 + P2 + P3);
    const pathB = fixture(P1 + P2);
    const b = body(await handleDiffFdx({ pathA, pathB }));
    expect(b.removed).toEqual([{ id: "p3", type: "Character", text: "GROG" }]);
    expect(b.added).toEqual([]);
  });

  test("a paragraph with the same id and changed text is modified", async () => {
    const pathA = fixture(P1 + '<Paragraph Type="Action" id="p2"><Text>Before text.</Text></Paragraph>');
    const pathB = fixture(P1 + '<Paragraph Type="Action" id="p2"><Text>After text.</Text></Paragraph>');
    const b = body(await handleDiffFdx({ pathA, pathB }));
    expect(b.modified).toEqual([
      { id: "p2", before: { type: "Action", text: "Before text." }, after: { type: "Action", text: "After text." } },
    ]);
  });

  test("a paragraph with the same id and changed type (same text) is modified", async () => {
    const pathA = fixture('<Paragraph Type="Action" id="p2"><Text>Same text.</Text></Paragraph>');
    const pathB = fixture('<Paragraph Type="Dialogue" id="p2"><Text>Same text.</Text></Paragraph>');
    const b = body(await handleDiffFdx({ pathA, pathB }));
    expect(b.modified).toEqual([
      { id: "p2", before: { type: "Action", text: "Same text." }, after: { type: "Dialogue", text: "Same text." } },
    ]);
  });

  test("a paragraph that only moved position is unchanged", async () => {
    const pathA = fixture(P1 + P2 + P3);
    const pathB = fixture(P3 + P1 + P2); // reordered, content identical
    const b = body(await handleDiffFdx({ pathA, pathB }));
    expect(b.added).toEqual([]);
    expect(b.removed).toEqual([]);
    expect(b.modified).toEqual([]);
    expect(b.unchangedCount).toBe(3);
  });

  test("summary counts match the lists' lengths", async () => {
    const pathA = fixture(P1 + P2 + P3);
    const pathB = fixture(P1 + '<Paragraph Type="Action" id="p2"><Text>changed</Text></Paragraph>');
    const b = body(await handleDiffFdx({ pathA, pathB }));
    expect((b.removed as unknown[]).length).toBe(1); // p3 gone
    expect((b.modified as unknown[]).length).toBe(1); // p2 changed
    expect(b.unchangedCount).toBe(1); // p1
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/diff-fdx.test.ts`
Expected: FAIL — `Cannot find module './diff-fdx.ts'`.

- [ ] **Step 3: Implement**

Create `src/tools/diff-fdx.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * diff_fdx — Read-Only. Diffs two .fdx documents' top-level body paragraphs by id: which were
 * added, removed, or modified (type and/or text changed) going from pathA to pathB. Ids are stable
 * UUIDs preserved across edits and saves (including versioned ones), so id-based matching answers
 * "which paragraphs changed" for the exact workflow that motivated this — confirming what a
 * versioned save actually changed, not just how many paragraphs moved.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import { getParagraphId, getParagraphType, paragraphText } from "../fdx/paragraph.ts";

export const diffFdxTool: FdxTool = {
  name: "diff_fdx",
  description:
    "Read-Only. Diffs two .fdx documents' top-level body paragraphs by id: added (in pathB, not pathA), removed (in pathA, not pathB), and modified (present in both but type and/or text differs, reported as before/after). Everything else is folded into unchangedCount. Scoped to type+text only — not run-level styling, and not reordering (a paragraph that only moved position is unchanged). Loads both paths the same way any tool loads one (auto-loads on a cache miss).",
  inputSchema: {
    type: "object",
    properties: {
      pathA: { type: "string", description: "the baseline .fdx file" },
      pathB: { type: "string", description: "the .fdx file to compare against pathA" },
    },
    required: ["pathA", "pathB"],
  },
};

interface DiffParagraph {
  id: string;
  type: string;
  text: string;
}

export async function handleDiffFdx(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const pathA = arg<string>(args, "pathA");
  const pathB = arg<string>(args, "pathB");
  if (!pathA) return errResult("pathA is required");
  if (!pathB) return errResult("pathB is required");

  let warningA: string;
  let warningB: string;
  let mapA: Map<string, DiffParagraph>;
  let mapB: Map<string, DiffParagraph>;
  try {
    const loadedA = await getCachedFdx(pathA);
    warningA = loadedA.warning;
    mapA = new Map(
      loadedA.doc.getParagraphElements().map((p) => {
        const id = getParagraphId(p);
        return [id, { id, type: getParagraphType(p), text: paragraphText(p) }];
      }),
    );

    const loadedB = await getCachedFdx(pathB);
    warningB = loadedB.warning;
    mapB = new Map(
      loadedB.doc.getParagraphElements().map((p) => {
        const id = getParagraphId(p);
        return [id, { id, type: getParagraphType(p), text: paragraphText(p) }];
      }),
    );
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const added: DiffParagraph[] = [];
  const removed: DiffParagraph[] = [];
  const modified: Array<{ id: string; before: { type: string; text: string }; after: { type: string; text: string } }> = [];
  let unchangedCount = 0;

  for (const [id, a] of mapA) {
    const b = mapB.get(id);
    if (!b) {
      removed.push(a);
      continue;
    }
    if (a.type !== b.type || a.text !== b.text) {
      modified.push({ id, before: { type: a.type, text: a.text }, after: { type: b.type, text: b.text } });
    } else {
      unchangedCount++;
    }
  }
  for (const [id, b] of mapB) {
    if (!mapA.has(id)) added.push(b);
  }

  const body = {
    pathA,
    pathB,
    added,
    removed,
    modified,
    unchangedCount,
    message: `${added.length} added, ${removed.length} removed, ${modified.length} modified, ${unchangedCount} unchanged.`,
  };

  return pushCacheWarning(pushCacheWarning(textResult(JSON.stringify(body, null, 2)), warningB), warningA);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/diff-fdx.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the full suite**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tools/diff-fdx.ts src/tools/diff-fdx.test.ts
git commit -m "Add diff_fdx tool

Wishlist item 11: diffs two documents' top-level body paragraphs by
id -- added, removed, modified (type/text, before/after) -- so
confirming what a versioned save actually changed no longer means
external tooling or a paragraph-count comparison. Loads both paths via
the existing getCachedFdx auto-load, same as any other tool; no new
cache capability needed. Not yet registered as an MCP tool."
```

---

### Task 3: Register both tools; documentation sync

**Files:**
- Modify: `src/index.ts`
- Modify: `src/tools/context-data.ts`
- Modify: `TOOLS.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Check: `README.md`

**Interfaces:** none new — wiring and docs only.

- [ ] **Step 1: Register in `src/index.ts`**

Add imports near `editParTool`/`replaceTextTool`:

```typescript
import { createDialogueTool, handleCreateDialogue } from "./tools/create-dialogue.ts";
import { diffFdxTool, handleDiffFdx } from "./tools/diff-fdx.ts";
```

Add `createDialogueTool,` and `diffFdxTool,` to the tool-list array, and to the dispatch map:

```typescript
  create_dialogue: (args) => handleCreateDialogue(args),
  diff_fdx: (args) => handleDiffFdx(args),
```

- [ ] **Step 2: Add `context-data.ts` catalog entries**

In `contextTools`, near `edit_par`:

```typescript
  {
    name: "create_dialogue",
    description:
      "Create a Character/[Parenthetical]/Dialogue group as one atomic, contiguous insertion — a new speech in a single call. Use beforeParId or afterParId to control insertion position. Returns {characterId, parentheticalId, dialogueId, message} as JSON.",
  },
```

Near `get_par`/read-only analysis tools:

```typescript
  {
    name: "diff_fdx",
    description:
      "Read-Only. Diffs two documents' top-level body paragraphs by id: added, removed, and modified (type/text, before/after). Everything else is folded into unchangedCount.",
  },
```

In `contextRules`, extend the existing "Dialogue Sequence" rule's content to mention the new tool
(targeted edit — insert one clause, don't rewrite the whole string):

```typescript
  {
    title: "Dialogue Sequence",
    content:
      "Speaking requires a strict chain: Character -> [Parenthetical] -> Dialogue. A Dialogue paragraph is invalid unless preceded immediately by Character or Parenthetical. create_dialogue creates a valid group in one call instead of two or three separate edit_par creates that leave the document in an invalid intermediate state in between.",
  },
```

- [ ] **Step 3: Run the full suite**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 4: Update `TOOLS.md`**

Add two new rows near `edit_par` (`create_dialogue`) and near `find_par`/`get_section` (`diff_fdx`):

```
| create_dialogue           | path, character, dialogue, parenthetical?, beforeParId?, afterParId?                                                                                                                                                                                                                | Create a Character/[Parenthetical]/Dialogue group as one atomic, contiguous insertion — a new speech in a single call, instead of two or three separate edit_par creates that leave the document in an invalid intermediate state in between. Use beforeParId or afterParId to control insertion position (falls back to append). character's text is added to the SmartType Characters list. Returns {characterId, parentheticalId, dialogueId, message} as JSON. After editing, call save_fdx to persist changes to disk. |
| diff_fdx                  | pathA, pathB                                                                                                                                                                                                                                                                          | Read-Only. Diffs two documents' top-level body paragraphs by id: added, removed, and modified (type/text, before/after). Everything else is folded into unchangedCount. Not run-level styling; not reordering.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
```

Increment the tool count header line by 2.

- [ ] **Step 5: Update `CHANGELOG.md`**

Add a new version entry above the current top entry:

```markdown
## [<next-patch-version>] - 2026-08-02

### Added

- **`create_dialogue`** tool — creates a Character/[Parenthetical]/Dialogue group as one atomic, contiguous insertion, so a new speech no longer leaves the document in the invalid intermediate state two or three separate `edit_par` creates would (Dialogue is invalid unless immediately preceded by Character or Parenthetical). `character`'s text is added to the SmartType Characters list, same as `edit_par action=create type=Character`.
- **`diff_fdx`** tool — diffs two documents' top-level body paragraphs by id: added, removed, and modified (type and/or text, reported before/after). Confirming what a versioned save actually changed no longer means external tooling or a paragraph-count comparison.
```

Determine `<next-patch-version>` from `package.json`'s current version at implementation time
(increment the patch number by 1).

- [ ] **Step 6: Bump `package.json`**

Set `"version"` to the same `<next-patch-version>` used in the changelog entry.

- [ ] **Step 7: Check `README.md`**

Read `README.md`'s Features list. Add bullets fitting the existing style if warranted — e.g. a
`create_dialogue` mention could extend the existing "Dialogue Sequence"-adjacent capability
description (there isn't a dedicated bullet for paragraph creation today, so check whether one of
the existing bullets is the natural home or a new one is warranted), and a `diff_fdx` bullet near
"Document lifecycle". Confirm and draft at implementation time rather than assuming either way.

- [ ] **Step 8: Run the full suite one more time**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/index.ts src/tools/context-data.ts TOOLS.md CHANGELOG.md package.json README.md
git commit -m "Register create_dialogue/diff_fdx; update docs; bump version"
```

## Self-Review Notes

- **Spec coverage:** `create_dialogue` (spec section 1) maps to Task 1; `diff_fdx` (section 2) maps
  to Task 2; documentation requirements map to Task 3.
- **Independence confirmed:** Tasks 1 and 2 share no code and can be implemented/tested in either
  order or in parallel; Task 3 is the only point where they're combined (shared registration/docs
  commit), matching the spec's own framing of these as two unrelated items bundled into one document
  for convenience, not because they're coupled.
- **Type consistency:** `create_dialogue`'s response fields (`characterId`, `parentheticalId`,
  `dialogueId`) and `diff_fdx`'s (`added`/`removed`/`modified`/`unchangedCount`) match between each
  tool's implementation code and its own test assertions.
