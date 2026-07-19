/**
 * get_revisions — Read-Only. Retrieve the document's <Revisions> block as JSON. Mirrors Go's
 * tools/get_revisions.go (fdx.Revisions/Revision struct shape, camelCased field names).
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { getCachedFdx, pushCacheWarning, textResult, errResult } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { findChild, findChildren, getAttr } from "../fdx/xml.ts";

export const getRevisionsTool: FdxTool = {
  name: "get_revisions",
  description:
    "Read-Only. Retrieve the document's <Revisions> block as JSON — the active revision-color set and the ordered list of color-coded revision swatches. Returns an empty object if the document has no Revisions block.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
    },
    required: ["path"],
  },
};

function omit(v: string | undefined): string | undefined {
  return v ? v : undefined;
}

export async function handleGetRevisions(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = args?.path as string | undefined;
  if (!path) return errResult("path is required");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const revEl = findChild(doc.root, "Revisions");
  const result: Record<string, unknown> = {};
  if (revEl) {
    const activeSet = omit(getAttr(revEl, "ActiveSet"));
    const location = omit(getAttr(revEl, "Location"));
    const revisionMode = omit(getAttr(revEl, "RevisionMode"));
    const revisionsShown = omit(getAttr(revEl, "RevisionsShown"));
    const showPageColor = omit(getAttr(revEl, "ShowPageColor"));
    if (activeSet) result.activeSet = activeSet;
    if (location) result.location = location;
    if (revisionMode) result.revisionMode = revisionMode;
    if (revisionsShown) result.revisionsShown = revisionsShown;
    if (showPageColor) result.showPageColor = showPageColor;

    const revisions = findChildren(revEl, "Revision").map((r) => {
      const entry: Record<string, unknown> = {};
      const color = omit(getAttr(r, "Color"));
      const fullRevision = omit(getAttr(r, "FullRevision"));
      const id = omit(getAttr(r, "ID"));
      const mark = omit(getAttr(r, "Mark"));
      const name = omit(getAttr(r, "Name"));
      const pageColor = omit(getAttr(r, "PageColor"));
      const style = omit(getAttr(r, "Style"));
      if (color) entry.color = color;
      if (fullRevision) entry.fullRevision = fullRevision;
      if (id) entry.id = id;
      if (mark) entry.mark = mark;
      if (name) entry.name = name;
      if (pageColor) entry.pageColor = pageColor;
      if (style) entry.style = style;
      return entry;
    });
    if (revisions.length > 0) result.revision = revisions;
  }

  return pushCacheWarning(textResult(JSON.stringify(result)), warning);
}
