# Five Small Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five independent, small fixes from the wishlist: `find_duplicate_ids`/`fix_duplicate_ids`
report the DualDialogue skip count (item 20); `fix_duplicate_ids action=report` stops previewing a
`newId` it can't deliver on (item 21); `get_context`'s Dual Dialogue rule stops overstating the
wrapper's `Type` (item 22); `get_fdx_breakdown`'s Character Frequency section surfaces the same
skip warning `get_character_appearances` already has, in all three renderers (item 23); and the
text renderer's name column no longer runs into the following number for long names (item 24).

**Architecture:** Items 20/21 touch the two duplicate-id tool files together (same handler
pattern, same file pair). Item 22 is a single-sentence prose change. Items 23/24 both touch
`breakdown-report.ts`'s shared `BreakdownData`/renderers plus `breakdown-pdf.ts` and
`get-fdx-breakdown.ts`; item 23's warning threading is split into its own task from item 24's
`pad()` fix since they touch different functions and are independently reviewable/testable.

**Tech Stack:** TypeScript, Bun test runner — no new dependencies. Reuses the existing
`skippedNestedWarning`/`pushWarning`/`countNestedParagraphs` helpers already used by `find_par`,
`replace_text`, `get_flagged_words`, `get_placeholders`, and `get_character_appearances`.

## Global Constraints

- The skip-warning pattern is always: compute once per call via
  `skippedNestedWarning(countNestedParagraphs(doc.getParagraphElements()))`, apply via
  `pushWarning(result, skipWarning)` — a no-op when the count is `0`, since `skippedNestedWarning`
  returns `""` in that case and `pushWarning` no-ops on an empty string.
- Established prepend ordering (see `get-character-appearances.ts`/`find-par.ts`): apply
  `pushWarning` (skip warning) first, then wrap the result in `pushCacheWarning` (eviction
  warning) last, so on output the cache warning appears above the skip warning, which appears
  above the main content.
- Item 21: `newId` is dropped only from `action=report`'s serialized output. `planDuplicateIdFixes`
  keeps minting real UUIDs internally (needed by `applyDuplicateIdFixes`), and `action=fix`'s own
  response is unaffected — it still reports the real, just-written `newId`s.
- Item 24: the `pad()` fix applies to every call site in `breakdown-report.ts`, not just the
  Character Frequency column — it's a bug in the shared helper, not a one-off.
- No tool input/output schema changes anywhere in this plan — no `README.md`/`TOOLS.md` sync
  needed beyond the `CHANGELOG.md` entry in the final task. Item 21's tool description text change
  is picked up automatically by `get_context`/`search_actions`/`TOOLS.md` since all three are now
  derived from `registry.ts` (see the roster-drift fix earlier this session) — no manual mirror
  edit needed.

---

### Task 1: `find_duplicate_ids` reports the DualDialogue skip count

**Files:**
- Modify: `src/tools/find-duplicate-ids.ts`
- Test: `src/tools/find-duplicate-ids.test.ts`

**Interfaces:** none new — reuses `pushWarning`/`skippedNestedWarning` from `./shared.ts` and
`countNestedParagraphs` from `../fdx/paragraph.ts`, both already used elsewhere in the codebase.

- [ ] **Step 1: Write the failing tests**

Add to `src/tools/find-duplicate-ids.test.ts`. This needs `handleEditDualDialogue` imported and a
source string containing both a duplicate id pair and a `<DualDialogue>`-wrapped pair, so one test
fixture covers both concerns:

```typescript
import { handleEditDualDialogue } from "./edit-dual-dialogue.ts";
```

```typescript
const SOURCE_WITH_DUPES_AND_DUAL_DIALOGUE = `<?xml version="1.0"?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Action" id="dup"><Text>first</Text></Paragraph>
    <Paragraph Type="Character" id="char1"><Text>ALICE</Text></Paragraph>
    <Paragraph Type="Dialogue" id="dlg1"><Text>Hi.</Text></Paragraph>
    <Paragraph Type="Dialogue" id="dup"><Text>second</Text></Paragraph>
  </Content>
</FinalDraft>`;

describe("find_duplicate_ids with a DualDialogue in the document", () => {
  async function withDualDialogue(key: string) {
    const path = freshDoc(key, SOURCE_WITH_DUPES_AND_DUAL_DIALOGUE);
    await handleEditDualDialogue({ path, action: "create", ids: ["char1", "dlg1"] });
    return path;
  }

  test("reports the skipped-nested count alongside the duplicate groups", async () => {
    const path = await withDualDialogue("skip-warning");
    const result = await handleFindDuplicateIds({ path });
    expect(result.isError).toBeFalsy();
    const text = result.content.map((c) => c.text).join("\n");
    expect(text).toContain("2 paragraph(s) nested inside a DualDialogue block were not scanned by this call.");
  });

  test("no DualDialogue means no skip warning", async () => {
    const path = freshDoc("no-dual-dialogue", SOURCE_CLEAN);
    const result = await handleFindDuplicateIds({ path });
    expect(result.content[0]!.text).not.toContain("nested inside a DualDialogue");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/find-duplicate-ids.test.ts`
Expected: FAIL — the skip-count text is not present in either test's result yet.

- [ ] **Step 3: Implement the fix**

In `src/tools/find-duplicate-ids.ts`, change the imports from:

```typescript
import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { findDuplicateParagraphIds } from "../fdx/duplicate-ids.ts";
```

to:

```typescript
import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, pushWarning, skippedNestedWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { findDuplicateParagraphIds } from "../fdx/duplicate-ids.ts";
import { countNestedParagraphs } from "../fdx/paragraph.ts";
```

Change `handleFindDuplicateIds` from:

```typescript
export async function handleFindDuplicateIds(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const groups = findDuplicateParagraphIds(doc);
  const msg =
    groups.length === 0
      ? "No duplicate paragraph ids found."
      : JSON.stringify(groups, null, 2);

  return pushCacheWarning(textResult(msg), warning);
}
```

to:

```typescript
export async function handleFindDuplicateIds(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const skipWarning = skippedNestedWarning(countNestedParagraphs(doc.getParagraphElements()));

  const groups = findDuplicateParagraphIds(doc);
  const msg =
    groups.length === 0
      ? "No duplicate paragraph ids found."
      : JSON.stringify(groups, null, 2);

  return pushCacheWarning(pushWarning(textResult(msg), skipWarning), warning);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/find-duplicate-ids.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/tools/find-duplicate-ids.ts src/tools/find-duplicate-ids.test.ts
git commit -m "find_duplicate_ids: report the DualDialogue skip count (wishlist item 20)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: `fix_duplicate_ids` reports the skip count and stops previewing an unreliable `newId`

**Files:**
- Modify: `src/tools/fix-duplicate-ids.ts`
- Test: `src/tools/fix-duplicate-ids.test.ts`

**Interfaces:** none new — same helpers as Task 1.

- [ ] **Step 1: Write the failing tests**

Add to `src/tools/fix-duplicate-ids.test.ts`:

```typescript
import { handleEditDualDialogue } from "./edit-dual-dialogue.ts";
```

```typescript
const SOURCE_WITH_DUPES_AND_DUAL_DIALOGUE = `<?xml version="1.0"?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Action" id="dup"><Text>first</Text></Paragraph>
    <Paragraph Type="Character" id="char1"><Text>ALICE</Text></Paragraph>
    <Paragraph Type="Dialogue" id="dlg1"><Text>Hi.</Text></Paragraph>
    <Paragraph Type="Dialogue" id="dup"><Text>second</Text></Paragraph>
  </Content>
</FinalDraft>`;

describe("fix_duplicate_ids with a DualDialogue in the document", () => {
  async function withDualDialogue(key: string) {
    const { path } = freshDoc(key, SOURCE_WITH_DUPES_AND_DUAL_DIALOGUE);
    await handleEditDualDialogue({ path, action: "create", ids: ["char1", "dlg1"] });
    return path;
  }

  test("action=report reports the skipped-nested count", async () => {
    const path = await withDualDialogue("skip-report");
    const result = await handleFixDuplicateIds({ path, action: "report" });
    const text = result.content.map((c) => c.text).join("\n");
    expect(text).toContain("2 paragraph(s) nested inside a DualDialogue block were not scanned by this call.");
  });

  test("action=fix reports the skipped-nested count", async () => {
    const path = await withDualDialogue("skip-fix");
    const result = await handleFixDuplicateIds({ path, action: "fix" });
    const text = result.content.map((c) => c.text).join("\n");
    expect(text).toContain("2 paragraph(s) nested inside a DualDialogue block were not scanned by this call.");
  });

  test("no DualDialogue means no skip warning", async () => {
    const { path } = freshDoc("no-dual-dialogue", SOURCE_CLEAN);
    const result = await handleFixDuplicateIds({ path, action: "report" });
    expect(result.content[0]!.text).not.toContain("nested inside a DualDialogue");
  });
});

describe("fix_duplicate_ids action=report's newId omission", () => {
  test("report does not include newId in reassigned entries", async () => {
    const { path } = freshDoc("report-no-newid", SOURCE_WITH_DUPES);
    const result = await handleFixDuplicateIds({ path, action: "report" });
    const plan = JSON.parse(result.content[result.content.length - 1]!.text);
    expect(plan[0].reassigned[0]).not.toHaveProperty("newId");
    expect(plan[0].reassigned[0]).toHaveProperty("oldId", "dup");
    expect(plan[0].reassigned[0]).toHaveProperty("index");
    expect(plan[0].reassigned[0]).toHaveProperty("type");
  });

  test("fix still reports real newIds, unaffected by report's omission", async () => {
    const { path } = freshDoc("fix-still-has-newid", SOURCE_WITH_DUPES);
    const result = await handleFixDuplicateIds({ path, action: "fix" });
    const plan = JSON.parse(result.content[result.content.length - 1]!.text);
    expect(typeof plan[0].reassigned[0].newId).toBe("string");
    expect(plan[0].reassigned[0].newId.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/fix-duplicate-ids.test.ts`
Expected: FAIL — no skip-count text yet, and `action=report`'s output still includes `newId`.

- [ ] **Step 3: Implement the fix**

In `src/tools/fix-duplicate-ids.ts`, change the imports from:

```typescript
import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { applyDuplicateIdFixes, planDuplicateIdFixes } from "../fdx/duplicate-ids.ts";
```

to:

```typescript
import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, pushWarning, skippedNestedWarning, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { applyDuplicateIdFixes, planDuplicateIdFixes } from "../fdx/duplicate-ids.ts";
import { countNestedParagraphs } from "../fdx/paragraph.ts";
```

Change `fixDuplicateIdsTool.description` from:

```typescript
    "Repairs top-level body paragraphs that share the same id (see find_duplicate_ids). action=report previews the repair without changing anything; action=fix applies it: the first occurrence of each duplicated id (document order) keeps its id, every later occurrence gets a freshly minted uuid. After action=fix, call save_fdx to persist changes to disk.",
```

to:

```typescript
    "Repairs top-level body paragraphs that share the same id (see find_duplicate_ids). action=report previews which paragraphs would be reassigned without changing anything or minting ids yet (ids are freshly minted at action=fix time, so report's preview has no newId to show); action=fix applies it: the first occurrence of each duplicated id (document order) keeps its id, every later occurrence gets a freshly minted uuid. After action=fix, call save_fdx to persist changes to disk.",
```

Change `handleFixDuplicateIds` from:

```typescript
export async function handleFixDuplicateIds(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  const action = arg<string>(args, "action");
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");
  if (action !== "report" && action !== "fix") return errResult('action must be "report" or "fix"');

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const plan = planDuplicateIdFixes(doc);
  if (plan.length === 0) {
    return pushCacheWarning(textResult("No duplicate paragraph ids found; nothing to fix."), warning);
  }

  if (action === "report") {
    return pushCacheWarning(textResult(JSON.stringify(plan, null, 2)), warning);
  }

  applyDuplicateIdFixes(doc, plan);
  const dirtyWarning = documentCache.touchDirty(path, doc);
  const msg = `Reassigned ids for ${plan.reduce((n, g) => n + g.reassigned.length, 0)} duplicate paragraph(s) across ${plan.length} id(s). File updated in cache — call save_fdx to persist changes to disk.\n${JSON.stringify(plan, null, 2)}`;
  return pushCacheWarning(pushCacheWarning(textResult(msg), dirtyWarning), warning);
}
```

to:

```typescript
export async function handleFixDuplicateIds(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  const action = arg<string>(args, "action");
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");
  if (action !== "report" && action !== "fix") return errResult('action must be "report" or "fix"');

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const skipWarning = skippedNestedWarning(countNestedParagraphs(doc.getParagraphElements()));

  const plan = planDuplicateIdFixes(doc);
  if (plan.length === 0) {
    return pushCacheWarning(pushWarning(textResult("No duplicate paragraph ids found; nothing to fix."), skipWarning), warning);
  }

  if (action === "report") {
    const preview = plan.map((g) => ({
      id: g.id,
      keptIndex: g.keptIndex,
      reassigned: g.reassigned.map(({ newId, ...rest }) => rest),
    }));
    return pushCacheWarning(pushWarning(textResult(JSON.stringify(preview, null, 2)), skipWarning), warning);
  }

  applyDuplicateIdFixes(doc, plan);
  const dirtyWarning = documentCache.touchDirty(path, doc);
  const msg = `Reassigned ids for ${plan.reduce((n, g) => n + g.reassigned.length, 0)} duplicate paragraph(s) across ${plan.length} id(s). File updated in cache — call save_fdx to persist changes to disk.\n${JSON.stringify(plan, null, 2)}`;
  return pushCacheWarning(pushCacheWarning(pushWarning(textResult(msg), skipWarning), dirtyWarning), warning);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/fix-duplicate-ids.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/tools/fix-duplicate-ids.ts src/tools/fix-duplicate-ids.test.ts
git commit -m "fix_duplicate_ids: report skip count, drop unreliable newId from preview (items 20, 21)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `get_context`'s Dual Dialogue rule stops overstating the wrapper's `Type`

**Files:**
- Modify: `src/tools/context-data.ts`

**Interfaces:** none — pure text change.

No test — this is a prose-only change with no observable behavior, matching how item 15 (also
pure wording) needed none in the `three-small-fixes` phase; covered structurally by
`registry.test.ts`'s existing parity checks, which don't inspect rule content.

- [ ] **Step 1: Edit the rule text**

In `src/tools/context-data.ts`, find the `"Dual Dialogue"` entry in `contextRules` and change:

```typescript
  {
    title: "Dual Dialogue",
    content:
      "Side-by-side dialogue is nested inside a Type='General' wrapper paragraph with a <DualDialogue> child. Use edit_dual_dialogue to create (move paragraphs into wrapper) or remove (delete wrapper, optionally extract contents).",
  },
```

to:

```typescript
  {
    title: "Dual Dialogue",
    content:
      "Side-by-side dialogue is nested inside a wrapper paragraph with a <DualDialogue> child; edit_dual_dialogue action=create always builds this wrapper with Type='General', but a wrapper Final Draft's own UI authors may instead carry the first contained paragraph's type (e.g. Type='Character') — don't filter on wrapper type to find dual-dialogue blocks. Use edit_dual_dialogue to create (move paragraphs into wrapper) or remove (delete wrapper, optionally extract contents).",
  },
```

- [ ] **Step 2: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions (no test asserts this rule's exact wording).

```bash
git add src/tools/context-data.ts
git commit -m "get_context: correct Dual Dialogue rule's wrapper Type claim (wishlist item 22)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `get_fdx_breakdown`'s Character Frequency section reports the DualDialogue skip count

**Files:**
- Modify: `src/tools/breakdown-report.ts`
- Modify: `src/tools/get-fdx-breakdown.ts`
- Test: `src/tools/breakdown-report.test.ts`
- Test: `src/tools/get-fdx-breakdown.test.ts`

**Interfaces:**
- Produces: `BreakdownData.skippedNestedCount: number`, consumed by Task 5 (PDF renderer).

- [ ] **Step 1: Write the failing tests**

Add to `src/tools/breakdown-report.test.ts`, inside a new `describe` block (needs
`countNestedParagraphs`-producing fixture — reuse the inline-XML + `DualDialogue`-via-XML pattern,
building the wrapper directly in the source string rather than via a tool call since this test file
works with `FdxDocument.parse` directly, not through handlers):

```typescript
describe("buildBreakdownData: skippedNestedCount", () => {
  test("counts paragraphs nested inside a DualDialogue block", () => {
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Scene Heading" id="sh1"><Text>INT. ROOM - DAY</Text></Paragraph>
    <Paragraph Type="Character" id="wrap">
      <Text>ALICE</Text>
      <DualDialogue>
        <Paragraph Type="Character" id="c1"><Text>ALICE</Text></Paragraph>
        <Paragraph Type="Dialogue" id="d1"><Text>Hi.</Text></Paragraph>
        <Paragraph Type="Character" id="c2"><Text>BOB</Text></Paragraph>
        <Paragraph Type="Dialogue" id="d2"><Text>Hey.</Text></Paragraph>
      </DualDialogue>
    </Paragraph>
  </Content>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const data = buildBreakdownData(doc);
    expect(data.skippedNestedCount).toBe(4);
  });

  test("zero when there's no DualDialogue block", async () => {
    const { doc } = await getCachedFdx(FIXTURE_PATH);
    const data = buildBreakdownData(doc);
    expect(data.skippedNestedCount).toBe(0);
  });
});

describe("renderBreakdownText: skip warning", () => {
  test("reports the skip count under CHARACTER FREQUENCY when present", () => {
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Character" id="wrap">
      <Text>ALICE</Text>
      <DualDialogue>
        <Paragraph Type="Character" id="c1"><Text>ALICE</Text></Paragraph>
        <Paragraph Type="Dialogue" id="d1"><Text>Hi.</Text></Paragraph>
      </DualDialogue>
    </Paragraph>
  </Content>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const data = buildBreakdownData(doc);
    const text = renderBreakdownText(data);
    expect(text).toContain("2 paragraph(s) nested inside a DualDialogue block were not scanned by this call.");
  });

  test("no skip line when skippedNestedCount is 0", async () => {
    const { doc } = await getCachedFdx(FIXTURE_PATH);
    const data = buildBreakdownData(doc);
    const text = renderBreakdownText(data);
    expect(text).not.toContain("nested inside a DualDialogue");
  });
});

describe("renderBreakdownHtml: skip warning", () => {
  test("reports the skip count in the characters section when present", () => {
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Character" id="wrap">
      <Text>ALICE</Text>
      <DualDialogue>
        <Paragraph Type="Character" id="c1"><Text>ALICE</Text></Paragraph>
        <Paragraph Type="Dialogue" id="d1"><Text>Hi.</Text></Paragraph>
      </DualDialogue>
    </Paragraph>
  </Content>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const data = buildBreakdownData(doc);
    const html = renderBreakdownHtml(data);
    expect(html).toContain("2 paragraph(s) nested inside a DualDialogue block were not scanned by this call.");
  });
});
```

This test file needs `FdxDocument` imported (check the existing import list — it already imports
`FdxDocument` from `../fdx/document.ts`, confirmed by the existing "computes scene-length extremes"
test in the same file, so no new import is needed there).

Add to `src/tools/get-fdx-breakdown.test.ts`, inside `describe("get_fdx_breakdown", ...)`:

```typescript
  test("the skip warning appears in the tool result and the text report when a DualDialogue is present", async () => {
    const dir = await makeTmpDir();
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Character" id="wrap">
      <Text>ALICE</Text>
      <DualDialogue>
        <Paragraph Type="Character" id="c1"><Text>ALICE</Text></Paragraph>
        <Paragraph Type="Dialogue" id="d1"><Text>Hi.</Text></Paragraph>
      </DualDialogue>
    </Paragraph>
  </Content>
</FinalDraft>`;
    const path = join(dir, "dual.fdx");
    await Bun.write(path, source);
    await handleReadFdx({ path });

    const targetPath = join(dir, "breakdown.txt");
    const result = await handleGetFdxBreakdown({ path, targetPath });
    expect(result.isError).toBeFalsy();
    const resultText = result.content.map((c) => c.text).join("\n");
    expect(resultText).toContain("2 paragraph(s) nested inside a DualDialogue block were not scanned by this call.");

    const text = await Bun.file(targetPath).text();
    expect(text).toContain("2 paragraph(s) nested inside a DualDialogue block were not scanned by this call.");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/breakdown-report.test.ts src/tools/get-fdx-breakdown.test.ts`
Expected: FAIL — `data.skippedNestedCount` is `undefined`, and no renderer emits the warning yet.

- [ ] **Step 3: Implement the fix**

In `src/tools/breakdown-report.ts`, change the imports from:

```typescript
import type { FdxDocument } from "../fdx/document.ts";
import { paragraphText } from "../fdx/paragraph.ts";
```

to:

```typescript
import type { FdxDocument } from "../fdx/document.ts";
import { paragraphText, countNestedParagraphs } from "../fdx/paragraph.ts";
import { skippedNestedWarning } from "./shared.ts";
```

Add `skippedNestedCount: number;` to the `BreakdownData` interface, after `noArcChars: string[];`:

```typescript
export interface BreakdownData {
  title: string;
  stats: ScriptStats;
  sortedTypes: string[];
  scenes: SceneInfo[];
  acts: SceneInfo[];
  appearances: Map<string, CharacterAppearance[]>;
  rankedChars: RankedCharacter[];
  pageMap: PageMapEntry[];
  arcs: ArcBeatData[];
  totalLength: number;
  shortestIdx: number;
  longestIdx: number;
  colorCoded: number;
  overOnePage: number;
  missingTime: number;
  noArcChars: string[];
  skippedNestedCount: number;
}
```

In `buildBreakdownData`, add the computation and include it in the returned object literal. Change:

```typescript
  const data: BreakdownData = {
    title,
    stats,
    sortedTypes,
    scenes,
    acts,
    appearances,
    rankedChars,
    pageMap,
    arcs,
    totalLength: 0,
    shortestIdx: -1,
    longestIdx: -1,
    colorCoded: 0,
    overOnePage: 0,
    missingTime: 0,
    noArcChars: [],
  };
```

to:

```typescript
  const data: BreakdownData = {
    title,
    stats,
    sortedTypes,
    scenes,
    acts,
    appearances,
    rankedChars,
    pageMap,
    arcs,
    totalLength: 0,
    shortestIdx: -1,
    longestIdx: -1,
    colorCoded: 0,
    overOnePage: 0,
    missingTime: 0,
    noArcChars: [],
    skippedNestedCount: countNestedParagraphs(doc.getParagraphElements()),
  };
```

In `renderBreakdownText`, change:

```typescript
  lines.push("CHARACTER FREQUENCY (top 10)");
  for (const c of d.rankedChars.slice(0, 10)) {
```

to:

```typescript
  lines.push("CHARACTER FREQUENCY (top 10)");
  if (d.skippedNestedCount > 0) {
    lines.push(`  ${skippedNestedWarning(d.skippedNestedCount)}`);
  }
  for (const c of d.rankedChars.slice(0, 10)) {
```

In `renderBreakdownHtml`, change:

```typescript
  parts.push(
    `<section id="characters"><h2>Character Frequency</h2><table><tr><th>#</th><th>Character</th><th>Appearances</th><th>Scenes</th></tr>`,
  );
```

to:

```typescript
  parts.push(`<section id="characters"><h2>Character Frequency</h2>`);
  if (d.skippedNestedCount > 0) {
    parts.push(`<p>${escapeHtml(skippedNestedWarning(d.skippedNestedCount))}</p>`);
  }
  parts.push(
    `<table><tr><th>#</th><th>Character</th><th>Appearances</th><th>Scenes</th></tr>`,
  );
```

In `src/tools/get-fdx-breakdown.ts`, change the imports from:

```typescript
import { arg, getCachedFdx, pushCacheWarning, textResult, errResult } from "./shared.ts";
```

to:

```typescript
import { arg, getCachedFdx, pushCacheWarning, pushWarning, skippedNestedWarning, textResult, errResult } from "./shared.ts";
```

Change the final two lines of `handleGetFdxBreakdown` from:

```typescript
  const result = textResult(`Wrote ${asType || "text"} breakdown report to ${targetPath}.`);
  return pushCacheWarning(result, warning);
```

to:

```typescript
  const result = textResult(`Wrote ${asType || "text"} breakdown report to ${targetPath}.`);
  return pushCacheWarning(pushWarning(result, skippedNestedWarning(data.skippedNestedCount)), warning);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/breakdown-report.test.ts src/tools/get-fdx-breakdown.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/tools/breakdown-report.ts src/tools/get-fdx-breakdown.ts src/tools/breakdown-report.test.ts src/tools/get-fdx-breakdown.test.ts
git commit -m "get_fdx_breakdown: report the DualDialogue skip count (wishlist item 23, text/html)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: PDF renderer reports the same skip count

**Files:**
- Modify: `src/tools/breakdown-pdf.ts`
- Test: `src/tools/breakdown-pdf.test.ts`

**Interfaces:**
- Consumes: `BreakdownData.skippedNestedCount` from Task 4.

- [ ] **Step 1: Write the failing test**

Add to `src/tools/breakdown-pdf.test.ts`. This needs a minimal `BreakdownData` object built by
hand (the file's existing test only exercises `Layout` directly, not `renderBreakdownPdf` — check
`breakdown-report.test.ts`'s `buildBreakdownData` for the full field list this must match).
`pdf-lib` doesn't expose text extraction, so the test compares rendered byte length between a
`skippedNestedCount: 0` document and an otherwise-identical `skippedNestedCount: 2` document as a
proxy for "the extra line was actually drawn" — the difference is real drawn text, so the version
with the warning line has extra draw-text operators in its content stream and never comes out
`<=` the byte size of the version without it:

```typescript
import { buildBreakdownData } from "./breakdown-report.ts";
import { FdxDocument } from "../fdx/document.ts";

test("includes the skip-count warning under Character Frequency when present", async () => {
  const baseSource = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Scene Heading" id="sh1"><Text>INT. ROOM - DAY</Text></Paragraph>
    <Paragraph Type="Character" id="c1"><Text>ALICE</Text></Paragraph>
    <Paragraph Type="Dialogue" id="d1"><Text>Hi.</Text></Paragraph>
  </Content>
</FinalDraft>`;
  const dualSource = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Scene Heading" id="sh1"><Text>INT. ROOM - DAY</Text></Paragraph>
    <Paragraph Type="Character" id="wrap">
      <Text>ALICE</Text>
      <DualDialogue>
        <Paragraph Type="Character" id="c1"><Text>ALICE</Text></Paragraph>
        <Paragraph Type="Dialogue" id="d1"><Text>Hi.</Text></Paragraph>
      </DualDialogue>
    </Paragraph>
  </Content>
</FinalDraft>`;

  const baseData = buildBreakdownData(FdxDocument.parse(baseSource));
  const dualData = buildBreakdownData(FdxDocument.parse(dualSource));
  expect(baseData.skippedNestedCount).toBe(0);
  expect(dualData.skippedNestedCount).toBe(2);

  const baseBytes = await renderBreakdownPdf(baseData);
  const dualBytes = await renderBreakdownPdf(dualData);
  expect(dualBytes.length).toBeGreaterThan(baseBytes.length);
});
```

This needs `renderBreakdownPdf` added to the existing `import { Layout } from "./breakdown-pdf.ts";`
line, changing it to `import { Layout, renderBreakdownPdf } from "./breakdown-pdf.ts";`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/tools/breakdown-pdf.test.ts`
Expected: FAIL — both renders currently produce the same Character Frequency content (one
character row either way), so `dualBytes.length` is not reliably greater than `baseBytes.length`
yet (the only difference today is the underlying character count, which is identical between the
two fixtures — both have exactly one `ALICE`/`Hi.` pair, one inside a wrapper and one not).

- [ ] **Step 3: Implement the fix**

In `src/tools/breakdown-pdf.ts`, add an import:

```typescript
import { skippedNestedWarning } from "./shared.ts";
```

Change:

```typescript
  // Character frequency as horizontal bars.
  l.newPage();
  l.heading("Character Frequency");
  const maxTotal = d.rankedChars.reduce((m, c) => Math.max(m, c.total), 0);
```

to:

```typescript
  // Character frequency as horizontal bars.
  l.newPage();
  l.heading("Character Frequency");
  if (d.skippedNestedCount > 0) {
    l.line(skippedNestedWarning(d.skippedNestedCount));
  }
  const maxTotal = d.rankedChars.reduce((m, c) => Math.max(m, c.total), 0);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/tools/breakdown-pdf.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/tools/breakdown-pdf.ts src/tools/breakdown-pdf.test.ts
git commit -m "get_fdx_breakdown: report the DualDialogue skip count (wishlist item 23, pdf)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: Character Frequency name column no longer runs into the count

**Files:**
- Modify: `src/tools/breakdown-report.ts`
- Test: `src/tools/breakdown-report.test.ts`

**Interfaces:** none new — `pad()` stays private to the file, called the same way by every
existing call site.

- [ ] **Step 1: Write the failing test**

Add to `src/tools/breakdown-report.test.ts`, inside `describe("renderBreakdownText", ...)`:

```typescript
  test("guarantees a space between a long character name and its appearance count", () => {
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Character" id="c1"><Text>CAPTAIN IRIKOV</Text></Paragraph>
    <Paragraph Type="Dialogue" id="d1"><Text>Report.</Text></Paragraph>
  </Content>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const data = buildBreakdownData(doc);
    const text = renderBreakdownText(data);
    expect(text).toContain("CAPTAIN IRIKOV 1 appearances");
    expect(text).not.toContain("CAPTAIN IRIKOV1");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/tools/breakdown-report.test.ts`
Expected: FAIL — the current output contains `"CAPTAIN IRIKOV1 appearances"` (no separating space,
`"CAPTAIN IRIKOV"` is 14 characters, exactly the pad width, so `pad()` returns it unchanged).

- [ ] **Step 3: Implement the fix**

In `src/tools/breakdown-report.ts`, change:

```typescript
function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}
```

to:

```typescript
function pad(s: string, width: number): string {
  return s.length >= width ? s + " " : s + " ".repeat(width - s.length);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/tools/breakdown-report.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions — every other `pad()` call site (paragraph-type counts, act
labels, scene-catalog columns) either stays under its width (unaffected) or gains the same
one-space guarantee this fixes for the character-frequency column.

```bash
git add src/tools/breakdown-report.ts src/tools/breakdown-report.test.ts
git commit -m "get_fdx_breakdown: guarantee a minimum column gap in pad() (wishlist item 24)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Version bump and CHANGELOG entry

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`
- Rebuild: `dist/index.js`

- [ ] **Step 1: Bump `package.json`**

Check `package.json`'s current `"version"` first and bump the patch number by one.

- [ ] **Step 2: Add a `CHANGELOG.md` entry**

Add a new entry at the top of `CHANGELOG.md`, above the previous most-recent entry, using that new
version number and today's date:

```markdown
### Fixed

- **`find_duplicate_ids`** and **`fix_duplicate_ids`** now report how many paragraphs nested inside a `DualDialogue` block were out of scope for the call, matching the warning `find_par`/`replace_text`/`get_flagged_words`/`get_placeholders`/`get_character_appearances` already carry.
- **`fix_duplicate_ids action=report`**'s preview no longer includes a `newId` per reassignment — it was freshly re-minted (and different) on the following `action=fix` call, so a caller comparing the two would never see a match. Ids are now documented as minted only at `action=fix` time.
- **`get_context`**'s Dual Dialogue rule no longer claims a wrapper paragraph always carries `Type='General'` — that's only true of wrappers `edit_dual_dialogue action=create` builds; a wrapper Final Draft's own UI authors may carry the first contained paragraph's type instead.
- **`get_fdx_breakdown`**'s Character Frequency section (text, HTML, and PDF) now carries the same DualDialogue skip-count warning `get_character_appearances` already has, both in the rendered report and in the tool's own response — previously the warning was computed but never surfaced.
- **`get_fdx_breakdown`**'s text report no longer runs a character name into its appearance count when the name is at or past the name column's width (e.g. `CAPTAIN IRIKOV121 appearances`) — a minimum one-space gap is now guaranteed regardless of name length.
```

- [ ] **Step 3: Rebuild `dist/`, run the full suite again, and commit**

```bash
bun run build
```

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add package.json CHANGELOG.md dist/index.js
git commit -m "Bump version for five small fixes (wishlist items 20-24)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## After the plan: wishlist and push

Once all seven tasks are committed, mark wishlist items 20, 21, 22, 23, and 24 as **DONE** in
`F:\Vault\mcp\fdx-mcp-server\wishlist.md` (format: `— **DONE** (<version>, 2026-08-02)` appended to
each item's heading, using the version bumped in Task 7). Push this phase's commits to
`origin/master` — no tag, no publish unless separately requested, matching the established pattern
for every prior phase.
