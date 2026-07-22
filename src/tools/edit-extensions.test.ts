// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { mkdtempSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetExtensions } from "./get-extensions.ts";
import { handleEditExtensions } from "./edit-extensions.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

function freshCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "fdx-edit-extensions-"));
  const path = join(dir, "script.fdx");
  copyFileSync(FIXTURE_PATH, path);
  return path;
}

describe("edit_extensions", () => {
  test("create appends a new extension", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditExtensions({ path, action: "create", value: "(V.O.)" });
    expect(result.isError).toBeFalsy();
    const after = await handleGetExtensions({ path });
    expect(after.content[0]!.text).toContain("(V.O.)");
  });

  test("edit replaces a matching entry case-insensitively", async () => {
    const path = freshCopy();
    await handleReadFdx({ path });
    const result = await handleEditExtensions({ path, action: "edit", find: "(o.c.)", replace: "(OFFSCREEN)" });
    expect(result.isError).toBeFalsy();
    const after = await handleGetExtensions({ path });
    expect(after.content[0]!.text).toContain("(OFFSCREEN)");
    expect(after.content[0]!.text).not.toContain("(O.C.)");
  });
});

