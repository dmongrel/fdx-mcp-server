// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleFindDuplicateIds } from "./find-duplicate-ids.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";

const SOURCE_WITH_DUPES = `<?xml version="1.0"?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Action" id="dup"><Text>first</Text></Paragraph>
    <Paragraph Type="Action" id="unique"><Text>middle</Text></Paragraph>
    <Paragraph Type="Dialogue" id="dup"><Text>second</Text></Paragraph>
  </Content>
</FinalDraft>`;

const SOURCE_CLEAN = `<?xml version="1.0"?>
<FinalDraft Version="6">
  <Content>
    <Paragraph Type="Action" id="a"><Text>one</Text></Paragraph>
    <Paragraph Type="Action" id="b"><Text>two</Text></Paragraph>
  </Content>
</FinalDraft>`;

function freshDoc(key: string, source: string): string {
  const path = join(import.meta.dir, `find-duplicate-ids-${key}.fdx`);
  documentCache.set(path, FdxDocument.parse(source, path));
  return path;
}

describe("find_duplicate_ids", () => {
  test("path is required", async () => {
    expect((await handleFindDuplicateIds(undefined)).isError).toBe(true);
  });

  test("reports duplicate groups as JSON", async () => {
    const path = freshDoc("dupes", SOURCE_WITH_DUPES);
    const result = await handleFindDuplicateIds({ path });
    expect(result.isError).toBeFalsy();
    const groups = JSON.parse(result.content[0]!.text);
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe("dup");
    expect(groups[0].count).toBe(2);
  });

  test("reports no duplicates for a clean document", async () => {
    const path = freshDoc("clean", SOURCE_CLEAN);
    const result = await handleFindDuplicateIds({ path });
    expect(result.isError).toBeFalsy();
    expect(result.content[0]!.text).toBe("No duplicate paragraph ids found.");
  });
});
