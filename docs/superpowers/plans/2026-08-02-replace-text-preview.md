# replace_text preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement wishlist Phase C (item 5) per
`docs/superpowers/specs/2026-08-02-replace-text-preview-design.md`: a `preview=true` param on
`replace_text` that reports what would be matched — and what would be skipped for spanning a run
boundary — without mutating anything.

**Architecture:** One extension to the existing `runPreservingReplace` helper (already shared with
`rename_character`) plus one new branch in `handleReplaceText`. No new files, no new tool.

**Tech Stack:** TypeScript, Bun test runner.

## Global Constraints

- Bun-first, Deno-compatible — no Bun/Node-only APIs beyond what's already in the codebase.
- `rename_character` (the other caller of `runPreservingReplace`) must be unaffected — it never
  passes `preview`, so the new option must default to falsy/off behavior identical to today.
- Mutate-mode's existing plain-text response and message wording are unchanged — only preview mode
  is new.
- `bun test` must stay green after every task.

---

### Task 1: `preview` mode in `runPreservingReplace` / `replace_text`

**Files:**
- Modify: `src/tools/replace-text.ts`
- Modify: `src/tools/replace-text.test.ts`

**Interfaces:**
- Produces: `RunPreservingReplaceOptions` gains `preview?: boolean`; `RunPreservingReplaceResult`
  gains `previewMatches?: PreviewMatch[]` (populated only when `preview` is `true`), where:
  ```typescript
  export interface PreviewMatch {
    id: string;
    type: string;
    text: string;         // paragraph text with every occurrence wrapped in «...»
    wouldReplace: number; // occurrences that fall entirely within one <Text> run
    skipped: number;      // occurrences that only exist by spanning a run boundary
  }
  ```
- `handleReplaceText` gains a `preview` arg; when true, returns JSON instead of the existing
  plain-text message, and performs no mutation (no `setTextContent`, no `touchDirty`).

- [ ] **Step 1: Write the failing tests**

Add to `src/tools/replace-text.test.ts`, before the closing `});` of the `describe` block:

```typescript
  test("preview reports matches without mutating the document", async () => {
    const { path, doc } = freshDoc("preview-basic");
    const target = doc.getParagraphElements().find((p) => paragraphText(p).includes("boulder"))!;
    const id = getParagraphId(target);

    const result = await handleReplaceText({ path, find: "boulder", replace: "rock", preview: true });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[result.content.length - 1]!.text);
    expect(body.preview).toBe(true);
    expect(body.totalMatches).toBe(1);
    expect(body.totalSkipped).toBe(0);
    const match = body.matches.find((m: { id: string }) => m.id === id);
    expect(match).toBeDefined();
    expect(match.wouldReplace).toBe(1);
    expect(match.skipped).toBe(0);
    expect(match.text).toContain("«boulder»");

    // Nothing changed.
    const stillThere = doc.getParagraphElements().find((p) => getParagraphId(p) === id)!;
    expect(paragraphText(stillThere)).toContain("boulder");
    expect(paragraphText(stillThere)).not.toContain("rock");
  });

  test("preview marks a case-insensitive match with its original document casing", async () => {
    const { path } = freshDoc("preview-casing");
    const result = await handleReplaceText({ path, find: "grog", replace: "ZOG", parType: "Character", preview: true });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0]!.text);
    const match = body.matches.find((m: { text: string }) => m.text.includes("«Grog»") || m.text.includes("«GROG»"));
    expect(match).toBeDefined();
    // The find term itself ("grog", lowercase) must not appear verbatim inside the marker.
    expect(match.text).not.toContain("«grog»");
  });

  test("preview marks every occurrence in a paragraph with multiple matches", async () => {
    const { path, doc } = freshDoc("preview-multi");
    await handleEditPar({
      path,
      action: "create",
      type: "Action",
      textRuns: [{ content: "Grog sees Grog's reflection and greets Grog." }],
    });
    const created = doc.getParagraphElements().at(-1)!;
    const id = getParagraphId(created);

    const result = await handleReplaceText({ path, find: "Grog", replace: "Zog", preview: true });
    const body = JSON.parse(result.content[0]!.text);
    const match = body.matches.find((m: { id: string }) => m.id === id);
    expect(match.wouldReplace).toBe(3);
    expect((match.text.match(/«Grog»/g) ?? []).length).toBe(3);
  });

  test("preview surfaces a run-spanning match as skip-only, not silently omitted", async () => {
    const { path, doc } = freshDoc("preview-spanning");
    await handleEditPar({
      path,
      action: "create",
      type: "Action",
      textRuns: [{ content: "fo" }, { content: "obar", attrs: { AdornmentStyle: "-1" } }],
    });
    const created = doc.getParagraphElements().at(-1)!;
    const id = getParagraphId(created);
    const runsBefore = findChildren(created, "Text").map((r) => textContent(r));

    const result = await handleReplaceText({ path, find: "foobar", replace: "TARGET", preview: true });
    const body = JSON.parse(result.content[0]!.text);
    expect(body.totalMatches).toBe(0);
    expect(body.totalSkipped).toBe(1);
    const match = body.matches.find((m: { id: string }) => m.id === id);
    expect(match).toBeDefined();
    expect(match.wouldReplace).toBe(0);
    expect(match.skipped).toBe(1);

    const runsAfter = findChildren(doc.getParagraphElements().find((p) => getParagraphId(p) === id)!, "Text").map((r) =>
      textContent(r),
    );
    expect(runsAfter).toEqual(runsBefore);
  });

  test("preview with zero matches returns an empty list, not an error", async () => {
    const { path } = freshDoc("preview-no-match");
    const result = await handleReplaceText({ path, find: "zzz_no_such_text_zzz", replace: "x", preview: true });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0]!.text);
    expect(body.matches).toEqual([]);
    expect(body.totalMatches).toBe(0);
  });

  test("preview respects parType/id/caseSensitive scoping the same as mutate mode", async () => {
    const { path } = freshDoc("preview-scoping");
    const csResult = await handleReplaceText({
      path,
      find: "grog",
      replace: "GROG",
      parType: "Dialogue",
      caseSensitive: true,
      preview: true,
    });
    const csBody = JSON.parse(csResult.content[0]!.text);
    expect(csBody.totalMatches).toBe(0);

    const badScope = await handleReplaceText({ path, find: "Zog", replace: "x", id: "does-not-exist", preview: true });
    expect(badScope.isError).toBe(true);
    expect(badScope.content[0]!.text).toContain("section id not found");
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/replace-text.test.ts`
Expected: FAIL — `preview` isn't recognized yet; results are still plain text, `JSON.parse` throws
or `body.preview` is `undefined`.

- [ ] **Step 3: Implement**

Replace `src/tools/replace-text.ts` in full:

```typescript
// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * replace_text — run-preserving find/replace across a loaded screenplay's paragraph text.
 * Substitutes inside each <Text> run's own content, leaving run boundaries and every run
 * attribute (AdornmentStyle, Font, Color, Size, RevisionID, ...) untouched. A match that only
 * exists when spanning two runs is left alone and reported as skipped rather than merged.
 * Pass preview=true to see what would happen (each occurrence marked with «...» in its
 * paragraph's text) without changing anything.
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
    "Find and replace text across paragraphs in a loaded screenplay, substituting inside each <Text> run's own content so run boundaries and every run attribute (AdornmentStyle, Font, Color, Size, RevisionID, ...) are preserved. A match that only exists by spanning two runs is left unreplaced and reported as skipped. Optionally scope to a section (id) and/or a paragraph type (parType). Pass preview=true to see what would be matched — each occurrence marked with «...» in its paragraph's text, original document casing preserved — without changing anything; call again with preview omitted (or false) to apply. After editing, call save_fdx to persist changes to disk.",
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
      preview: {
        type: "boolean",
        description: "when true, report what would be matched/skipped without changing anything",
      },
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

/** Wraps every occurrence of `find` in «...», preserving the original matched substring's casing. */
function markMatches(haystack: string, find: string, caseSensitive: boolean): string {
  if (caseSensitive) return haystack.split(find).join(`«${find}»`);
  return haystack.replace(new RegExp(escapeRegExp(find), "gi"), (m) => `«${m}»`);
}

export interface RunPreservingReplaceOptions {
  find: string;
  replace: string;
  caseSensitive: boolean;
  parType?: string;
  startIndex?: number;
  endIndex?: number;
  preview?: boolean;
}

export interface PreviewMatch {
  id: string;
  type: string;
  text: string;
  wouldReplace: number;
  skipped: number;
}

export interface RunPreservingReplaceResult {
  totalReplaced: number;
  paragraphsTouched: number;
  touched: boolean;
  skipped: Array<{ id: string; count: number }>;
  previewMatches?: PreviewMatch[];
}

/**
 * Substitutes `find` with `replace` inside each <Text> run's own content across the paragraphs in
 * [startIndex, endIndex) (defaults to the whole document), optionally restricted to `parType`. A
 * match that only exists by spanning two runs is left unreplaced and counted in `skipped` instead.
 * When `preview` is true, nothing is mutated — `previewMatches` reports what would happen instead.
 */
export function runPreservingReplace(doc: FdxDocument, opts: RunPreservingReplaceOptions): RunPreservingReplaceResult {
  const { find, replace, caseSensitive, parType, preview } = opts;
  const paragraphs = doc.getParagraphElements();
  const startIndex = opts.startIndex ?? 0;
  const endIndex = opts.endIndex ?? paragraphs.length;

  let totalReplaced = 0;
  let paragraphsTouched = 0;
  const skipped: Array<{ id: string; count: number }> = [];
  const previewMatches: PreviewMatch[] = [];
  let touched = false;

  for (let i = startIndex; i < endIndex; i++) {
    const para = paragraphs[i]!;
    if (parType && getParagraphType(para) !== parType) continue;

    const text = paragraphText(para);
    const naiveTotal = countOccurrences(text, find, caseSensitive);
    if (naiveTotal === 0) continue;

    let perRunReplaced = 0;
    for (const run of findChildren(para, "Text")) {
      const content = textContent(run);
      const count = countOccurrences(content, find, caseSensitive);
      if (count === 0) continue;
      if (!preview) {
        setTextContent(run, replaceAllOccurrences(content, find, replace, caseSensitive));
      }
      perRunReplaced += count;
    }

    const skippedCount = naiveTotal - perRunReplaced;

    if (preview) {
      previewMatches.push({
        id: getParagraphId(para),
        type: getParagraphType(para),
        text: markMatches(text, find, caseSensitive),
        wouldReplace: perRunReplaced,
        skipped: skippedCount,
      });
      continue;
    }

    if (perRunReplaced > 0) {
      totalReplaced += perRunReplaced;
      paragraphsTouched++;
      touched = true;
    }

    if (skippedCount > 0) skipped.push({ id: getParagraphId(para), count: skippedCount });
  }

  return preview
    ? { totalReplaced, paragraphsTouched, touched, skipped, previewMatches }
    : { totalReplaced, paragraphsTouched, touched, skipped };
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
  const preview = Boolean(args?.preview);

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
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/replace-text.test.ts`
Expected: PASS (all existing + 6 new tests).

- [ ] **Step 5: Run the full suite**

Run: `bun test`
Expected: all PASS — confirms `rename_character` (the other `runPreservingReplace` caller, which
never passes `preview`) is unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/tools/replace-text.ts src/tools/replace-text.test.ts
git commit -m "Add preview mode to replace_text

Wishlist item 5: preview=true reports what would be matched (and
what would be skipped for spanning a run boundary) without changing
anything, marking each occurrence with «...» in its paragraph's text
using the original document casing. Mutate-mode's response is
unchanged. rename_character (the other runPreservingReplace caller)
never passes preview, so its behavior is unaffected."
```

---

### Task 2: Documentation sync

**Files:**
- Modify: `TOOLS.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Check: `README.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Update `TOOLS.md`**

Find `replace_text`'s row and update its parameters column to
`path, find, replace, parType?, id?, caseSensitive?, preview?` and its description to match the
tool description from Task 1 Step 3.

- [ ] **Step 2: Update `CHANGELOG.md`**

Add a new version entry above the current top entry:

```markdown
## [<next-patch-version>] - 2026-08-02

### Added

- **`replace_text` gains a `preview` option.** `preview=true` reports what would be matched — and what would be skipped for spanning a run boundary — without changing anything: each occurrence is marked with `«...»` in its paragraph's text (original document casing preserved), and skip-only paragraphs are surfaced up front instead of only being discoverable after a real run. Same call shape as a normal `replace_text` call, so preview-then-commit is a two-line workflow.
```

Determine `<next-patch-version>` from `package.json`'s current version at implementation time
(increment the patch number by 1).

- [ ] **Step 3: Bump `package.json`**

Set `"version"` to the same `<next-patch-version>` used in the changelog entry.

- [ ] **Step 4: Check `README.md`**

Confirm whether `README.md` mentions `replace_text` or find/replace capability anywhere (per this
repo's `CLAUDE.md` doc-sync rule — check, don't assume). If it doesn't reference this tool
specifically, no change is needed; note that explicitly in the commit message.

- [ ] **Step 5: Run the full suite**

Run: `bun test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add TOOLS.md CHANGELOG.md package.json
git commit -m "Update TOOLS.md/CHANGELOG.md for replace_text preview; bump version"
```

## Self-Review Notes

- **Spec coverage:** the spec's single scope item (preview param + `runPreservingReplace`
  extension) maps directly to Task 1; documentation requirements map to Task 2.
- **Type consistency:** `PreviewMatch` field names (`wouldReplace`, `skipped`) match between the
  interface definition and every place Task 1's code and tests reference them.
- **Backward compatibility:** `RunPreservingReplaceOptions.preview` is optional and
  `rename_character`'s existing call site (from the prior phase) doesn't set it, so its behavior is
  unchanged — verified by the full suite in Task 1 Step 5, not just `replace-text.test.ts` alone.
