// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleGetParRuns } from "./get-par-runs.ts";
import { handleEditPar } from "./edit-par.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";
import { getParagraphId } from "../fdx/paragraph.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");
const FIXTURE_SOURCE = readFileSync(FIXTURE_PATH, "utf-8");

function freshDoc(key: string): { path: string; doc: FdxDocument } {
  const path = join(import.meta.dir, `get-par-runs-${key}.fdx`);
  const doc = FdxDocument.parse(FIXTURE_SOURCE, path);
  documentCache.set(path, doc);
  return { path, doc };
}

describe("get_par_runs", () => {
  test("path is required", async () => {
    const result = await handleGetParRuns({ id: "x" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("path is required");
  });

  test("id is required", async () => {
    const { path } = freshDoc("no-id");
    const result = await handleGetParRuns({ path });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("id is required");
  });

  test("unknown id fails", async () => {
    const { path } = freshDoc("unknown-id");
    const result = await handleGetParRuns({ path, id: "does-not-exist" });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("paragraph id not found");
  });

  test("returns a single unstyled run for a plain paragraph", async () => {
    const { path, doc } = freshDoc("plain-run");
    const target = doc.getParagraphElements().find((p) => getParagraphId(p) === "f2a08a18-1655-41ec-8597-c744149ffcee")!;
    const id = getParagraphId(target);

    const result = await handleGetParRuns({ path, id });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0]!.text);
    expect(body.id).toBe(id);
    expect(body.runs.length).toBe(1);
    expect(body.runs[0].content).toBe(
      "Grog the caveman crouches behind a boulder, eyeing a wooly mammoth grazing in the tall grass.",
    );
    expect(body.runs[0].attrs).toEqual({});
  });

  test("round-trips arbitrary run attrs written by edit_par", async () => {
    const { path } = freshDoc("attrs-roundtrip");

    const createResult = await handleEditPar({
      path,
      action: "create",
      type: "Action",
      textRuns: [
        { content: "The " },
        { content: "Praetorate", attrs: { AdornmentStyle: "-1", Font: "Courier Final Draft" } },
        { content: " has ordered our mission to continue." },
      ],
    });
    expect(createResult.isError).toBeFalsy();

    const doc = documentCache.get(path)!;
    const created = doc.getParagraphElements().at(-1)!;
    const id = getParagraphId(created);

    const result = await handleGetParRuns({ path, id });
    const body = JSON.parse(result.content[0]!.text);
    expect(body.runs.length).toBe(3);
    expect(body.runs[1].content).toBe("Praetorate");
    expect(body.runs[1].attrs).toEqual({ AdornmentStyle: "-1", Font: "Courier Final Draft" });
    expect(body.runs[0].attrs).toEqual({});
  });
});
