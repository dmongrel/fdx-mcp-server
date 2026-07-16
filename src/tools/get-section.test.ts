import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleGetSection } from "./get-section.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");
const SCENE_HEADING_ID = "3c4f7ca7-60ba-4af1-bf97-19c7c36151c5";

function allText(result: { content: Array<{ text: string }> }): string {
  return result.content.map((c) => c.text).join("\n");
}

describe("get_section", () => {
  test("path is required", async () => {
    expect((await handleGetSection(undefined)).isError).toBe(true);
  });

  test("errors on an unknown section id", async () => {
    const result = await handleGetSection({ path: FIXTURE_PATH, id: "does-not-exist" });
    expect(result.isError).toBe(true);
    expect(allText(result)).toContain("section id not found");
  });

  test("returns the heading plus paragraphs up to the next section heading", async () => {
    const result = await handleGetSection({ path: FIXTURE_PATH, id: SCENE_HEADING_ID });
    expect(result.isError).toBeFalsy();
    const text = allText(result);
    expect(text).toContain("[Scene Heading]");
    expect(text).toContain("EXT. SPACE, ON PLANET GIMAN-DOL IV");
    // Must not include a second Scene Heading block (that would mean it overran the boundary).
    const headingCount = (text.match(/\[Scene Heading\]/g) ?? []).length;
    expect(headingCount).toBe(1);
  });

  test("omitting id starts from the very first paragraph", async () => {
    const result = await handleGetSection({ path: FIXTURE_PATH });
    expect(result.isError).toBeFalsy();
    // The document opens with an Act&Scene Break section.
    expect(allText(result)).toContain("[Act&Scene Break]");
  });
});
