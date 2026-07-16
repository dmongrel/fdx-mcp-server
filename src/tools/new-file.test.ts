import { describe, expect, test } from "bun:test";
import { mkdtempSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleNewFile, newFileBytes, resolveNewFilePath, createNewFile } from "./new-file.ts";

describe("new_file", () => {
  test("newFileBytes preserves the template FinalDraft format version", async () => {
    const s = await newFileBytes();
    expect(s.startsWith("<?xml")).toBe(true);
    expect(s).toContain('Version="6"');
    expect(s).not.toContain('Version="7"');
    expect(s).toContain("<Watermarking");
    expect(s).toContain("<DocumentRef");
  });

  test("newFileBytes mints fresh unique ids on every call, preserving one shared pair", async () => {
    const idRe = /\bid="([^"]*)"/g;
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const templateIds = new Set([
      "2b27c4dc-f764-43f9-b61d-b2ee7824bc9d",
      "c631ce01-2ad6-4ed3-b0bf-599c64db961a",
      "31eebf07-025b-4252-816e-1747d15525b1",
      "e4cc0e17-e966-404f-bacd-ec32b98f478a",
    ]);

    const a = await newFileBytes();
    const aIds = [...a.matchAll(idRe)].map((m) => m[1]!);
    expect(aIds.length).toBeGreaterThan(0);

    const counts = new Map<string, number>();
    for (const id of aIds) {
      expect(templateIds.has(id)).toBe(false);
      expect(uuidRe.test(id)).toBe(true);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const dupes = [...counts.values()].filter((n) => n === 2).length;
    expect(dupes).toBe(1);

    const b = await newFileBytes();
    const bIds = new Set([...b.matchAll(idRe)].map((m) => m[1]!));
    for (const id of aIds) expect(bIds.has(id)).toBe(false);
  });

  test("resolveNewFilePath finds the next free _v# slot", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fdx-newfile-test-"));
    const base = join(dir, "foo.fdx");
    expect(await resolveNewFilePath(base, true)).toBe(join(dir, "foo_v1.fdx"));
    writeFileSync(join(dir, "foo_v1.fdx"), "x");
    expect(await resolveNewFilePath(base, true)).toBe(join(dir, "foo_v2.fdx"));
    writeFileSync(join(dir, "foo_v2.fdx"), "x");
    expect(await resolveNewFilePath(base, true)).toBe(join(dir, "foo_v3.fdx"));
  });

  test("resolveNewFilePath returns the exact path when unversioned", async () => {
    const p = join(mkdtempSync(join(tmpdir(), "fdx-newfile-test-")), "bar.fdx");
    expect(await resolveNewFilePath(p, false)).toBe(p);
  });

  test("createNewFile writes a file at the resolved path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fdx-newfile-test-"));
    const target = await createNewFile(join(dir, "script.fdx"), true);
    expect(target).toBe(join(dir, "script_v1.fdx"));
    expect(existsSync(target)).toBe(true);
  });

  test("handleNewFile rejects non-.fdx paths", async () => {
    const result = await handleNewFile({ path: "foo.txt" });
    expect(result.isError).toBe(true);
  });

  test("handleNewFile creates a versioned file by default", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fdx-newfile-test-"));
    const result = await handleNewFile({ path: join(dir, "script.fdx") });
    expect(result.content[0]!.text).toContain(join(dir, "script_v1.fdx"));
  });
});
