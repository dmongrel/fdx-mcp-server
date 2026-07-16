import { describe, expect, test } from "bun:test";
import { handleGetContext } from "./get-context.ts";
import { contextTools } from "./context-data.ts";

describe("get_context", () => {
  const result = handleGetContext();
  const text = result.content.map((c) => c.text).join("");

  test("contains the formatting rules header", () => {
    expect(text).toContain("=== Formatting Rules & Constraints ===");
  });

  test("has at least 5 rule sections", () => {
    const ruleCount = (text.match(/## /g) ?? []).length;
    expect(ruleCount).toBeGreaterThanOrEqual(5);
  });

  test("contains the available tools header", () => {
    expect(text).toContain("=== Available Tools ===");
  });

  test("lists every registered tool exactly once", () => {
    const toolLines = (text.match(/- `/g) ?? []).length;
    expect(toolLines).toBe(contextTools.length);
  });

  test("includes key tools", () => {
    for (const name of ["get_context", "read_fdx", "save_fdx", "edit_par", "get_characters"]) {
      expect(text).toContain(`\`${name}\``);
    }
  });

  test("every tool entry has a non-empty description", () => {
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("- `") && line.includes("`: ")) {
        const [, desc] = line.split("`: ");
        expect(desc?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });
});
