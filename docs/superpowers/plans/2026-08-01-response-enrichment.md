# Response Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement wishlist Phase A (items 1, 2+3, 4, 14) per
`docs/superpowers/specs/2026-08-01-response-enrichment-design.md`: `edit_par`/`edit_dual_dialogue`
`action=create` return the new id; `find_par` reports containing scene + page per hit;
`get_section` gains ids and absorbs `get_section_par_list`; `get_par_runs` accepts a batch of
paragraph ids or a whole section.

**Architecture:** Five small, independent tool-file changes sharing two new/exported helpers
(`findContainingSectionIndex` in `src/fdx/sections.ts`, `getSceneProperties` exported from
`src/tools/breakdown.ts`). No new files except the two deletions (`get-section-par-list.ts` and its
test) and one new tiny test file for the new sections.ts helper.

**Tech Stack:** TypeScript, Bun test runner, existing MCP tool-registration pattern in `src/index.ts`.

## Global Constraints

- Bun-first, Deno-compatible — don't use Bun- or Node-only APIs that Deno can't run (this codebase
  already avoids that; just don't introduce new ones).
- Every `ToolResult.content` entry is `{ type: "text"; text: string }` — JSON output is a `text`
  block containing `JSON.stringify(...)`, not a different content type.
- Match existing file conventions: SPDX header (`// SPDX-FileCopyrightText: 2026 Joel L. Caesar` /
  `// SPDX-License-Identifier: MIT`) at the top of every source file; a top-of-file doc comment
  describing the tool and, where applicable, which Go file it mirrors.
- `bun test` must stay green after every task.
- No behavior changes beyond what's specified here — don't touch `action=edit`/`action=remove` on
  `edit_par`/`edit_dual_dialogue`, don't touch other SmartType or spell-check tools.

---

### Task 1: `findContainingSectionIndex` helper + export `getSceneProperties`

**Files:**
- Modify: `src/fdx/sections.ts`
- Modify: `src/tools/breakdown.ts:76` (add `export`)
- Create: `src/fdx/sections.test.ts`

**Interfaces:**
- Produces: `findContainingSectionIndex(paragraphs: XmlElement[], index: number): number` — exported
  from `src/fdx/sections.ts`. Scans backward from `index` (inclusive) for the nearest
  section-type paragraph; returns its index, or `-1` if `index` is before the first section heading
  in the document.
- Produces: `getSceneProperties(p: XmlElement): { color: string; length: string; page: string; title: string } | undefined`
  — now exported from `src/tools/breakdown.ts` (was module-private). Reads a paragraph's
  `<SceneProperties>` child; `page` is the raw `Page` attribute string (`""` if absent), not parsed.
- Consumes (in `sections.test.ts`): `isSectionType` (existing export from `src/fdx/sections.ts`) to
  build synthetic paragraph fixtures without needing a real `.fdx` file.

- [ ] **Step 1: Write the failing test**

Create `src/fdx/sections.test.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { findContainingSectionIndex } from "./sections.ts";
import type { XmlElement } from "./xml.ts";

function par(type: string, id: string): XmlElement {
  return { type: "element", name: "Paragraph", attrs: [["Type", type], ["id", id]], children: [] };
}

describe("findContainingSectionIndex", () => {
  test("returns the index of the nearest preceding section-type paragraph", () => {
    const paragraphs = [
      par("Scene Heading", "scene-1"),
      par("Action", "action-1"),
      par("Dialogue", "dialogue-1"),
      par("Scene Heading", "scene-2"),
      par("Action", "action-2"),
    ];
    expect(findContainingSectionIndex(paragraphs, 2)).toBe(0);
    expect(findContainingSectionIndex(paragraphs, 4)).toBe(3);
  });

  test("a section-type paragraph itself is its own containing section", () => {
    const paragraphs = [par("Scene Heading", "scene-1"), par("Action", "action-1")];
    expect(findContainingSectionIndex(paragraphs, 0)).toBe(0);
  });

  test("returns -1 for a paragraph before any section heading", () => {
    const paragraphs = [par("Action", "preamble"), par("Scene Heading", "scene-1")];
    expect(findContainingSectionIndex(paragraphs, 0)).toBe(-1);
  });

  test("returns -1 for an empty document", () => {
    expect(findContainingSectionIndex([], 0)).toBe(-1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/fdx/sections.test.ts`
Expected: FAIL — `findContainingSectionIndex is not a function` (not exported yet).

- [ ] **Step 3: Implement `findContainingSectionIndex` and export `getSceneProperties`**

In `src/fdx/sections.ts`, add this function after `findSectionEnd`:

```typescript
/**
 * Scans backward from `index` (inclusive) for the nearest section-type paragraph — the section
 * the paragraph at `index` belongs to. A section-type paragraph is its own containing section.
 * Returns -1 when `index` is before the first section heading in the document.
 */
export function findContainingSectionIndex(paragraphs: XmlElement[], index: number): number {
  for (let i = Math.min(index, paragraphs.length - 1); i >= 0; i--) {
    if (isSectionType(getParagraphType(paragraphs[i]!))) return i;
  }
  return -1;
}
```

In `src/tools/breakdown.ts:76`, change:

```typescript
function getSceneProperties(p: XmlElement): { color: string; length: string; page: string; title: string } | undefined {
```

to:

```typescript
export function getSceneProperties(p: XmlElement): { color: string; length: string; page: string; title: string } | undefined {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/fdx/sections.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full suite and typecheck-sensitive build**

Run: `bun test`
Expected: all existing tests still PASS (the `export` addition is purely additive; nothing consumes
`getSceneProperties` outside `breakdown.ts` yet).

- [ ] **Step 6: Commit**

```bash
git add src/fdx/sections.ts src/fdx/sections.test.ts src/tools/breakdown.ts
git commit -m "Add findContainingSectionIndex helper; export getSceneProperties

Shared groundwork for find_par's scene/page enrichment (Task 2): a
backward scan to find which section a paragraph belongs to, and
access to that section's raw SceneProperties.Page."
```

---

### Task 2: `find_par` reports containing scene and page per hit

**Files:**
- Modify: `src/tools/find-par.ts`
- Modify: `src/tools/find-par.test.ts`
- Modify: `src/tools/context-data.ts:180-181` (mirrored description)

**Interfaces:**
- Consumes: `findContainingSectionIndex` (`src/fdx/sections.ts`, Task 1), `getSceneProperties`
  (`src/tools/breakdown.ts`, Task 1).
- Produces: `handleFindPar` now returns `ToolResult` whose text block is
  `JSON.stringify(FindParHit[])`, where
  `FindParHit = { id: string; type: string; text: string; sceneId: string | null; sceneHeading: string | null; page: number | null }`.
  Empty result is `[]`, not the string `"No paragraph found"`. This is a breaking output-shape
  change from the current plain-text format — no other tool consumes `find_par`'s output
  programmatically today, so nothing else in the codebase needs updating for this.

- [ ] **Step 1: Write the failing tests**

Replace `src/tools/find-par.test.ts` entirely with:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { handleFindPar } from "./find-par.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");
const FIXTURE_SOURCE = readFileSync(FIXTURE_PATH, "utf-8");

/** Loads a fresh copy of the fixture under a unique cache key so tests don't interfere. */
function freshDoc(key: string): { path: string; doc: FdxDocument } {
  const path = join(import.meta.dir, `find-par-${key}.fdx`);
  const doc = FdxDocument.parse(FIXTURE_SOURCE, path);
  documentCache.set(path, doc);
  return { path, doc };
}

/** Parses the last content block as JSON (the main block; earlier blocks may be cache warnings). */
function hits(result: { content: Array<{ text: string }> }): Array<Record<string, unknown>> {
  return JSON.parse(result.content[result.content.length - 1]!.text);
}

describe("find_par", () => {
  test("path and textContent are required", async () => {
    expect((await handleFindPar({ textContent: "x" })).isError).toBe(true);
    expect((await handleFindPar({ path: FIXTURE_PATH })).isError).toBe(true);
  });

  test("finds a paragraph containing the query, case-insensitively by default", async () => {
    const { path } = freshDoc("basic-match");
    const result = await handleFindPar({ path, textContent: "wooly mammoth grazing" });
    expect(result.isError).toBeFalsy();
    const found = hits(result);
    expect(found.length).toBe(1);
    expect(found[0]!.text).toContain("wooly mammoth grazing");
    expect(found[0]!.type).toBe("Action");
  });

  test("case-sensitive search misses a differently-cased query", async () => {
    const { path } = freshDoc("case-sensitive-miss");
    const result = await handleFindPar({
      path,
      textContent: "WOOLY MAMMOTH GRAZING",
      caseSensitive: true,
    });
    expect(hits(result)).toEqual([]);
  });

  test("filters by paragraph type", async () => {
    const { path } = freshDoc("filter-by-type");
    const result = await handleFindPar({ path, textContent: "OOK", parType: "Character" });
    expect(result.isError).toBeFalsy();
    for (const hit of hits(result)) {
      expect(hit.type).toBe("Character");
    }
  });

  test("no match returns an empty array", async () => {
    const { path } = freshDoc("no-match");
    const result = await handleFindPar({ path, textContent: "zzz_no_such_text_zzz" });
    expect(hits(result)).toEqual([]);
  });

  test("unknown scene id errors", async () => {
    const { path } = freshDoc("bad-scene-id");
    const result = await handleFindPar({ path, textContent: "Romulan", id: "not-a-scene" });
    expect(result.isError).toBe(true);
  });

  test("a hit inside a scene reports sceneId and sceneHeading", async () => {
    const { path, doc } = freshDoc("scene-enrichment");
    const scene = doc.getParagraphElements()[0]!; // "EXT. PREHISTORIC VALLEY - DAY"
    const sceneId = scene.attrs.find(([k]) => k === "id")?.[1];

    const result = await handleFindPar({ path, textContent: "wooly mammoth grazing" });
    const [hit] = hits(result);
    expect(hit!.sceneId).toBe(sceneId);
    expect(hit!.sceneHeading).toBe("EXT. PREHISTORIC VALLEY - DAY");
  });

  test("page is null when the containing scene has no SceneProperties.Page", async () => {
    const { path } = freshDoc("no-page");
    const result = await handleFindPar({ path, textContent: "wooly mammoth grazing" });
    const [hit] = hits(result);
    expect(hit!.page).toBeNull();
  });

  test("a hit before any section heading gets null scene fields", async () => {
    const { path, doc } = freshDoc("no-containing-scene");
    const content = doc.getContentElement(true)!;
    content.children.unshift({
      type: "element",
      name: "Paragraph",
      attrs: [["Type", "Action"], ["id", "preamble-1"]],
      children: [{ type: "element", name: "Text", attrs: [], children: [{ type: "text", value: "A lone preamble line." }] }],
    });

    const result = await handleFindPar({ path, textContent: "lone preamble" });
    const [hit] = hits(result);
    expect(hit!.sceneId).toBeNull();
    expect(hit!.sceneHeading).toBeNull();
    expect(hit!.page).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/find-par.test.ts`
Expected: FAIL — output is still plain text, `JSON.parse` throws or assertions on `.type`/`.sceneId`
fail.

- [ ] **Step 3: Implement the enrichment**

Replace `src/tools/find-par.ts` in full:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * find_par — searches top-level body paragraphs by text content, optionally scoped to a section
 * (via id) and/or filtered by paragraph type, with optional case sensitivity. Each hit reports its
 * containing section (id, heading text, page), found by scanning backward for the nearest
 * preceding section-type paragraph — no more guessing which scene a match belongs to. Mirrors Go's
 * tools/find_par.go, extended with scene/page reporting.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, getParagraphType, paragraphText } from "../fdx/paragraph.ts";
import { findSectionIndex, findSectionEnd, findContainingSectionIndex } from "../fdx/sections.ts";
import { getSceneProperties } from "./breakdown.ts";

export const findParTool: FdxTool = {
  name: "find_par",
  description:
    "Read-Only. Search for a paragraph by text content. Returns a JSON array of hits, each carrying id, type, text, and the containing section's sceneId/sceneHeading/page (all null when the hit is before any section heading) — no separate lookup needed to place a match in the document.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the absolute or relative path to the file" },
      textContent: { type: "string", description: "the text content to search for" },
      id: {
        type: "string",
        description: "id is the scene id (the id of the Scene Heading paragraph) to scope the search to",
      },
      parType: { type: "string", description: "the type of paragraph to search for" },
      caseSensitive: { type: "boolean", description: "whether the search should be case-sensitive" },
    },
    required: ["path", "textContent"],
  },
};

interface FindParHit {
  id: string;
  type: string;
  text: string;
  sceneId: string | null;
  sceneHeading: string | null;
  page: number | null;
}

export async function handleFindPar(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  const query = arg<string>(args, "textContent");
  if (!path) return errResult("path is required");
  if (query === undefined) return errResult("textContent is required");

  const sceneId = arg<string>(args, "id");
  const parType = arg<string>(args, "parType");
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

  const searchLower = caseSensitive ? "" : query.toLowerCase();
  const hits: FindParHit[] = [];
  for (let i = startIndex; i < endIndex; i++) {
    const p = paragraphs[i]!;
    if (parType && getParagraphType(p) !== parType) continue;

    const text = paragraphText(p);
    const isHit = caseSensitive ? text.includes(query) : text.toLowerCase().includes(searchLower);
    if (!isHit) continue;

    const sectionIdx = findContainingSectionIndex(paragraphs, i);
    let hSceneId: string | null = null;
    let sceneHeading: string | null = null;
    let page: number | null = null;
    if (sectionIdx !== -1) {
      const sectionPara = paragraphs[sectionIdx]!;
      hSceneId = getParagraphId(sectionPara);
      sceneHeading = paragraphText(sectionPara);
      const sp = getSceneProperties(sectionPara);
      const parsedPage = sp ? parseInt(sp.page, 10) : NaN;
      page = Number.isNaN(parsedPage) ? null : parsedPage;
    }

    hits.push({
      id: getParagraphId(p),
      type: getParagraphType(p),
      text,
      sceneId: hSceneId,
      sceneHeading,
      page,
    });
  }

  return pushCacheWarning(textResult(JSON.stringify(hits)), warning);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/find-par.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Update the mirrored description in `context-data.ts`**

In `src/tools/context-data.ts:180-181`, change:

```typescript
    name: "find_par",
    description: "Read-Only. Search for a paragraph by text content.",
```

to:

```typescript
    name: "find_par",
    description:
      "Read-Only. Search for a paragraph by text content. Returns a JSON array of hits, each carrying id, type, text, and the containing section's sceneId/sceneHeading/page.",
```

- [ ] **Step 6: Run the full suite**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/tools/find-par.ts src/tools/find-par.test.ts src/tools/context-data.ts
git commit -m "find_par: report containing scene and page per hit

Wishlist items 2+3: a hit no longer requires a separate lookup (or
guessing from page numbers) to know which scene it's in. Output is
now a JSON array; each hit adds sceneId/sceneHeading/page, found by
scanning backward for the nearest preceding section heading. A hit
before any section gets all three as null. No matches returns []."
```

---

### Task 3: `get_section` gains ids; `get_section_par_list` is removed

**Files:**
- Modify: `src/tools/get-section.ts`
- Modify: `src/tools/get-section.test.ts`
- Delete: `src/tools/get-section-par-list.ts`
- Delete: `src/tools/get-section-par-list.test.ts`
- Modify: `src/index.ts:51,172,287` (remove import, registration, dispatch)
- Modify: `src/tools/context-data.ts:239-252` (update `get_section` entry, remove
  `get_section_par_list` entry)
- Modify: `src/tools/find-duplicate-ids.ts:19` (drop the `get_section_par_list` mention)
- Modify: `src/fdx/duplicate-ids.ts:7` (drop the `get_section_par_list` mention)

**Interfaces:**
- Produces: `handleGetSection` now returns `ToolResult` whose text block is
  `JSON.stringify(Array<{id: string; type: string; text: string}>)`. Omitting `id` now starts at the
  *first section* in the document (matching the old `get_section_par_list` default), not document
  index 0 as before — a deliberate behavior change since `get_section` is now the merged tool and
  "everything before the first section" isn't itself a section. No sections in the document returns
  `[]`.
- Removed: `getSectionParListTool`, `handleGetSectionParList` (no longer exist anywhere).

- [ ] **Step 1: Write the failing tests**

Replace `src/tools/get-section.test.ts` in full:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleGetSection } from "./get-section.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");
const SCENE_HEADING_ID = "6e39d99f-6972-42f8-bdc8-3f0dbe546280";

function items(result: { content: Array<{ text: string }> }): Array<Record<string, unknown>> {
  return JSON.parse(result.content[result.content.length - 1]!.text);
}

describe("get_section", () => {
  test("path is required", async () => {
    expect((await handleGetSection(undefined)).isError).toBe(true);
  });

  test("errors on an unknown section id", async () => {
    const result = await handleGetSection({ path: FIXTURE_PATH, id: "does-not-exist" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("section id not found");
  });

  test("returns the heading plus paragraphs up to the next section heading, with ids", async () => {
    const result = await handleGetSection({ path: FIXTURE_PATH, id: SCENE_HEADING_ID });
    expect(result.isError).toBeFalsy();
    const rows = items(result);
    expect(rows[0]).toEqual({ id: SCENE_HEADING_ID, type: "Scene Heading", text: "EXT. PREHISTORIC VALLEY - DAY" });
    // Must not include a second Scene Heading (that would mean it overran the boundary).
    const headingCount = rows.filter((r) => r.type === "Scene Heading").length;
    expect(headingCount).toBe(1);
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      expect(typeof row.id).toBe("string");
      expect((row.id as string).length).toBeGreaterThan(0);
    }
  });

  test("omitting id starts at the first section in the document", async () => {
    const result = await handleGetSection({ path: FIXTURE_PATH });
    expect(result.isError).toBeFalsy();
    const rows = items(result);
    expect(rows[0]!.id).toBe(SCENE_HEADING_ID);
    expect(rows[0]!.type).toBe("Scene Heading");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/get-section.test.ts`
Expected: FAIL — current output is plain text, not JSON with `id`.

- [ ] **Step 3: Implement the merge**

Replace `src/tools/get-section.ts` in full:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_section — retrieves a section: its heading paragraph (any section type) plus all following
 * paragraphs up to the next section heading of any type (exclusive), as a JSON array of
 * {id, type, text}. Omit id to start at the first section in the document. Absorbs what used to be
 * the separate get_section_par_list tool — any edit workflow needed both id and text, so both are
 * always returned together now.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, getParagraphType, paragraphText } from "../fdx/paragraph.ts";
import { findSectionIndex, isSectionType } from "../fdx/sections.ts";

export const getSectionTool: FdxTool = {
  name: "get_section",
  description:
    "Read-Only. Retrieve every paragraph in a section (a section-type heading such as a Scene Heading, Act Break, or Shot, and the paragraphs that follow it up to the next section heading) as a JSON array of {id, type, text}. Omit id to start at the first section in the document.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      id: {
        type: "string",
        description: "id is the section id (the id of a section-heading paragraph such as a Scene Heading or Act Break); omit to start at the first section",
      },
    },
    required: ["path"],
  },
};

interface SectionParagraph {
  id: string;
  type: string;
  text: string;
}

export async function handleGetSection(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");
  const sceneId = arg<string>(args, "id");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const paragraphs = doc.getParagraphElements();
  let startIndex: number;
  if (sceneId) {
    const idx = findSectionIndex(paragraphs, sceneId);
    if (idx === -1) return errResult(`section id not found: ${sceneId}`);
    startIndex = idx;
  } else {
    const idx = findSectionIndex(paragraphs, "");
    if (idx === -1) return pushCacheWarning(textResult("[]"), warning);
    startIndex = idx;
  }

  const items: SectionParagraph[] = [];
  for (let i = startIndex; i < paragraphs.length; i++) {
    const p = paragraphs[i]!;
    if (i > startIndex && isSectionType(getParagraphType(p))) break;
    items.push({ id: getParagraphId(p), type: getParagraphType(p), text: paragraphText(p) });
  }

  return pushCacheWarning(textResult(JSON.stringify(items)), warning);
}
```

Delete `src/tools/get-section-par-list.ts` and `src/tools/get-section-par-list.test.ts`.

In `src/index.ts`, remove line 51:

```typescript
import { getSectionParListTool, handleGetSectionParList } from "./tools/get-section-par-list.ts";
```

remove line 172 (`getSectionParListTool,` from the tool list array), and remove line 287
(`get_section_par_list: (args) => handleGetSectionParList(args),` from the dispatch map).

In `src/tools/context-data.ts:239-252`, replace:

```typescript
  {
    name: "get_section",
    description:
      "Read-Only. Retrieve a section: its heading paragraph (any section type) plus all following paragraphs up to the next section heading of any type (exclusive). Returns each paragraph's id, type, and text.",
  },
  {
    name: "get_section_list",
    description:
      "Read-Only. List all section headings (any section type) in document order with their ids, types, and text; pass type to list only paragraphs of that exact type instead.",
  },
  {
    name: "get_section_par_list",
    description:
      "Read-Only. Retrieve all paragraph ids within a section, starting from a specific section id (the heading itself is included).",
  },
```

with:

```typescript
  {
    name: "get_section",
    description:
      "Read-Only. Retrieve every paragraph in a section (a section-type heading such as a Scene Heading, Act Break, or Shot, and the paragraphs that follow it up to the next section heading) as a JSON array of {id, type, text}. Omit id to start at the first section in the document.",
  },
  {
    name: "get_section_list",
    description:
      "Read-Only. List all section headings (any section type) in document order with their ids, types, and text; pass type to list only paragraphs of that exact type instead.",
  },
```

In `src/tools/find-duplicate-ids.ts:19`, change:

```typescript
    "Read-Only. Detects top-level body paragraphs that share the same id — a silent-corruption gap where FinalDraft's copy/paste duplicates a paragraph's id instead of minting a new one. Every id-addressed tool (get_par, edit_par, edit_scene_arc_beats, get_section_par_list) resolves a duplicated id to its first match, so a caller addressing a later paragraph with that id edits the wrong one. Call fix_duplicate_ids to repair what this finds.",
```

to:

```typescript
    "Read-Only. Detects top-level body paragraphs that share the same id — a silent-corruption gap where FinalDraft's copy/paste duplicates a paragraph's id instead of minting a new one. Every id-addressed tool (get_par, edit_par, edit_scene_arc_beats, get_section) resolves a duplicated id to its first match, so a caller addressing a later paragraph with that id edits the wrong one. Call fix_duplicate_ids to repair what this finds.",
```

In `src/fdx/duplicate-ids.ts:5-8`, change:

```typescript
/**
 * Detects and repairs duplicate <Paragraph> ids: FinalDraft's copy/paste sometimes duplicates a
 * paragraph's id attribute instead of minting a new one, and every id-addressed tool (get_par,
 * edit_par, edit_scene_arc_beats, get_section_par_list) silently resolves a duplicated id to the
 * first match. See HANDOFF-duplicate-paragraph-ids.md for the repro that motivated this.
 */
```

to:

```typescript
/**
 * Detects and repairs duplicate <Paragraph> ids: FinalDraft's copy/paste sometimes duplicates a
 * paragraph's id attribute instead of minting a new one, and every id-addressed tool (get_par,
 * edit_par, edit_scene_arc_beats, get_section) silently resolves a duplicated id to the first
 * match. See HANDOFF-duplicate-paragraph-ids.md for the repro that motivated this.
 */
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/get-section.test.ts`
Expected: PASS (4 tests).

Run: `bun test`
Expected: all PASS — confirms `get_section_par_list`'s removal didn't break `index.ts` wiring or
`context-data.test.ts`'s "every tool has a unique, non-empty name/description" check, and that
deleting its test file didn't leave a dangling reference anywhere.

- [ ] **Step 5: Commit**

```bash
git add src/tools/get-section.ts src/tools/get-section.test.ts src/index.ts src/tools/context-data.ts src/tools/find-duplicate-ids.ts src/fdx/duplicate-ids.ts
git rm src/tools/get-section-par-list.ts src/tools/get-section-par-list.test.ts
git commit -m "Merge get_section_par_list into get_section

Wishlist item 4: every edit workflow needed both tools back to back,
joining them by position. get_section now returns {id, type, text}
per paragraph as JSON; get_section_par_list is removed as a strict
subset. Omitting id now starts at the first section in the document
(matching get_section_par_list's old default) rather than document
index 0, since 'everything before the first section' isn't a section."
```

---

### Task 4: `get_par_runs` accepts `ids` or `sectionId`

**Files:**
- Modify: `src/tools/get-par-runs.ts`
- Modify: `src/tools/get-par-runs.test.ts`
- Modify: `src/tools/context-data.ts` (add a `get_par_runs` entry — it has none today)

**Interfaces:**
- Consumes: `findSectionIndex`, `findSectionEnd` (`src/fdx/sections.ts`, existing exports).
- Produces: `handleGetParRuns` unchanged for `id` (single object). New: `ids?: string[]` and
  `sectionId?: string` params; exactly one of `id`/`ids`/`sectionId` must be given (error otherwise).
  Both new modes return `ToolResult` whose text block is
  `JSON.stringify(Array<{id: string; type: string; runs: ReturnType<typeof getParagraphRuns>}>)`.

- [ ] **Step 1: Write the failing tests**

Add to `src/tools/get-par-runs.test.ts` (after the existing `"round-trips arbitrary run attrs..."`
test, before the closing `});`):

```typescript
  test("exactly one of id, ids, or sectionId is required", async () => {
    const { path } = freshDoc("no-selector");
    const result = await handleGetParRuns({ path });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("exactly one of id, ids, or sectionId");
  });

  test("rejects both id and ids given together", async () => {
    const { path, doc } = freshDoc("both-selectors");
    const id = getParagraphId(doc.getParagraphElements()[0]!);
    const result = await handleGetParRuns({ path, id, ids: [id] });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("exactly one of id, ids, or sectionId");
  });

  test("ids returns runs for each paragraph in the given order", async () => {
    const { path, doc } = freshDoc("ids-batch");
    const paragraphs = doc.getParagraphElements();
    const firstId = getParagraphId(paragraphs[1]!);
    const secondId = getParagraphId(paragraphs[0]!);

    const result = await handleGetParRuns({ path, ids: [firstId, secondId] });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0]!.text);
    expect(body.length).toBe(2);
    expect(body[0].id).toBe(firstId);
    expect(body[1].id).toBe(secondId);
    expect(Array.isArray(body[0].runs)).toBe(true);
  });

  test("ids fails the whole call on a missing id", async () => {
    const { path, doc } = freshDoc("ids-missing");
    const id = getParagraphId(doc.getParagraphElements()[0]!);
    const result = await handleGetParRuns({ path, ids: [id, "does-not-exist"] });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("paragraph id not found");
  });

  test("sectionId returns every paragraph in that section, heading included", async () => {
    const { path, doc } = freshDoc("section-batch");
    const sceneHeading = doc.getParagraphElements()[0]!;
    const sceneId = getParagraphId(sceneHeading);

    const result = await handleGetParRuns({ path, sectionId: sceneId });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0]!.text);
    expect(body[0].id).toBe(sceneId);
    expect(body.length).toBeGreaterThan(1);
  });

  test("sectionId errors on an unknown section id", async () => {
    const { path } = freshDoc("section-unknown");
    const result = await handleGetParRuns({ path, sectionId: "nope" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("section id not found");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/get-par-runs.test.ts`
Expected: FAIL — `ids`/`sectionId` aren't recognized; `handleGetParRuns` still requires `id` and
errors with `"id is required"` for all the new cases.

- [ ] **Step 3: Implement batch support**

Replace `src/tools/get-par-runs.ts` in full:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_par_runs — retrieves one or more top-level body paragraphs' <Text> runs, with full attribute
 * sets (AdornmentStyle, Font, Color, Size, RevisionID, ...) intact. Unlike get_par (which flattens
 * runs into plain text), this is the read half of the round-trip needed to edit a styled paragraph
 * without losing its styling. Accepts a single id (backward-compatible single-object response), or
 * a batch via ids or sectionId (array response) — a pre-sweep styled-run audit no longer needs one
 * call per paragraph.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, getParagraphType, getParagraphRuns } from "../fdx/paragraph.ts";
import { findSectionIndex, findSectionEnd } from "../fdx/sections.ts";
import type { XmlElement } from "../fdx/xml.ts";

export const getParRunsTool: FdxTool = {
  name: "get_par_runs",
  description:
    "Read-Only. Retrieve one or more paragraphs' <Text> runs, with each run's full attribute set (AdornmentStyle, Font, Color, Size, RevisionID, etc.) preserved — unlike get_par, which returns flattened plain text and discards run boundaries and attributes. Use this before edit_par when a paragraph may contain styled runs, so the attrs can be passed back unchanged. Pass exactly one of: id (single paragraph, returns one object), ids (array, returns an array in the given order — a missing id fails the whole call), or sectionId (every paragraph in that section, heading included, returns an array in document order) — useful for a pre-sweep audit of where styled runs are before running replace_text or edit_par across a scene.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      id: { type: "string", description: "a single paragraph id to retrieve" },
      ids: { type: "array", items: { type: "string" }, description: "a list of paragraph ids to retrieve, in the given order" },
      sectionId: { type: "string", description: "a section id (a section-heading paragraph's id); retrieves every paragraph in that section, heading included" },
    },
    required: ["path"],
  },
};

interface ParRunsBody {
  id: string;
  type: string;
  runs: ReturnType<typeof getParagraphRuns>;
}

function toBody(p: XmlElement): ParRunsBody {
  return { id: getParagraphId(p), type: getParagraphType(p), runs: getParagraphRuns(p) };
}

export async function handleGetParRuns(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");

  const id = arg<string>(args, "id");
  const ids = arg<string[]>(args, "ids");
  const sectionId = arg<string>(args, "sectionId");
  const selectorCount = [id, ids, sectionId].filter((v) => v !== undefined).length;
  if (selectorCount !== 1) {
    return errResult("exactly one of id, ids, or sectionId is required");
  }

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

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
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/get-par-runs.test.ts`
Expected: PASS (all existing + 6 new tests). Note the existing `"id is required"` test needs its
expected message updated first if it still asserts the old text — check it now asserts
`exactly one of id, ids, or sectionId` instead of `id is required` (the old error message no longer
exists; update that one pre-existing test alongside the new ones in this step).

- [ ] **Step 5: Add `get_par_runs` to the `context-data.ts` catalog**

`get_par_runs` currently has no entry in `contextTools` (a pre-existing gap — it exists as a real
tool but isn't listed in `get_context`'s catalog or `search_actions`' output). Since this task
changes it substantially, add it now. In `src/tools/context-data.ts`, insert into the `contextTools`
array (anywhere; alphabetical-ish grouping isn't strictly enforced elsewhere in the file, so add it
near `get_par`):

```typescript
  {
    name: "get_par_runs",
    description:
      "Read-Only. Retrieve one or more paragraphs' <Text> runs with full attribute sets preserved (unlike get_par, which flattens to plain text). Pass exactly one of id (single), ids (array), or sectionId (whole section).",
  },
```

- [ ] **Step 6: Run the full suite**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/tools/get-par-runs.ts src/tools/get-par-runs.test.ts src/tools/context-data.ts
git commit -m "get_par_runs: accept a batch via ids or sectionId

Wishlist item 14: a pre-sweep styled-run audit needed one call per
paragraph. id keeps its existing single-object response; ids/sectionId
return an array. Also adds get_par_runs to the get_context/
search_actions tool catalog, which it was missing from."
```

---

### Task 5: `edit_par action=create` returns the new paragraph's id

**Files:**
- Modify: `src/tools/edit-par.ts`
- Modify: `src/tools/edit-par.test.ts`
- Modify: `src/tools/context-data.ts:96-100` (the "UUID Generation" rule) and `:137` (the mirrored
  `edit_par` description)

**Interfaces:**
- Produces: for `action=create` only, `handleEditPar`'s main content block becomes
  `JSON.stringify({id: string, type: string, message: string})` instead of a plain sentence.
  `action=edit`/`action=remove` are unchanged (still plain-text sentences — `action=remove`'s
  `(${removedType})`-bearing message from the previous fix stays exactly as-is).

- [ ] **Step 1: Write the failing test**

Add to `src/tools/edit-par.test.ts`, right after the `"create appends a new paragraph with a fresh, unique UUID"` test:

```typescript
  test("create returns the new paragraph's id and type as JSON", async () => {
    const { path, doc } = freshDoc("create-returns-id");

    const result = await handleEditPar({
      path,
      action: "create",
      type: "Action",
      textRuns: [{ content: "a fresh paragraph" }],
    });
    expect(result.isError).toBeFalsy();

    const body = JSON.parse(result.content[result.content.length - 1]!.text);
    expect(body.type).toBe("Action");
    expect(body.id).toMatch(UUID_RE);

    const created = doc.getParagraphElements().find((p) => getParagraphId(p) === body.id);
    expect(created).toBeDefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/tools/edit-par.test.ts`
Expected: FAIL — `JSON.parse` throws, since the response is still a plain sentence.

- [ ] **Step 3: Implement**

In `src/tools/edit-par.ts`, add a `createdId` variable alongside the other `let` declarations
(currently `modifiedText`, `modifiedType`, `touched`, `dupWarning`, `removedType`):

```typescript
  let modifiedText = "";
  let modifiedType = "";
  let touched = false;
  let dupWarning = "";
  let removedType = "";
  let createdId = "";
```

In the `action === "create"` branch, capture the id before building the paragraph:

```typescript
  } else if (action === "create") {
    const type = typeArg ?? "";
    const newId = generateUuid();
    const newPara = buildParagraphElement(type, newId, alignment, textRuns);
    if (beforeParId) {
      const idx = paragraphs.findIndex((p) => getParagraphId(p) === beforeParId);
      if (idx === -1) return errResult("failed to create paragraph: anchor paragraph not found");
      const contentIdx = content.children.indexOf(paragraphs[idx]!);
      content.children.splice(contentIdx, 0, newPara);
    } else if (afterParId) {
      const idx = paragraphs.findIndex((p) => getParagraphId(p) === afterParId);
      if (idx === -1) return errResult("failed to create paragraph: anchor paragraph not found");
      const contentIdx = content.children.indexOf(paragraphs[idx]!);
      content.children.splice(contentIdx + 1, 0, newPara);
    } else {
      content.children.push(newPara);
    }
    modifiedText = paragraphText(newPara);
    modifiedType = type;
    createdId = newId;
    touched = true;
  } else if (action === "create") {
```

(The last line above is just the existing branch boundary shown for placement context — don't
duplicate the `else if`, only the body changes: `newId`/`createdId` are new, everything else in the
branch is unchanged.)

At the bottom of `handleEditPar`, replace:

```typescript
  const dirtyWarning = documentCache.touchDirty(path, doc);
  const msg =
    action === "remove"
      ? `Successfully removed paragraph (${removedType}) from script. File updated in cache — call save_fdx to persist changes to disk.`
      : `Successfully ${pastTense(action)} paragraph in script. File updated in cache — call save_fdx to persist changes to disk.`;
  const result = pushCacheWarning(
    pushCacheWarning(pushWarning(textResult(msg), dupWarning), dirtyWarning),
    warning,
  );
  return result;
```

with:

```typescript
  const dirtyWarning = documentCache.touchDirty(path, doc);
  let mainBlock: ToolResult;
  if (action === "create") {
    mainBlock = textResult(
      JSON.stringify({
        id: createdId,
        type: modifiedType,
        message: "Successfully created paragraph in script. File updated in cache — call save_fdx to persist changes to disk.",
      }),
    );
  } else {
    const msg =
      action === "remove"
        ? `Successfully removed paragraph (${removedType}) from script. File updated in cache — call save_fdx to persist changes to disk.`
        : `Successfully ${pastTense(action)} paragraph in script. File updated in cache — call save_fdx to persist changes to disk.`;
    mainBlock = textResult(msg);
  }
  const result = pushCacheWarning(
    pushCacheWarning(pushWarning(mainBlock, dupWarning), dirtyWarning),
    warning,
  );
  return result;
```

Also update the tool description. In `src/tools/edit-par.ts`, change the `description` field of
`editParTool` — find the sentence `"For create, use beforeParId or afterParId..."` and the one
after it, and insert a new sentence after `"...falls back to append)."`:

```
"...falls back to append). Returns {id, type, message} as JSON on success, so the new paragraph is immediately addressable without a follow-up lookup. For edit, provide id..."
```

(Apply this as a targeted edit to the existing description string — insert the new sentence in
place, don't rewrite the whole string from scratch, so the rest of the description is untouched.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/tools/edit-par.test.ts`
Expected: PASS (all existing + 1 new test).

- [ ] **Step 5: Update `context-data.ts`**

In `src/tools/context-data.ts:96-100`, change:

```typescript
  {
    title: "UUID Generation",
    content:
      "New paragraphs created by edit_par or edit_dual_dialogue receive fresh UUIDs via generateUUID(). Existing paragraph IDs must be preserved when editing or moving content.",
  },
```

to:

```typescript
  {
    title: "UUID Generation",
    content:
      "New paragraphs created by edit_par or edit_dual_dialogue receive fresh UUIDs via generateUUID(), returned directly in the create response ({id, ...} as JSON) — no separate lookup needed. Existing paragraph IDs must be preserved when editing or moving content.",
  },
```

In `src/tools/context-data.ts:137` (the mirrored `edit_par` description), apply the same targeted
insertion made to the live tool description in Step 3, so the two stay identical.

- [ ] **Step 6: Run the full suite**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/tools/edit-par.ts src/tools/edit-par.test.ts src/tools/context-data.ts
git commit -m "edit_par action=create returns the new paragraph's id

Wishlist item 1: create's success response was a sentence with no way
to address the paragraph just created, forcing fragile text-matching
(and no route at all for an empty paragraph, which has no text to
match). action=create's response is now JSON: {id, type, message}.
action=edit/action=remove are unchanged."
```

---

### Task 6: `edit_dual_dialogue action=create` returns the new wrapper's id

**Files:**
- Modify: `src/tools/edit-dual-dialogue.ts`
- Modify: `src/tools/edit-dual-dialogue.test.ts`
- Modify: `src/tools/context-data.ts:120-123` (mirrored description)

**Interfaces:**
- Produces: for `action=create` only, `handleEditDualDialogue`'s main content block becomes
  `JSON.stringify({id: string, message: string})` — `id` is the new wrapper paragraph's id.
  `action=remove` is unchanged.

- [ ] **Step 1: Write the failing test**

In `src/tools/edit-dual-dialogue.test.ts`, modify the existing
`"create moves paragraphs into a new wrapper, preserving order"` test: replace

```typescript
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("call save_fdx");

    const doc = documentCache.get(path)!;
    const paragraphs = doc.getParagraphElements();
```

with

```typescript
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0]!.text);
    expect(body.message).toContain("call save_fdx");

    const doc = documentCache.get(path)!;
    const paragraphs = doc.getParagraphElements();
```

and later in the same test, replace

```typescript
    const wrapper = paragraphs.find((p) =>
      p.children.some((c) => c.type === "element" && c.name === "DualDialogue"),
    );
    expect(wrapper).toBeDefined();
    const wrapperId = getParagraphId(wrapper!);
```

with

```typescript
    const wrapper = paragraphs.find((p) =>
      p.children.some((c) => c.type === "element" && c.name === "DualDialogue"),
    );
    expect(wrapper).toBeDefined();
    const wrapperId = getParagraphId(wrapper!);
    expect(body.id).toBe(wrapperId);
```

(everything after that in the test — the `get_dual_dialogue` round-trip assertions — is unchanged).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/tools/edit-dual-dialogue.test.ts`
Expected: FAIL — `JSON.parse` throws on the current plain-sentence response.

- [ ] **Step 3: Implement**

In `src/tools/edit-dual-dialogue.ts`, in the `create` branch, capture the wrapper id before building
the wrapper element. Replace:

```typescript
    const dd = createElement("DualDialogue", [], moved);
    const wrapper = createElement("Paragraph", [
      ["Type", "General"],
      ["id", generateUuid()],
    ], [dd]);

    content.children.splice(insertPos, 0, wrapper);
```

with:

```typescript
    const dd = createElement("DualDialogue", [], moved);
    const wrapperId = generateUuid();
    const wrapper = createElement("Paragraph", [
      ["Type", "General"],
      ["id", wrapperId],
    ], [dd]);

    content.children.splice(insertPos, 0, wrapper);
```

At the bottom of `handleEditDualDialogue`, replace:

```typescript
  const dirtyWarning = documentCache.touchDirty(path, doc);
  const result = pushCacheWarning(
    pushCacheWarning(
      textResult(`Successfully ${actionPastTense(action)} dual dialogue. File updated in cache — call save_fdx to persist changes to disk.`),
      warning,
    ),
    dirtyWarning,
  );
  return result;
```

with:

```typescript
  const dirtyWarning = documentCache.touchDirty(path, doc);
  const message = `Successfully ${actionPastTense(action)} dual dialogue. File updated in cache — call save_fdx to persist changes to disk.`;
  const mainBlock =
    action.toLowerCase() === "create"
      ? textResult(JSON.stringify({ id: wrapperId!, message }))
      : textResult(message);
  const result = pushCacheWarning(pushCacheWarning(mainBlock, warning), dirtyWarning);
  return result;
```

`wrapperId` is only assigned inside the `create` branch, so it must be declared before the
`if (action.toLowerCase() === "create")` block. At the top of the `if`/`else if` chain (right after
`const content = doc.getContentElement(true)!;`), add:

```typescript
  let wrapperId: string | undefined;
```

and inside the `create` branch, the `const wrapperId = generateUuid();` line from above becomes
`wrapperId = generateUuid();` (no `const`, assigning the outer variable) — adjust the wrapper
construction accordingly:

```typescript
    const dd = createElement("DualDialogue", [], moved);
    wrapperId = generateUuid();
    const wrapper = createElement("Paragraph", [
      ["Type", "General"],
      ["id", wrapperId],
    ], [dd]);

    content.children.splice(insertPos, 0, wrapper);
```

Also update the tool description. In `editDualDialogueTool`'s `description`, insert after
"...inserted where the first of them was":

```
"...inserted where the first of them was, returning {id, message} as JSON (id is the new wrapper's id) — edit the paragraphs' content beforehand with edit_par."
```

(Targeted edit — the rest of the description, covering `action=remove`, is unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/tools/edit-dual-dialogue.test.ts`
Expected: PASS (all existing tests, including the modified one).

- [ ] **Step 5: Update `context-data.ts`**

In `src/tools/context-data.ts:120-123`, apply the same targeted insertion made to the live
`editDualDialogueTool` description in Step 3, so the two stay identical.

- [ ] **Step 6: Run the full suite**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/tools/edit-dual-dialogue.ts src/tools/edit-dual-dialogue.test.ts src/tools/context-data.ts
git commit -m "edit_dual_dialogue action=create returns the new wrapper's id

Same fix as edit_par (wishlist item 1): action=create's response is
now JSON {id, message}, id being the new wrapper paragraph's id.
action=remove is unchanged."
```

---

### Task 7: Documentation sync — TOOLS.md, CHANGELOG.md, package.json

**Files:**
- Modify: `TOOLS.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`

**Interfaces:** none — documentation only, no code.

- [ ] **Step 1: Update `TOOLS.md` rows for the five changed tools**

`TOOLS.md` is a hand-maintained snapshot (no generator script) and is already stale beyond this
phase's scope (missing `edit_cast`, `edit_scene_arc_beats`, `find_duplicate_ids`,
`fix_duplicate_ids`, `get_cast`, `replace_text`, and carrying a few rows — `get_cache_status`,
`get_context`, `read_file`, `search_actions`, `write_file` — that don't match `index.ts`'s current
registrations). That drift predates this phase and is out of scope here; only fix the five rows
this phase actually touches.

In `TOOLS.md`, update the `edit_par` row's description to match the new tool description from
Task 5 (id/type/message JSON on create). Update the `find_par` row's parameters column (unchanged:
`path, textContent, id?, parType?, caseSensitive?`) and description to match Task 2's new
description. Update the `get_section` row's parameters (unchanged: `path, id?`) and description to
match Task 3's new description. Remove the `get_section_par_list` row entirely. Add a new row for
`get_par_runs` (currently missing) with parameters `path, id?, ids?, sectionId?` and the description
from Task 4.

Update the header line `This server exposes 57 tools.` to `This server exposes 56 tools.` (57 minus
`get_section_par_list`, since `get_par_runs` was already registered and running — its row was just
missing, not the tool itself).

- [ ] **Step 2: Add a CHANGELOG.md entry**

In `CHANGELOG.md`, add a new version section above `## [0.0.9]`:

```markdown
## [0.0.10] - 2026-08-01

### Changed

- **`edit_par`/`edit_dual_dialogue` `action=create` now return the new paragraph's/wrapper's id** as JSON (`{id, type, message}` / `{id, message}`) instead of a plain sentence, so a caller can address what it just created without a fragile text-matching lookup — including an empty paragraph, which has no text to match on at all. `action=edit`/`action=remove` are unchanged.
- **`find_par` now reports each hit's containing scene and page.** Output is a JSON array; every hit carries `sceneId`, `sceneHeading`, and `page` (all `null` when the hit is before any section heading), found by scanning backward for the nearest preceding section heading — no more guessing which scene a match belongs to from page numbers.
- **`get_section` now includes each paragraph's id**, returning a JSON array of `{id, type, text}`. It absorbs `get_section_par_list`, which is removed — every edit workflow needed both back to back and joined them by position. Omitting `id` now starts at the first section in the document (matching `get_section_par_list`'s old default) rather than document index 0.
- **`get_par_runs` accepts a batch of paragraphs** via `ids` (an array, in the given order) or `sectionId` (every paragraph in a section, heading included), returning a JSON array — a pre-sweep audit of styled runs no longer needs one call per paragraph. `id` (single paragraph) is unchanged.

### Removed

- **`get_section_par_list`** — folded into `get_section` (see above).
```

- [ ] **Step 3: Bump `package.json` version**

In `package.json`, change `"version": "0.0.9"` to `"version": "0.0.10"`.

- [ ] **Step 4: Run the full suite one more time**

Run: `bun test`
Expected: all PASS — documentation-only changes shouldn't affect this, but confirm nothing was
accidentally left broken from earlier tasks.

- [ ] **Step 5: Commit**

```bash
git add TOOLS.md CHANGELOG.md package.json
git commit -m "Update TOOLS.md/CHANGELOG.md for the response-enrichment changes; bump to 0.0.10"
```

---

## Self-Review Notes

- **Spec coverage:** all five spec items (1, 2+3, 4, 5/14) map to Tasks 5, 2, 3, 4, 6 respectively.
  Documentation requirements from the spec's own "Documentation" section map to Task 7.
- **README:** the spec already established README doesn't enumerate individual tools or a tool
  count, so it needs no changes; confirmed again while writing this plan (only `TOOLS.md` carries a
  tool count).
- **Pre-existing `TOOLS.md` staleness** (6 missing tools, 5 stale rows unrelated to this phase) is
  called out in Task 7 rather than silently expanded into a full resync, per "fix what you touch,
  mention what you don't."
