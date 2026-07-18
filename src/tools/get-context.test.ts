import { describe, expect, test, afterEach } from "bun:test";
import { handleGetContext, getContextTool, setUpdateNotice } from "./get-context.ts";
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

  test("tool description does not contain update notice by default", () => {
    expect(getContextTool.description).not.toContain("[SYSTEM NOTICE:");
  });
});

describe("get_context with update notice", () => {
  afterEach(() => {
    // Reset the tool description so other tests see a clean state.
    setUpdateNotice("");
  });

  test("setUpdateNotice patches the tool description header", () => {
    setUpdateNotice("1.0.0");
    expect(getContextTool.description).toContain("[SYSTEM NOTICE:");
    expect(getContextTool.description).toContain("(latest 1.0.0)");
    expect(getContextTool.description).toContain(
      "npm update -g fdx-mcp-server",
    );
  });

  test("setUpdateNotice prepends notice to handler output", () => {
    setUpdateNotice("2.3.4");
    const result = handleGetContext();
    const text = result.content.map((c) => c.text).join("");
    expect(text).toContain("[SYSTEM NOTICE:");
    expect(text).toContain("(latest 2.3.4)");
    // The notice should appear before the formatting rules section
    const noticeIdx = text.indexOf("[SYSTEM NOTICE:");
    const rulesIdx = text.indexOf("=== Formatting Rules & Constraints ===");
    expect(noticeIdx).toBeGreaterThanOrEqual(0);
    expect(rulesIdx).toBeGreaterThan(noticeIdx);
  });

  test("empty version resets to base description", () => {
    setUpdateNotice("");
    expect(getContextTool.description).not.toContain("[SYSTEM NOTICE:");
    const result = handleGetContext();
    const text = result.content.map((c) => c.text).join("");
    expect(text).not.toContain("[SYSTEM NOTICE:");
  });
});
