// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { handleBatchEdit } from "./batch-edit.ts";
import { handleGetSceneProperties } from "./get-scene-properties.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";
import { getParagraphId, paragraphText } from "../fdx/paragraph.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Grog The Caveman.fdx");
const FIXTURE_SOURCE = readFileSync(FIXTURE_PATH, "utf-8");

function freshDoc(key: string): { path: string; doc: FdxDocument } {
  const path = join(import.meta.dir, `batch-edit-${key}.fdx`);
  const doc = FdxDocument.parse(FIXTURE_SOURCE, path);
  documentCache.set(path, doc);
  return { path, doc };
}

describe("batch_edit", () => {
  test("path and operations are required", async () => {
    expect((await handleBatchEdit({ operations: [] })).isError).toBe(true);
    const { path } = freshDoc("missing-operations");
    expect((await handleBatchEdit({ path })).isError).toBe(true);
    expect((await handleBatchEdit({ path, operations: [] })).isError).toBe(true);
  });

  test("errors when nothing is cached for path", async () => {
    const result = await handleBatchEdit({
      path: "not-cached.fdx",
      operations: [{ tool: "edit_par", args: { action: "create", type: "Action", textRuns: [{ content: "x" }] } }],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("nothing cached for path");
  });

  test("rejects an operation naming a tool outside the allowlist, before touching anything", async () => {
    const { path, doc } = freshDoc("disallowed-tool");
    const before = doc.serialize();

    const result = await handleBatchEdit({
      path,
      operations: [{ tool: "save_fdx", args: {} }],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("save_fdx");
    expect(documentCache.hasSavepoint(path)).toBe(false);
    expect(documentCache.get(path)!.serialize()).toBe(before);
  });

  test("applies multiple operations in order and reports each result", async () => {
    const { path, doc } = freshDoc("multi-op-success");
    const target = doc.getParagraphElements().find((p) => paragraphText(p).includes("boulder"))!;
    const id = getParagraphId(target);

    const result = await handleBatchEdit({
      path,
      operations: [
        { tool: "replace_text", args: { find: "boulder", replace: "rock" } },
        { tool: "edit_par", args: { action: "create", type: "Action", textRuns: [{ content: "A new line." }] } },
      ],
    });
    expect(result.isError).toBeFalsy();
    const body = JSON.parse(result.content[0]!.text);
    expect(body.operationsApplied).toBe(2);
    expect(body.results.length).toBe(2);
    expect(body.results[0].tool).toBe("replace_text");
    expect(body.results[1].tool).toBe("edit_par");

    const updated = documentCache.get(path)!;
    expect(paragraphText(updated.getParagraphElements().find((p) => getParagraphId(p) === id)!)).toContain("rock");
    expect(updated.getParagraphElements().some((p) => paragraphText(p) === "A new line.")).toBe(true);
  });

  test("a path given inside an operation's args is overridden by the batch's path", async () => {
    const { path } = freshDoc("path-override");

    const result = await handleBatchEdit({
      path,
      operations: [{ tool: "replace_text", args: { path: "some/other/path.fdx", find: "boulder", replace: "rock" } }],
    });
    expect(result.isError).toBeFalsy();
    expect(
      paragraphText(documentCache.get(path)!.getParagraphElements().find((p) => paragraphText(p).includes("rock"))!),
    ).toContain("rock");
    expect(documentCache.get("some/other/path.fdx")).toBeUndefined();
  });

  test("a failing operation rolls back every earlier operation in the same batch", async () => {
    const { path, doc } = freshDoc("mid-batch-failure");
    const before = doc.serialize();

    const result = await handleBatchEdit({
      path,
      operations: [
        { tool: "replace_text", args: { find: "boulder", replace: "rock" } },
        { tool: "edit_par", args: { action: "edit", id: "does-not-exist", type: "Action" } },
      ],
    });
    expect(result.isError).toBe(true);
    const body = JSON.parse(result.content[0]!.text);
    expect(body.failedAtIndex).toBe(1);
    expect(body.failedTool).toBe("edit_par");
    expect(body.results.length).toBe(1);

    expect(documentCache.get(path)!.serialize()).toBe(before);
  });

  test("after a successful batch, the pre-batch savepoint is still present and undoes the whole batch", async () => {
    const { path, doc } = freshDoc("post-success-rollback");
    const before = doc.serialize();

    await handleBatchEdit({
      path,
      operations: [{ tool: "replace_text", args: { find: "boulder", replace: "rock" } }],
    });
    expect(documentCache.hasSavepoint(path)).toBe(true);
    expect(documentCache.get(path)!.serialize()).not.toBe(before);

    documentCache.rollback(path);
    expect(documentCache.get(path)!.serialize()).toBe(before);
  });

  test("after a rolled-back batch, calling rollback again is a no-op", async () => {
    const { path, doc } = freshDoc("rollback-idempotent");
    const before = doc.serialize();

    await handleBatchEdit({
      path,
      operations: [
        { tool: "replace_text", args: { find: "boulder", replace: "rock" } },
        { tool: "edit_par", args: { action: "edit", id: "does-not-exist", type: "Action" } },
      ],
    });
    expect(documentCache.get(path)!.serialize()).toBe(before);

    const secondRollback = documentCache.rollback(path);
    expect(secondRollback).toEqual({ ok: true });
    expect(documentCache.get(path)!.serialize()).toBe(before);
  });

  test("runs edit_scene_properties as one step in a batch", async () => {
    const { path } = freshDoc("scene-properties-success");
    const sceneId = "6e39d99f-6972-42f8-bdc8-3f0dbe546280";

    const result = await handleBatchEdit({
      path,
      operations: [{ tool: "edit_scene_properties", args: { id: sceneId, color: "#6363A7A7EFEF" } }],
    });
    expect(result.isError).toBeFalsy();

    const getResult = await handleGetSceneProperties({ path, id: sceneId });
    const props = JSON.parse(getResult.content[getResult.content.length - 1]!.text);
    expect(props.color).toBe("#6363A7A7EFEF");
  });

  test("rolls back edit_scene_properties when a later operation in the batch fails", async () => {
    const { path, doc } = freshDoc("scene-properties-rollback");
    const sceneId = "6e39d99f-6972-42f8-bdc8-3f0dbe546280";
    const before = doc.serialize();

    const result = await handleBatchEdit({
      path,
      operations: [
        { tool: "edit_scene_properties", args: { id: sceneId, color: "#6363A7A7EFEF" } },
        { tool: "edit_par", args: { action: "edit", id: "does-not-exist", type: "Action" } },
      ],
    });
    expect(result.isError).toBe(true);
    expect(documentCache.get(path)!.serialize()).toBe(before);
  });
});
