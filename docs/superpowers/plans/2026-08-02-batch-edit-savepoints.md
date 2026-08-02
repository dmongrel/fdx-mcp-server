# Batch Edits + Savepoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement wishlist Phase E (items 7 and 8) per
`docs/superpowers/specs/2026-08-02-batch-edit-savepoints-design.md`: an all-or-nothing `batch_edit`
tool built on a serialize/parse-based savepoint mechanism, plus standalone `savepoint`/`rollback`
tools sharing the same single-level slot per cached document.

**Architecture:** One extension to `LruCache` (the savepoint primitive), two thin standalone tools
wrapping it directly, and one larger tool (`batch_edit`) that validates an operation list against a
fixed allowlist, then dispatches each operation to the same handler functions already registered in
`index.ts`, wrapping the whole sequence in a savepoint/rollback pair.

**Tech Stack:** TypeScript, Bun test runner, existing MCP tool-registration pattern in `src/index.ts`.

## Global Constraints

- Bun-first, Deno-compatible — no Bun/Node-only APIs beyond what's already in the codebase.
- `bun test` must stay green after every task.
- `batch_edit`'s allowlist is exactly: `edit_par`, `edit_dual_dialogue`, `edit_cast`,
  `edit_scene_arc_beats`, `edit_smarttype_characters`, `edit_smarttype_extensions`,
  `edit_smarttype_locations`, `edit_smarttype_scene_intros`, `edit_smarttype_times_of_day`,
  `edit_smarttype_transitions`, `edit_spell_check`, `edit_locations`, `edit_title_page`,
  `edit_copyright`, `edit_element_settings`, `edit_header_and_footer`, `replace_text`,
  `rename_character` — never `save_fdx`/`reload_fdx`/`close_fdx`/`new_file`/`read_fdx` or any
  read-only tool.
- A savepoint is single-level: `setSavepoint` always overwrites whatever was there.
- Every `ToolResult.content` entry is `{ type: "text"; text: string }`.

---

### Task 1: Savepoint primitive on `LruCache`

**Files:**
- Modify: `src/fdx/cache.ts`
- Modify: `src/fdx/cache.test.ts`

**Interfaces:**
- Produces: `LruCache.setSavepoint(path: string): { ok: true } | { ok: false; reason: string }`,
  `LruCache.rollback(path: string): { ok: true } | { ok: false; reason: string }`,
  `LruCache.hasSavepoint(path: string): boolean`.
- `CacheEntryInfo` gains `hasSavepoint: boolean`.

- [ ] **Step 1: Write the failing tests**

Add to `src/fdx/cache.test.ts`, before the closing `});`:

```typescript
  test("setSavepoint fails when nothing is cached for path", () => {
    const c = new LruCache();
    const result = c.setSavepoint("nope.fdx");
    expect(result).toEqual({ ok: false, reason: "nothing cached for path" });
  });

  test("rollback fails when nothing is cached for path", () => {
    const c = new LruCache();
    const result = c.rollback("nope.fdx");
    expect(result).toEqual({ ok: false, reason: "nothing cached for path" });
  });

  test("rollback fails when path has no savepoint", () => {
    const c = new LruCache();
    c.set("a.fdx", blankDoc());
    const result = c.rollback("a.fdx");
    expect(result).toEqual({ ok: false, reason: "no savepoint set for path" });
  });

  test("setSavepoint then rollback restores content and dirty flag", () => {
    const c = new LruCache();
    const doc = FdxDocument.parse(
      '<?xml version="1.0"?><FinalDraft Version="6"><Content><Paragraph Type="Action" id="p1"><Text>before</Text></Paragraph></Content></FinalDraft>',
    );
    c.set("a.fdx", doc);
    expect(c.setSavepoint("a.fdx")).toEqual({ ok: true });
    expect(c.hasSavepoint("a.fdx")).toBe(true);

    const mutated = c.get("a.fdx")!;
    c.touchDirty("a.fdx", mutated);
    const paragraph = mutated.getParagraphElements()[0]!;
    paragraph.children = [{ type: "element", name: "Text", attrs: [], children: [{ type: "text", value: "after" }] }];

    expect(c.get("a.fdx")!.serialize()).toContain("after");
    expect(c.entries()[0]!.dirty).toBe(true);

    expect(c.rollback("a.fdx")).toEqual({ ok: true });
    expect(c.get("a.fdx")!.serialize()).toContain("before");
    expect(c.get("a.fdx")!.serialize()).not.toContain("after");
    expect(c.entries()[0]!.dirty).toBe(false);
  });

  test("rollback is non-destructive — calling it twice restores the same state both times", () => {
    const c = new LruCache();
    const doc = FdxDocument.parse(
      '<?xml version="1.0"?><FinalDraft Version="6"><Content><Paragraph Type="Action" id="p1"><Text>saved</Text></Paragraph></Content></FinalDraft>',
    );
    c.set("a.fdx", doc);
    c.setSavepoint("a.fdx");
    c.rollback("a.fdx");
    const firstRollback = c.get("a.fdx")!.serialize();
    c.rollback("a.fdx");
    expect(c.get("a.fdx")!.serialize()).toBe(firstRollback);
  });

  test("a second setSavepoint overwrites the first", () => {
    const c = new LruCache();
    const doc = FdxDocument.parse(
      '<?xml version="1.0"?><FinalDraft Version="6"><Content><Paragraph Type="Action" id="p1"><Text>v1</Text></Paragraph></Content></FinalDraft>',
    );
    c.set("a.fdx", doc);
    c.setSavepoint("a.fdx"); // savepoint = v1

    const mutated = c.get("a.fdx")!;
    mutated.getParagraphElements()[0]!.children = [
      { type: "element", name: "Text", attrs: [], children: [{ type: "text", value: "v2" }] },
    ];
    c.setSavepoint("a.fdx"); // savepoint = v2, overwriting v1

    mutated.getParagraphElements()[0]!.children = [
      { type: "element", name: "Text", attrs: [], children: [{ type: "text", value: "v3" }] },
    ];
    c.rollback("a.fdx");
    expect(c.get("a.fdx")!.serialize()).toContain("v2");
  });

  test("hasSavepoint reflects presence/absence", () => {
    const c = new LruCache();
    c.set("a.fdx", blankDoc());
    expect(c.hasSavepoint("a.fdx")).toBe(false);
    c.setSavepoint("a.fdx");
    expect(c.hasSavepoint("a.fdx")).toBe(true);
  });

  test("entries() reports hasSavepoint per entry", () => {
    const c = new LruCache();
    c.set("a.fdx", blankDoc());
    c.set("b.fdx", blankDoc());
    c.setSavepoint("a.fdx");
    const entries = c.entries();
    expect(entries.find((e) => e.path === "a.fdx")!.hasSavepoint).toBe(true);
    expect(entries.find((e) => e.path === "b.fdx")!.hasSavepoint).toBe(false);
  });
```

Add `FdxDocument` to the existing import line (it currently imports only `FdxDocument` as a type via
the file's own `blankDoc()` helper — check the actual current import statement before editing, since
Task 1's own Step 3 changes `cache.ts`'s import but this test file already imports `FdxDocument`
directly from `./document.ts` for `blankDoc()`, so no test-file import change should be needed).

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/fdx/cache.test.ts`
Expected: FAIL — `setSavepoint`/`rollback`/`hasSavepoint` are not functions yet.

- [ ] **Step 3: Implement**

In `src/fdx/cache.ts`, change the import from a type-only import to a value import (the class is now
called, not just referenced as a type):

```typescript
import { FdxDocument } from "./document.ts";
```

Update `CacheEntryInfo` and `CacheEntry`:

```typescript
export interface CacheEntryInfo {
  path: string;
  dirty: boolean;
  hasSavepoint: boolean;
}

interface CacheEntry {
  doc: FdxDocument;
  dirty: boolean;
  savepoint?: { xml: string; dirty: boolean };
}
```

Add three methods to `LruCache` (anywhere inside the class body — placing them after `touchDirty`
and before `removeIf` keeps lifecycle-related methods grouped):

```typescript
  /**
   * Snapshots path's current document (serialized) and dirty flag, overwriting any existing
   * savepoint for this path. Fails if nothing is cached for path.
   */
  setSavepoint(path: string): { ok: true } | { ok: false; reason: string } {
    const entry = this.items.get(path);
    if (!entry) return { ok: false, reason: "nothing cached for path" };
    entry.savepoint = { xml: entry.doc.serialize(), dirty: entry.dirty };
    return { ok: true };
  }

  /**
   * Restores path's document and dirty flag from its savepoint. The savepoint is left in place
   * afterward — calling this twice in a row restores the same state both times. Fails if nothing
   * is cached for path, or if path has no savepoint.
   */
  rollback(path: string): { ok: true } | { ok: false; reason: string } {
    const entry = this.items.get(path);
    if (!entry) return { ok: false, reason: "nothing cached for path" };
    if (!entry.savepoint) return { ok: false, reason: "no savepoint set for path" };
    entry.doc = FdxDocument.parse(entry.savepoint.xml, path);
    entry.dirty = entry.savepoint.dirty;
    this.touchOrder(path);
    return { ok: true };
  }

  /** Whether path currently has a savepoint set. */
  hasSavepoint(path: string): boolean {
    return Boolean(this.items.get(path)?.savepoint);
  }
```

Update `entries()`:

```typescript
  entries(): CacheEntryInfo[] {
    return [...this.items.entries()].reverse().map(([path, e]) => ({ path, dirty: e.dirty, hasSavepoint: Boolean(e.savepoint) }));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/fdx/cache.test.ts`
Expected: PASS (all existing + 8 new).

- [ ] **Step 5: Run the full suite**

Run: `bun test`
Expected: all PASS — `CacheEntryInfo` gaining a field is additive; `get_cache_status`'s existing
test doesn't assert an exact key set, only that specific fields are present, so it should be
unaffected until Task 2 extends it deliberately.

- [ ] **Step 6: Commit**

```bash
git add src/fdx/cache.ts src/fdx/cache.test.ts
git commit -m "Add savepoint/rollback primitive to LruCache

Wishlist item 8's foundation: a single-level snapshot per cached
document, implemented as serialize()-now/parse()-later rather than
deep-cloning the mutable XML tree — the same round-trip
document.test.ts already verifies is lossless. setSavepoint captures
content+dirty flag, overwriting any previous savepoint; rollback
restores both and leaves the savepoint in place (non-destructive,
repeatable)."
```

---

### Task 2: Standalone `savepoint`/`rollback` tools; `get_cache_status` gains `hasSavepoint`

**Files:**
- Create: `src/tools/savepoint.ts`
- Create: `src/tools/savepoint.test.ts`
- Create: `src/tools/rollback.ts`
- Create: `src/tools/rollback.test.ts`
- Modify: `src/tools/get-cache-status.ts`
- Modify: `src/tools/get-cache-status.test.ts`

**Interfaces:**
- Consumes: `documentCache.setSavepoint`/`.rollback` (`src/fdx/cache.ts`, Task 1).
- Produces: `savepointTool`/`handleSavepoint`, `rollbackTool`/`handleRollback` (both synchronous,
  matching `close_fdx`'s existing non-async pattern — no I/O here, just cache-object mutation).

- [ ] **Step 1: Write the failing tests**

Create `src/tools/savepoint.test.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { handleSavepoint } from "./savepoint.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";

describe("savepoint", () => {
  test("path is required", () => {
    expect(handleSavepoint(undefined).isError).toBe(true);
  });

  test("errors when nothing is cached for path", () => {
    const result = handleSavepoint({ path: "not-cached.fdx" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("nothing cached for path");
  });

  test("captures a savepoint for a cached document", () => {
    const path = "savepoint-basic.fdx";
    documentCache.set(path, FdxDocument.parse('<?xml version="1.0"?><FinalDraft Version="6"></FinalDraft>'));
    const result = handleSavepoint({ path });
    expect(result.isError).toBeFalsy();
    expect(documentCache.hasSavepoint(path)).toBe(true);
  });
});
```

Create `src/tools/rollback.test.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { handleRollback } from "./rollback.ts";
import { handleSavepoint } from "./savepoint.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";
import { getParagraphId } from "../fdx/paragraph.ts";

describe("rollback", () => {
  test("path is required", () => {
    expect(handleRollback(undefined).isError).toBe(true);
  });

  test("errors when nothing is cached for path", () => {
    const result = handleRollback({ path: "not-cached.fdx" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("nothing cached for path");
  });

  test("errors when path has no savepoint", () => {
    const path = "rollback-no-savepoint.fdx";
    documentCache.set(path, FdxDocument.parse('<?xml version="1.0"?><FinalDraft Version="6"></FinalDraft>'));
    const result = handleRollback({ path });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("no savepoint set for path");
  });

  test("restores the document to its savepoint", () => {
    const path = "rollback-restores.fdx";
    const doc = FdxDocument.parse(
      '<?xml version="1.0"?><FinalDraft Version="6"><Content><Paragraph Type="Action" id="p1"><Text>original</Text></Paragraph></Content></FinalDraft>',
      path,
    );
    documentCache.set(path, doc);
    handleSavepoint({ path });

    const cached = documentCache.get(path)!;
    cached.getParagraphElements()[0]!.children = [
      { type: "element", name: "Text", attrs: [], children: [{ type: "text", value: "changed" }] },
    ];

    const result = handleRollback({ path });
    expect(result.isError).toBeFalsy();
    const restored = documentCache.get(path)!;
    expect(getParagraphId(restored.getParagraphElements()[0]!)).toBe("p1");
    expect(restored.serialize()).toContain("original");
    expect(restored.serialize()).not.toContain("changed");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/savepoint.test.ts src/tools/rollback.test.ts`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Implement**

Create `src/tools/savepoint.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * savepoint — captures the current in-memory state of a cached document (content and dirty flag)
 * as a single rollback point, overwriting any previous savepoint for this path. Pairs with
 * rollback. Does not touch disk.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";

export const savepointTool: FdxTool = {
  name: "savepoint",
  description:
    "Captures the current in-memory state of a cached document (content and dirty flag) as a single rollback point, overwriting any previous savepoint for this path. Call rollback to restore it. Does not touch disk. One level only — batch_edit takes its own savepoint automatically right before it runs, which overwrites whatever savepoint (if any) was set here.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
    },
    required: ["path"],
  },
};

export function handleSavepoint(args: Record<string, unknown> | undefined): ToolResult {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");

  const result = documentCache.setSavepoint(path);
  if (!result.ok) return errResult(`failed to set savepoint: ${result.reason}; call read_fdx first`);
  return textResult(`Savepoint captured for ${path}. Call rollback to restore this state; does not touch disk.`);
}
```

Create `src/tools/rollback.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * rollback — restores a document to its last savepoint (set explicitly by savepoint, or
 * automatically by batch_edit right before its operations ran), discarding any edits made since.
 * Does not touch disk.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";

export const rollbackTool: FdxTool = {
  name: "rollback",
  description:
    "Restores a document to its last savepoint — set explicitly by savepoint, or automatically by batch_edit right before its operations ran — discarding any edits made since. Errors if no savepoint exists for this path. Does not touch disk; call save_fdx afterward if you want the rollback persisted.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
    },
    required: ["path"],
  },
};

export function handleRollback(args: Record<string, unknown> | undefined): ToolResult {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");

  const result = documentCache.rollback(path);
  if (!result.ok) return errResult(`failed to rollback: ${result.reason}`);
  return textResult(`Rolled back ${path} to its last savepoint. Does not touch disk — call save_fdx if you want this persisted.`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/savepoint.test.ts src/tools/rollback.test.ts`
Expected: PASS (3 + 4 tests).

- [ ] **Step 5: Extend `get_cache_status` with `hasSavepoint`**

Add to `src/tools/get-cache-status.test.ts`, before the closing `});`:

```typescript
  test("reports hasSavepoint per entry", () => {
    const path = "status-savepoint-test.fdx";
    documentCache.set(path, FdxDocument.parse('<?xml version="1.0"?><FinalDraft Version="6"></FinalDraft>'));
    const before = handleGetCacheStatus();
    const beforeStatus = JSON.parse(before.content[0]!.text);
    expect(beforeStatus.entries.find((e: { path: string }) => e.path === path).hasSavepoint).toBe(false);

    documentCache.setSavepoint(path);
    const after = handleGetCacheStatus();
    const afterStatus = JSON.parse(after.content[0]!.text);
    expect(afterStatus.entries.find((e: { path: string }) => e.path === path).hasSavepoint).toBe(true);
  });
```

Run: `bun test src/tools/get-cache-status.test.ts`
Expected: FAIL — `hasSavepoint` isn't in the description yet, but the *data* already includes it
(Task 1 already added it to `entries()`), so this specific test should actually PASS already. Run it
to confirm; if it already passes, that's expected (Task 1's `entries()` change is what this test
exercises) — the only remaining change in this step is the description text below, which has no
runtime assertion. Proceed to Step 6 regardless.

In `src/tools/get-cache-status.ts`, update the tool description to mention the new field:

```typescript
  description:
    "Read-Only. Retrieve the server's document cache contents: capacity (currently 4 slots), the number of documents currently cached, and each cached document's path, dirty flag (true if it has unsaved edits from an edit_* tool since it was last loaded or saved), and hasSavepoint (true if savepoint or batch_edit has set a rollback point for it), listed most-recently-used first. With only 4 slots shared across every open document, check this before loading another file to see what is cached and whether anything dirty is at risk of being silently evicted (the least-recently-used slot) — evict deliberately with close_fdx, or save first with save_fdx.",
```

- [ ] **Step 6: Run the full suite**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/tools/savepoint.ts src/tools/savepoint.test.ts src/tools/rollback.ts src/tools/rollback.test.ts src/tools/get-cache-status.ts src/tools/get-cache-status.test.ts
git commit -m "Add standalone savepoint/rollback tools; get_cache_status reports hasSavepoint

Wishlist item 8: thin wrappers around LruCache's savepoint primitive,
usable around any sequence of individual edit_* calls, not just
batch_edit. Not yet registered as MCP tools (later task)."
```

---

### Task 3: `batch_edit` tool

**Files:**
- Create: `src/tools/batch-edit.ts`
- Create: `src/tools/batch-edit.test.ts`

**Interfaces:**
- Consumes: every allowlisted `handle*` function (imported directly, not via MCP dispatch),
  `documentCache.setSavepoint`/`.rollback` (Task 1).
- Produces: `batchEditTool`, `handleBatchEdit(args): Promise<ToolResult>`.

- [ ] **Step 1: Write the failing tests**

Create `src/tools/batch-edit.test.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleBatchEdit } from "./batch-edit.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, paragraphText } from "../fdx/paragraph.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");
const FIXTURE_SOURCE = readFileSync(FIXTURE_PATH, "utf-8");

function freshDoc(key: string): { path: string; doc: FdxDocument } {
  const path = join(import.meta.dir, `batch-edit-${key}.fdx`);
  const doc = FdxDocument.parse(FIXTURE_SOURCE, path);
  documentCache.set(path, doc);
  return { path, doc };
}

describe("batch_edit", () => {
  test("path and operations are required", async () => {
    expect((await handleBatchEdit({ operations: [] })).isError).toBe(true);
    const { path } = freshDoc("missing-operations");
    expect((await handleBatchEdit({ path })).isError).toBe(true);
    expect((await handleBatchEdit({ path, operations: [] })).isError).toBe(true);
  });

  test("errors when nothing is cached for path", async () => {
    const result = await handleBatchEdit({
      path: "not-cached.fdx",
      operations: [{ tool: "edit_par", args: { action: "create", type: "Action", textRuns: [{ content: "x" }] } }],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("nothing cached for path");
  });

  test("rejects an operation naming a tool outside the allowlist, before touching anything", async () => {
    const { path, doc } = freshDoc("disallowed-tool");
    const before = doc.serialize();

    const result = await handleBatchEdit({
      path,
      operations: [{ tool: "save_fdx", args: {} }],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("save_fdx");
    expect(documentCache.hasSavepoint(path)).toBe(false);
    expect(documentCache.get(path)!.serialize()).toBe(before);
  });

  test("applies multiple operations in order and reports each result", async () => {
    const { path, doc } = freshDoc("multi-op-success");
    const target = doc.getParagraphElements().find((p) => paragraphText(p).includes("boulder"))!;
    const id = getParagraphId(target);

    const result = await handleBatchEdit({
      path,
      operations: [
        { tool: "replace_text", args: { find: "boulder", replace: "rock" } },
        { tool: "edit_par", args: { action: "create", type: "Action", textRuns: [{ content: "A new line." }] } },
      ],
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0]!.text);
    expect(body.operationsApplied).toBe(2);
    expect(body.results.length).toBe(2);
    expect(body.results[0].tool).toBe("replace_text");
    expect(body.results[1].tool).toBe("edit_par");

    const updated = documentCache.get(path)!;
    expect(paragraphText(updated.getParagraphElements().find((p) => getParagraphId(p) === id)!)).toContain("rock");
    expect(updated.getParagraphElements().some((p) => paragraphText(p) === "A new line.")).toBe(true);
  });

  test("a path given inside an operation's args is overridden by the batch's path", async () => {
    const { path, doc } = freshDoc("path-override");
    const target = doc.getParagraphElements().find((p) => paragraphText(p).includes("boulder"))!;

    const result = await handleBatchEdit({
      path,
      operations: [{ tool: "replace_text", args: { path: "some/other/path.fdx", find: "boulder", replace: "rock" } }],
    });
    expect(result.isError).toBeFalsy();
    expect(paragraphText(documentCache.get(path)!.getParagraphElements().find((p) => paragraphText(p).includes("rock"))!)).toContain(
      "rock",
    );
    expect(documentCache.get("some/other/path.fdx")).toBeUndefined();
  });

  test("a failing operation rolls back every earlier operation in the same batch", async () => {
    const { path, doc } = freshDoc("mid-batch-failure");
    const before = doc.serialize();

    const result = await handleBatchEdit({
      path,
      operations: [
        { tool: "replace_text", args: { find: "boulder", replace: "rock" } },
        { tool: "edit_par", args: { action: "edit", id: "does-not-exist", type: "Action" } },
      ],
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0]!.text);
    expect(body.failedAtIndex).toBe(1);
    expect(body.failedTool).toBe("edit_par");
    expect(body.results.length).toBe(1);

    expect(documentCache.get(path)!.serialize()).toBe(before);
  });

  test("after a successful batch, the pre-batch savepoint is still present and undoes the whole batch", async () => {
    const { path, doc } = freshDoc("post-success-rollback");
    const before = doc.serialize();

    await handleBatchEdit({
      path,
      operations: [{ tool: "replace_text", args: { find: "boulder", replace: "rock" } }],
    });
    expect(documentCache.hasSavepoint(path)).toBe(true);
    expect(documentCache.get(path)!.serialize()).not.toBe(before);

    documentCache.rollback(path);
    expect(documentCache.get(path)!.serialize()).toBe(before);
  });

  test("after a rolled-back batch, calling rollback again is a no-op", async () => {
    const { path, doc } = freshDoc("rollback-idempotent");
    const before = doc.serialize();

    await handleBatchEdit({
      path,
      operations: [
        { tool: "replace_text", args: { find: "boulder", replace: "rock" } },
        { tool: "edit_par", args: { action: "edit", id: "does-not-exist", type: "Action" } },
      ],
    });
    expect(documentCache.get(path)!.serialize()).toBe(before);

    const secondRollback = documentCache.rollback(path);
    expect(secondRollback).toEqual({ ok: true });
    expect(documentCache.get(path)!.serialize()).toBe(before);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/batch-edit.test.ts`
Expected: FAIL — `Cannot find module './batch-edit.ts'`.

- [ ] **Step 3: Implement**

Create `src/tools/batch-edit.ts`:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * batch_edit — runs an ordered list of edit operations against one document, all-or-nothing. Takes
 * a savepoint before running (see savepoint.ts/rollback.ts), then dispatches each operation to the
 * same handler function its own MCP tool uses. The first operation to fail triggers an immediate
 * rollback to the pre-batch state and stops the batch; no partial result is ever left in the cache.
 * On full success, the pre-batch savepoint is left in place so the whole batch can still be undone
 * afterward with a plain rollback call.
 *
 * Allowlisted to pure in-memory mutation tools only — never save_fdx/reload_fdx/close_fdx/new_file/
 * read_fdx, since a disk write or cache-lifecycle change can't be rolled back by this mechanism.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, errResult, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import { handleEditPar } from "./edit-par.ts";
import { handleEditDualDialogue } from "./edit-dual-dialogue.ts";
import { handleEditCast } from "./edit-cast.ts";
import { handleEditSceneArcBeats } from "./edit-scene-arc-beats.ts";
import { handleEditSmarttypeCharacters } from "./edit-smarttype-characters.ts";
import { handleEditSmarttypeExtensions } from "./edit-smarttype-extensions.ts";
import { handleEditSmarttypeLocations } from "./edit-smarttype-locations.ts";
import { handleEditSmarttypeSceneIntros } from "./edit-smarttype-scene-intros.ts";
import { handleEditSmarttypeTimesOfDay } from "./edit-smarttype-times-of-day.ts";
import { handleEditSmarttypeTransitions } from "./edit-smarttype-transitions.ts";
import { handleEditSpellCheck } from "./edit-spell-check.ts";
import { handleEditLocations } from "./edit-locations.ts";
import { handleEditTitlePage } from "./edit-title-page.ts";
import { handleEditCopyright } from "./edit-copyright.ts";
import { handleEditElementSettings } from "./edit-element-settings.ts";
import { handleEditHeaderAndFooter } from "./edit-header-and-footer.ts";
import { handleReplaceText } from "./replace-text.ts";
import { handleRenameCharacter } from "./rename-character.ts";

type OperationHandler = (args: Record<string, unknown> | undefined) => Promise<ToolResult>;

const ALLOWED_OPERATIONS: Record<string, OperationHandler> = {
  edit_par: handleEditPar,
  edit_dual_dialogue: handleEditDualDialogue,
  edit_cast: handleEditCast,
  edit_scene_arc_beats: handleEditSceneArcBeats,
  edit_smarttype_characters: handleEditSmarttypeCharacters,
  edit_smarttype_extensions: handleEditSmarttypeExtensions,
  edit_smarttype_locations: handleEditSmarttypeLocations,
  edit_smarttype_scene_intros: handleEditSmarttypeSceneIntros,
  edit_smarttype_times_of_day: handleEditSmarttypeTimesOfDay,
  edit_smarttype_transitions: handleEditSmarttypeTransitions,
  edit_spell_check: handleEditSpellCheck,
  edit_locations: handleEditLocations,
  edit_title_page: handleEditTitlePage,
  edit_copyright: handleEditCopyright,
  edit_element_settings: handleEditElementSettings,
  edit_header_and_footer: handleEditHeaderAndFooter,
  replace_text: handleReplaceText,
  rename_character: handleRenameCharacter,
};

const ALLOWED_TOOL_NAMES = Object.keys(ALLOWED_OPERATIONS).join(", ");

export const batchEditTool: FdxTool = {
  name: "batch_edit",
  description:
    `Run an ordered list of edit operations against one document, all-or-nothing: if any operation fails, every operation in the batch is rolled back and the document is left exactly as it was before the call. Takes a savepoint automatically before running and leaves it in place afterward, win or lose, so rollback can undo the whole batch even after it succeeds. Each operation is {tool, args} — tool must be one of: ${ALLOWED_TOOL_NAMES} (never save_fdx/reload_fdx/close_fdx/new_file/read_fdx — a disk write can't be rolled back). path is supplied once for the whole batch and injected into every operation's args, overriding anything given there. After a successful batch, call save_fdx to persist changes to disk.`,
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      operations: {
        type: "array",
        description: "ordered list of {tool, args} operations to apply atomically",
        items: {
          type: "object",
          properties: {
            tool: { type: "string", description: `one of: ${ALLOWED_TOOL_NAMES}` },
            args: { type: "object", description: "arguments for that tool, same shape as calling it directly (path is supplied automatically)" },
          },
          required: ["tool", "args"],
        },
      },
    },
    required: ["path", "operations"],
  },
};

interface BatchOperation {
  tool: string;
  args: Record<string, unknown>;
}

export async function handleBatchEdit(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");

  const operations = arg<BatchOperation[]>(args, "operations");
  if (!Array.isArray(operations) || operations.length === 0) {
    return errResult("operations is required and must be a non-empty array");
  }

  for (let i = 0; i < operations.length; i++) {
    const tool = operations[i]!.tool;
    if (!ALLOWED_OPERATIONS[tool]) {
      return errResult(
        `failed to validate batch: operation ${i} names an unsupported tool "${tool}" — allowed: ${ALLOWED_TOOL_NAMES}`,
      );
    }
  }

  const savepointResult = documentCache.setSavepoint(path);
  if (!savepointResult.ok) {
    return errResult(`failed to start batch: ${savepointResult.reason}; call read_fdx first`);
  }

  const results: Array<{ tool: string; result: string }> = [];
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i]!;
    const handler = ALLOWED_OPERATIONS[op.tool]!;
    const opResult = await handler({ ...op.args, path });
    const resultText = opResult.content.map((c) => c.text).join("\n");

    if (opResult.isError) {
      documentCache.rollback(path);
      const body = {
        path,
        failedAtIndex: i,
        failedTool: op.tool,
        error: resultText,
        results,
        message: `Batch failed at operation ${i + 1} (${op.tool}): ${resultText} All changes rolled back — the document is unchanged from before this batch call.`,
      };
      return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }], isError: true };
    }

    results.push({ tool: op.tool, result: resultText });
  }

  const body = {
    path,
    operationsApplied: operations.length,
    results,
    message: `Successfully applied ${operations.length} operation(s) atomically. A savepoint from before this batch is still available — call rollback to undo the whole batch. File updated in cache — call save_fdx to persist changes to disk.`,
  };
  return { content: [{ type: "text", text: JSON.stringify(body, null, 2) }] };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/batch-edit.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Run the full suite**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/tools/batch-edit.ts src/tools/batch-edit.test.ts
git commit -m "Add batch_edit tool

Wishlist item 7: an ordered list of edit operations applied
atomically against one document. Validates every operation's tool
name against a fixed allowlist before touching anything; takes a
savepoint, then dispatches each operation to the same handler
function its own MCP tool uses. First failure rolls back everything
and stops; full success leaves the pre-batch savepoint in place so
the whole batch can still be undone with a plain rollback call. Not
yet registered as an MCP tool."
```

---

### Task 4: Register the three tools; `get_context` documentation

**Files:**
- Modify: `src/index.ts`
- Modify: `src/tools/context-data.ts`
- Modify: `src/tools/context-data.test.ts`

**Interfaces:** none new — wiring and docs only.

- [ ] **Step 1: Register in `src/index.ts`**

Add imports near the other lifecycle/cache-related tool imports (alongside `closeFdxTool`):

```typescript
import { savepointTool, handleSavepoint } from "./tools/savepoint.ts";
import { rollbackTool, handleRollback } from "./tools/rollback.ts";
import { batchEditTool, handleBatchEdit } from "./tools/batch-edit.ts";
```

Add `savepointTool,`, `rollbackTool,`, `batchEditTool,` to the tool-list array (near
`closeFdxTool,`), and to the dispatch map:

```typescript
  savepoint: (args) => handleSavepoint(args),
  rollback: (args) => handleRollback(args),
  batch_edit: (args) => handleBatchEdit(args),
```

- [ ] **Step 2: Add `context-data.ts` catalog entries**

In `src/tools/context-data.ts`'s `contextTools` array, add entries near `close_fdx`/`reload_fdx`:

```typescript
  {
    name: "savepoint",
    description:
      "Captures the current in-memory state of a cached document as a single rollback point, overwriting any previous savepoint for this path. Call rollback to restore it. Does not touch disk.",
  },
  {
    name: "rollback",
    description:
      "Restores a document to its last savepoint, discarding any edits made since. Errors if no savepoint exists for this path. Does not touch disk.",
  },
  {
    name: "batch_edit",
    description:
      "Run an ordered list of edit operations against one document, all-or-nothing. Takes a savepoint automatically and leaves it in place afterward, so rollback can undo the whole batch even after success. Allowlisted to in-memory mutation tools only.",
  },
```

Add a new rule to `contextRules`, after "Versioned Saves and the Cache":

```typescript
  {
    title: "Batch Edits and Savepoints",
    content:
      "batch_edit runs an ordered list of edit operations against one document, all-or-nothing: if any operation fails, every operation in the batch is rolled back and the document is left exactly as it was before the call. It takes a savepoint automatically before running and leaves it in place afterward, win or lose — so rollback can undo the whole batch even after it succeeds, if you change your mind. savepoint/rollback are the same mechanism, callable directly around any sequence of individual edit_* calls — one level only, and a new savepoint (manual or from the next batch_edit call) always overwrites whatever was there. Neither touches disk; save_fdx is still a separate, explicit step.",
  },
```

- [ ] **Step 3: Update the rule-count test**

In `src/tools/context-data.test.ts`, change:

```typescript
  test("has 17 formatting rules", () => {
    expect(contextRules.length).toBe(17);
  });
```

to:

```typescript
  test("has 18 formatting rules", () => {
    expect(contextRules.length).toBe(18);
  });
```

- [ ] **Step 4: Run the full suite**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts src/tools/context-data.ts src/tools/context-data.test.ts
git commit -m "Register savepoint/rollback/batch_edit; document the mechanism in get_context"
```

---

### Task 5: Documentation sync

**Files:**
- Modify: `TOOLS.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Check: `README.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Update `TOOLS.md`**

Add three new rows near `close_fdx`/`reload_fdx`:

```
| savepoint                 | path                                                                                                                                                                                                                                                                                   | Captures the current in-memory state of a cached document as a single rollback point, overwriting any previous savepoint for this path. Call rollback to restore it. Does not touch disk.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| rollback                  | path                                                                                                                                                                                                                                                                                   | Restores a document to its last savepoint, discarding any edits made since. Errors if no savepoint exists for this path. Does not touch disk.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| batch_edit                | path, operations                                                                                                                                                                                                                                                                      | Run an ordered list of edit operations against one document, all-or-nothing. Takes a savepoint automatically and leaves it in place afterward, so rollback can undo the whole batch even after success. Allowlisted to in-memory mutation tools only (never save_fdx/reload_fdx/close_fdx/new_file/read_fdx).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
```

Update `get_cache_status`'s row description to mention `hasSavepoint`, matching the tool description
text from Task 2.

- [ ] **Step 2: Update `CHANGELOG.md`**

Add a new version entry above the current top entry:

```markdown
## [<next-patch-version>] - 2026-08-02

### Added

- **`batch_edit`** tool — runs an ordered list of edit operations against one document, all-or-nothing. Validates every operation's tool name against a fixed allowlist of in-memory mutation tools before touching anything (never `save_fdx`/`reload_fdx`/`close_fdx`/`new_file`/`read_fdx` — a disk write can't be rolled back). Takes a savepoint automatically before running; the first operation to fail rolls back everything and stops, and a fully successful batch leaves the savepoint in place so the whole thing can still be undone afterward with `rollback`.
- **`savepoint`/`rollback`** tools — a single-level, per-document snapshot of in-memory content and dirty state, independent of disk. `savepoint` captures it (overwriting any previous one); `rollback` restores it, repeatably. The same mechanism `batch_edit` uses internally, exposed directly for use around any sequence of individual `edit_*` calls.

### Changed

- **`get_cache_status`** now reports `hasSavepoint` per cached document.
```

Determine `<next-patch-version>` from `package.json`'s current version at implementation time
(increment the patch number by 1).

- [ ] **Step 3: Bump `package.json`**

Set `"version"` to the same `<next-patch-version>` used in the changelog entry.

- [ ] **Step 4: Check `README.md`**

Read `README.md`'s Features list. Per this repo's `CLAUDE.md` doc-sync rule, add a bullet if batch
edits/savepoints fit the existing bullet style (they do — this is a headline capability, similar to
how `rename_character` earned a mention in the "Character tracking" bullet). Suggested new bullet,
inserted near "Document lifecycle":

```markdown
- **Batch edits & savepoints** — apply an ordered list of edits atomically (all-or-nothing, with automatic rollback on failure), or take a manual savepoint around any sequence of edits and roll back to it on demand.
```

- [ ] **Step 5: Run the full suite one more time**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add TOOLS.md CHANGELOG.md package.json README.md
git commit -m "Update TOOLS.md/CHANGELOG.md/README.md for batch_edit/savepoint/rollback; bump version"
```

## Self-Review Notes

- **Spec coverage:** the savepoint primitive (spec section 1) maps to Task 1; the standalone tools
  (section 2) and `get_cache_status` extension (section 4) map to Task 2; `batch_edit` (section 3)
  maps to Task 3; `get_context` documentation (section 5) maps to Task 4.
- **Type consistency:** `ALLOWED_OPERATIONS`'s keys in Task 3 match the Global Constraints allowlist
  exactly (18 tool names); every handler function imported there was confirmed `async` (returns
  `Promise<ToolResult>`) against its actual source file before being included in this plan, so the
  `OperationHandler` type is satisfied without a cast.
- **Ordering dependency:** Task 3 (`batch_edit`) imports `handleReplaceText` and
  `handleRenameCharacter`, both already `async function ... : Promise<ToolResult>` from prior
  phases — no changes needed to either for this phase.
- **Test-count sensitivity:** Task 4 Step 3 updates `context-data.test.ts`'s hardcoded rule count
  (17 → 18) in the same commit as the rule that makes it necessary, so `bun test` never goes red
  between those two changes.
