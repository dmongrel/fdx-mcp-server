// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetSceneProperties } from "./get-scene-properties.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

// The shared fixture has no SceneProperties data (no edit_* tool writes it), so the positive
// case needs a handcrafted document that actually has some.
function fixtureWithSceneProperties(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-get-scene-properties-"));
  const path = join(dir, "script.fdx");
  const source = `<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Scene Heading" id="sh1">
      <Text>EXT. BRIDGE - DAY</Text>
      <SceneProperties Color="#C0C0C0C0C0C0" Length="4/8" Page="1"/>
    </Paragraph>
  </Content>
</FinalDraft>`;
  writeFileSync(path, source, "utf-8");
  return path;
}

describe("get_scene_properties", () => {
  test("path is required", async () => {
    expect((await handleGetSceneProperties({ id: "x" })).isError).toBe(true);
  });

  test("id is required", async () => {
    expect((await handleGetSceneProperties({ path: FIXTURE_PATH })).isError).toBe(true);
  });

  test("returns parsed SceneProperties for a known id", async () => {
    const path = fixtureWithSceneProperties();
    await handleReadFdx({ path });
    const result = await handleGetSceneProperties({ path, id: "sh1" });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.page).toBe(1);
    expect(parsed.lengthEights).toBe(0.5);
    expect(parsed.color).toBe("#C0C0C0C0C0C0");
  });

  test("errors for an unknown paragraph id", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetSceneProperties({ path: FIXTURE_PATH, id: "nope" });
    expect(result.isError).toBe(true);
  });

  test("errors for a paragraph with no SceneProperties", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetSceneProperties({
      path: FIXTURE_PATH,
      id: "f2a08a18-1655-41ec-8597-c744149ffcee",
    });
    expect(result.isError).toBe(true);
  });
});

