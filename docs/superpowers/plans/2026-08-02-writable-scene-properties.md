# Writable Scene Properties Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the server a way to write a paragraph's `SceneProperties.Color` and `.Title` —
today only readable via `get_scene_properties` — including creating the `SceneProperties` block
when a paragraph (e.g. one created through `edit_par`) doesn't have one yet.

**Architecture:** One new shared helper (`getOrCreateSceneProperties`, in `breakdown.ts` next to
the existing read-side `getSceneProperties`), a new tool (`edit_scene_properties`) built on it, and
one new optional parameter (`color`) on the existing `edit_par action=create`, also built on it.
`Length` and `Page` stay read-only everywhere — they're Final Draft's own derived pagination
values, never written by this change.

**Tech Stack:** TypeScript, Bun test runner, existing `FdxDocument`/XML helpers — no new
dependencies.

## Global Constraints

- `color`/`title` values are accepted and written verbatim — no format validation anywhere in this
  plan.
- `Length` and `Page` are never written by any code in this plan.
- `edit_scene_properties` looks up its target paragraph among `doc.getParagraphElements()` only
  (top-level) — Scene Headings and other section-type paragraphs are never nested inside a
  `DualDialogue`, so no `expandDualDialogue` lookup is needed.
- `edit_par action=create`'s new `color` parameter enforces no restriction based on `type`.
- Per the project's standing rule, any tool add/schema-change updates `README.md`, `CHANGELOG.md`,
  `TOOLS.md`, and `src/tools/context-data.ts`'s mirrored entries together.

---

### Task 1: `getOrCreateSceneProperties` helper

**Files:**
- Modify: `src/tools/breakdown.ts`
- Test: `src/tools/breakdown.test.ts`

**Interfaces:**
- Produces: `export function getOrCreateSceneProperties(p: XmlElement): XmlElement` — consumed by
  Tasks 2 and 3.

- [ ] **Step 1: Write the failing tests**

Add to `src/tools/breakdown.test.ts`, in a new `describe` block placed directly after the existing
`describe("getScenePropertiesById", ...)` block:

```typescript
describe("getOrCreateSceneProperties", () => {
  test("returns the existing SceneProperties element unchanged", () => {
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Scene Heading" id="sh1">
      <Text>EXT. BRIDGE - DAY</Text>
      <SceneProperties Color="#C0C0C0C0C0C0" Length="4/8" Page="1"/>
    </Paragraph>
  </Content>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const para = doc.getParagraphElements()[0]!;
    const sp = getOrCreateSceneProperties(para);
    expect(sp.name).toBe("SceneProperties");
    expect(sp.attrs).toContainEqual(["Color", "#C0C0C0C0C0C0"]);
    expect(sp.attrs).toContainEqual(["Length", "4/8"]);
  });

  test("creates an empty SceneProperties element when absent", () => {
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Scene Heading" id="sh1"><Text>EXT. BRIDGE - DAY</Text></Paragraph>
  </Content>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const para = doc.getParagraphElements()[0]!;
    expect(findChild(para, "SceneProperties")).toBeUndefined();
    const sp = getOrCreateSceneProperties(para);
    expect(sp.name).toBe("SceneProperties");
    expect(sp.attrs).toEqual([]);
    expect(findChild(para, "SceneProperties")).toBe(sp);
  });

  test("calling it twice on the same paragraph doesn't create a second element", () => {
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Scene Heading" id="sh1"><Text>EXT. BRIDGE - DAY</Text></Paragraph>
  </Content>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const para = doc.getParagraphElements()[0]!;
    const first = getOrCreateSceneProperties(para);
    const second = getOrCreateSceneProperties(para);
    expect(first).toBe(second);
    expect(para.children.filter((c) => c.type === "element" && c.name === "SceneProperties")).toHaveLength(1);
  });
});
```

`src/tools/breakdown.test.ts`'s current imports (top of file) are:

```typescript
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { FdxDocument } from "../fdx/document.ts";
import { readTextFile } from "../fdx/runtime.ts";
import {
  parseSceneLength,
  parseSlugline,
  buildSceneIndex,
  buildScriptStats,
  buildPageMap,
  buildCharacterAppearances,
  rankCharacters,
  buildArcBeatData,
  getScenePropertiesById,
  locateSluglineLocation,
  buildLocationAppearances,
  rankLocations,
} from "./breakdown.ts";
```

There is no existing import from `../fdx/xml.ts` in this file. Add `getOrCreateSceneProperties` to
the `./breakdown.ts` import list, and add one new import line for `findChild`:

```typescript
import { findChild } from "../fdx/xml.ts";
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/tools/breakdown.test.ts`
Expected: FAIL — `getOrCreateSceneProperties` is not exported from `./breakdown.ts`.

- [ ] **Step 3: Implement the helper**

In `src/tools/breakdown.ts`, change the top import line:

```typescript
import { findChild, findChildren, getAttr, type XmlElement, type XmlNode } from "../fdx/xml.ts";
```

to:

```typescript
import { createElement, findChild, findChildren, getAttr, type XmlElement, type XmlNode } from "../fdx/xml.ts";
```

Add the function directly after `getSceneProperties` (the existing read-side function):

```typescript
/** Returns a paragraph's <SceneProperties> element, creating an empty one if absent. */
export function getOrCreateSceneProperties(p: XmlElement): XmlElement {
  let sp = findChild(p, "SceneProperties");
  if (!sp) {
    sp = createElement("SceneProperties");
    p.children.push(sp);
  }
  return sp;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/tools/breakdown.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/tools/breakdown.ts src/tools/breakdown.test.ts
git commit -m "Add getOrCreateSceneProperties helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: New `edit_scene_properties` tool

**Files:**
- Create: `src/tools/edit-scene-properties.ts`
- Test: `src/tools/edit-scene-properties.test.ts`

**Interfaces:**
- Consumes: `getOrCreateSceneProperties(p: XmlElement): XmlElement` from Task 1.
- Produces: `export const editScenePropertiesTool: FdxTool` and
  `export async function handleEditSceneProperties(args): Promise<ToolResult>` — for Task 4's
  registration in `src/index.ts` and `src/tools/context-data.ts`.

- [ ] **Step 1: Write the failing tests**

Create `src/tools/edit-scene-properties.test.ts`, modeled on `edit-scene-arc-beats.test.ts`'s
fixture pattern (hand-crafted `.fdx` via `mkdtempSync`/`writeFileSync`):

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetSceneProperties } from "./get-scene-properties.ts";
import { handleEditSceneProperties } from "./edit-scene-properties.ts";

function fixture(sceneXml: string): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-edit-scene-properties-"));
  const path = join(dir, "script.fdx");
  const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>${sceneXml}</Content>
</FinalDraft>`;
  writeFileSync(path, source, "utf-8");
  return path;
}

const NO_SCENE_PROPERTIES = `<Paragraph Type="Scene Heading" id="sh1"><Text>EXT. BRIDGE - DAY</Text></Paragraph>`;

const WITH_SCENE_PROPERTIES = `<Paragraph Type="Scene Heading" id="sh1">
  <Text>EXT. BRIDGE - DAY</Text>
  <SceneProperties Color="#C0C0C0C0C0C0" Length="4/8" Page="1"/>
</Paragraph>`;

describe("edit_scene_properties", () => {
  test("path/id are required", async () => {
    expect((await handleEditSceneProperties({ id: "sh1", color: "#000000000000" })).isError).toBe(true);
    const path = fixture(NO_SCENE_PROPERTIES);
    await handleReadFdx({ path });
    expect((await handleEditSceneProperties({ path, color: "#000000000000" })).isError).toBe(true);
  });

  test("errors when neither color nor title is given", async () => {
    const path = fixture(NO_SCENE_PROPERTIES);
    await handleReadFdx({ path });
    const result = await handleEditSceneProperties({ path, id: "sh1" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("color or title");
  });

  test("errors on an unknown id", async () => {
    const path = fixture(NO_SCENE_PROPERTIES);
    await handleReadFdx({ path });
    const result = await handleEditSceneProperties({ path, id: "nope", color: "#000000000000" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("paragraph id not found");
  });

  test("sets color on a paragraph with no existing SceneProperties, creating the block", async () => {
    const path = fixture(NO_SCENE_PROPERTIES);
    await handleReadFdx({ path });
    const result = await handleEditSceneProperties({ path, id: "sh1", color: "#6363A7A7EFEF" });
    expect(result.isError).toBeFalsy();

    const getResult = await handleGetSceneProperties({ path, id: "sh1" });
    const props = JSON.parse(getResult.content[getResult.content.length - 1]!.text);
    expect(props.color).toBe("#6363A7A7EFEF");
    expect(props.length).toBeUndefined();
  });

  test("sets color on a paragraph that already has SceneProperties, leaving length/page untouched", async () => {
    const path = fixture(WITH_SCENE_PROPERTIES);
    await handleReadFdx({ path });
    const result = await handleEditSceneProperties({ path, id: "sh1", color: "#6363A7A7EFEF" });
    expect(result.isError).toBeFalsy();

    const getResult = await handleGetSceneProperties({ path, id: "sh1" });
    const props = JSON.parse(getResult.content[getResult.content.length - 1]!.text);
    expect(props.color).toBe("#6363A7A7EFEF");
    expect(props.length).toBe("4/8");
    expect(props.page).toBe(1);
  });

  test("sets title only", async () => {
    const path = fixture(NO_SCENE_PROPERTIES);
    await handleReadFdx({ path });
    const result = await handleEditSceneProperties({ path, id: "sh1", title: "The Bridge Scene" });
    expect(result.isError).toBeFalsy();

    const getResult = await handleGetSceneProperties({ path, id: "sh1" });
    const props = JSON.parse(getResult.content[getResult.content.length - 1]!.text);
    expect(props.title).toBe("The Bridge Scene");
  });

  test("sets both color and title in one call", async () => {
    const path = fixture(NO_SCENE_PROPERTIES);
    await handleReadFdx({ path });
    const result = await handleEditSceneProperties({
      path,
      id: "sh1",
      color: "#6363A7A7EFEF",
      title: "The Bridge Scene",
    });
    expect(result.isError).toBeFalsy();

    const getResult = await handleGetSceneProperties({ path, id: "sh1" });
    const props = JSON.parse(getResult.content[getResult.content.length - 1]!.text);
    expect(props.color).toBe("#6363A7A7EFEF");
    expect(props.title).toBe("The Bridge Scene");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/edit-scene-properties.test.ts`
Expected: FAIL — `./edit-scene-properties.ts` does not exist yet (module not found).

- [ ] **Step 3: Implement the tool**

Create `src/tools/edit-scene-properties.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * edit_scene_properties — set Color and/or Title on a paragraph's SceneProperties block,
 * creating the block if it doesn't exist yet (e.g. a paragraph created through edit_par has none).
 * Length and Page are Final Draft's own derived pagination values and are never written here.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { setAttr } from "../fdx/xml.ts";
import { getParagraphId } from "../fdx/paragraph.ts";
import { getOrCreateSceneProperties } from "./breakdown.ts";

export const editScenePropertiesTool: FdxTool = {
  name: "edit_scene_properties",
  description:
    "Set Color and/or Title on a paragraph's SceneProperties block, creating the block if it doesn't exist yet — a paragraph created through edit_par has no SceneProperties at all until this is called. At least one of color or title is required. Neither value is format-validated; see get_context for Final Draft's actual color format. Length and Page are Final Draft's own derived pagination values and are never written by this tool. After editing, call save_fdx to persist changes to disk.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      id: { type: "string", description: "the paragraph id (typically a Scene Heading) whose SceneProperties to set" },
      color: { type: "string", description: "the Color value to set, written verbatim" },
      title: { type: "string", description: "the Title value to set, written verbatim" },
    },
    required: ["path", "id"],
  },
};

export async function handleEditSceneProperties(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  const id = arg<string>(args, "id");
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");
  if (!id) return errResult("id is required");

  const color = arg<string>(args, "color");
  const title = arg<string>(args, "title");
  if (color === undefined && title === undefined) {
    return errResult("at least one of color or title is required");
  }

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const para = doc.getParagraphElements().find((p) => getParagraphId(p) === id);
  if (!para) return errResult(`paragraph id not found: ${id}`);

  const sp = getOrCreateSceneProperties(para);
  const set: string[] = [];
  if (color !== undefined) {
    setAttr(sp, "Color", color);
    set.push("color");
  }
  if (title !== undefined) {
    setAttr(sp, "Title", title);
    set.push("title");
  }

  const dirtyWarning = documentCache.touchDirty(path, doc);
  const msg = `Successfully set ${set.join(" and ")} on scene ${id}. File updated in cache — call save_fdx to persist changes to disk.`;
  return pushCacheWarning(pushCacheWarning(textResult(msg), dirtyWarning), warning);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/edit-scene-properties.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/tools/edit-scene-properties.ts src/tools/edit-scene-properties.test.ts
git commit -m "Add edit_scene_properties tool

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `edit_par action=create` gains a `color` parameter

**Files:**
- Modify: `src/tools/edit-par.ts`
- Test: `src/tools/edit-par.test.ts`

**Interfaces:**
- Consumes: `getOrCreateSceneProperties(p: XmlElement): XmlElement` from Task 1.

- [ ] **Step 1: Write the failing tests**

Add to `describe("edit_par", ...)` in `src/tools/edit-par.test.ts` (this file already has a
`freshDoc(key)` helper and imports `getParagraphId`):

```typescript
  test("create with color sets SceneProperties.Color on the new paragraph", async () => {
    const { path, doc } = freshDoc("create-with-color");
    const result = await handleEditPar({
      path,
      action: "create",
      type: "Scene Heading",
      color: "#6363A7A7EFEF",
      textRuns: [{ content: "INT. ZZZ TEST BRIDGE - DAY" }],
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0]!.text);

    const created = doc.getParagraphElements().find((p) => getParagraphId(p) === body.id)!;
    const sp = created.children.find((c) => c.type === "element" && c.name === "SceneProperties") as
      | { attrs: Array<[string, string]> }
      | undefined;
    expect(sp).toBeDefined();
    expect(sp!.attrs).toContainEqual(["Color", "#6363A7A7EFEF"]);
  });

  test("create without color behaves exactly as before — no SceneProperties created", async () => {
    const { path, doc } = freshDoc("create-without-color");
    const result = await handleEditPar({
      path,
      action: "create",
      type: "Action",
      textRuns: [{ content: "Grog stands up." }],
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0]!.text);

    const created = doc.getParagraphElements().find((p) => getParagraphId(p) === body.id)!;
    const sp = created.children.find((c) => c.type === "element" && c.name === "SceneProperties");
    expect(sp).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/edit-par.test.ts`
Expected: the first new test FAILs (`sp` is `undefined` — `color` is currently ignored); the second
new test already PASSes today (it's a regression guard for behavior that must stay true).

- [ ] **Step 3: Implement the fix**

In `src/tools/edit-par.ts`, add `getOrCreateSceneProperties` to the existing
`import { parseSlugline } from "./breakdown.ts";` line:

```typescript
import { parseSlugline, getOrCreateSceneProperties } from "./breakdown.ts";
```

Add `setAttr` to the existing `import { findChild, findChildren, type XmlElement } from "../fdx/xml.ts";`
line:

```typescript
import { findChild, findChildren, setAttr, type XmlElement } from "../fdx/xml.ts";
```

Add the new input property to `editParTool.inputSchema.properties`, directly after `alignment`:

```typescript
      alignment: { type: "string", description: "alignment setting" },
      color: {
        type: "string",
        description:
          "(create) sets SceneProperties.Color on the new paragraph, creating the block. Meaningful for Scene Heading and similarly-classed section paragraphs; written verbatim, not format-validated — see get_context for Final Draft's actual color format.",
      },
```

In `handleEditPar`, add the extraction alongside the other input reads near the top of the
function:

```typescript
  const alignment = arg<string>(args, "alignment");
  const color = arg<string>(args, "color");
```

In the `action === "create"` branch, change:

```typescript
  } else if (action === "create") {
    const type = typeArg ?? "";
    const newId = generateUuid();
    const newPara = buildParagraphElement(type, newId, alignment, textRuns);
    if (beforeParId) {
```

to:

```typescript
  } else if (action === "create") {
    const type = typeArg ?? "";
    const newId = generateUuid();
    const newPara = buildParagraphElement(type, newId, alignment, textRuns);
    if (color !== undefined) {
      const sp = getOrCreateSceneProperties(newPara);
      setAttr(sp, "Color", color);
    }
    if (beforeParId) {
```

Also update the tool's `description` string — append one clause:

```typescript
  description:
    "Create a new paragraph, edit an existing one, or remove one in a loaded screenplay. For create, use beforeParId or afterParId (each a paragraph id) to control insertion position (falls back to append); pass color to set SceneProperties.Color on the new paragraph in the same call (creates the block; see edit_scene_properties to set it on an existing paragraph, or to set Title). Returns {id, type, message} as JSON on success, so the new paragraph is immediately addressable without a follow-up lookup. For edit, provide id (the paragraph id) and the fields to update — this also reaches a paragraph nested inside a <DualDialogue> block. For remove, provide id and the paragraph is deleted; the response reports its type so a caller can confirm what was removed. remove refuses a dual-dialogue wrapper paragraph (one holding a <DualDialogue> block) rather than silently deleting every paragraph nested inside it — use edit_dual_dialogue action=remove instead (extract=true keeps the nested paragraphs, extract=false discards them along with the wrapper); remove and create's beforeParId/afterParId anchoring do not reach paragraphs nested inside a DualDialogue. After editing, call save_fdx to persist changes to disk.",
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/edit-par.test.ts`
Expected: PASS, both new tests.

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/tools/edit-par.ts src/tools/edit-par.test.ts
git commit -m "edit_par: add color parameter to action=create

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
- Consumes: `editScenePropertiesTool`, `handleEditSceneProperties` from
  `./tools/edit-scene-properties.ts` (Task 2). `edit_par`'s description already changed in Task 3
  — no new registration needed for it, only its mirrored description and TOOLS.md row.

- [ ] **Step 1: Register `edit_scene_properties` in `src/index.ts`**

Add the import near the other scene-properties import (`getScenePropertiesTool`):

```typescript
import { getScenePropertiesTool, handleGetSceneProperties } from "./tools/get-scene-properties.ts";
import { editScenePropertiesTool, handleEditSceneProperties } from "./tools/edit-scene-properties.ts";
```

Add to the tool list array, next to `getScenePropertiesTool`:

```typescript
  getScenePropertiesTool,
  editScenePropertiesTool,
```

Add to the dispatch map, next to `get_scene_properties`:

```typescript
  get_scene_properties: (args) => handleGetSceneProperties(args),
  edit_scene_properties: (args) => handleEditSceneProperties(args),
```

- [ ] **Step 2: Update `src/tools/context-data.ts`**

The existing `get_scene_properties` entry (at time of writing, around line 365) reads:

```typescript
  {
    name: "get_scene_properties",
    description:
      "Read-Only. Retrieve one paragraph's SceneProperties as JSON — Color, Length (raw and parsed eighths-of-a-page), Page, and Title. Errors if the paragraph has no SceneProperties block.",
  },
```

Add a new `edit_scene_properties` entry directly after it:

```typescript
  {
    name: "edit_scene_properties",
    description:
      "Set Color and/or Title on a paragraph's SceneProperties block, creating the block if it doesn't exist yet — a paragraph created through edit_par has no SceneProperties at all until this is called. At least one of color or title is required. Neither value is format-validated; see get_context for Final Draft's actual color format. Length and Page are Final Draft's own derived pagination values and are never written by this tool. After editing, call save_fdx to persist changes to disk.",
  },
```

The existing `edit_par` entry (at time of writing, around line 145) is a byte-for-byte verbatim
copy of `edit-par.ts`'s own `description` string (confirmed while writing this plan — unlike
`find_par`/`get_flagged_words`/etc., whose `context-data.ts` entries are abbreviated summaries,
`edit_par`'s mirror is kept verbatim). Replace its `description` field's value with the exact same
string written in Task 3, Step 3's `edit_par` description update, keeping that verbatim
relationship.

Add a new `contextRules` entry, "Scene Color," placed after "Section Boundaries" and before "UUID
Generation" (both existing rules deal with section-type paragraph structure):

```typescript
  {
    title: "Scene Color",
    content:
      "Final Draft's scene color is a 12-hex-digit value, #RRRRGGGGBBBB — each RGB channel doubled to 4 hex digits (e.g. #6363A7A7EFEF), not the usual 6-digit web format. edit_scene_properties(id, color=...) sets it on an existing paragraph, creating its SceneProperties block if needed; edit_par action=create also accepts a color parameter for a new Scene Heading. Neither tool validates the format — send it in Final Draft's own form.",
  },
```

- [ ] **Step 3: Run the full suite**

Run: `bun test`
Expected: PASS, no regressions.

- [ ] **Step 4: Update `TOOLS.md`**

Increment the tool-count header line (`This server exposes N tools.`) by 1.

Add a new row for `edit_scene_properties`, placed near the `get_scene_properties` row:

```
| edit_scene_properties     | path, id, color?, title?                                                                                                                                                                                                                                                              | Set Color and/or Title on a paragraph's SceneProperties block, creating the block if it doesn't exist yet — a paragraph created through edit_par has no SceneProperties at all until this is called. At least one of color or title is required. Neither value is format-validated; see get_context for Final Draft's actual color format. Length and Page are Final Draft's own derived pagination values and are never written by this tool. After editing, call save_fdx to persist changes to disk. |
```

Update the `edit_par` row's Parameters column to add `color?`, and its Description column to match
Task 3's new description string.

- [ ] **Step 5: Bump `package.json` and add a `CHANGELOG.md` entry**

Check `package.json`'s current `"version"` first and bump the patch number by one. Add a new entry
at the top of `CHANGELOG.md`, above the previous most-recent entry, using that version and today's
date:

```markdown
### Added

- **`edit_scene_properties`** tool — sets `Color` and/or `Title` on a paragraph's `SceneProperties` block, creating the block if it doesn't exist yet (a paragraph created through `edit_par` previously had no route to acquire one). Neither value is format-validated; `get_context` now documents Final Draft's actual `#RRRRGGGGBBBB` color format.

### Changed

- **`edit_par action=create`** accepts an optional `color` parameter, setting `SceneProperties.Color` on the newly created paragraph in the same call instead of a create-then-`edit_scene_properties` sequence.
```

- [ ] **Step 6: Check `README.md`**

The existing "Scene analysis" bullet under `## Features` (at time of writing, line 126) reads:

```markdown
- **Scene analysis** — parse scene headings (INT./EXT., location, time of day), extract scene index and properties, compute script stats and page maps.
```

Change it to:

```markdown
- **Scene analysis** — parse scene headings (INT./EXT., location, time of day), extract scene index and properties, compute script stats and page maps; set a scene's Color and/or Title with `edit_scene_properties`, or color a newly created Scene Heading in the same call via `edit_par action=create`'s `color` parameter.
```

- [ ] **Step 7: Rebuild `dist/`, run the full suite again, and commit**

```bash
bun run build
```

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/index.ts src/tools/context-data.ts TOOLS.md CHANGELOG.md package.json README.md dist/index.js
git commit -m "Register edit_scene_properties and sync docs (wishlist item 18)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## After the plan: wishlist and push

Once all four tasks are committed, mark wishlist item 18 as **DONE** in
`F:\Vault\mcp\fdx-mcp-server\wishlist.md` (format: `— **DONE** (<version>, 2026-08-02)` appended to
its `## 18.` heading). Push this phase's commits to `origin/master` together with item 17's commits
if both are being implemented in the same session — one push covering both, per this project's
established pattern of one push per phase (unless the user asks for them pushed separately).
