import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetTransitions } from "./get-transitions.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

describe("get_transitions", () => {
  test("path is required", async () => {
    expect((await handleGetTransitions({})).isError).toBe(true);
  });

  test("returns the Transitions SmartType list", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const result = await handleGetTransitions({ path: FIXTURE_PATH });
    expect(result.content[0]!.text).toContain("CUT TO:");
    expect(result.content[0]!.text).toContain("FADE OUT.");
  });
});
