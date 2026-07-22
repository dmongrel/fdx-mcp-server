// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

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

  test("matches a trailing TimeOfDay entry exactly", async () => {
    const doc = await loadFixture();
    const { intro, location, timeOfDay } = parseSlugline(doc, "INT. BRIDGE - DAY");
    expect(intro).toBe("INT");
    expect(timeOfDay).toBe("DAY");
    expect(location).toBe("BRIDGE -");
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

