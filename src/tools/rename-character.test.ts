// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleRenameCharacter } from "./rename-character.ts";
import { documentCache } from "../fdx/cache.ts";

/** Builds a minimal .fdx with only the blocks a given test needs. */
function fixture(opts: {
  content?: string;
  characters?: string[];
  cast?: Array<{ character: string; actor: string }>;
  characterHighlighting?: Array<{ name: string; color: string; visible: string }>;
}): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-rename-character-"));
  const path = join(dir, "script.fdx");
  const charactersXml = opts.characters?.length
    ? `<Characters>${opts.characters.map((c) => `<Character>${c}</Character>`).join("")}</Characters>`
    : "";
  const castXml = opts.cast?.length
    ? `<Cast>${opts.cast.map((m) => `<Member Actor="${m.actor}" Character="${m.character}"/>`).join("")}</Cast>`
    : "";
  const highlightingXml = opts.characterHighlighting?.length
    ? `<CharacterHighlighting>${opts.characterHighlighting
        .map((h) => `<Character Name="${h.name}" Color="${h.color}" Visible="${h.visible}"/>`)
        .join("")}</CharacterHighlighting>`
    : "";
  const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>${opts.content ?? ""}</Content>
  <SmartType>${charactersXml}</SmartType>
  ${castXml}
  ${highlightingXml}
</FinalDraft>`;
  writeFileSync(path, source, "utf-8");
  return path;
}

async function rename(path: string, from: string, to: string, cs?: boolean) {
  await handleReadFdx({ path });
  return handleRenameCharacter({ path, from, to, cs });
}

function body(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[result.content.length - 1]!.text);
}

const CUE_CONTENT = `
  <Paragraph Type="Character" id="c1"><Text>OLD NAME</Text></Paragraph>
  <Paragraph Type="Dialogue" id="d1"><Text>Hello there.</Text></Paragraph>
  <Paragraph Type="Character" id="c2"><Text>OLD NAME (V.O.)</Text></Paragraph>
  <Paragraph Type="Dialogue" id="d2"><Text>Voice over line.</Text></Paragraph>
`;

describe("rename_character", () => {
  test("path/from/to are required", async () => {
    expect((await handleRenameCharacter({ from: "A", to: "B" })).isError).toBe(true);
    const path = fixture({});
    await handleReadFdx({ path });
    expect((await handleRenameCharacter({ path, to: "B" })).isError).toBe(true);
    expect((await handleRenameCharacter({ path, from: "A" })).isError).toBe(true);
  });

  test("from and to must differ", async () => {
    const path = fixture({ content: CUE_CONTENT });
    const result = await rename(path, "OLD NAME", "OLD NAME");
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("must be different");
  });

  test("errors when from is not found anywhere", async () => {
    const path = fixture({ content: CUE_CONTENT });
    const result = await rename(path, "ZZZ_NOT_A_CHARACTER", "SOMEONE ELSE");
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found anywhere");
  });

  test("renames Character-cue paragraphs, preserving extensions, and reports the other locations as not found", async () => {
    const path = fixture({ content: CUE_CONTENT });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    const b = body(result);
    expect(b.cueParagraphs).toEqual({ paragraphsTouched: 2, occurrencesReplaced: 2, skipped: [] });
    expect(b.smartTypeCharacters).toBe("not found");
    expect(b.castMember).toBe("not found");
    expect(b.characterHighlighting).toBe("not found");

    const doc = documentCache.get(path)!;
    expect(doc.serialize()).toContain("NEW NAME");
    expect(doc.serialize()).toContain("NEW NAME (V.O.)");
    expect(doc.serialize()).not.toContain("OLD NAME");
  });

  test("renames the SmartType Characters entry when to is not already present", async () => {
    const path = fixture({ characters: ["OLD NAME"] });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    expect(body(result).smartTypeCharacters).toBe("renamed");
    const doc = documentCache.get(path)!;
    expect(doc.getSmartTypeList("Character")!.values).toEqual(["NEW NAME"]);
  });

  test("merges SmartType Characters entries when to already exists", async () => {
    const path = fixture({ characters: ["OLD NAME", "NEW NAME"] });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    expect(body(result).smartTypeCharacters).toContain("removed");
    const doc = documentCache.get(path)!;
    expect(doc.getSmartTypeList("Character")!.values).toEqual(["NEW NAME"]);
  });

  test("renames the Cast Member row when to has no row", async () => {
    const path = fixture({ cast: [{ character: "OLD NAME", actor: "Voice A" }] });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    expect(body(result).castMember).toBe("renamed");
    const doc = documentCache.get(path)!;
    const members = doc.getCastMembers();
    expect(members.length).toBe(1);
    expect(members[0]!.attrs.find(([k]) => k === "Character")?.[1]).toBe("NEW NAME");
    expect(members[0]!.attrs.find(([k]) => k === "Actor")?.[1]).toBe("Voice A");
  });

  test("merges Cast rows when to already has one: drops from's row, keeps to's actor, warns", async () => {
    const path = fixture({
      cast: [
        { character: "OLD NAME", actor: "Voice A" },
        { character: "NEW NAME", actor: "Voice B" },
      ],
    });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    const b = body(result);
    expect(b.castMember).toContain("removed");
    expect((b.warnings as string[]).some((w) => w.includes("Voice A") && w.includes("Voice B"))).toBe(true);

    const doc = documentCache.get(path)!;
    const members = doc.getCastMembers();
    expect(members.length).toBe(1);
    expect(members[0]!.attrs.find(([k]) => k === "Actor")?.[1]).toBe("Voice B");
  });

  test("renames CharacterArcBeat entries across scenes", async () => {
    const path = fixture({
      content: `
        <Paragraph Type="Scene Heading" id="sh1"><Text>INT. A</Text>
          <SceneProperties><SceneArcBeats><CharacterArcBeat Name="OLD NAME"/></SceneArcBeats></SceneProperties>
        </Paragraph>
        <Paragraph Type="Scene Heading" id="sh2"><Text>INT. B</Text>
          <SceneProperties><SceneArcBeats><CharacterArcBeat Name="OLD NAME"/></SceneArcBeats></SceneProperties>
        </Paragraph>
      `,
    });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    expect(body(result).arcBeats).toEqual({ renamed: 2, conflictingScenes: [] });
  });

  test("leaves a scene's arc beat untouched when both from and to already have one there", async () => {
    const path = fixture({
      content: `
        <Paragraph Type="Scene Heading" id="sh1"><Text>INT. A</Text>
          <SceneProperties><SceneArcBeats>
            <CharacterArcBeat Name="OLD NAME"/>
            <CharacterArcBeat Name="NEW NAME"/>
          </SceneArcBeats></SceneProperties>
        </Paragraph>
        <Paragraph Type="Scene Heading" id="sh2"><Text>INT. B</Text>
          <SceneProperties><SceneArcBeats><CharacterArcBeat Name="OLD NAME"/></SceneArcBeats></SceneProperties>
        </Paragraph>
      `,
    });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    const b = body(result);
    expect(b.arcBeats).toEqual({ renamed: 1, conflictingScenes: ["sh1"] });
    expect((b.warnings as string[]).some((w) => w.includes("sh1"))).toBe(true);

    const doc = documentCache.get(path)!;
    const sh1 = doc.getParagraphElements().find((p) => p.attrs.find(([k]) => k === "id")?.[1] === "sh1")!;
    const names = sh1.children
      .find((c) => c.type === "element" && c.name === "SceneProperties")!
      .children.find((c) => c.type === "element" && c.name === "SceneArcBeats")!
      .children.filter((c) => c.type === "element" && c.name === "CharacterArcBeat")
      .map((c) => c.attrs.find(([k]) => k === "Name")?.[1]);
    expect(names.sort()).toEqual(["NEW NAME", "OLD NAME"]);
  });

  test("renames the CharacterHighlighting entry when to has none", async () => {
    const path = fixture({ characterHighlighting: [{ name: "OLD NAME", color: "#0000FFFF0000", visible: "Yes" }] });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    expect(body(result).characterHighlighting).toBe("renamed");
    const doc = documentCache.get(path)!;
    const rows = doc.getHighlightedCharacters();
    expect(rows.length).toBe(1);
    expect(rows[0]!.attrs.find(([k]) => k === "Name")?.[1]).toBe("NEW NAME");
    expect(rows[0]!.attrs.find(([k]) => k === "Color")?.[1]).toBe("#0000FFFF0000");
  });

  test("highlighting merge: keeps from's visible entry over to's sentinel, renamed to to", async () => {
    const path = fixture({
      characterHighlighting: [
        { name: "OLD NAME", color: "#0000FFFF0000", visible: "Yes" },
        { name: "NEW NAME", color: "#RRRRGGGGBBBB", visible: "No" },
      ],
    });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    expect(body(result).characterHighlighting).toContain("visible assignment");
    const doc = documentCache.get(path)!;
    const rows = doc.getHighlightedCharacters();
    expect(rows.length).toBe(1);
    expect(rows[0]!.attrs.find(([k]) => k === "Name")?.[1]).toBe("NEW NAME");
    expect(rows[0]!.attrs.find(([k]) => k === "Color")?.[1]).toBe("#0000FFFF0000");
  });

  test("highlighting merge: keeps to's entry when it's the visible one", async () => {
    const path = fixture({
      characterHighlighting: [
        { name: "OLD NAME", color: "#RRRRGGGGBBBB", visible: "No" },
        { name: "NEW NAME", color: "#0000FFFF0000", visible: "Yes" },
      ],
    });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    expect(body(result).characterHighlighting).toContain("removed");
    const doc = documentCache.get(path)!;
    const rows = doc.getHighlightedCharacters();
    expect(rows.length).toBe(1);
    expect(rows[0]!.attrs.find(([k]) => k === "Color")?.[1]).toBe("#0000FFFF0000");
  });

  test("highlighting merge: keeps to's entry when neither is visible", async () => {
    const path = fixture({
      characterHighlighting: [
        { name: "OLD NAME", color: "#RRRRGGGGBBBB", visible: "No" },
        { name: "NEW NAME", color: "#RRRRGGGGBBBB", visible: "No" },
      ],
    });
    const result = await rename(path, "OLD NAME", "NEW NAME");
    expect(result.isError).toBeFalsy();
    const doc = documentCache.get(path)!;
    expect(doc.getHighlightedCharacters().length).toBe(1);
  });

  test("cs=true prevents a case-insensitive match", async () => {
    const path = fixture({ content: CUE_CONTENT });
    const result = await rename(path, "old name", "NEW NAME", true);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found anywhere");
  });
});
