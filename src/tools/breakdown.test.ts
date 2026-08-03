// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { FdxDocument } from "../fdx/document.ts";
import { readTextFile } from "../fdx/runtime.ts";
import { findChild } from "../fdx/xml.ts";
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
  getOrCreateSceneProperties,
  locateSluglineLocation,
  buildLocationAppearances,
  rankLocations,
} from "./breakdown.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

async function loadFixture(): Promise<FdxDocument> {
  const source = await readTextFile(FIXTURE_PATH);
  const doc = FdxDocument.parse(source, FIXTURE_PATH);
  doc.dedupSmartTypeLists();
  return doc;
}

describe("parseSceneLength", () => {
  test("fraction only", () => expect(parseSceneLength("4/8")).toBe(0.5));
  test("whole + fraction", () => expect(parseSceneLength("1 4/8")).toBe(1.5));
  test("bare integer means eighths", () => expect(parseSceneLength("6")).toBe(0.75));
  test("empty is 0", () => expect(parseSceneLength("")).toBe(0));
  test("garbage is 0", () => expect(parseSceneLength("nope")).toBe(0));
});

describe("parseSlugline", () => {
  test("splits intro from location", async () => {
    const doc = await loadFixture();
    const { intro, location } = parseSlugline(doc, "INT. BRIDGE - VRIHA THRAI");
    expect(intro).toBe("INT");
    expect(location.length).toBeGreaterThan(0);
  });

  test("empty text yields empty parts", async () => {
    const doc = await loadFixture();
    expect(parseSlugline(doc, "   ")).toEqual({ intro: "", location: "", timeOfDay: "" });
  });

  test("splits on the declared separator regardless of TimesOfDay dictionary membership", async () => {
    const doc = await loadFixture();
    const { intro, location, timeOfDay } = parseSlugline(doc, "INT. BRIDGE - DAY");
    expect(intro).toBe("INT");
    expect(timeOfDay).toBe("DAY");
    expect(location).toBe("BRIDGE");
  });

  test("splits structurally even when the tail is not a known TimesOfDay entry", async () => {
    const doc = await loadFixture();
    const { location, timeOfDay } = parseSlugline(doc, "INT. VRIHA THRAI BRIDGE - ALERT");
    // "ALERT" need not be in the document's TimesOfDay dictionary — the declared separator is
    // what marks the split point, not dictionary membership. This is what collapses a room that
    // splits three ways under word-based dictionary matching into one consistent location.
    expect(location).toBe("VRIHA THRAI BRIDGE");
    expect(timeOfDay).toBe("ALERT");
  });

  test("no declared separator means the entire remainder is the location", async () => {
    const doc = await loadFixture();
    const { intro, location, timeOfDay } = parseSlugline(doc, "INT. U.S.S. YAMATO BRIDGE");
    expect(intro).toBe("INT");
    expect(location).toBe("U.S.S. YAMATO BRIDGE");
    expect(timeOfDay).toBe("");
  });

  test("a hyphen inside the location without the declared spacing is not treated as a separator", async () => {
    const doc = await loadFixture();
    const { location, timeOfDay } = parseSlugline(doc, "INT. GIMAN-DOL COMMAND SICKBAY");
    expect(location).toBe("GIMAN-DOL COMMAND SICKBAY");
    expect(timeOfDay).toBe("");
  });

  test("splits on the last occurrence of the separator when location itself contains ' - '", async () => {
    const doc = await loadFixture();
    const { location, timeOfDay } = parseSlugline(doc, "INT. STAR TREK - THE BRIDGE - NIGHT");
    expect(location).toBe("STAR TREK - THE BRIDGE");
    expect(timeOfDay).toBe("NIGHT");
  });
});

describe("locateSluglineLocation", () => {
  test("finds the location's character offsets within the full slugline text, trimming the trailing separator", async () => {
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

describe("buildSceneIndex", () => {
  test("includes every Scene Heading with parsed metadata", async () => {
    const doc = await loadFixture();
    const scenes = buildSceneIndex(doc);
    expect(scenes.length).toBe(7);
    const first = scenes.find((s) => s.id === "6e39d99f-6972-42f8-bdc8-3f0dbe546280");
    expect(first).toBeDefined();
    expect(first!.type).toBe("Scene Heading");
    expect(first!.intro).toBe("EXT");
    expect(first!.text).toContain("PREHISTORIC VALLEY");
  });

  test("parses page/length/color from SceneProperties when present", () => {
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Scene Heading" id="sh1">
      <Text>EXT. BRIDGE - DAY</Text>
      <SceneProperties Color="#C0C0C0C0C0C0" Length="4/8" Page="3" Title="1"/>
    </Paragraph>
  </Content>
  <SmartType>
    <TimesOfDay>
      <TimeOfDay>DAY</TimeOfDay>
    </TimesOfDay>
  </SmartType>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const scenes = buildSceneIndex(doc);
    expect(scenes).toHaveLength(1);
    expect(scenes[0]!.page).toBe(3);
    expect(scenes[0]!.length).toBe(0.5);
    expect(scenes[0]!.color).toBe("#C0C0C0C0C0C0");
  });
});

describe("buildScriptStats", () => {
  test("computes totals across the whole document", async () => {
    const doc = await loadFixture();
    const stats = buildScriptStats(doc);
    expect(stats.paragraphCount).toBe(53);
    expect(stats.sceneCount).toBe(6);
    expect(stats.totalPages).toBe(0);
    expect(stats.byType["Scene Heading"]).toBe(6);
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
});

describe("buildPageMap", () => {
  test("covers every paragraph in a single page when no SceneProperties.Page is set", async () => {
    const doc = await loadFixture();
    const pageMap = buildPageMap(doc);
    expect(pageMap.length).toBe(1);
    expect(pageMap[0]!.startIndex).toBe(0);
    const last = pageMap[pageMap.length - 1]!;
    expect(last.endIndex).toBe(doc.getParagraphElements().length - 1);
    expect(last.page).toBe(1);
  });

  test("splits into multiple entries when SceneProperties.Page changes", () => {
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Scene Heading" id="sh1">
      <Text>EXT. BRIDGE - DAY</Text>
      <SceneProperties Page="1"/>
    </Paragraph>
    <Paragraph Type="Action" id="a1"><Text>Beat one.</Text></Paragraph>
    <Paragraph Type="Scene Heading" id="sh2">
      <Text>INT. BRIDGE - DAY</Text>
      <SceneProperties Page="2"/>
    </Paragraph>
    <Paragraph Type="Action" id="a2"><Text>Beat two.</Text></Paragraph>
  </Content>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const pageMap = buildPageMap(doc);
    expect(pageMap).toEqual([
      { page: 1, startIndex: 0, endIndex: 1 },
      { page: 2, startIndex: 2, endIndex: 3 },
    ]);
  });
});

describe("buildCharacterAppearances / rankCharacters", () => {
  test("counts scene mentions and ranks by total descending", async () => {
    const doc = await loadFixture();
    const appearances = buildCharacterAppearances(doc);
    expect(appearances.size).toBeGreaterThan(0);
    const ranked = rankCharacters(appearances);
    expect(ranked.length).toBe(appearances.size);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.total).toBeGreaterThanOrEqual(ranked[i]!.total);
    }
    // Every ranked total should equal the sum of that character's per-scene counts.
    for (const r of ranked) {
      const sum = appearances.get(r.name)!.reduce((s, a) => s + a.count, 0);
      expect(r.total).toBe(sum);
    }
  });
});

describe("buildArcBeatData", () => {
  test("only includes scenes with at least one beat", async () => {
    const doc = await loadFixture();
    // The shared fixture has no SceneProperties/arc-beat data — no edit_* tool writes it, so
    // there's nothing for buildArcBeatData to find on a document built purely through the MCP
    // tools.
    expect(buildArcBeatData(doc)).toEqual([]);
  });

  test("returns one entry per scene with beats, skipping scenes with none", () => {
    const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Scene Heading" id="sh1">
      <Text>EXT. BRIDGE - DAY</Text>
      <SceneProperties>
        <SceneArcBeats>
          <CharacterArcBeat Name="TALPEK">
            <Paragraph Type="General" id="n1"><Text>note one</Text></Paragraph>
          </CharacterArcBeat>
        </SceneArcBeats>
      </SceneProperties>
    </Paragraph>
    <Paragraph Type="Scene Heading" id="sh2">
      <Text>INT. BRIDGE - NIGHT</Text>
      <SceneProperties/>
    </Paragraph>
  </Content>
</FinalDraft>`;
    const doc = FdxDocument.parse(source);
    const arcs = buildArcBeatData(doc);
    expect(arcs).toHaveLength(1);
    expect(arcs[0]!.sceneId).toBe("sh1");
    expect(arcs[0]!.beats).toEqual([{ name: "TALPEK", noteCount: 1 }]);
  });
});

describe("getScenePropertiesById", () => {
  test("returns parsed properties for a known Scene Heading", () => {
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
    const result = getScenePropertiesById(doc, "sh1");
    expect(result).toBeTruthy();
    expect(result!.page).toBe(1);
    expect(result!.lengthEights).toBe(0.5);
    expect(result!.color).toBe("#C0C0C0C0C0C0");
  });

  test("returns null for an unknown id", async () => {
    const doc = await loadFixture();
    expect(getScenePropertiesById(doc, "nope")).toBeNull();
  });

  test("returns undefined for a paragraph with no SceneProperties", async () => {
    const doc = await loadFixture();
    // The Action paragraph right after the first Scene Heading has no SceneProperties.
    const result = getScenePropertiesById(doc, "f2a08a18-1655-41ec-8597-c744149ffcee");
    expect(result).toBeUndefined();
  });
});

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

