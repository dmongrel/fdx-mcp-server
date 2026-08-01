// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetSmarttypeTransitions } from "./get-smarttype-transitions.ts";
import { handleEditSmarttypeTransitions } from "./edit-smarttype-transitions.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

function freshCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-edit-transitions-"));
  const path = join(dir, "script.fdx");
  copyFileSync(FIXTURE_PATH, path);
  return path;
}

describe("edit_smarttype_transitions", () => {
  test("create appends a new transition", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditSmarttypeTransitions({ path, action: "create", value: "SMASH CUT TO:" });
    expect(result.isError).toBeFalsy();
    const after = await handleGetSmarttypeTransitions({ path });
    expect(after.content[0]!.text).toContain("SMASH CUT TO:");
  });

  test("unknown action is rejected", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditSmarttypeTransitions({ path, action: "bogus" });
    expect(result.isError).toBe(true);
  });
});

