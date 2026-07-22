// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test, afterEach } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { handleReadFdx } from "./read-fdx.ts";
import { handleGetFdxBreakdown } from "./get-fdx-breakdown.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

let tmpDirs: string[] = [];
async function makeTmpDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "fdx-breakdown-"));
  tmpDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tmpDirs.map((d) => rm(d, { recursive: true, force: true })));
  tmpDirs = [];
});

describe("get_fdx_breakdown", () => {
  test("path is required", async () => {
    expect((await handleGetFdxBreakdown({ targetPath: "out.txt" })).isError).toBe(true);
  });

  test("targetPath is required", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    expect((await handleGetFdxBreakdown({ path: FIXTURE_PATH })).isError).toBe(true);
  });

  test("rejects an invalid asType", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const dir = await makeTmpDir();
    const result = await handleGetFdxBreakdown({
      path: FIXTURE_PATH,
      targetPath: join(dir, "out.xml"),
      asType: "xml",
    });
    expect(result.isError).toBe(true);
  });

  test("asType='text' (default) writes the expected sections to targetPath, not inline", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const dir = await makeTmpDir();
    const targetPath = join(dir, "breakdown.txt");
    const result = await handleGetFdxBreakdown({ path: FIXTURE_PATH, targetPath });

    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toContain(targetPath);
    expect(result.content[0]!.text).not.toContain("SCRIPT BREAKDOWN");

    const text = await Bun.file(targetPath).text();
    expect(text).toContain("SCRIPT BREAKDOWN");
    expect(text).toContain("DOCUMENT OVERVIEW");
    expect(text).toContain("Total Pages:        95");
    expect(text).toContain("Total Paragraphs:   1755");
    expect(text).toContain("Scenes:             89");
    expect(text).toContain("PARAGRAPH BREAKDOWN");
    expect(text).toContain("SCENE CATALOG");
    expect(text).toContain("CHARACTER FREQUENCY");
    expect(text).toContain("SCENE-LENGTH ANALYSIS");
    expect(text).toContain("PRODUCTION FLAGS");
  });

  test("asType='text' is the explicit-default equivalent", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const dir = await makeTmpDir();
    const implicitPath = join(dir, "implicit.txt");
    const explicitPath = join(dir, "explicit.txt");
    await handleGetFdxBreakdown({ path: FIXTURE_PATH, targetPath: implicitPath });
    await handleGetFdxBreakdown({ path: FIXTURE_PATH, targetPath: explicitPath, asType: "text" });

    const implicit = await Bun.file(implicitPath).text();
    const explicit = await Bun.file(explicitPath).text();
    expect(implicit).toBe(explicit);
  });

  test("asType='html' writes a standalone styled page to targetPath", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const dir = await makeTmpDir();
    const targetPath = join(dir, "breakdown.html");
    const result = await handleGetFdxBreakdown({ path: FIXTURE_PATH, targetPath, asType: "html" });
    expect(result.isError).toBeFalsy();

    const html = await Bun.file(targetPath).text();
    expect(html).toStartWith("<!doctype html>");
    expect(html).toContain("<title>Script Breakdown");
    expect(html).toContain("Document Overview");
    expect(html).toContain("<table>");
    expect(html).toContain("</html>");
  });

  test("asType='pdf' writes a PDF document to targetPath", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const dir = await makeTmpDir();
    const targetPath = join(dir, "breakdown.pdf");
    const result = await handleGetFdxBreakdown({ path: FIXTURE_PATH, targetPath, asType: "pdf" });
    expect(result.isError).toBeFalsy();

    const bytes = await Bun.file(targetPath).bytes();
    const header = new TextDecoder().decode(bytes.slice(0, 5));
    expect(header).toBe("%PDF-");
  });

  test("asType is case-insensitive and trims whitespace", async () => {
    await handleReadFdx({ path: FIXTURE_PATH });
    const dir = await makeTmpDir();
    const targetPath = join(dir, "breakdown.html");
    const result = await handleGetFdxBreakdown({ path: FIXTURE_PATH, targetPath, asType: "  HTML  " });
    expect(result.isError).toBeFalsy();

    const html = await Bun.file(targetPath).text();
    expect(html).toStartWith("<!doctype html>");
  });
});

