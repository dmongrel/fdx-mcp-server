// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test, beforeAll, afterEach } from "bun:test";
import { handleGetContext, getContextTool, setUpdateNotice } from "./get-context.ts";
import { contextTools } from "./context-data.ts";

const noUpdate = () => Promise.resolve(null);

describe("get_context", () => {
  let text = "";

  beforeAll(async () => {
    const result = await handleGetContext(noUpdate);
    text = result.content.map((c) => c.text).join("");
  });

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
    for (const name of ["get_context", "read_fdx", "save_fdx", "edit_par", "get_smarttype_characters"]) {
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

  test("base description notes that calling it checks for updates", () => {
    expect(getContextTool.description).toContain("checks for");
  });
});

describe("get_context with update notice", () => {
  afterEach(() => {
    // Reset the tool description so other tests see a clean state.
    setUpdateNotice("");
  });

  test("a newer version from the check sets the notice", async () => {
    const result = await handleGetContext(() => Promise.resolve({ available: true, latest: "2.3.4" }));
    const text = result.content.map((c) => c.text).join("");
    expect(getContextTool.description).toContain("[SYSTEM NOTICE:");
    expect(text).toContain("[SYSTEM NOTICE:");
    expect(text).toContain("(latest 2.3.4)");
    expect(text).toContain("npm update -g fdx-mcp-server");
    // The notice should appear before the formatting rules section
    const noticeIdx = text.indexOf("[SYSTEM NOTICE:");
    const rulesIdx = text.indexOf("=== Formatting Rules & Constraints ===");
    expect(noticeIdx).toBeGreaterThanOrEqual(0);
    expect(rulesIdx).toBeGreaterThan(noticeIdx);
  });

  test("an up-to-date check clears a previously set notice", async () => {
    setUpdateNotice("9.9.9");
    const result = await handleGetContext(() => Promise.resolve({ available: false }));
    const text = result.content.map((c) => c.text).join("");
    expect(getContextTool.description).not.toContain("[SYSTEM NOTICE:");
    expect(text).not.toContain("[SYSTEM NOTICE:");
  });

  test("a failed check (null) leaves an existing notice untouched — fail open", async () => {
    setUpdateNotice("5.5.5");
    const result = await handleGetContext(noUpdate);
    const text = result.content.map((c) => c.text).join("");
    expect(text).toContain("[SYSTEM NOTICE:");
    expect(text).toContain("(latest 5.5.5)");
  });
});
