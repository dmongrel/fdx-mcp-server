# Three Small Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three independent, small fixes from the wishlist: correct `AdornmentStyle="-1"`'s
"unknown-word marker" mislabeling everywhere it appears (item 15), have
`edit_smarttype_characters`'s cross-reference warning count Character-cue paragraphs (item 16),
and add `edit_scene_properties` to `batch_edit`'s allowlist (item 19).

**Architecture:** No shared code between the three — they touch entirely separate files. Item 15
is a text-only change across nine locations. Item 16 extends one existing function's return type
and one warning-formatting function. Item 19 adds one map entry.

**Tech Stack:** TypeScript, Bun test runner — no new dependencies.

## Global Constraints

- Item 15: `CHANGELOG.md` is never retroactively edited — it records what was true at each past
  release.
- Item 16: cue-paragraph counting is top-level-only (Character-type paragraphs from
  `doc.getParagraphElements()`), matching every other paragraph-scanning tool's established scope.
  `cueParagraphsExact` uses the existing `cs` case-sensitivity flag, matching how `cast`/
  `arcBeats`/`highlighting` already compare.
- Item 16: the warning message always lists all four counts (even when individually zero) as long
  as the overall trigger condition passes — matching the existing message's established style,
  which already lists `cast`/`arcBeats`/`highlighting` unconditionally once triggered. Only the new
  substring-only parenthetical is conditionally omitted (when that count is `0`).
- Item 19: no other logic in `batch-edit.ts` changes — the allowlist is a plain lookup map.

---

### Task 1: `countCharacterReferences` gains cue-paragraph counts

**Files:**
- Modify: `src/tools/breakdown.ts`
- Test: `src/tools/breakdown.test.ts`

**Interfaces:**
- Produces: `countCharacterReferences(doc: FdxDocument, name: string, cs: boolean): { cast: number; arcBeats: number; highlighting: number; cueParagraphsExact: number; cueParagraphsSubstringOnly: number }` — consumed by Task 2.

- [ ] **Step 1: Write the failing tests**

Add to `src/tools/breakdown.test.ts`, as a new `describe` block after the existing
`describe("getOrCreateSceneProperties", ...)` block. This needs `countCharacterReferences` added
to the existing `import { ... } from "./breakdown.ts";` list at the top of the file.

```typescript
describe("countCharacterReferences", () => {
  test("counts an exact-match cue paragraph", () => {
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Character" id="c1"><Text>ETHNEN</Text></Paragraph>
    <Paragraph Type="Dialogue" id="d1"><Text>Hello.</Text></Paragraph>
  </Content>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const result = countCharacterReferences(doc, "ETHNEN", false);
    expect(result.cueParagraphsExact).toBe(1);
    expect(result.cueParagraphsSubstringOnly).toBe(0);
  });

  test("counts a substring-only cue paragraph (e.g. with an extension) separately", () => {
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Character" id="c1"><Text>ETHNEN (V.O.)</Text></Paragraph>
  </Content>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const result = countCharacterReferences(doc, "ETHNEN", false);
    expect(result.cueParagraphsExact).toBe(0);
    expect(result.cueParagraphsSubstringOnly).toBe(1);
  });

  test("counts exact and substring-only cues together without double-counting", () => {
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Character" id="c1"><Text>ETHNEN</Text></Paragraph>
    <Paragraph Type="Character" id="c2"><Text>ETHNEN (V.O.)</Text></Paragraph>
    <Paragraph Type="Character" id="c3"><Text>ETHNEN</Text></Paragraph>
  </Content>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const result = countCharacterReferences(doc, "ETHNEN", false);
    expect(result.cueParagraphsExact).toBe(2);
    expect(result.cueParagraphsSubstringOnly).toBe(1);
  });

  test("a Dialogue paragraph containing the name is not counted as a cue", () => {
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Dialogue" id="d1"><Text>Tell ETHNEN I said hello.</Text></Paragraph>
  </Content>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const result = countCharacterReferences(doc, "ETHNEN", false);
    expect(result.cueParagraphsExact).toBe(0);
    expect(result.cueParagraphsSubstringOnly).toBe(0);
  });

  test("respects the cs case-sensitivity flag for exact matches", () => {
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Character" id="c1"><Text>ethnen</Text></Paragraph>
  </Content>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    expect(countCharacterReferences(doc, "ETHNEN", false).cueParagraphsExact).toBe(1);
    expect(countCharacterReferences(doc, "ETHNEN", true).cueParagraphsExact).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/breakdown.test.ts`
Expected: FAIL — `result.cueParagraphsExact` and `result.cueParagraphsSubstringOnly` are
`undefined`.

- [ ] **Step 3: Implement the fix**

In `src/tools/breakdown.ts`, change `countCharacterReferences` from:

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

to:

```typescript
export function countCharacterReferences(doc: FdxDocument, name: string, cs: boolean): { cast: number; arcBeats: number; highlighting: number; cueParagraphsExact: number; cueParagraphsSubstringOnly: number } {
  const match = (v: string) => (cs ? v === name : v.toLowerCase() === name.toLowerCase());
  const contains = (v: string) => (cs ? v.includes(name) : v.toLowerCase().includes(name.toLowerCase()));

  const cast = doc.getCastMembers().filter((m) => match(getAttr(m, "Character") ?? "")).length;

  let arcBeats = 0;
  for (const p of doc.getParagraphElements()) {
    const sp = findChild(p, "SceneProperties");
    const arcBeatsEl = sp && findChild(sp, "SceneArcBeats");
    if (!arcBeatsEl) continue;
    arcBeats += findChildren(arcBeatsEl, "CharacterArcBeat").filter((b) => match(getAttr(b, "Name") ?? "")).length;
  }

  const highlighting = doc.getHighlightedCharacters().filter((c) => match(getAttr(c, "Name") ?? "")).length;

  let cueParagraphsExact = 0;
  let cueParagraphsSubstringOnly = 0;
  for (const p of doc.getParagraphElements()) {
    if (getParagraphType(p) !== "Character") continue;
    const text = paragraphText(p);
    if (match(text)) cueParagraphsExact++;
    else if (contains(text)) cueParagraphsSubstringOnly++;
  }

  return { cast, arcBeats, highlighting, cueParagraphsExact, cueParagraphsSubstringOnly };
}
```

`getParagraphType` and `paragraphText` are already imported in `breakdown.ts` (used throughout the
file) — no new import needed for this function.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/breakdown.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test`
Expected: FAIL — `src/tools/edit-smarttype-characters.test.ts`'s existing "remove does not warn
when nothing else references the removed name" test will now fail. This is expected: it removes
`"OOK"` from a full copy of the Grog fixture, and `OOK` has three exact-match Character cue
paragraphs in that fixture (confirmed by grepping `examples/Grog The Caveman.fdx` while writing
this plan) — so a warning citing those cues is now the *correct* behavior, and that test's premise
is invalidated by this fix. Task 2 corrects it. Do not attempt to fix it in this task — commit with
the now-expected failure, since Task 1's own deliverable (`countCharacterReferences`) is otherwise
fully working and tested, and Task 2 is the right place to update the consumer.

```bash
git add src/tools/breakdown.ts src/tools/breakdown.test.ts
git commit -m "countCharacterReferences: count Character-cue paragraphs referencing a name

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Cross-reference warning reports cue paragraphs

**Files:**
- Modify: `src/tools/edit-smarttype-characters.ts`
- Test: `src/tools/edit-smarttype-characters.test.ts`

**Interfaces:**
- Consumes: `countCharacterReferences`'s new return fields from Task 1.

- [ ] **Step 1: Fix the now-invalid existing test, and add new ones**

`src/tools/edit-smarttype-characters.test.ts`'s existing "remove does not warn when nothing else
references the removed name" test uses `"OOK"` (which now correctly triggers a warning via its
cue paragraphs). Replace that test with one using a name genuinely referenced nowhere — create a
synthetic SmartType entry first, then remove it in the same call sequence, guaranteeing no cue
paragraph, Cast row, arc beat, or highlighting entry exists for it:

```typescript
  test("remove does not warn when nothing else references the removed name", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    await handleEditSmarttypeCharacters({ path, action: "create", value: "ZZZ_NO_REFERENCES" });
    const result = await handleEditSmarttypeCharacters({ path, action: "remove", find: "ZZZ_NO_REFERENCES" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).not.toContain("Warning:");
  });
```

Add a new test proving the cue-paragraph count alone triggers the warning (this is the direct
regression case for the invalidated test above — `"OOK"` has three exact-match cues and zero
Cast/arc-beat/highlighting references in the base fixture):

```typescript
  test("remove warns citing cue paragraphs even when nothing else references the name", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditSmarttypeCharacters({ path, action: "remove", find: "OOK" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain(
      "Warning: 0 Cast member(s), 0 arc beat(s), 0 CharacterHighlighting entry(ies), and 3 cue paragraph(s) still reference this name.",
    );
  });
```

Update the existing "remove warns when Cast/arc-beat/highlighting rows still reference the removed
name" test's expectation — `fixtureWithReferences()`'s `DANAERIAN COMMANDER` has no Character-cue
paragraphs (it only appears in `SceneArcBeats`, `Cast`, `SmartType`, and `CharacterHighlighting` in
that fixture), so its `cueParagraphsExact`/`cueParagraphsSubstringOnly` are both `0`:

```typescript
  test("remove warns when Cast/arc-beat/highlighting rows still reference the removed name", async () => {
    const path = fixtureWithReferences();
    await handleReadFdx({ path });
    const result = await handleEditSmarttypeCharacters({ path, action: "remove", find: "DANAERIAN COMMANDER" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain(
      "Warning: 1 Cast member(s), 1 arc beat(s), 1 CharacterHighlighting entry(ies), and 0 cue paragraph(s) still reference this name.",
    );
  });
```

Add a test for the substring-only parenthetical clause, using a hand-crafted fixture with a
Character cue carrying an extension:

```typescript
  test("remove's warning appends a substring-only clause when a cue carries an extension", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fdx-edit-characters-ext-"));
    const path = join(dir, "script.fdx");
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Character" id="c1"><Text>ETHNEN (V.O.)</Text></Paragraph>
  </Content>
  <SmartType>
    <Characters>
      <Character>ETHNEN</Character>
    </Characters>
  </SmartType>
</FinalDraft>`;
    writeFileSync(path, source, "utf-8");
    await handleReadFdx({ path });
    const result = await handleEditSmarttypeCharacters({ path, action: "remove", find: "ETHNEN" });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain(
      "Warning: 0 Cast member(s), 0 arc beat(s), 0 CharacterHighlighting entry(ies), and 0 cue paragraph(s) (plus 1 more containing the name as part of a longer cue, e.g. with an extension) still reference this name.",
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/edit-smarttype-characters.test.ts`
Expected: FAIL — the "warns citing cue paragraphs" test and the substring-only clause test both
fail (the current message has no cue-paragraph clause at all); the corrected
Cast/arc-beat/highlighting test also fails (its expected string now includes `, and 0 cue
paragraph(s)` which the current code doesn't produce).

- [ ] **Step 3: Implement the fix**

In `src/tools/edit-smarttype-characters.ts`, change `crossRefCheck` from:

```typescript
function crossRefCheck(doc: FdxDocument, name: string, cs: boolean): string {
  const { cast, arcBeats, highlighting } = countCharacterReferences(doc, name, cs);
  if (cast === 0 && arcBeats === 0 && highlighting === 0) return "";
  return `Warning: ${cast} Cast member(s), ${arcBeats} arc beat(s), and ${highlighting} CharacterHighlighting entry(ies) still reference this name.`;
}
```

to:

```typescript
function crossRefCheck(doc: FdxDocument, name: string, cs: boolean): string {
  const { cast, arcBeats, highlighting, cueParagraphsExact, cueParagraphsSubstringOnly } = countCharacterReferences(doc, name, cs);
  if (cast === 0 && arcBeats === 0 && highlighting === 0 && cueParagraphsExact === 0 && cueParagraphsSubstringOnly === 0) {
    return "";
  }
  const substringClause =
    cueParagraphsSubstringOnly > 0
      ? ` (plus ${cueParagraphsSubstringOnly} more containing the name as part of a longer cue, e.g. with an extension)`
      : "";
  return `Warning: ${cast} Cast member(s), ${arcBeats} arc beat(s), ${highlighting} CharacterHighlighting entry(ies), and ${cueParagraphsExact} cue paragraph(s)${substringClause} still reference this name.`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/edit-smarttype-characters.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/tools/edit-smarttype-characters.ts src/tools/edit-smarttype-characters.test.ts
git commit -m "edit_smarttype_characters: cross-reference warning counts cue paragraphs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: `edit_scene_properties` added to `batch_edit`'s allowlist

**Files:**
- Modify: `src/tools/batch-edit.ts`
- Test: `src/tools/batch-edit.test.ts`

**Interfaces:**
- Consumes: `handleEditSceneProperties` from `./edit-scene-properties.ts`.

- [ ] **Step 1: Write the failing tests**

`src/tools/batch-edit.test.ts` uses a `freshDoc(key)` helper returning `{path, doc}` synchronously
(it builds the doc directly with `FdxDocument.parse` and registers it in `documentCache` — no
`handleReadFdx` call needed). Operations in a batch omit `path` from their own `args` (the batch's
top-level `path` overrides it — see the file's existing "path given inside an operation's args is
overridden" test). Rollback tests compare `doc.serialize()` before and after, not individual field
reads. Add this import:

```typescript
import { handleGetSceneProperties } from "./get-scene-properties.ts";
```

The first Scene Heading in the Grog fixture (used elsewhere this session, e.g.
`edit-dual-dialogue.test.ts`) has id `"6e39d99f-6972-42f8-bdc8-3f0dbe546280"`. Add two tests inside
`describe("batch_edit", ...)`:

```typescript
  test("runs edit_scene_properties as one step in a batch", async () => {
    const { path } = freshDoc("scene-properties-success");
    const sceneId = "6e39d99f-6972-42f8-bdc8-3f0dbe546280";

    const result = await handleBatchEdit({
      path,
      operations: [{ tool: "edit_scene_properties", args: { id: sceneId, color: "#6363A7A7EFEF" } }],
    });
    expect(result.isError).toBeFalsy();

    const getResult = await handleGetSceneProperties({ path, id: sceneId });
    const props = JSON.parse(getResult.content[getResult.content.length - 1]!.text);
    expect(props.color).toBe("#6363A7A7EFEF");
  });

  test("rolls back edit_scene_properties when a later operation in the batch fails", async () => {
    const { path, doc } = freshDoc("scene-properties-rollback");
    const sceneId = "6e39d99f-6972-42f8-bdc8-3f0dbe546280";
    const before = doc.serialize();

    const result = await handleBatchEdit({
      path,
      operations: [
        { tool: "edit_scene_properties", args: { id: sceneId, color: "#6363A7A7EFEF" } },
        { tool: "edit_par", args: { action: "edit", id: "does-not-exist", type: "Action" } },
      ],
    });
    expect(result.isError).toBe(true);
    expect(documentCache.get(path)!.serialize()).toBe(before);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/tools/batch-edit.test.ts`
Expected: FAIL — `edit_scene_properties` is not a recognized operation name yet (the batch fails
immediately with an "unknown tool" or similar error from `batch_edit`'s own allowlist check).

- [ ] **Step 3: Implement the fix**

In `src/tools/batch-edit.ts`, add the import alongside the other handler imports:

```typescript
import { handleEditSceneProperties } from "./edit-scene-properties.ts";
```

Add the map entry to `ALLOWED_OPERATIONS`, alongside `edit_scene_arc_beats` (both operate on the
same `SceneProperties` block, so keeping them adjacent in the map matches how the rest of the map
already groups related tools):

```typescript
const ALLOWED_OPERATIONS: Record<string, OperationHandler> = {
  edit_par: handleEditPar,
  edit_dual_dialogue: handleEditDualDialogue,
  edit_cast: handleEditCast,
  edit_scene_arc_beats: handleEditSceneArcBeats,
  edit_scene_properties: handleEditSceneProperties,
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
```

`batchEditTool.description` interpolates `ALLOWED_TOOL_NAMES` (`` `tool must be one of:
${ALLOWED_TOOL_NAMES}` ``, derived from `Object.keys(ALLOWED_OPERATIONS).join(", ")`) rather than
naming tools statically, so no description string edit is needed — the new map entry from this
step is already reflected there automatically. Same for `operations.items.properties.tool`'s
schema description, one line below, which also interpolates the same constant.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/tools/batch-edit.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and commit**

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add src/tools/batch-edit.ts src/tools/batch-edit.test.ts
git commit -m "batch_edit: add edit_scene_properties to the allowlist

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Fix "unknown-word marker" wording everywhere

**Files:**
- Modify: `src/tools/get-flagged-words.ts`
- Modify: `src/tools/get-script-stats.ts`
- Modify: `src/tools/breakdown.ts`
- Modify: `src/tools/context-data.ts`
- Modify: `TOOLS.md`
- Modify: `README.md`

**Interfaces:** none — pure text changes, no code behavior changes.

- [ ] **Step 1: Replace the wording in `src/tools/get-flagged-words.ts`**

Change the file header comment from:

```typescript
/**
 * get_flagged_words — Read-Only. Surfaces every <Text> run carrying AdornmentStyle="-1" (Final
 * Draft's unknown-word marker, the on-screen squiggle) as a ready-made typo index — every
 * misspelling in a script is already marked in the file, this just asks for the list instead of
 * calling get_par_runs on every paragraph one at a time.
 */
```

to:

```typescript
/**
 * get_flagged_words — Read-Only. Surfaces every <Text> run carrying AdornmentStyle="-1" (Final
 * Draft's proofing flag, covering spelling and grammar both — repeated-word and spacing hits
 * appear alongside genuine typos) as a ready-made typo index — every flagged word in a script is
 * already marked in the file, this just asks for the list instead of calling get_par_runs on every
 * paragraph one at a time.
 */
```

Change `getFlaggedWordsTool.description` from:

```typescript
    'Read-Only. Surfaces every <Text> run carrying AdornmentStyle="-1" — Final Draft\'s unknown-word marker — as {word, paragraphId, paragraphType, page} per hit. Scoped to top-level body paragraphs (nested DualDialogue paragraphs are out of scope, same as find_par/replace_text — a warning is prepended reporting how many were skipped when the document contains any). Pass excludeIgnoreList=true to filter out words already in the spell-check ignore list.',
```

to:

```typescript
    'Read-Only. Surfaces every <Text> run carrying AdornmentStyle="-1" — Final Draft\'s proofing flag (spelling and grammar both, so expect repeated-word and spacing hits alongside genuine typos) — as {word, paragraphId, paragraphType, page} per hit. Scoped to top-level body paragraphs (nested DualDialogue paragraphs are out of scope, same as find_par/replace_text — a warning is prepended reporting how many were skipped when the document contains any). Pass excludeIgnoreList=true to filter out words already in the spell-check ignore list.',
```

- [ ] **Step 2: Replace the wording in `src/tools/get-script-stats.ts`**

Change `getScriptStatsTool.description` from:

```typescript
    'Read-Only. Retrieve high-level document metrics as JSON: total pages, scene count, act break count, total paragraph count, a per-paragraph-type breakdown, document integrity counts (adornmentStyleCount, winVoiceCount, totalTextRuns, curlyQuoteCount, flaggedWordCount — flaggedWordCount is the AdornmentStyle="-1" subset of adornmentStyleCount, Final Draft\'s unknown-word marker; see get_flagged_words to list them individually), and placeholderCount (whole-bracket paragraphs like "[FIX - ...]", counted regardless of paragraph type). Pass excludePlaceholders=true to exclude them from paragraphCount/byType/sceneCount/actBreakCount so a baseline is recoverable without deleting anything; totalPages is unaffected either way. Call this first for a quick overview before deeper inspection, or to confirm nothing was altered by a sweep (compare these counts before/after).',
```

to:

```typescript
    'Read-Only. Retrieve high-level document metrics as JSON: total pages, scene count, act break count, total paragraph count, a per-paragraph-type breakdown, document integrity counts (adornmentStyleCount, winVoiceCount, totalTextRuns, curlyQuoteCount, flaggedWordCount — flaggedWordCount is the AdornmentStyle="-1" subset of adornmentStyleCount, Final Draft\'s proofing flag covering spelling and grammar both; see get_flagged_words to list them individually), and placeholderCount (whole-bracket paragraphs like "[FIX - ...]", counted regardless of paragraph type). Pass excludePlaceholders=true to exclude them from paragraphCount/byType/sceneCount/actBreakCount so a baseline is recoverable without deleting anything; totalPages is unaffected either way. Call this first for a quick overview before deeper inspection, or to confirm nothing was altered by a sweep (compare these counts before/after).',
```

- [ ] **Step 3: Replace the wording in `src/tools/breakdown.ts`**

Change the code comment (directly above `walkIntegrityCounts` or the nearby integrity-counting
function) from:

```typescript
/**
 * Walks the whole document tree once, counting every <Text> run (styled or not), how many carry an
 * AdornmentStyle attribute at all, how many are specifically "-1" (Final Draft's unknown-word
 * marker), and curly-quote characters in text-node content. Scoped to the whole tree (not just
 * top-level body paragraphs) since a raw-regex sweep isn't scoped that way either. Never inspects
 * attribute values for curly quotes, so <Actors>' WinVoice/MacVoice blobs are excluded by
 * construction, not by special-casing them.
 */
```

to:

```typescript
/**
 * Walks the whole document tree once, counting every <Text> run (styled or not), how many carry an
 * AdornmentStyle attribute at all, how many are specifically "-1" (Final Draft's proofing flag,
 * covering spelling and grammar both), and curly-quote characters in text-node content. Scoped to
 * the whole tree (not just top-level body paragraphs) since a raw-regex sweep isn't scoped that way
 * either. Never inspects attribute values for curly quotes, so <Actors>' WinVoice/MacVoice blobs
 * are excluded by construction, not by special-casing them.
 */
```

- [ ] **Step 4: Replace the wording in `src/tools/context-data.ts`**

Change the mirrored `get_flagged_words` entry's description from:

```typescript
      'Read-Only. Surfaces every <Text> run carrying AdornmentStyle="-1" — Final Draft\'s unknown-word marker — as {word, paragraphId, paragraphType, page} per hit. Scoped to top-level body paragraphs (nested DualDialogue paragraphs are out of scope, same as find_par/replace_text — a warning is prepended reporting how many were skipped when the document contains any). Pass excludeIgnoreList=true to filter out words already in the spell-check ignore list.',
```

to the same replacement text used in Step 1 for `get-flagged-words.ts`'s own description (the two
strings must stay identical — verbatim mirror).

Change the mirrored `get_script_stats` entry's description from its current text to the same
replacement text used in Step 2 for `get-script-stats.ts`'s own description (also a verbatim
mirror).

- [ ] **Step 5: Replace the wording in `TOOLS.md`**

Update the `get_flagged_words` row's Description column and the `get_script_stats` row's
Description column, applying the same two wording substitutions used in Steps 1 and 2 to each
row's current text (find each row by searching for `"unknown-word"` in the file — both rows
contain it once).

- [ ] **Step 6: Replace the wording in `README.md`**

Find the "Document integrity" feature bullet under `## Features` (search for "unknown-word
(spellcheck squiggle)"). Change `"unknown-word (spellcheck squiggle) hit"` to `"proofing-flag
(spellcheck squiggle) hit"` — a minimal substitution preserving the rest of the bullet's wording
and structure.

- [ ] **Step 7: Verify no stray old wording remains, run the full suite, and commit**

Run: `grep -rn "unknown-word" src/ TOOLS.md README.md`
Expected: no output (zero matches). `CHANGELOG.md` is deliberately not checked or touched — it
records history, not current state.

Run: `bun test`
Expected: PASS, no regressions (this task changes no code behavior, only strings).

```bash
git add src/tools/get-flagged-words.ts src/tools/get-script-stats.ts src/tools/breakdown.ts src/tools/context-data.ts TOOLS.md README.md
git commit -m "Fix AdornmentStyle=-1 'unknown-word marker' mislabeling (wishlist item 15)

It's Final Draft's proofing flag, covering spelling and grammar both
— repeated-word and spacing hits appear alongside genuine typos, not
just misspellings. Corrected everywhere the old wording appeared.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Version bump and CHANGELOG entry

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

- **`get_flagged_words`**, **`get_script_stats`**, and `get_context`'s formatting rules no longer call `AdornmentStyle="-1"` an "unknown-word marker" — it's Final Draft's proofing flag, covering spelling and grammar both, so repeated-word and spacing hits appear alongside genuine typos.

### Changed

- **`edit_smarttype_characters`**'s cross-reference warning (on `action=remove`) now also counts Character-cue paragraphs still referencing the removed name — previously it named Cast rows, arc beats, and CharacterHighlighting entries but not the fifth and most numerous location a name lives.
- **`batch_edit`** adds `edit_scene_properties` to its allowlist of tools it can run as one step in an atomic batch.
```

- [ ] **Step 3: Rebuild `dist/`, run the full suite again, and commit**

```bash
bun run build
```

Run: `bun test`
Expected: PASS, no regressions.

```bash
git add package.json CHANGELOG.md dist/index.js
git commit -m "Bump version for three small fixes (wishlist items 15, 16, 19)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## After the plan: wishlist and push

Once all five tasks are committed, mark wishlist items 15, 16, and 19 as **DONE** in
`F:\Vault\mcp\fdx-mcp-server\wishlist.md` (format: `— **DONE** (<version>, 2026-08-02)` appended to
each item's heading, using the version bumped in Task 5). Push this phase's commits to
`origin/master` — no tag, no publish unless separately requested, matching the established pattern
for every prior phase.
