# Placeholder-Aware Counting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `get_script_stats` a way to report and exclude drafting-placeholder paragraphs from
its counts, and add a `get_placeholders` tool that lists them precisely enough to bulk-remove via
the existing `batch_edit` + `edit_par action=remove` combo.

**Architecture:** One shared detection helper (`isPlaceholderParagraph`) lives in
`breakdown.ts` next to `buildScriptStats`. `buildScriptStats` gains an always-on
`placeholderCount` field and an opt-in `excludePlaceholders` mode that skips placeholder
paragraphs when tallying `paragraphCount`/`byType`/`sceneCount`/`actBreakCount`. A new
`get_placeholders` tool (`src/tools/get-placeholders.ts`), modeled directly on the existing
`get_flagged_words` tool, walks the document once and returns every placeholder's
id/type/text/page.

**Tech Stack:** TypeScript, Bun test runner, existing `FdxDocument`/XML helpers — no new
dependencies.

## Global Constraints

- Placeholder rule: a paragraph's full text, trimmed, entirely wrapped by one `[...]` pair —
  `/^\[[\s\S]*\]$/` applied to `paragraphText(p).trim()`. Applies regardless of `Type`.
- `totalPages` is never adjusted by `excludePlaceholders` (in either direction) — it reflects
  Final Draft's own last-computed pagination, which this server does not recompute.
- `buildScriptStats(doc, opts?)`'s new second parameter must default to no exclusion, so the
  existing call sites in `breakdown-report.ts` and `breakdown.test.ts` are unaffected by omitting
  it.
- No new mutation tool for bulk removal — `get_placeholders` + existing `batch_edit` +
  `edit_par action=remove` covers it.
- Any tool add/schema-change updates `README.md`, `CHANGELOG.md`, `TOOLS.md`, and
  `src/tools/context-data.ts`'s mirrored catalog entry together (project standing rule).

---

### Task 1: `isPlaceholderParagraph` helper + `placeholderCount` on `get_script_stats`

**Files:**
- Modify: `src/tools/breakdown.ts`
- Test: `src/tools/breakdown.test.ts`

**Interfaces:**
- Produces: `export function isPlaceholderParagraph(p: XmlElement): boolean` — importable by
  Task 3's `get_placeholders` tool.
- Produces: `ScriptStats.placeholderCount: number` — new field, always populated.

- [ ] **Step 1: Write the failing tests**

Add to `describe("buildScriptStats", ...)` in `src/tools/breakdown.test.ts`, right after the
existing `"curlyQuoteCount counts paragraph text..."` test (before the closing `});` of that
describe block):

```typescript
  test("placeholderCount counts whole-bracket paragraphs regardless of type", () => {
    const source = `<?xml version="1.0"?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="General" id="p1"><Text>[FIX - move this scene earlier]</Text></Paragraph>
    <Paragraph Type="Action" id="p2"><Text>[NOTE: check timing]</Text></Paragraph>
    <Paragraph Type="Action" id="p3"><Text>INT. CAVE - DAY [FIX - check slug]</Text></Paragraph>
    <Paragraph Type="Action" id="p4"><Text>Grog picks up a rock.</Text></Paragraph>
  </Content>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const stats = buildScriptStats(doc);
    expect(stats.placeholderCount).toBe(2); // p1 and p2 only; p3 has real text before the bracket
    expect(stats.paragraphCount).toBe(4); // unaffected without excludePlaceholders
  });
```

This test also imports nothing new — `FdxDocument` and `buildScriptStats` are already imported at
the top of `breakdown.test.ts` (used by the tests directly above it).

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/tools/breakdown.test.ts`
Expected: FAIL — `stats.placeholderCount` is `undefined`, `toBe(2)` fails (or a TypeScript error if
`ScriptStats` is a strict type; either failure mode confirms the field doesn't exist yet).

- [ ] **Step 3: Add the helper and wire the field**

In `src/tools/breakdown.ts`, add the helper near the top-level functions (after the
`getSceneProperties` function, around line 90, before `getArcBeats`):

```typescript
const PLACEHOLDER_RE = /^\[[\s\S]*\]$/;

/** True when a paragraph's full trimmed text is entirely one [...] span, regardless of Type. */
export function isPlaceholderParagraph(p: XmlElement): boolean {
  return PLACEHOLDER_RE.test(paragraphText(p).trim());
}
```

In the `ScriptStats` interface (around line 48-59), add the new field:

```typescript
export interface ScriptStats {
  totalPages: number;
  sceneCount: number;
  actBreakCount: number;
  paragraphCount: number;
  byType: Record<string, number>;
  adornmentStyleCount: number;
  winVoiceCount: number;
  totalTextRuns: number;
  curlyQuoteCount: number;
  flaggedWordCount: number;
  placeholderCount: number;
}
```

In `buildScriptStats` (around line 467-502), initialize the field and count it in the existing
per-paragraph loop:

```typescript
export function buildScriptStats(doc: FdxDocument): ScriptStats {
  const paragraphs = doc.getParagraphElements();
  const stats: ScriptStats = {
    totalPages: 0,
    sceneCount: 0,
    actBreakCount: 0,
    paragraphCount: paragraphs.length,
    byType: {},
    adornmentStyleCount: 0,
    winVoiceCount: 0,
    totalTextRuns: 0,
    curlyQuoteCount: 0,
    flaggedWordCount: 0,
    placeholderCount: 0,
  };
  for (const p of paragraphs) {
    const type = getParagraphType(p);
    stats.byType[type] = (stats.byType[type] ?? 0) + 1;
    if (type.toLowerCase() === "scene heading") stats.sceneCount++;
    if (type.toLowerCase() === "act&scene break" || type.toLowerCase() === "act break") stats.actBreakCount++;
    if (isPlaceholderParagraph(p)) stats.placeholderCount++;
    const sp = getSceneProperties(p);
    if (sp && sp.page !== "") {
      const page = parseInt(sp.page, 10);
      if (!Number.isNaN(page) && page > stats.totalPages) stats.totalPages = page;
    }
  }

  const integrity: IntegrityCounts = { totalTextRuns: 0, adornmentStyleCount: 0, flaggedWordCount: 0, curlyQuoteCount: 0 };
  walkIntegrityCounts(doc.root, integrity);
  stats.totalTextRuns = integrity.totalTextRuns;
  stats.adornmentStyleCount = integrity.adornmentStyleCount;
  stats.flaggedWordCount = integrity.flaggedWordCount;
  stats.curlyQuoteCount = integrity.curlyQuoteCount;
  stats.winVoiceCount = countWinVoiceOccurrences(doc.root);

  return stats;
}
```

(This step only adds the `placeholderCount: 0` initializer and the
`if (isPlaceholderParagraph(p)) stats.placeholderCount++;` line inside the existing loop — the
rest of the function body shown above is unchanged, included for exact placement.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/tools/breakdown.test.ts`
Expected: PASS, all tests in the file (the new one plus every pre-existing one).

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions (was 493 passing before this task).

```bash
git add src/tools/breakdown.ts src/tools/breakdown.test.ts
git commit -m "Add placeholderCount to get_script_stats

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `excludePlaceholders` option on `get_script_stats`

**Files:**
- Modify: `src/tools/breakdown.ts`
- Modify: `src/tools/get-script-stats.ts`
- Test: `src/tools/breakdown.test.ts`
- Test: `src/tools/get-script-stats.test.ts` (create if it doesn't already exist — check first)

**Interfaces:**
- Consumes: `isPlaceholderParagraph(p: XmlElement): boolean` and `ScriptStats.placeholderCount`
  from Task 1.
- Produces: `buildScriptStats(doc: FdxDocument, opts?: { excludePlaceholders?: boolean }): ScriptStats`
  — the new signature Task 4 does not touch but must not break.

- [ ] **Step 1: Check whether `get-script-stats.test.ts` already exists**

Run: `ls src/tools/get-script-stats.test.ts` (or equivalent). If it doesn't exist, Step 2 creates it
fresh with the imports shown; if it does exist, add the test into its existing `describe` block
using whatever fixture-loading pattern is already there instead of the one shown below — read the
file first and adapt.

- [ ] **Step 2: Write the failing tests**

Add to `describe("buildScriptStats", ...)` in `src/tools/breakdown.test.ts`, directly after the
`"placeholderCount counts whole-bracket paragraphs..."` test added in Task 1:

```typescript
  test("excludePlaceholders removes them from paragraphCount, byType, sceneCount, and actBreakCount", () => {
    const source = `<?xml version="1.0"?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Scene Heading" id="sh1"><Text>[FIX - placeholder scene heading]</Text></Paragraph>
    <Paragraph Type="General" id="p1"><Text>[FIX - move this scene earlier]</Text></Paragraph>
    <Paragraph Type="Action" id="p2"><Text>Grog picks up a rock.</Text></Paragraph>
  </Content>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const withPlaceholders = buildScriptStats(doc);
    expect(withPlaceholders.paragraphCount).toBe(3);
    expect(withPlaceholders.sceneCount).toBe(1);
    expect(withPlaceholders.byType["General"]).toBe(1);

    const excluded = buildScriptStats(doc, { excludePlaceholders: true });
    expect(excluded.paragraphCount).toBe(1);
    expect(excluded.sceneCount).toBe(0);
    expect(excluded.byType["General"]).toBeUndefined();
    expect(excluded.byType["Action"]).toBe(1);
    expect(excluded.placeholderCount).toBe(2); // still reported even though excluded from the rest
  });
```

For `get-script-stats.test.ts`, use the same `freshCopy()`-style fixture pattern established in
`edit-spell-check.test.ts` (copy `examples/Grog The Caveman.fdx` to a temp dir) if no file exists
yet, or match whatever pattern is already there if it does. Read the existing file first — its
actual helper names may differ from any name used here. The test to add:

```typescript
  test("excludePlaceholders is passed through to buildScriptStats", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    await handleEditPar({ path, action: "create", type: "General", value: "[FIX - temp placeholder]" });
    const withPlaceholder = await handleGetScriptStats({ path });
    const withBody = JSON.parse(withPlaceholder.content[withPlaceholder.content.length - 1]!.text);
    expect(withBody.placeholderCount).toBe(1);

    const excludedResult = await handleGetScriptStats({ path, excludePlaceholders: true });
    const excludedBody = JSON.parse(excludedResult.content[excludedResult.content.length - 1]!.text);
    expect(excludedBody.paragraphCount).toBe(withBody.paragraphCount - 1);
    expect(excludedBody.placeholderCount).toBe(1);
  });
```

This requires importing `handleEditPar` from `./edit-par.ts` if it isn't already imported in the
test file — add `import { handleEditPar } from "./edit-par.ts";` alongside the other imports if
missing.

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test src/tools/breakdown.test.ts src/tools/get-script-stats.test.ts`
Expected: FAIL — `buildScriptStats(doc, { excludePlaceholders: true })` either errors (extra
argument on a one-parameter function, depending on TS strictness) or the second call returns the
same counts as the first because the option is ignored; `excludePlaceholders` on the tool call is
similarly ignored.

- [ ] **Step 4: Implement `excludePlaceholders` in `buildScriptStats`**

In `src/tools/breakdown.ts`, change the function signature and loop:

```typescript
export function buildScriptStats(doc: FdxDocument, opts?: { excludePlaceholders?: boolean }): ScriptStats {
  const paragraphs = doc.getParagraphElements();
  const excludePlaceholders = opts?.excludePlaceholders ?? false;
  const stats: ScriptStats = {
    totalPages: 0,
    sceneCount: 0,
    actBreakCount: 0,
    paragraphCount: 0,
    byType: {},
    adornmentStyleCount: 0,
    winVoiceCount: 0,
    totalTextRuns: 0,
    curlyQuoteCount: 0,
    flaggedWordCount: 0,
    placeholderCount: 0,
  };
  for (const p of paragraphs) {
    const isPlaceholder = isPlaceholderParagraph(p);
    if (isPlaceholder) stats.placeholderCount++;

    // totalPages is computed unconditionally, before the exclusion check below, so it is
    // identical whether or not excludePlaceholders is set — see Global Constraints.
    const sp = getSceneProperties(p);
    if (sp && sp.page !== "") {
      const page = parseInt(sp.page, 10);
      if (!Number.isNaN(page) && page > stats.totalPages) stats.totalPages = page;
    }

    if (excludePlaceholders && isPlaceholder) continue;

    stats.paragraphCount++;
    const type = getParagraphType(p);
    stats.byType[type] = (stats.byType[type] ?? 0) + 1;
    if (type.toLowerCase() === "scene heading") stats.sceneCount++;
    if (type.toLowerCase() === "act&scene break" || type.toLowerCase() === "act break") stats.actBreakCount++;
  }

  const integrity: IntegrityCounts = { totalTextRuns: 0, adornmentStyleCount: 0, flaggedWordCount: 0, curlyQuoteCount: 0 };
  walkIntegrityCounts(doc.root, integrity);
  stats.totalTextRuns = integrity.totalTextRuns;
  stats.adornmentStyleCount = integrity.adornmentStyleCount;
  stats.flaggedWordCount = integrity.flaggedWordCount;
  stats.curlyQuoteCount = integrity.curlyQuoteCount;
  stats.winVoiceCount = countWinVoiceOccurrences(doc.root);

  return stats;
}
```

Note `paragraphCount` moved from being initialized to `paragraphs.length` up front to being
incremented inside the loop (skipping the `continue`d placeholders when `excludePlaceholders` is
true) — this is the one behavioral change beyond the new option itself, and it's required for
`paragraphCount` to actually reflect exclusion. `totalPages` is computed *before* the
`excludePlaceholders` check, from every paragraph unconditionally — so it comes out identical
regardless of the flag, even in the edge case where a placeholder paragraph happens to be typed as
a Scene Heading and carries its own `SceneProperties.Page`. This is what the Global Constraints
section requires: `totalPages` reflects Final Draft's own pagination and must not appear to change
based on a filter this server applies after the fact.

- [ ] **Step 5: Wire the tool input and pass it through**

In `src/tools/get-script-stats.ts`, add the new input property:

```typescript
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      excludePlaceholders: {
        type: "boolean",
        description:
          "when true, exclude whole-bracket placeholder paragraphs (e.g. \"[FIX - ...]\") from paragraphCount, byType, sceneCount, and actBreakCount — placeholderCount is still reported either way",
      },
    },
    required: ["path"],
  },
```

And in `handleGetScriptStats`:

```typescript
export async function handleGetScriptStats(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");
  const excludePlaceholders = Boolean(args?.excludePlaceholders);

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const stats = buildScriptStats(doc, { excludePlaceholders });
  return pushCacheWarning(textResult(JSON.stringify(stats)), warning);
}
```

Also update the tool's `description` string to mention the new field/option — append to the
existing description (don't replace the parts about integrity counts from the prior phase):

```typescript
  description:
    'Read-Only. Retrieve high-level document metrics as JSON: total pages, scene count, act break count, total paragraph count, a per-paragraph-type breakdown, document integrity counts (adornmentStyleCount, winVoiceCount, totalTextRuns, curlyQuoteCount, flaggedWordCount — flaggedWordCount is the AdornmentStyle="-1" subset of adornmentStyleCount, Final Draft\'s unknown-word marker; see get_flagged_words to list them individually), and placeholderCount (whole-bracket paragraphs like "[FIX - ...]", counted regardless of paragraph type). Pass excludePlaceholders=true to exclude them from paragraphCount/byType/sceneCount/actBreakCount so a baseline is recoverable without deleting anything; totalPages is unaffected either way. Call this first for a quick overview before deeper inspection, or to confirm nothing was altered by a sweep (compare these counts before/after).',
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `bun test src/tools/breakdown.test.ts src/tools/get-script-stats.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/tools/breakdown.ts src/tools/get-script-stats.ts src/tools/get-script-stats.test.ts
git commit -m "Add excludePlaceholders option to get_script_stats

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: New `get_placeholders` tool

**Files:**
- Create: `src/tools/get-placeholders.ts`
- Test: `src/tools/get-placeholders.test.ts`

**Interfaces:**
- Consumes: `isPlaceholderParagraph(p: XmlElement): boolean` from Task 1;
  `getParagraphId`, `getParagraphType`, `paragraphText` from `../fdx/paragraph.ts`;
  `findContainingSectionIndex` from `../fdx/sections.ts`; `getSceneProperties` from
  `./breakdown.ts` — the same set `get-flagged-words.ts` already uses for page resolution.
- Produces: `export const getPlaceholdersTool: FdxTool` and
  `export async function handleGetPlaceholders(args): Promise<ToolResult>` — for Task 4's
  registration in `src/index.ts` and `src/tools/context-data.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/tools/get-placeholders.test.ts`, modeled directly on
`src/tools/get-flagged-words.test.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleGetPlaceholders } from "./get-placeholders.ts";
import { handleReadFdx } from "./read-fdx.ts";

function fixture(bodyXml: string): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-placeholders-"));
  const path = join(dir, "script.fdx");
  const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>${bodyXml}</Content>
</FinalDraft>`;
  writeFileSync(path, source, "utf-8");
  return path;
}

function body(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[result.content.length - 1]!.text);
}

describe("get_placeholders", () => {
  test("path is required", async () => {
    expect((await handleGetPlaceholders(undefined)).isError).toBe(true);
  });

  test("reports a whole-bracket paragraph with id/type and page", async () => {
    const path = fixture(`
      <Paragraph Type="Scene Heading" id="sh1"><Text>INT. CAVE</Text>
        <SceneProperties Page="14"/>
      </Paragraph>
      <Paragraph Type="General" id="p1"><Text>[FIX - move this scene earlier]</Text></Paragraph>
    `);
    await handleReadFdx({ path });
    const result = await handleGetPlaceholders({ path });
    expect(result.isError).toBeFalsy();
    const b = body(result);
    expect(b.count).toBe(1);
    expect(b.placeholders).toEqual([
      { id: "p1", type: "General", text: "[FIX - move this scene earlier]", page: 14 },
    ]);
  });

  test("a placeholder before any section heading gets a null page", async () => {
    const path = fixture(`<Paragraph Type="General" id="p1"><Text>[FIX - x]</Text></Paragraph>`);
    await handleReadFdx({ path });
    const b = body(await handleGetPlaceholders({ path }));
    expect((b.placeholders as Array<{ page: number | null }>)[0]!.page).toBeNull();
  });

  test("a bracket alongside real content is not reported", async () => {
    const path = fixture(`<Paragraph Type="Action" id="a1"><Text>INT. CAVE - DAY [FIX - check slug]</Text></Paragraph>`);
    await handleReadFdx({ path });
    const b = body(await handleGetPlaceholders({ path }));
    expect(b.placeholders).toEqual([]);
    expect(b.count).toBe(0);
  });

  test("matches regardless of paragraph type", async () => {
    const path = fixture(`<Paragraph Type="Dialogue" id="d1"><Text>[NOTE: check timing]</Text></Paragraph>`);
    await handleReadFdx({ path });
    const b = body(await handleGetPlaceholders({ path }));
    expect(b.count).toBe(1);
  });

  test("no placeholders returns an empty list, not an error", async () => {
    const path = fixture(`<Paragraph Type="Action" id="a1"><Text>Grog picks up a rock.</Text></Paragraph>`);
    await handleReadFdx({ path });
    const result = await handleGetPlaceholders({ path });
    expect(result.isError).toBeFalsy();
    expect(body(result)).toMatchObject({ placeholders: [], count: 0 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/get-placeholders.test.ts`
Expected: FAIL — `./get-placeholders.ts` does not exist yet (module not found).

- [ ] **Step 3: Implement the tool**

Create `src/tools/get-placeholders.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_placeholders — Read-Only. Lists every paragraph whose full text is entirely one [...] span
 * (e.g. "[FIX - ...]" drafting notes), regardless of paragraph type. Pairs with batch_edit +
 * edit_par action=remove to bulk-clear them once applied.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, getParagraphType, paragraphText } from "../fdx/paragraph.ts";
import { findContainingSectionIndex } from "../fdx/sections.ts";
import { getSceneProperties, isPlaceholderParagraph } from "./breakdown.ts";

export const getPlaceholdersTool: FdxTool = {
  name: "get_placeholders",
  description:
    'Read-Only. Lists every paragraph whose full text (trimmed) is entirely one [...] span — a drafting placeholder like "[FIX - ...]" — regardless of paragraph type, as {id, type, text, page} per hit. Scoped to top-level body paragraphs (nested DualDialogue paragraphs are out of scope, same as find_par/get_flagged_words). Combine with batch_edit and edit_par action=remove to bulk-clear placeholders once applied; see also get_script_stats\'s placeholderCount and excludePlaceholders.',
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
    },
    required: ["path"],
  },
};

interface PlaceholderHit {
  id: string;
  type: string;
  text: string;
  page: number | null;
}

export async function handleGetPlaceholders(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const paragraphs = doc.getParagraphElements();
  const placeholders: PlaceholderHit[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]!;
    if (!isPlaceholderParagraph(p)) continue;

    const sectionIdx = findContainingSectionIndex(paragraphs, i);
    let page: number | null = null;
    if (sectionIdx !== -1) {
      const sp = getSceneProperties(paragraphs[sectionIdx]!);
      const parsedPage = sp ? parseInt(sp.page, 10) : NaN;
      page = Number.isNaN(parsedPage) ? null : parsedPage;
    }

    placeholders.push({
      id: getParagraphId(p),
      type: getParagraphType(p),
      text: paragraphText(p),
      page,
    });
  }

  const body = { placeholders, count: placeholders.length };
  return pushCacheWarning(textResult(JSON.stringify(body, null, 2)), warning);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/get-placeholders.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/tools/get-placeholders.ts src/tools/get-placeholders.test.ts
git commit -m "Add get_placeholders tool

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Registration and documentation sync

**Files:**
- Modify: `src/index.ts`
- Modify: `src/tools/context-data.ts`
- Modify: `TOOLS.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `README.md`

**Interfaces:**
- Consumes: `getPlaceholdersTool`, `handleGetPlaceholders` from `./tools/get-placeholders.ts`
  (Task 3). `get_script_stats` and `edit_spell_check` are already registered from prior phases —
  only their descriptions changed (Task 2), no new registration needed for them.

- [ ] **Step 1: Register `get_placeholders` in `src/index.ts`**

Add the import near the other `get-*` breakdown-family imports (next to
`getScriptStatsTool`/`getFlaggedWordsTool`):

```typescript
import { getPlaceholdersTool, handleGetPlaceholders } from "./tools/get-placeholders.ts";
```

Add to the tool list array, next to `getFlaggedWordsTool`:

```typescript
  getScriptStatsTool,
  getFlaggedWordsTool,
  getPlaceholdersTool,
  getSceneIndexTool,
```

Add to the dispatch map, next to `get_flagged_words`:

```typescript
  get_script_stats: (args) => handleGetScriptStats(args),
  get_flagged_words: (args) => handleGetFlaggedWords(args),
  get_placeholders: (args) => handleGetPlaceholders(args),
  get_scene_index: (args) => handleGetSceneIndex(args),
```

- [ ] **Step 2: Update `src/tools/context-data.ts`**

Update the existing `get_script_stats` catalog entry to match Task 2's new tool description
(same string used in `get-script-stats.ts`):

```typescript
  {
    name: "get_script_stats",
    description:
      'Read-Only. Retrieve high-level document metrics as JSON: total pages, scene count, act break count, total paragraph count, a per-paragraph-type breakdown, document integrity counts (adornmentStyleCount, winVoiceCount, totalTextRuns, curlyQuoteCount, flaggedWordCount — flaggedWordCount is the AdornmentStyle="-1" subset of adornmentStyleCount, Final Draft\'s unknown-word marker; see get_flagged_words to list them individually), and placeholderCount (whole-bracket paragraphs like "[FIX - ...]", counted regardless of paragraph type). Pass excludePlaceholders=true to exclude them from paragraphCount/byType/sceneCount/actBreakCount so a baseline is recoverable without deleting anything; totalPages is unaffected either way. Call this first for a quick overview before deeper inspection, or to confirm nothing was altered by a sweep (compare these counts before/after).',
  },
```

Add a new entry directly after it:

```typescript
  {
    name: "get_placeholders",
    description:
      'Read-Only. Lists every paragraph whose full text (trimmed) is entirely one [...] span — a drafting placeholder like "[FIX - ...]" — regardless of paragraph type, as {id, type, text, page} per hit. Scoped to top-level body paragraphs (nested DualDialogue paragraphs are out of scope, same as find_par/get_flagged_words). Combine with batch_edit and edit_par action=remove to bulk-clear placeholders once applied; see also get_script_stats\'s placeholderCount and excludePlaceholders.',
  },
```

- [ ] **Step 3: Run the full suite**

Run: `bun test`
Expected: PASS, no regressions.

- [ ] **Step 4: Update `TOOLS.md`**

Increment the tool-count header line (`This server exposes N tools.`) by 1.

Update the `get_script_stats` row's Parameters column to `path, excludePlaceholders?` and its
Description column to match the new description string from Step 2.

Add a new row directly after it:

```
| get_placeholders          | path                                                                                                                                                                                                                                                                                  | Read-Only. Lists every paragraph whose full text (trimmed) is entirely one [...] span — a drafting placeholder like "[FIX - ...]" — regardless of paragraph type, as {id, type, text, page} per hit. Scoped to top-level body paragraphs (nested DualDialogue paragraphs are out of scope, same as find_par/get_flagged_words). Combine with batch_edit and edit_par action=remove to bulk-clear placeholders once applied; see also get_script_stats's placeholderCount and excludePlaceholders. |
```

- [ ] **Step 5: Bump `package.json` and add a `CHANGELOG.md` entry**

In `package.json`, bump `"version"` from `0.0.15` to `0.0.16`.

In `CHANGELOG.md`, add a new entry above the `[0.0.15]` entry:

```markdown
## [0.0.16] - 2026-08-02

### Added

- **`get_placeholders`** tool — lists every paragraph whose full text is entirely one `[...]` span (a drafting placeholder like `[FIX - ...]`), regardless of paragraph type, as `{id, type, text, page}` per hit. Combine with `batch_edit` and `edit_par action=remove` to bulk-clear them once applied.

### Changed

- **`get_script_stats`** now reports `placeholderCount` (always) and accepts `excludePlaceholders=true` to exclude whole-bracket placeholder paragraphs from `paragraphCount`, `byType`, `sceneCount`, and `actBreakCount` — a stable baseline while placeholders are still present, without deleting anything. `totalPages` is unaffected either way.
```

- [ ] **Step 6: Check `README.md`**

Extend the existing "Document integrity" feature bullet (already touched last phase for
`get_flagged_words`):

```markdown
- **Document integrity** — detect and repair paragraphs that silently share a duplicated id (a FinalDraft copy/paste artifact that otherwise makes id-addressed edits land on the wrong paragraph); list every unknown-word (spellcheck squiggle) hit with `get_flagged_words`, or just its count via `get_script_stats`, to confirm a sweep didn't alter anything; list or exclude drafting placeholders (`[FIX - ...]`-style whole-bracket paragraphs) with `get_placeholders` and `get_script_stats`'s `excludePlaceholders`, so a paragraph-count baseline stays usable while they're still in the document.
```

- [ ] **Step 7: Run the full suite again and commit**

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/index.ts src/tools/context-data.ts TOOLS.md CHANGELOG.md package.json README.md
git commit -m "Register get_placeholders and sync docs for wishlist item 10

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## After the plan: wishlist and push

Once all four tasks are committed, mark wishlist item 10 as **DONE** in
`F:\Vault\mcp\fdx-mcp-server\wishlist.md` (format: `— **DONE** (0.0.16, 2026-08-02)` appended to
its `## 10.` heading, matching every other completed item), then push this phase's commits to
`origin/master` — no tag, no publish, matching the established pattern for every prior phase.
