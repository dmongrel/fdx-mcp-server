# Flagged Words + Integrity Counts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement wishlist items 6+12 (folded) per
`docs/superpowers/specs/2026-08-02-flagged-words-and-integrity-counts-design.md`: five new integrity
fields on `get_script_stats`, a new `get_flagged_words` read-only tool, and a bulk-add `values` param
on `edit_spell_check`.

**Architecture:** One new recursive tree-walk helper in `breakdown.ts` (shared internally by the
`get_script_stats` extension), one new tool file (`get-flagged-words.ts`), and one small change to
`edit-spell-check.ts`'s existing handler (a loop, no shared-engine changes).

**Tech Stack:** TypeScript, Bun test runner, existing MCP tool-registration pattern in `src/index.ts`.

## Global Constraints

- Bun-first, Deno-compatible — no Bun/Node-only APIs beyond what's already in the codebase.
- `bun test` must stay green after every task.
- `winVoiceCount` counts `<Actor>` rows with a **non-empty** `WinVoice` value, not merely a present
  attribute — confirmed against `examples/Grog The Caveman.fdx`, whose `<Actors>` block gives every
  row `WinVoice=""` (present, empty) by default. Counting mere presence would report every actor row
  regardless of whether a voice was ever assigned, which isn't what "WinVoice occurrences" means.
- `adornmentStyleCount` counts `<Text>` runs with the attribute **present at all** (any value) — this
  one *is* presence-based, correctly, because an unstyled run never carries `AdornmentStyle` at all
  (confirmed against `replace-text.test.ts`'s existing assertion that a plain run's `attrs` is `{}`).
- `edit_spell_check`'s bulk-add loop only touches `edit-spell-check.ts` — `smart-type-ops.ts`'s
  shared `editSmartList` function is not modified, so the six `edit_smarttype_*` tools are
  unaffected.

---

### Task 1: `get_script_stats` integrity counts

**Files:**
- Modify: `src/tools/breakdown.ts`
- Modify: `src/tools/breakdown.test.ts`
- Modify: `src/tools/get-script-stats.ts`

**Interfaces:**
- Produces: `ScriptStats` gains `adornmentStyleCount`, `winVoiceCount`, `totalTextRuns`,
  `curlyQuoteCount`, `flaggedWordCount` (all `number`). `buildScriptStats` computes them via one new
  internal recursive walk plus one small `<Actors>` scan.

- [ ] **Step 1: Write the failing tests**

Add to `src/tools/breakdown.test.ts`'s existing `describe("buildScriptStats", ...)` block:

```typescript
  test("existing fields are unaffected by the new integrity counts", async () => {
    const doc = await loadFixture();
    const stats = buildScriptStats(doc);
    expect(stats.paragraphCount).toBe(53);
    expect(stats.sceneCount).toBe(6);
  });

  test("counts AdornmentStyle presence, WinVoice non-empty values, and total Text runs", () => {
    const source = `<?xml version="1.0"?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Action" id="p1">
      <Text>Plain run.</Text>
      <Text AdornmentStyle="-1">satys</Text>
      <Text AdornmentStyle="1">Bold run.</Text>
    </Paragraph>
  </Content>
  <Actors>
    <Actor Name="Man 1" WinVoice="somevoicedata"/>
    <Actor Name="Man 2" WinVoice=""/>
  </Actors>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const stats = buildScriptStats(doc);
    expect(stats.totalTextRuns).toBe(3);
    expect(stats.adornmentStyleCount).toBe(2); // "-1" and "1", not the plain run
    expect(stats.flaggedWordCount).toBe(1); // only "-1"
    expect(stats.winVoiceCount).toBe(1); // only the non-empty one
  });

  test("curlyQuoteCount counts paragraph text but not a WinVoice value with a lookalike byte", () => {
    const source = `<?xml version="1.0"?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Action" id="p1">
      <Text>He said “hello” and left.</Text>
    </Paragraph>
  </Content>
  <Actors>
    <Actor Name="Man 1" WinVoice="‘Q|Çg(Ð„{DEST"/>
  </Actors>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const stats = buildScriptStats(doc);
    expect(stats.curlyQuoteCount).toBe(2); // the “ and ” in paragraph text only
  });
```

Add `FdxDocument` to `breakdown.test.ts`'s imports (it currently imports `FdxDocument` already for
`loadFixture`'s return type — check the actual import line before editing; if `FdxDocument` isn't
already imported as a value, add `import { FdxDocument } from "../fdx/document.ts";`).

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/breakdown.test.ts`
Expected: FAIL — the new `ScriptStats` fields are `undefined`.

- [ ] **Step 3: Implement**

In `src/tools/breakdown.ts`, update the import line:

```typescript
import type { FdxDocument } from "../fdx/document.ts";
import { findChild, findChildren, getAttr, type XmlElement, type XmlNode } from "../fdx/xml.ts";
import { getParagraphId, getParagraphType, paragraphText } from "../fdx/paragraph.ts";
import { isSectionType } from "../fdx/sections.ts";
```

Update `ScriptStats`:

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
}
```

Add a new helper above `buildScriptStats` (after the `ScriptStats` interface, or anywhere in the
file — placing it just before `buildScriptStats` keeps it close to its only caller):

```typescript
const CURLY_QUOTE_RE = /[“”‘’]/g;

interface IntegrityCounts {
  totalTextRuns: number;
  adornmentStyleCount: number;
  flaggedWordCount: number;
  curlyQuoteCount: number;
}

/**
 * Walks the whole document tree once, counting every <Text> run (styled or not), how many carry an
 * AdornmentStyle attribute at all, how many are specifically "-1" (Final Draft's unknown-word
 * marker), and curly-quote characters in text-node content. Scoped to the whole tree (not just
 * top-level body paragraphs) since a raw-regex sweep isn't scoped that way either. Never inspects
 * attribute values for curly quotes, so <Actors>' WinVoice/MacVoice blobs are excluded by
 * construction, not by special-casing them.
 */
function walkIntegrityCounts(node: XmlNode, acc: IntegrityCounts): void {
  if (node.type === "text") {
    const matches = node.value.match(CURLY_QUOTE_RE);
    if (matches) acc.curlyQuoteCount += matches.length;
    return;
  }
  if (node.type !== "element") return;
  if (node.name === "Text") {
    acc.totalTextRuns++;
    const adornment = getAttr(node, "AdornmentStyle");
    if (adornment !== undefined) acc.adornmentStyleCount++;
    if (adornment === "-1") acc.flaggedWordCount++;
  }
  for (const child of node.children) walkIntegrityCounts(child, acc);
}

/** Counts <Actor> rows under <Actors> with a non-empty WinVoice value (not merely a present one — a
 *  default/never-assigned row still carries WinVoice="", which isn't a real voice occurrence). */
function countWinVoiceOccurrences(root: XmlElement): number {
  const actors = findChild(root, "Actors");
  if (!actors) return 0;
  return findChildren(actors, "Actor").filter((a) => (getAttr(a, "WinVoice") ?? "") !== "").length;
}
```

In `buildScriptStats`, add the new computation before the `return stats;` line:

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
  };
  for (const p of paragraphs) {
    const type = getParagraphType(p);
    stats.byType[type] = (stats.byType[type] ?? 0) + 1;
    if (type.toLowerCase() === "scene heading") stats.sceneCount++;
    if (type.toLowerCase() === "act&scene break" || type.toLowerCase() === "act break") stats.actBreakCount++;
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

In `src/tools/get-script-stats.ts`, update the tool description:

```typescript
  description:
    "Read-Only. Retrieve high-level document metrics as JSON: total pages, scene count, act break count, total paragraph count, a per-paragraph-type breakdown, and document integrity counts (adornmentStyleCount, winVoiceCount, totalTextRuns, curlyQuoteCount, flaggedWordCount — flaggedWordCount is the AdornmentStyle=\"-1\" subset of adornmentStyleCount, Final Draft's unknown-word marker; see get_flagged_words to list them individually). Call this first for a quick overview before deeper inspection, or to confirm nothing was altered by a sweep (compare these counts before/after).",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/breakdown.test.ts`
Expected: PASS (all existing + 3 new).

- [ ] **Step 5: Run the full suite**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tools/breakdown.ts src/tools/breakdown.test.ts src/tools/get-script-stats.ts
git commit -m "Add document integrity counts to get_script_stats

Wishlist item 6, folded into item 12 per direction -- an extension to
the existing tool rather than a new one. adornmentStyleCount/
totalTextRuns/flaggedWordCount come from one recursive tree walk;
winVoiceCount counts non-empty WinVoice values specifically (a
default/unassigned Actor row still carries WinVoice=\"\", confirmed
against the Grog fixture); curlyQuoteCount only ever inspects
text-node content, so <Actors>' binary voice blobs are excluded by
construction, not by special-casing them."
```

---

### Task 2: `get_flagged_words` tool

**Files:**
- Create: `src/tools/get-flagged-words.ts`
- Create: `src/tools/get-flagged-words.test.ts`

**Interfaces:**
- Consumes: `getParagraphRuns` (`src/fdx/paragraph.ts`, existing export), `findContainingSectionIndex`
  (`src/fdx/sections.ts`, existing export from Phase A), `getSceneProperties` (`src/tools/breakdown.ts`,
  existing export), `doc.getIgnoredWords()` (existing `FdxDocument` accessor).
- Produces: `getFlaggedWordsTool: FdxTool`, `handleGetFlaggedWords(args): Promise<ToolResult>`.

- [ ] **Step 1: Write the failing tests**

Create `src/tools/get-flagged-words.test.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleGetFlaggedWords } from "./get-flagged-words.ts";
import { handleReadFdx } from "./read-fdx.ts";

function fixture(bodyXml: string, ignoredWords: string[] = []): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-flagged-words-"));
  const path = join(dir, "script.fdx");
  const ignoreXml = ignoredWords.length
    ? `<SpellCheckIgnoreLists><IgnoredWords>${ignoredWords.map((w) => `<Word>${w}</Word>`).join("")}</IgnoredWords></SpellCheckIgnoreLists>`
    : "";
  const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>${bodyXml}</Content>
  ${ignoreXml}
</FinalDraft>`;
  writeFileSync(path, source, "utf-8");
  return path;
}

function body(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[result.content.length - 1]!.text);
}

describe("get_flagged_words", () => {
  test("path is required", async () => {
    expect((await handleGetFlaggedWords(undefined)).isError).toBe(true);
  });

  test("reports a flagged run with paragraph id/type and page", async () => {
    const path = fixture(`
      <Paragraph Type="Scene Heading" id="sh1"><Text>INT. CAVE</Text>
        <SceneProperties><Page>14</Page></SceneProperties>
      </Paragraph>
      <Paragraph Type="Dialogue" id="d1"><Text AdornmentStyle="-1">satys</Text></Paragraph>
    `);
    await handleReadFdx({ path });
    const result = await handleGetFlaggedWords({ path });
    expect(result.isError).toBeFalsy();
    const b = body(result);
    expect(b.count).toBe(1);
    expect(b.flaggedWords).toEqual([{ word: "satys", paragraphId: "d1", paragraphType: "Dialogue", page: 14 }]);
  });

  test("a run before any section heading gets a null page", async () => {
    const path = fixture(`<Paragraph Type="Action" id="a1"><Text AdornmentStyle="-1">Talpek</Text></Paragraph>`);
    await handleReadFdx({ path });
    const b = body(await handleGetFlaggedWords({ path }));
    expect((b.flaggedWords as Array<{ page: number | null }>)[0]!.page).toBeNull();
  });

  test("a styled but not flagged run is not reported", async () => {
    const path = fixture(`<Paragraph Type="Action" id="a1"><Text AdornmentStyle="1">Bold, not flagged.</Text></Paragraph>`);
    await handleReadFdx({ path });
    const b = body(await handleGetFlaggedWords({ path }));
    expect(b.flaggedWords).toEqual([]);
    expect(b.count).toBe(0);
  });

  test("no flagged words returns an empty list, not an error", async () => {
    const path = fixture(`<Paragraph Type="Action" id="a1"><Text>Plain.</Text></Paragraph>`);
    await handleReadFdx({ path });
    const result = await handleGetFlaggedWords({ path });
    expect(result.isError).toBeFalsy();
    expect(body(result)).toMatchObject({ flaggedWords: [], count: 0 });
  });

  test("excludeIgnoreList filters a word already in the ignore list, case-insensitively", async () => {
    const path = fixture(
      `<Paragraph Type="Action" id="a1"><Text AdornmentStyle="-1">Talpek</Text></Paragraph>`,
      ["talpek"],
    );
    await handleReadFdx({ path });
    const withFilter = body(await handleGetFlaggedWords({ path, excludeIgnoreList: true }));
    expect(withFilter.flaggedWords).toEqual([]);
    const without = body(await handleGetFlaggedWords({ path, excludeIgnoreList: false }));
    expect((without.flaggedWords as unknown[]).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/get-flagged-words.test.ts`
Expected: FAIL — `Cannot find module './get-flagged-words.ts'`.

- [ ] **Step 3: Implement**

Create `src/tools/get-flagged-words.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_flagged_words — Read-Only. Surfaces every <Text> run carrying AdornmentStyle="-1" (Final
 * Draft's unknown-word marker, the on-screen squiggle) as a ready-made typo index — every
 * misspelling in a script is already marked in the file, this just asks for the list instead of
 * calling get_par_runs on every paragraph one at a time.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, getParagraphType, getParagraphRuns } from "../fdx/paragraph.ts";
import { findContainingSectionIndex } from "../fdx/sections.ts";
import { getSceneProperties } from "./breakdown.ts";

export const getFlaggedWordsTool: FdxTool = {
  name: "get_flagged_words",
  description:
    "Read-Only. Surfaces every <Text> run carrying AdornmentStyle=\"-1\" — Final Draft's unknown-word marker — as {word, paragraphId, paragraphType, page} per hit. Scoped to top-level body paragraphs (nested DualDialogue paragraphs are out of scope, same as find_par/replace_text). Pass excludeIgnoreList=true to filter out words already in the spell-check ignore list.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      excludeIgnoreList: {
        type: "boolean",
        description: "when true, omit words already in the spell-check ignore list (default false)",
      },
    },
    required: ["path"],
  },
};

interface FlaggedWord {
  word: string;
  paragraphId: string;
  paragraphType: string;
  page: number | null;
}

export async function handleGetFlaggedWords(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");
  const excludeIgnoreList = Boolean(args?.excludeIgnoreList);

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const ignoreSet = new Set(doc.getIgnoredWords().map((w) => w.toLowerCase()));
  const paragraphs = doc.getParagraphElements();
  const flaggedWords: FlaggedWord[] = [];

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i]!;
    for (const run of getParagraphRuns(p)) {
      if (run.attrs.AdornmentStyle !== "-1") continue;
      if (excludeIgnoreList && ignoreSet.has(run.content.toLowerCase())) continue;

      const sectionIdx = findContainingSectionIndex(paragraphs, i);
      let page: number | null = null;
      if (sectionIdx !== -1) {
        const sp = getSceneProperties(paragraphs[sectionIdx]!);
        const parsedPage = sp ? parseInt(sp.page, 10) : NaN;
        page = Number.isNaN(parsedPage) ? null : parsedPage;
      }

      flaggedWords.push({
        word: run.content,
        paragraphId: getParagraphId(p),
        paragraphType: getParagraphType(p),
        page,
      });
    }
  }

  const body = { flaggedWords, count: flaggedWords.length };
  return pushCacheWarning(textResult(JSON.stringify(body, null, 2)), warning);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/get-flagged-words.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full suite**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tools/get-flagged-words.ts src/tools/get-flagged-words.test.ts
git commit -m "Add get_flagged_words tool

Wishlist item 12 bullet 1: surfaces every AdornmentStyle=\"-1\" run
(Final Draft's unknown-word marker) as a ready-made typo index --
word, paragraph id/type, and page, reusing the same backward
containing-section scan find_par already uses. excludeIgnoreList
filters out words already in the spell-check ignore list. Not yet
registered as an MCP tool."
```

---

### Task 3: `edit_spell_check` bulk add

**Files:**
- Modify: `src/tools/edit-spell-check.ts`
- Modify: `src/tools/edit-spell-check.test.ts`

**Interfaces:**
- Consumes: `editSmartList` (`src/tools/smart-type-ops.ts`, existing export, unchanged signature).
- Produces: `handleEditSpellCheck` accepts a new `values?: string[]` arg for `action=create`.

- [ ] **Step 1: Write the failing tests**

Add to `src/tools/edit-spell-check.test.ts` (check the file's actual current test structure before
inserting — it colocates with `edit-spell-check.ts`, likely using a similar `freshCopy`/`freshDoc`
helper to other `edit_*` test files; match whatever pattern is already there):

```typescript
  test("action=create with values adds every word in one call", async () => {
    const { path, doc } = freshDoc("bulk-create");
    const result = await handleEditSpellCheck({ path, action: "create", values: ["Talpek", "Ethnen", "Vriha"] });
    expect(result.isError).toBeFalsy();
    const words = doc.getIgnoredWords();
    expect(words).toContain("Talpek");
    expect(words).toContain("Ethnen");
    expect(words).toContain("Vriha");
  });

  test("values takes precedence over value when both are given", async () => {
    const { path, doc } = freshDoc("bulk-precedence");
    await handleEditSpellCheck({ path, action: "create", value: "ShouldNotAppear", values: ["OnlyThis"] });
    const words = doc.getIgnoredWords();
    expect(words).toContain("OnlyThis");
    expect(words).not.toContain("ShouldNotAppear");
  });

  test("uppercase/dedup still apply correctly after a bulk add", async () => {
    const { path, doc } = freshDoc("bulk-cleanup");
    await handleEditSpellCheck({ path, action: "create", values: ["aaa", "bbb"], uppercase: true });
    const words = doc.getIgnoredWords();
    expect(words).toContain("AAA");
    expect(words).toContain("BBB");
  });
```

(Adjust the exact `freshDoc`/fixture-loading helper name to match whatever `edit-spell-check.test.ts`
already uses — read the file first if the name above doesn't match.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/edit-spell-check.test.ts`
Expected: FAIL — `values` isn't recognized; only the single `value` currently works.

- [ ] **Step 3: Implement**

In `src/tools/edit-spell-check.ts`, add `values` to the tool schema:

```typescript
      value: { type: "string", description: "(create) the new word to add to the list" },
      values: {
        type: "array",
        items: { type: "string" },
        description: "(create) a list of new words to add in one call; takes precedence over value if both are given",
      },
```

Update `handleEditSpellCheck`'s body — replace the single `editSmartList` call for `action=create`
with a branch that loops when `values` is present:

```typescript
export async function handleEditSpellCheck(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = args?.path as string | undefined;
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");

  const action = args?.action as string | undefined;

  let warning: string;
  let doc;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Fold any stray nested words into the single canonical list first.
  doc.consolidateSpellCheckWords();

  const values = args?.values as string[] | undefined;
  const cs = args?.cs as boolean | undefined;
  const uppercase = args?.uppercase as boolean | undefined;
  const dedup = args?.dedup as boolean | undefined;

  let successMsg: string;
  if (action === "create" && Array.isArray(values) && values.length > 0) {
    let workingList = doc.getIgnoredWords();
    for (const v of values) {
      const result = editSmartList(workingList, { action: "create", value: v, cs, uppercase, dedup });
      if (!result.ok) {
        return errResult(`failed to create ignore word "${v}": ${result.reason}`);
      }
      workingList = result.list;
    }
    doc.setIgnoredWords(workingList);
    successMsg = `Successfully created ${values.length} ignore word(s).`;
  } else {
    const e: SmartListEdit = {
      action,
      find: args?.find as string | undefined,
      replace: args?.replace as string | undefined,
      value: args?.value as string | undefined,
      cs,
      uppercase,
      dedup,
    };

    const result = editSmartList(doc.getIgnoredWords(), e);
    if (!result.ok) {
      return errResult(`failed to ${action} ignore word: ${result.reason}`);
    }
    doc.setIgnoredWords(result.list);
    successMsg = `Successfully ${actionPastTense(action ?? "")} spell-check ignore words.`;
  }

  const dirtyWarning = documentCache.touchDirty(path, doc);

  let out = textResult(`${successMsg} File updated in cache — call save_fdx to persist changes to disk.`);
  out = pushCacheWarning(out, warning);
  out = pushCacheWarning(out, dirtyWarning);
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/edit-spell-check.test.ts`
Expected: PASS (all existing + 3 new).

- [ ] **Step 5: Run the full suite**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tools/edit-spell-check.ts src/tools/edit-spell-check.test.ts
git commit -m "Add bulk-add values param to edit_spell_check

Wishlist item 12 bullet 3: action=create accepts values (an array)
alongside the existing single value, looping the existing
editSmartList function per word -- no changes to the shared engine
itself, so the six edit_smarttype_* tools that share it are
unaffected. values takes precedence over value when both are given."
```

---

### Task 4: Register `get_flagged_words`; documentation sync

**Files:**
- Modify: `src/index.ts`
- Modify: `src/tools/context-data.ts`
- Modify: `TOOLS.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Check: `README.md`

**Interfaces:** none new — `get_script_stats` and `edit_spell_check` are already registered (Tasks 1
and 3 only changed their existing behavior); only `get_flagged_words` needs new wiring.

- [ ] **Step 1: Register `get_flagged_words` in `src/index.ts`**

Add the import near `getScriptStatsTool`:

```typescript
import { getFlaggedWordsTool, handleGetFlaggedWords } from "./tools/get-flagged-words.ts";
```

Add `getFlaggedWordsTool,` to the tool-list array, and `get_flagged_words: (args) => handleGetFlaggedWords(args),`
to the dispatch map.

- [ ] **Step 2: Update `context-data.ts`**

Update `get_script_stats`'s existing catalog entry to match Task 1's new tool description. Add a new
`get_flagged_words` entry near it:

```typescript
  {
    name: "get_flagged_words",
    description:
      "Read-Only. Surfaces every <Text> run carrying AdornmentStyle=\"-1\" (Final Draft's unknown-word marker) as {word, paragraphId, paragraphType, page} per hit. Pass excludeIgnoreList=true to filter out words already in the spell-check ignore list.",
  },
```

Update `edit_spell_check`'s existing catalog entry to mention `values`:

```typescript
  {
    name: "edit_spell_check",
    description:
      "Add, change, remove, or fix entries in the spell-check ignore-words list (a single list of any-case words). action=create appends value, or every word in values (an array) in one call if given; action=edit replaces the first word equal to find (case-insensitive unless cs=true) with replace; action=remove deletes the first word equal to find; action=fix just cleans the list. Optional uppercase and dedup flags post-process the list, which is always alphabetized case-insensitively. Ignore-ranges are preserved untouched. After editing, call save_fdx to persist changes to disk.",
  },
```

- [ ] **Step 3: Run the full suite**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 4: Update `TOOLS.md`**

Update `get_script_stats`'s row description to match Task 1's new description. Update
`edit_spell_check`'s row parameters (`path, action, find?, replace?, value?, values?, cs?, uppercase?, dedup?`)
and description to match Task 3. Add a new row for `get_flagged_words` near `get_spell_check_lists`/
`edit_spell_check`. Increment the tool count header line by 1.

- [ ] **Step 5: Update `CHANGELOG.md`**

Add a new version entry above the current top entry:

```markdown
## [<next-patch-version>] - 2026-08-02

### Added

- **`get_script_stats` gains document integrity counts** — `adornmentStyleCount`, `winVoiceCount`, `totalTextRuns`, `curlyQuoteCount`, `flaggedWordCount`. Lets a caller confirm nothing was altered by a sweep (compare before/after) without shelling out to external tooling to count them.
- **`get_flagged_words`** tool — surfaces every run carrying `AdornmentStyle="-1"` (Final Draft's unknown-word marker) as a ready-made typo index: word, paragraph id/type, and page. Optional `excludeIgnoreList=true` filters out words already in the spell-check ignore list.
- **`edit_spell_check` gains a bulk-add `values` param** — `action=create` accepts an array of words in one call instead of one call per word.

### Changed

Nothing else changed in this release.
```

(Drop the empty "### Changed" section if it ends up genuinely empty — check at implementation time
whether anything else in this batch warrants it; if not, omit the heading entirely rather than
leaving a placeholder.)

Determine `<next-patch-version>` from `package.json`'s current version at implementation time
(increment the patch number by 1).

- [ ] **Step 6: Bump `package.json`**

Set `"version"` to the same `<next-patch-version>` used in the changelog entry.

- [ ] **Step 7: Check `README.md`**

Read `README.md`'s Features list. The existing "Document integrity" bullet (duplicate-id detection)
is the natural home for a clause about the new counts and `get_flagged_words`; confirm and draft the
exact wording at implementation time.

- [ ] **Step 8: Run the full suite one more time**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 9: Commit**

```bash
git add src/index.ts src/tools/context-data.ts TOOLS.md CHANGELOG.md package.json README.md
git commit -m "Register get_flagged_words; update docs; bump version"
```

## Self-Review Notes

- **Spec coverage:** integrity counts (spec section 1) map to Task 1; `get_flagged_words` (section 2)
  maps to Task 2; bulk add (section 3) maps to Task 3; documentation maps to Task 4.
- **The WinVoice/AdornmentStyle asymmetry is called out explicitly** in Global Constraints and
  re-stated in Task 1's commit message, since it's the one place this plan's logic isn't simply
  "count attribute presence" uniformly — worth being deliberate about so a future reader doesn't
  "fix" it into a bug.
- **Placeholder scan:** Task 4 Step 5's changelog template has a bracketed placeholder
  (`<next-patch-version>`) by design — flagged as resolved at implementation time, consistent with
  every prior phase's changelog step in this project.
