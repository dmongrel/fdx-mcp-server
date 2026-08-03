// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { tools } from "./registry.ts";
import { contextTools, getContextText, searchActionsText } from "./context-data.ts";

describe("tool roster parity", () => {
  test("get_context/search_actions roster matches the registered tool count exactly", () => {
    expect(contextTools.length).toBe(tools.length);
  });

  test("every registered tool name appears in the get_context roster and search_actions list", () => {
    for (const t of tools) {
      expect(getContextText).toContain(`\`${t.name}\``);
      expect(searchActionsText).toContain(t.name);
    }
  });

  test("get_context roster descriptions match the tool's own live description", () => {
    for (const t of tools) {
      const entry = contextTools.find((c) => c.name === t.name);
      expect(entry?.description).toBe(t.description);
    }
  });
});
