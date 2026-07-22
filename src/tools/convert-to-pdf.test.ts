// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test, afterEach } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { handleReadFdx } from "./read-fdx.ts";
import { handleConvertToPdf } from "./convert-to-pdf.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");

let tmpDirs: string[] = [];
async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "fdx-convert-to-pdf-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tmpDirs.map((d) => rm(d, { recursive: true, force: true })));
  tmpDirs = [];
});

describe("convert_to_pdf", () => {
  test("path is required", async () => {
    expect((await handleConvertToPdf({ targetPath: "out.pdf" })).isError).toBe(true);
  });

  test("targetPath is required", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    expect((await handleConvertToPdf({ path: FIXTURE_PATH })).isError).toBe(true);
  });

  test("reports a read error for a nonexistent file", async () => {
    const dir = await makeTmpDir();
    const result = await handleConvertToPdf({ path: join(dir, "missing.fdx"), targetPath: join(dir, "out.pdf") });
    expect(result.isError).toBe(true);
  });

  test("writes a PDF document to targetPath, not inline", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const dir = await makeTmpDir();
    const targetPath = join(dir, "screenplay.pdf");
    const result = await handleConvertToPdf({ path: FIXTURE_PATH, targetPath });

    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain(targetPath);

    const bytes = await Bun.file(targetPath).bytes();
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    expect(header).toBe("%PDF-");
  });
});
