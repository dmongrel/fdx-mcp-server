// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { handleGetHeaderAndFooter } from "./get-header-and-footer.ts";

const FIXTURE_PATH = join(import.meta.dir, "..", "..", "examples", "Star Trek Empires Pilot.fdx");

function allText(result: { content: Array<{ text: string }> }): string {
  return result.content.map((c) => c.text).join("\n");
}

describe("get_header_and_footer", () => {
  test("path is required", async () => {
    expect((await handleGetHeaderAndFooter(undefined)).isError).toBe(true);
  });

  test("rejects an invalid location or element", async () => {
    expect((await handleGetHeaderAndFooter({ path: FIXTURE_PATH, location: "bogus" })).isError).toBe(true);
    expect((await handleGetHeaderAndFooter({ path: FIXTURE_PATH, element: "bogus" })).isError).toBe(true);
  });

  test("body location renders text and dynamic labels in document order", async () => {
    const result = await handleGetHeaderAndFooter({ path: FIXTURE_PATH, location: "body" });
    expect(result.isError).toBeFalsy();
    const text = allText(result);
    const iText = text.indexOf("EMPIRES");
    const iDate = text.indexOf("[Date]");
    const iPage = text.indexOf("[Page #]");
    expect(iText).toBeGreaterThanOrEqual(0);
    expect(iDate).toBeGreaterThan(iText);
    expect(iPage).toBeGreaterThan(iDate);
    expect(text).toContain("[Header]");
    expect(text).toContain("[Footer]");
  });

  test("title location includes the title page header/footer", async () => {
    const result = await handleGetHeaderAndFooter({ path: FIXTURE_PATH, location: "title" });
    expect(result.isError).toBeFalsy();
    expect(allText(result)).toContain("[Page #]");
  });

  test("element filter isolates header vs footer", async () => {
    const headerOnly = await handleGetHeaderAndFooter({ path: FIXTURE_PATH, location: "body", element: "header" });
    const headerText = allText(headerOnly);
    expect(headerText).toContain("[Header]");
    expect(headerText).not.toContain("[Footer]");

    const footerOnly = await handleGetHeaderAndFooter({ path: FIXTURE_PATH, location: "body", element: "footer" });
    const footerText = allText(footerOnly);
    expect(footerText).toContain("[Footer]");
    expect(footerText).not.toContain("[Header]");
  });

  test("default location is 'all', showing both body and title page", async () => {
    const result = await handleGetHeaderAndFooter({ path: FIXTURE_PATH });
    const text = allText(result);
    expect(text).toContain("Body:");
    expect(text).toContain("Title Page:");
  });
});

