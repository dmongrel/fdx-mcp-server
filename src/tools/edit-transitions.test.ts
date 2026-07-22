// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetTransitions } from "./get-transitions.ts";
import { handleEditTransitions } from "./edit-transitions.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

function freshCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-edit-transitions-"));
  const path = join(dir, "script.fdx");
  copyFileSync(FIXTURE_PATH, path);
  return path;
}

describe("edit_transitions", () => {
  test("create appends a new transition", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditTransitions({ path, action: "create", value: "SMASH CUT TO:" });
    expect(result.isError).toBeFalsy();
    const after = await handleGetTransitions({ path });
    expect(after.content[0]!.text).toContain("SMASH CUT TO:");
  });

  test("unknown action is rejected", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditTransitions({ path, action: "bogus" });
    expect(result.isError).toBe(true);
  });
});

