# Real-usage location tools + SmartType tool renames Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the six SmartType dictionary tool pairs to `get_smarttype_*`/`edit_smarttype_*`, then build new `get_locations`/`edit_locations` tools backed by actual Scene Heading text instead of the dictionary.

**Architecture:** Two new pure functions in `src/fdx/paragraph.ts` (run-preserving text splice) and `src/tools/breakdown.ts` (slugline-location offset lookup + per-location scene grouping, alongside the existing `parseSlugline`/`buildCharacterAppearances`) back the two new tool files. The six renames are mechanical: `git mv` plus identifier/string updates, no behavior change, using `smart-type-ops.ts`'s existing factory functions unchanged.

**Tech Stack:** TypeScript, Bun (`bun test`, `bun run typecheck`), existing fdx XML model (`src/fdx/xml.ts`, `src/fdx/document.ts`).

## Global Constraints

- Every edit tool marks the cache dirty via `documentCache.touchDirty` and tells the caller to call `save_fdx` — do not write to disk directly (from `CLAUDE.md` / existing tool conventions).
- Match existing code style: `SPDX-FileCopyrightText: 2026 Joel L. Caesar` / `SPDX-License-Identifier: MIT` header on every new/renamed `.ts` file (copy verbatim from any existing file).
- `cs` (case-sensitive) flags across this codebase default to `false` (case-insensitive) unless the caller passes `cs: true` — keep that convention for the new `edit_locations`.
- Run `bun test` after every task; it must stay green (currently 385 pass / 0 fail) before moving to the next task.
- Do not touch `parseSlugline`'s existing behavior or `get_scene_index`'s use of it (it stays applied to all section types, not just Scene Heading — that is intentional existing behavior, out of scope here).

---

### Task 1: `spliceParagraphText` — run-preserving text splice helper

**Files:**
- Modify: `src/fdx/paragraph.ts` (add function, after `findParagraphIdAttr`)
- Test: `src/fdx/paragraph.test.ts` (new file)

**Interfaces:**
- Produces: `export function spliceParagraphText(el: XmlElement, start: number, end: number, replacement: string): "single-run" | "collapsed"` — splices `replacement` into the paragraph's concatenated text at character range `[start, end)`. If that range falls entirely inside one `<Text>` run, only that run's content is rewritten (its attributes and every other run untouched) and the function returns `"single-run"`. Otherwise every run is collapsed into one plain (no-attrs) run holding the full new text, and the function returns `"collapsed"`.

- [ ] **Step 1: Write the failing tests**

Create `src/fdx/paragraph.test.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { FdxDocument } from "./document.ts";
import { spliceParagraphText } from "./paragraph.ts";
import { findChildren, textContent } from "./xml.ts";

function docWithParagraph(paragraphXml: string): FdxDocument {
  return FdxDocument.parse(`<?xml version="1.0"?>
<FinalDraft Version="6">
  <Content>
    ${paragraphXml}
  </Content>
</FinalDraft>`);
}

describe("spliceParagraphText", () => {
  test("splices within a single run, preserving that run's attributes", () => {
    const doc = docWithParagraph(
      `<Paragraph Type="Scene Heading" id="a"><Text AdornmentStyle="-1">INT. CAVE - NIGHT</Text></Paragraph>`,
    );
    const para = doc.getParagraphElements()[0]!;
    const outcome = spliceParagraphText(para, 5, 9, "CAVERN");
    expect(outcome).toBe("single-run");
    const runs = findChildren(para, "Text");
    expect(runs).toHaveLength(1);
    expect(textContent(runs[0]!)).toBe("INT. CAVERN - NIGHT");
    expect(runs[0]!.attrs).toEqual([["AdornmentStyle", "-1"]]);
  });

  test("leaves runs before/after the spliced run untouched", () => {
    const doc = docWithParagraph(
      `<Paragraph Type="Scene Heading" id="a"><Text>INT. </Text><Text AdornmentStyle="-1">CAVE</Text><Text> - NIGHT</Text></Paragraph>`,
    );
    const para = doc.getParagraphElements()[0]!;
    // "CAVE" is the second run, occupying [5, 9) in the concatenated text.
    const outcome = spliceParagraphText(para, 5, 9, "CAVERN");
    expect(outcome).toBe("single-run");
    const runs = findChildren(para, "Text");
    expect(runs).toHaveLength(3);
    expect(textContent(runs[0]!)).toBe("INT. ");
    expect(textContent(runs[1]!)).toBe("CAVERN");
    expect(runs[1]!.attrs).toEqual([["AdornmentStyle", "-1"]]);
    expect(textContent(runs[2]!)).toBe(" - NIGHT");
  });

  test("collapses to one plain run when the range spans multiple runs", () => {
    const doc = docWithParagraph(
      `<Paragraph Type="Scene Heading" id="a"><Text>INT. CA</Text><Text AdornmentStyle="-1">VE - NIGHT</Text></Paragraph>`,
    );
    const para = doc.getParagraphElements()[0]!;
    // "CAVE" spans both runs: [5, 9).
    const outcome = spliceParagraphText(para, 5, 9, "CAVERN");
    expect(outcome).toBe("collapsed");
    const runs = findChildren(para, "Text");
    expect(runs).toHaveLength(1);
    expect(textContent(runs[0]!)).toBe("INT. CAVERN - NIGHT");
    expect(runs[0]!.attrs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/fdx/paragraph.test.ts`
Expected: FAIL — `spliceParagraphText is not a function` (or a TypeScript import error), since it doesn't exist yet.

- [ ] **Step 3: Implement `spliceParagraphText`**

In `src/fdx/paragraph.ts`, add this import to the existing `xml.ts` import line at the top of the file (merge into the existing `import { ... } from "./xml.ts";` statement — it currently imports `type XmlElement, type XmlNode, createElement, findChildren, getAttr, setAttr, textContent`; add `setTextContent`):

```typescript
import { type XmlElement, type XmlNode, createElement, findChildren, getAttr, setAttr, setTextContent, textContent } from "./xml.ts";
```

Then append this function after `findParagraphIdAttr`:

```typescript
/**
 * Splices `replacement` into a paragraph's concatenated text at character range [start, end),
 * preserving <Text> run boundaries and attributes when that range falls entirely inside one run.
 * When the range spans more than one run, every run collapses into a single plain (no-attrs) run
 * holding the full new text — styling that straddled the splice point can't be preserved, so it's
 * dropped rather than guessed at.
 */
export function spliceParagraphText(
  el: XmlElement,
  start: number,
  end: number,
  replacement: string,
): "single-run" | "collapsed" {
  const runs = findChildren(el, "Text");
  let pos = 0;
  for (const run of runs) {
    const content = textContent(run);
    const runStart = pos;
    const runEnd = pos + content.length;
    if (start >= runStart && end <= runEnd) {
      const localStart = start - runStart;
      const localEnd = end - runStart;
      setTextContent(run, content.slice(0, localStart) + replacement + content.slice(localEnd));
      return "single-run";
    }
    pos = runEnd;
  }
  const full = paragraphText(el);
  setParagraphTextRuns(el, [{ content: full.slice(0, start) + replacement + full.slice(end) }]);
  return "collapsed";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/fdx/paragraph.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/fdx/paragraph.ts src/fdx/paragraph.test.ts
git commit -m "Add spliceParagraphText: run-preserving text splice for paragraph content"
```

---

### Task 2: Slugline-location lookup + per-location scene grouping in `breakdown.ts`

**Files:**
- Modify: `src/tools/breakdown.ts` (add functions after `parseSlugline` and after `rankCharacters`)
- Modify: `src/tools/breakdown.test.ts` (add test coverage)

**Interfaces:**
- Consumes: `parseSlugline(doc, text)` (existing, in this same file), `getParagraphId`/`getParagraphType`/`paragraphText` (existing imports in this file), `getSceneProperties` (existing private helper in this file).
- Produces:
  - `export interface SluglineLocation { intro: string; location: string; timeOfDay: string; start: number; end: number }`
  - `export function locateSluglineLocation(doc: FdxDocument, text: string): SluglineLocation | undefined`
  - `export interface LocationScene { id: string; text: string; page: number }`
  - `export function buildLocationAppearances(doc: FdxDocument): Map<string, LocationScene[]>`
  - `export interface RankedLocation { location: string; total: number }`
  - `export function rankLocations(appearances: Map<string, LocationScene[]>): RankedLocation[]`

- [ ] **Step 1: Write the failing tests**

Add to `src/tools/breakdown.test.ts`, in the imports block at the top (extend the existing `import { ... } from "./breakdown.ts";`):

```typescript
  locateSluglineLocation,
  buildLocationAppearances,
  rankLocations,
```

Then add these `describe` blocks anywhere after the existing `describe("parseSlugline", ...)` block:

```typescript
describe("locateSluglineLocation", () => {
  test("finds the location's character offsets within the full slugline text", async () => {
    const doc = await loadFixture();
    const text = "INT. CAVE - NIGHT";
    const loc = locateSluglineLocation(doc, text)!;
    expect(loc.location).toBe("CAVE");
    expect(text.slice(loc.start, loc.end)).toBe("CAVE");
    expect(loc.intro).toBe("INT");
    expect(loc.timeOfDay).toBe("NIGHT");
  });

  test("returns undefined when there is no location", async () => {
    const doc = await loadFixture();
    expect(locateSluglineLocation(doc, "")).toBeUndefined();
  });

  test("offsets stay correct with a multi-word location", async () => {
    const doc = await loadFixture();
    const text = "EXT. PREHISTORIC VALLEY - DAY";
    const loc = locateSluglineLocation(doc, text)!;
    expect(loc.location).toBe("PREHISTORIC VALLEY");
    expect(text.slice(loc.start, loc.end)).toBe("PREHISTORIC VALLEY");
  });
});

describe("buildLocationAppearances / rankLocations", () => {
  test("groups Scene Heading paragraphs by parsed location", async () => {
    const doc = await loadFixture();
    const appearances = buildLocationAppearances(doc);
    expect(appearances.get("CAVE")).toHaveLength(2);
    expect(appearances.get("PREHISTORIC VALLEY")).toHaveLength(4);
  });

  test("rankLocations sorts by scene count descending", async () => {
    const doc = await loadFixture();
    const ranked = rankLocations(buildLocationAppearances(doc));
    const valley = ranked.find((r) => r.location === "PREHISTORIC VALLEY")!;
    const cave = ranked.find((r) => r.location === "CAVE")!;
    expect(valley.total).toBe(4);
    expect(cave.total).toBe(2);
    expect(ranked.indexOf(valley)).toBeLessThan(ranked.indexOf(cave));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/breakdown.test.ts`
Expected: FAIL — the three new names aren't exported from `breakdown.ts` yet.

- [ ] **Step 3: Implement the three functions**

In `src/tools/breakdown.ts`, add directly after the closing brace of `parseSlugline` (before the `buildSceneIndex` doc comment):

```typescript
export interface SluglineLocation {
  intro: string;
  location: string;
  timeOfDay: string;
  /** Character offset of `location` within the original `text`, for splicing a replacement in. */
  start: number;
  end: number;
}

/**
 * Like parseSlugline, but also returns the character range the location occupies within `text` —
 * needed to splice a rename into a Scene Heading's actual <Text> runs without disturbing the
 * intro token, separators, or time-of-day around it.
 */
export function locateSluglineLocation(doc: FdxDocument, text: string): SluglineLocation | undefined {
  const { intro, location, timeOfDay } = parseSlugline(doc, text);
  if (location === "") return undefined;
  const searchFrom = intro ? text.indexOf(intro) + intro.length : 0;
  const start = text.indexOf(location, Math.max(searchFrom, 0));
  if (start === -1) return undefined;
  return { intro, location, timeOfDay, start, end: start + location.length };
}
```

Then add directly after the closing brace of `rankCharacters` (after its function body, before the next section's comment):

```typescript
export interface LocationScene {
  id: string;
  text: string;
  page: number;
}

/**
 * Walks every Scene Heading paragraph (only Scene Heading — other section types like Act Break
 * don't carry a real location, and parseSlugline would misparse them as if they did) and groups
 * them by parsed location.
 */
export function buildLocationAppearances(doc: FdxDocument): Map<string, LocationScene[]> {
  const result = new Map<string, LocationScene[]>();
  for (const p of doc.getParagraphElements()) {
    if (getParagraphType(p) !== "Scene Heading") continue;
    const text = paragraphText(p);
    const loc = locateSluglineLocation(doc, text);
    if (!loc) continue;
    const sp = getSceneProperties(p);
    const page = sp ? parseInt(sp.page, 10) || 0 : 0;
    const list = result.get(loc.location) ?? [];
    list.push({ id: getParagraphId(p), text, page });
    result.set(loc.location, list);
  }
  return result;
}

export interface RankedLocation {
  location: string;
  total: number;
}

/** Summarizes and sorts a location-appearances map by scene count descending, tie-breaking
 *  case-insensitively by name. Mirrors rankCharacters. */
export function rankLocations(appearances: Map<string, LocationScene[]>): RankedLocation[] {
  const ranked = [...appearances].map(([location, scenes]) => ({ location, total: scenes.length }));
  ranked.sort((a, b) => (a.total !== b.total ? b.total - a.total : compareNamesCI(a.location, b.location)));
  return ranked;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/breakdown.test.ts`
Expected: PASS — all tests including the 5 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/tools/breakdown.ts src/tools/breakdown.test.ts
git commit -m "Add locateSluglineLocation/buildLocationAppearances/rankLocations to breakdown.ts"
```

---

### Task 3: Export `addSmartTypeValue` from `edit-par.ts`

**Files:**
- Modify: `src/tools/edit-par.ts:67` (add `export` keyword)

**Interfaces:**
- Produces: `export function addSmartTypeValue(doc: FdxDocument, leaf: string, value: string): void` (signature unchanged — was already defined, just not exported).

- [ ] **Step 1: Make the existing function exported**

In `src/tools/edit-par.ts`, change:

```typescript
function addSmartTypeValue(doc: FdxDocument, leaf: string, value: string): void {
```

to:

```typescript
export function addSmartTypeValue(doc: FdxDocument, leaf: string, value: string): void {
```

- [ ] **Step 2: Run the full suite to confirm nothing broke**

Run: `bun test`
Expected: PASS — 385+ pass, 0 fail (exporting a previously-private function cannot change behavior; this step just confirms no typo).

- [ ] **Step 3: Commit**

```bash
git add src/tools/edit-par.ts
git commit -m "Export addSmartTypeValue from edit-par.ts for reuse by the new edit_locations tool"
```

---

### Task 4: Rename the six SmartType tool pairs to `get_smarttype_*`/`edit_smarttype_*`

**Files:** (12 source files + 12 test files renamed; `src/index.ts` modified)
- `src/tools/get-characters.ts` → `src/tools/get-smarttype-characters.ts` (+ `.test.ts`)
- `src/tools/edit-characters.ts` → `src/tools/edit-smarttype-characters.ts` (+ `.test.ts`)
- `src/tools/get-extensions.ts` → `src/tools/get-smarttype-extensions.ts` (+ `.test.ts`)
- `src/tools/edit-extensions.ts` → `src/tools/edit-smarttype-extensions.ts` (+ `.test.ts`)
- `src/tools/get-locations.ts` → `src/tools/get-smarttype-locations.ts` (+ `.test.ts`)
- `src/tools/edit-locations.ts` → `src/tools/edit-smarttype-locations.ts` (+ `.test.ts`)
- `src/tools/get-scene-intros.ts` → `src/tools/get-smarttype-scene-intros.ts` (+ `.test.ts`)
- `src/tools/edit-scene-intros.ts` → `src/tools/edit-smarttype-scene-intros.ts` (+ `.test.ts`)
- `src/tools/get-times-of-day.ts` → `src/tools/get-smarttype-times-of-day.ts` (+ `.test.ts`)
- `src/tools/edit-times-of-day.ts` → `src/tools/edit-smarttype-times-of-day.ts` (+ `.test.ts`)
- `src/tools/get-transitions.ts` → `src/tools/get-smarttype-transitions.ts` (+ `.test.ts`)
- `src/tools/edit-transitions.ts` → `src/tools/edit-smarttype-transitions.ts` (+ `.test.ts`)
- Modify: `src/index.ts`

**Interfaces:**
- Produces (replacing the old exports 1:1, same signatures, `smart-type-ops.ts` untouched):
  `getSmarttypeCharactersTool`/`handleGetSmarttypeCharacters`, `editSmarttypeCharactersTool`/`handleEditSmarttypeCharacters`,
  `getSmarttypeExtensionsTool`/`handleGetSmarttypeExtensions`, `editSmarttypeExtensionsTool`/`handleEditSmarttypeExtensions`,
  `getSmarttypeLocationsTool`/`handleGetSmarttypeLocations`, `editSmarttypeLocationsTool`/`handleEditSmarttypeLocations`,
  `getSmarttypeSceneIntrosTool`/`handleGetSmarttypeSceneIntros`, `editSmarttypeSceneIntrosTool`/`handleEditSmarttypeSceneIntros`,
  `getSmarttypeTimesOfDayTool`/`handleGetSmarttypeTimesOfDay`, `editSmarttypeTimesOfDayTool`/`handleEditSmarttypeTimesOfDay`,
  `getSmarttypeTransitionsTool`/`handleGetSmarttypeTransitions`, `editSmarttypeTransitionsTool`/`handleEditSmarttypeTransitions`.

This task is purely mechanical (rename + identifier substitution, zero logic changes). Do all twelve pairs in one task since each is a 2-minute find/replace and splitting further adds overhead without a meaningful review boundary.

- [ ] **Step 1: Rename every source and test file with `git mv`**

```bash
git mv src/tools/get-characters.ts src/tools/get-smarttype-characters.ts
git mv src/tools/get-characters.test.ts src/tools/get-smarttype-characters.test.ts
git mv src/tools/edit-characters.ts src/tools/edit-smarttype-characters.ts
git mv src/tools/edit-characters.test.ts src/tools/edit-smarttype-characters.test.ts
git mv src/tools/get-extensions.ts src/tools/get-smarttype-extensions.ts
git mv src/tools/get-extensions.test.ts src/tools/get-smarttype-extensions.test.ts
git mv src/tools/edit-extensions.ts src/tools/edit-smarttype-extensions.ts
git mv src/tools/edit-extensions.test.ts src/tools/edit-smarttype-extensions.test.ts
git mv src/tools/get-locations.ts src/tools/get-smarttype-locations.ts
git mv src/tools/get-locations.test.ts src/tools/get-smarttype-locations.test.ts
git mv src/tools/edit-locations.ts src/tools/edit-smarttype-locations.ts
git mv src/tools/edit-locations.test.ts src/tools/edit-smarttype-locations.test.ts
git mv src/tools/get-scene-intros.ts src/tools/get-smarttype-scene-intros.ts
git mv src/tools/get-scene-intros.test.ts src/tools/get-smarttype-scene-intros.test.ts
git mv src/tools/edit-scene-intros.ts src/tools/edit-smarttype-scene-intros.ts
git mv src/tools/edit-scene-intros.test.ts src/tools/edit-smarttype-scene-intros.test.ts
git mv src/tools/get-times-of-day.ts src/tools/get-smarttype-times-of-day.ts
git mv src/tools/get-times-of-day.test.ts src/tools/get-smarttype-times-of-day.test.ts
git mv src/tools/edit-times-of-day.ts src/tools/edit-smarttype-times-of-day.ts
git mv src/tools/edit-times-of-day.test.ts src/tools/edit-smarttype-times-of-day.test.ts
git mv src/tools/get-transitions.ts src/tools/get-smarttype-transitions.ts
git mv src/tools/get-transitions.test.ts src/tools/get-smarttype-transitions.test.ts
git mv src/tools/edit-transitions.ts src/tools/edit-smarttype-transitions.ts
git mv src/tools/edit-transitions.test.ts src/tools/edit-smarttype-transitions.test.ts
```

- [ ] **Step 2: Update each renamed source file's tool name, exported identifiers, and header comment**

In `src/tools/get-smarttype-characters.ts`: change the header comment's `get_characters` to `get_smarttype_characters`; change `"get_characters"` (the tool-name string) to `"get_smarttype_characters"`; change `export const getCharactersTool = tool;` to `export const getSmarttypeCharactersTool = tool;`; change `export const handleGetCharacters = handler;` to `export const handleGetSmarttypeCharacters = handler;`.

Apply the equivalent rename in each of the other 11 source files, following the exact old-name → new-name mapping given in this task's Interfaces section above (tool-name string, `*Tool` export, `handle*` export, and the header-comment mention of the old tool name). Do not change the `noun`/`leaf` arguments passed to `makeSmartListGetTool`/`makeSmartListEditTool`/`makeSmartSeparatorEditTool`, the description text, or any other logic — only the four items just listed.

For `edit-smarttype-characters.ts` specifically: its `crossRefCheck` function and `countCharacterReferences` import are unrelated to the rename — leave them untouched.

- [ ] **Step 3: Update each renamed test file's imports**

In each of the 12 renamed `.test.ts` files, update the `import` line(s) that reference the old file path and old exported handler/tool names to the new path and new names. For example, in `get-smarttype-characters.test.ts`:

```typescript
import { handleGetSmarttypeCharacters } from "./get-smarttype-characters.ts";
```

and update every call site within that test file from `handleGetCharacters(...)` to `handleGetSmarttypeCharacters(...)`. The `describe("get_characters", ...)` block label may stay as-is or be updated to `"get_smarttype_characters"` — update it to match the new tool name for consistency with every other test file in this codebase (each `describe` block is named after its tool).

Apply the same treatment to the other 11 test files. Where a test file imports handlers from an unrelated tool (e.g. `edit-smarttype-characters.test.ts` likely imports `handleGetSmarttypeCharacters` from the sibling get-file to verify round-trips), update those cross-references too.

- [ ] **Step 4: Update `src/index.ts`**

Update the 12 import lines (currently importing from `./tools/get-characters.ts`, `./tools/edit-characters.ts`, etc.) to import from the renamed files and renamed identifiers, e.g.:

```typescript
import { getSmarttypeCharactersTool, handleGetSmarttypeCharacters } from "./tools/get-smarttype-characters.ts";
import { editSmarttypeCharactersTool, handleEditSmarttypeCharacters } from "./tools/edit-smarttype-characters.ts";
```

Update the `tools` array entries (`getCharactersTool` → `getSmarttypeCharactersTool`, etc. — all 12) and the `toolHandlers` map entries (the tool-name-string keys change too, e.g. `get_characters: (args) => handleGetCharacters(args),` becomes `get_smarttype_characters: (args) => handleGetSmarttypeCharacters(args),`) for all 12 tools.

- [ ] **Step 5: Run the full test suite**

Run: `bun test`
Expected: PASS — same total test count as before this task (renames don't add or remove tests), 0 fail.

- [ ] **Step 6: Run typecheck**

Run: `bun run typecheck 2>&1 | grep "^src/"`
Expected: no output (the `bun-types` package itself has pre-existing, unrelated parse errors outside `src/` — ignore those; only `src/` output matters).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Rename get/edit_characters|extensions|locations|scene_intros|times_of_day|transitions to smarttype_-prefixed names"
```

---

### Task 5: New `get_locations` — real-usage read tool

**Files:**
- Create: `src/tools/get-locations.ts`
- Create: `src/tools/get-locations.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `buildLocationAppearances`, `rankLocations` (from Task 2, `src/tools/breakdown.ts`); `arg`, `textResult`, `errResult`, `getCachedFdx`, `pushCacheWarning` (existing, `src/tools/shared.ts`).
- Produces: `export const getLocationsTool: FdxTool`, `export async function handleGetLocations(args): Promise<ToolResult>`.

- [ ] **Step 1: Write the failing test**

Create `src/tools/get-locations.test.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetLocations } from "./get-locations.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

describe("get_locations", () => {
  test("path is required", async () => {
    expect((await handleGetLocations({})).isError).toBe(true);
  });

  test("returns every location used in Scene Headings, ranked by scene count", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetLocations({ path: FIXTURE_PATH });
    expect(result.isError).toBeFalsy();
    const groups = JSON.parse(result.content[0]!.text);
    const valley = groups.find((g: { location: string }) => g.location === "PREHISTORIC VALLEY");
    const cave = groups.find((g: { location: string }) => g.location === "CAVE");
    expect(valley.count).toBe(4);
    expect(cave.count).toBe(2);
    expect(valley.scenes).toHaveLength(4);
    expect(valley.scenes[0]).toHaveProperty("id");
    expect(valley.scenes[0]).toHaveProperty("text");
    expect(valley.scenes[0]).toHaveProperty("page");
  });

  test("location param filters to one location, case-insensitively", async () => {
    const result = await handleGetLocations({ path: FIXTURE_PATH, location: "cave" });
    expect(result.isError).toBeFalsy();
    const entry = JSON.parse(result.content[0]!.text);
    expect(entry.location).toBe("CAVE");
    expect(entry.count).toBe(2);
  });

  test("an unknown location filter is a friendly message, not an error", async () => {
    const result = await handleGetLocations({ path: FIXTURE_PATH, location: "does-not-exist" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain("no scenes found for location");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/tools/get-locations.test.ts`
Expected: FAIL — `Cannot find module './get-locations.ts'` (file doesn't exist yet — it was renamed away in Task 4).

- [ ] **Step 3: Implement `get-locations.ts`**

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * get_locations — Read-Only. Retrieve actual location usage from Scene Heading paragraphs (not
 * the SmartType Locations dictionary — see get_smarttype_locations for that, which only reflects
 * FinalDraft's autocomplete list and can drift from what the script actually uses).
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { buildLocationAppearances, rankLocations } from "./breakdown.ts";

export const getLocationsTool: FdxTool = {
  name: "get_locations",
  description:
    "Read-Only. Retrieve, as JSON, actual location usage parsed from every Scene Heading's slugline (not the SmartType Locations dictionary — see get_smarttype_locations for that). Each entry is { location, count, scenes: [{ id, text, page }] }, sorted by scene count descending. Pass location to filter to one location (case-insensitive); omit for every location.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      location: {
        type: "string",
        description: "optional location name to filter (case-insensitive); when omitted, returns every location",
      },
    },
    required: ["path"],
  },
};

export async function handleGetLocations(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const appearances = buildLocationAppearances(doc);
  const ranked = rankLocations(appearances);

  const want = (arg<string>(args, "location") ?? "").trim();
  if (want !== "") {
    const hit = ranked.find((r) => r.location.toLowerCase() === want.toLowerCase());
    if (!hit) {
      return pushCacheWarning(textResult(`no scenes found for location: ${want}`), warning);
    }
    const entry = { location: hit.location, count: hit.total, scenes: appearances.get(hit.location) ?? [] };
    return pushCacheWarning(textResult(JSON.stringify(entry)), warning);
  }

  if (ranked.length === 0) {
    return pushCacheWarning(textResult("No locations found"), warning);
  }
  const ordered = ranked.map((r) => ({
    location: r.location,
    count: r.total,
    scenes: appearances.get(r.location) ?? [],
  }));
  return pushCacheWarning(textResult(JSON.stringify(ordered)), warning);
}
```

- [ ] **Step 4: Register the tool in `src/index.ts`**

Add the import (near the other `get_*` tool imports):

```typescript
import { getLocationsTool, handleGetLocations } from "./tools/get-locations.ts";
```

Add `getLocationsTool` to the `tools` array, and add to `toolHandlers`:

```typescript
get_locations: (args) => handleGetLocations(args),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun test src/tools/get-locations.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/tools/get-locations.ts src/tools/get-locations.test.ts src/index.ts
git commit -m "Add get_locations: real Scene Heading location usage, replacing the freed dictionary-only name"
```

---

### Task 6: New `edit_locations` — real-usage rename tool

**Files:**
- Create: `src/tools/edit-locations.ts`
- Create: `src/tools/edit-locations.test.ts`
- Modify: `src/index.ts`

**Interfaces:**
- Consumes: `spliceParagraphText` (Task 1, `src/fdx/paragraph.ts`); `locateSluglineLocation` (Task 2, `src/tools/breakdown.ts`); `addSmartTypeValue` (Task 3, `src/tools/edit-par.ts`); `getParagraphId`, `getParagraphType`, `paragraphText` (existing, `src/fdx/paragraph.ts`); `documentCache` (existing, `src/fdx/cache.ts`).
- Produces: `export const editLocationsTool: FdxTool`, `export async function handleEditLocations(args): Promise<ToolResult>`.

- [ ] **Step 1: Write the failing tests**

Create `src/tools/edit-locations.test.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetLocations } from "./get-locations.ts";
import { handleEditLocations } from "./edit-locations.ts";
import { handleGetSmarttypeLocations } from "./get-smarttype-locations.ts";
import { documentCache } from "../fdx/cache.ts";
import { getParagraphId, paragraphText } from "../fdx/paragraph.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

function freshCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-edit-locations-"));
  const path = join(dir, "script.fdx");
  copyFileSync(FIXTURE_PATH, path);
  return path;
}

describe("edit_locations", () => {
  test("path, find, and replace are required", async () => {
    expect((await handleEditLocations({})).isError).toBe(true);
    expect((await handleEditLocations({ path: "x.fdx" })).isError).toBe(true);
    expect((await handleEditLocations({ path: "x.fdx", find: "CAVE" })).isError).toBe(true);
  });

  test("rejects a non-.fdx path", async () => {
    const result = await handleEditLocations({ path: "script.txt", find: "CAVE", replace: "CAVERN" });
    expect(result.isError).toBe(true);
  });

  test("renames every Scene Heading using that location, case-insensitively by default", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditLocations({ path, find: "cave", replace: "CAVERN" });
    expect(result.isError).toBeFalsy();
    expect(result.content.map((c) => c.text).join("\n")).toContain("Renamed 2 Scene Heading");

    const after = await handleGetLocations({ path });
    const groups = JSON.parse(after.content[0]!.text);
    expect(groups.find((g: { location: string }) => g.location === "CAVERN").count).toBe(2);
    expect(groups.find((g: { location: string }) => g.location === "CAVE")).toBeUndefined();
  });

  test("preserves the time-of-day suffix and intro token", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    await handleEditLocations({ path, find: "CAVE", replace: "CAVERN" });
    const doc = documentCache.get(path)!;
    const renamed = doc.getParagraphElements().find((p) => getParagraphId(p) === "195fdc26-b72f-4291-9749-4c78b3042d10")!;
    expect(paragraphText(renamed)).toBe("INT. CAVERN - NIGHT");
  });

  test("adds the new name to the SmartType Locations list", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    await handleEditLocations({ path, find: "CAVE", replace: "CAVERN" });
    const smartList = await handleGetSmarttypeLocations({ path });
    expect(smartList.content.map((c) => c.text).join("\n")).toContain("CAVERN");
  });

  test("warns that the old name is now orphaned in the SmartType Locations list", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditLocations({ path, find: "CAVE", replace: "CAVERN" });
    const text = result.content.map((c) => c.text).join("\n");
    expect(text).toContain("no longer used by any Scene Heading");
    expect(text).toContain("edit_smarttype_locations");
  });

  test("errors when the location isn't used anywhere", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditLocations({ path, find: "NO SUCH PLACE", replace: "SOMEWHERE" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("location not found");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/edit-locations.test.ts`
Expected: FAIL — `Cannot find module './edit-locations.ts'`.

- [ ] **Step 3: Implement `edit-locations.ts`**

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * edit_locations — Rename a location across every Scene Heading that uses it, editing the actual
 * script text (not the SmartType Locations dictionary that only feeds FinalDraft's autocomplete —
 * see edit_smarttype_locations for that).
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, getParagraphType, paragraphText, spliceParagraphText } from "../fdx/paragraph.ts";
import { locateSluglineLocation } from "./breakdown.ts";
import { addSmartTypeValue } from "./edit-par.ts";

export const editLocationsTool: FdxTool = {
  name: "edit_locations",
  description:
    "Rename a location across every Scene Heading that uses it, editing the actual script text (not the SmartType Locations dictionary — see edit_smarttype_locations for that). Matches find against each Scene Heading's parsed location (case-insensitive unless cs=true) and splices replace into just that segment, preserving the intro token, separators, and time-of-day around it. Adds replace to the SmartType Locations list if missing, and warns (without blocking) when find is left orphaned there. After editing, call save_fdx to persist changes to disk.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      find: { type: "string", description: "the existing location text to match, as parsed from Scene Heading sluglines" },
      replace: { type: "string", description: "the new location text" },
      cs: { type: "boolean", description: "match find case-sensitively (default false)" },
    },
    required: ["path", "find", "replace"],
  },
};

export async function handleEditLocations(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  const find = arg<string>(args, "find");
  const replace = arg<string>(args, "replace");
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");
  if (!find) return errResult("find is required");
  if (!replace) return errResult("replace is required");
  const cs = Boolean(args?.cs);

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const matchesFind = (location: string): boolean =>
    cs ? location === find : location.toLowerCase() === find.toLowerCase();

  const collapsed: string[] = [];
  let renamedCount = 0;
  for (const p of doc.getParagraphElements()) {
    if (getParagraphType(p) !== "Scene Heading") continue;
    const loc = locateSluglineLocation(doc, paragraphText(p));
    if (!loc || !matchesFind(loc.location)) continue;
    const outcome = spliceParagraphText(p, loc.start, loc.end, replace);
    if (outcome === "collapsed") collapsed.push(getParagraphId(p));
    renamedCount++;
  }

  if (renamedCount === 0) {
    return pushCacheWarning(errResult(`location not found in any Scene Heading: ${find}`), warning);
  }

  addSmartTypeValue(doc, "Location", replace);

  let orphanWarning = "";
  const stillUsed = doc.getParagraphElements().some((p) => {
    if (getParagraphType(p) !== "Scene Heading") return false;
    const loc = locateSluglineLocation(doc, paragraphText(p));
    return loc ? matchesFind(loc.location) : false;
  });
  if (!stillUsed) {
    const smartList = doc.getSmartTypeList("Location");
    const stillInDictionary = smartList?.values.some((v) => matchesFind(v));
    if (stillInDictionary) {
      orphanWarning = `Note: "${find}" is no longer used by any Scene Heading but is still in the SmartType Locations list; call edit_smarttype_locations action=remove find="${find}" to clean it up.`;
    }
  }

  const dirtyWarning = documentCache.touchDirty(path, doc);
  let msg = `Renamed ${renamedCount} Scene Heading(s) from "${find}" to "${replace}".`;
  if (collapsed.length > 0) {
    msg += ` Reformatted as a single unstyled run (location text spanned multiple styled runs) for: ${collapsed.join(", ")}.`;
  }
  if (orphanWarning) msg += ` ${orphanWarning}`;
  msg += " File updated in cache — call save_fdx to persist changes to disk.";

  return pushCacheWarning(pushCacheWarning(textResult(msg), dirtyWarning), warning);
}
```

- [ ] **Step 4: Register the tool in `src/index.ts`**

Add the import:

```typescript
import { editLocationsTool, handleEditLocations } from "./tools/edit-locations.ts";
```

Add `editLocationsTool` to the `tools` array, and add to `toolHandlers`:

```typescript
edit_locations: (args) => handleEditLocations(args),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/tools/edit-locations.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 6: Run the full suite**

Run: `bun test`
Expected: PASS — 0 fail.

- [ ] **Step 7: Commit**

```bash
git add src/tools/edit-locations.ts src/tools/edit-locations.test.ts src/index.ts
git commit -m "Add edit_locations: rename a location across every Scene Heading that uses it"
```

---

### Task 7: Update `context-data.ts` (the `get_context` tool catalog)

**Files:**
- Modify: `src/tools/context-data.ts`

**Interfaces:**
- None (this file is a static data catalog, no exported functions change signature).

- [ ] **Step 1: Rename the six SmartType entries and add the two new ones**

In `src/tools/context-data.ts`, within the `contextTools` array:

For each of the 6 renamed tools, change `name: "edit_characters"` → `name: "edit_smarttype_characters"` (and likewise `get_characters`, `edit_extensions`, `get_extensions`, `edit_locations` → `edit_smarttype_locations`, `get_locations` → `get_smarttype_locations`, `edit_scene_intros`, `get_scene_intros`, `edit_times_of_day`, `get_times_of_day`, `edit_transitions`, `get_transitions`). Leave each entry's `description` text unchanged — only the `name` field changes.

Then replace the two entries that previously described `get_locations`/`edit_locations` (now renamed to `get_smarttype_locations`/`edit_smarttype_locations` per the step above) — wait, do not replace them; those two entries just got renamed in place. Instead, **add two new entries** to the array (keeping the array's existing alphabetical-by-name ordering — insert `edit_locations` among the other `edit_*` entries near `edit_dual_dialogue`/`edit_element_settings`, and `get_locations` among the other `get_*` entries near `get_header_and_footer`/`get_par`):

```typescript
  {
    name: "edit_locations",
    description:
      "Rename a location across every Scene Heading that uses it, editing the actual script text (not the SmartType Locations dictionary — see edit_smarttype_locations for that). Matches find against each Scene Heading's parsed location (case-insensitive unless cs=true) and splices replace into just that segment, preserving the intro token, separators, and time-of-day around it. Adds replace to the SmartType Locations list if missing, and warns (without blocking) when find is left orphaned there. After editing, call save_fdx to persist changes to disk.",
  },
```

```typescript
  {
    name: "get_locations",
    description:
      "Read-Only. Retrieve, as JSON, actual location usage parsed from every Scene Heading's slugline (not the SmartType Locations dictionary — see get_smarttype_locations for that). Each entry is { location, count, scenes: [{ id, text, page }] }, sorted by scene count descending. Pass location to filter to one location (case-insensitive); omit for every location.",
  },
```

Copy each tool description verbatim from the corresponding tool file's `description` field (Tasks 4–6) — do not paraphrase, so `get_context`'s output stays byte-identical to each tool's actual registered description.

- [ ] **Step 2: Run the context-data test if one exists, else the full suite**

Run: `bun test src/tools/context-data.test.ts` if that file exists, otherwise `bun test`.
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/tools/context-data.ts
git commit -m "Update get_context's tool catalog for the smarttype renames and new location tools"
```

---

### Task 8: Update `TOOLS.md`

**Files:**
- Modify: `TOOLS.md`

- [ ] **Step 1: Update the tool count and the 6 renamed rows**

`TOOLS.md` is a hand-maintained Markdown table (`| Name | Parameters | Description |`). Change the header line `This server exposes 55 tools.` to `This server exposes 57 tools.` (55 existing + 2 new; the 6 renames are a net-zero count change).

In the table, change the `Name` cell for each of the 6 renamed tools (`get_characters` → `get_smarttype_characters`, `edit_characters` → `edit_smarttype_characters`, and the other 5 pairs) — leave their `Parameters` and `Description` cells unchanged, matching each tool's file from Task 4 verbatim.

- [ ] **Step 2: Add two new rows for `get_locations`/`edit_locations`**

Add a row for `get_locations` (Parameters: `path, location?`; Description: copied verbatim from `src/tools/get-locations.ts`'s `description` field) and `edit_locations` (Parameters: `path, find, replace, cs?`; Description: copied verbatim from `src/tools/edit-locations.ts`'s `description` field). Insert them alphabetically among the existing rows, matching the table's existing sort order.

- [ ] **Step 3: Commit**

```bash
git add TOOLS.md
git commit -m "Update TOOLS.md for the smarttype renames and new location tools"
```

---

### Task 9: Update `README.md`

**Files:**
- Modify: `README.md:127` (the "SmartType dictionaries" Features bullet)

- [ ] **Step 1: Split the SmartType bullet and add a real-usage-locations bullet**

Change:

```markdown
- **SmartType dictionaries** — manage characters, extensions, locations, transitions, scene intros, times of day, spell-check lists, and paragraph types.
```

to:

```markdown
- **SmartType dictionaries** — manage the FinalDraft autocomplete lists: characters, extensions, transitions, scene intros, times of day, spell-check lists, and paragraph types.
- **Location usage** — see actual location usage parsed from Scene Heading text (not just the autocomplete dictionary) and rename a location across every scene that uses it in one call.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Update README Features for the smarttype renames and new location tools"
```

---

### Task 10: `CHANGELOG.md` + version bump

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`

- [ ] **Step 1: Bump the version**

In `package.json`, change `"version": "0.0.5"` to `"version": "0.0.6"`.

- [ ] **Step 2: Add a changelog entry**

At the top of `CHANGELOG.md`, above the `## [0.0.5]` entry, add:

```markdown
## [0.0.6] - 2026-07-31

### Changed

- **Renamed the six SmartType dictionary tool pairs** for clarity: `get_characters`/`edit_characters`, `get_extensions`/`edit_extensions`, `get_locations`/`edit_locations`, `get_scene_intros`/`edit_scene_intros`, `get_times_of_day`/`edit_times_of_day`, and `get_transitions`/`edit_transitions` are now `get_smarttype_*`/`edit_smarttype_*`. Same behavior — these tools only ever read/wrote FinalDraft's autocomplete dictionary, never the actual script, and the old names didn't make that clear.

### Added

- **`get_locations`/`edit_locations`** (new tools, taking over the names freed by the rename above) — report actual location usage parsed from Scene Heading text (scene ids, page, count per location) and rename a location across every Scene Heading that uses it, splicing just the location segment of each slugline while preserving intro token, separators, time-of-day, and run styling. Keeps the SmartType Locations list in sync on rename, and warns (without blocking) when the old name is left orphaned there.
```

- [ ] **Step 3: Commit**

```bash
git add CHANGELOG.md package.json
git commit -m "Bump to 0.0.6: smarttype tool renames + new real-usage location tools"
```

---

### Task 11: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `bun test`
Expected: PASS, 0 fail.

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck 2>&1 | grep "^src/"`
Expected: no output.

- [ ] **Step 3: Spot-check the renamed tools still work end to end**

Run: `bun test src/index.ts` is not applicable (no tests there); instead confirm `src/index.ts`'s `tools` array has exactly 12 renamed entries plus 2 new entries by running:

```bash
grep -c "smarttype" src/index.ts
```

Expected: at least 24 (12 import lines + 12 tools-array/handler-map references, give or take formatting — a sanity count, not an exact assertion).

- [ ] **Step 4: Confirm no dangling references to the old names**

```bash
grep -rn "get_characters\b\|edit_characters\b\|get_extensions\b\|edit_extensions\b\|get_scene_intros\b\|edit_scene_intros\b\|get_times_of_day\b\|edit_times_of_day\b\|get_transitions\b\|edit_transitions\b" src README.md TOOLS.md
```

Expected: no output (every reference should now say `get_smarttype_characters` etc., or not match at all if it was a `get_locations`/`edit_locations` line that's now legitimately the new real-usage tool).

This step deliberately excludes `get_locations`/`edit_locations` from the grep, since those name strings correctly still appear — now referring to the new tools.
