import { describe, expect, test } from "bun:test";
import { handleSearchActions } from "./search-actions.ts";
import { contextTools } from "./context-data.ts";

describe("search_actions", () => {
  test("returns a comma-separated list of every tool name", () => {
    const result = handleSearchActions();
    const text = result.content.map((c) => c.text).join("");

    expect(text).toStartWith("Available tools: ");
    for (const tool of contextTools) {
      expect(text).toContain(tool.name);
    }
  });

  test("returns the same output regardless of the query argument", () => {
    const result = handleSearchActions();
    expect(result.content[0]?.text).toContain("search_actions");
  });
});
