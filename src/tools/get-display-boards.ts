/**
 * get_display_boards — Read-Only. Retrieve the document's <DisplayBoards> block as JSON. Mirrors
 * Go's tools/get_display_boards.go (fdx.DisplayBoards/DisplayBoard/Lanes/Lane struct shape).
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { getCachedFdx, pushCacheWarning, textResult, errResult } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { findChild, findChildren, getAttr } from "../fdx/xml.ts";

export const getDisplayBoardsTool: FdxTool = {
  name: "get_display_boards",
  description:
    "Read-Only. Retrieve the document's <DisplayBoards> block as JSON — Beat Board and Story Map layout data (viewport, zoom, lanes). Editor-UI state with no effect on screenplay content. Returns an empty object if the document has no DisplayBoards block.",
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

export async function handleGetDisplayBoards(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = args?.path as string | undefined;
  if (!path) return errResult("path is required");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const boardsEl = findChild(doc.root, "DisplayBoards");
  const result: Record<string, unknown> = {};
  if (boardsEl) {
    const boards = findChildren(boardsEl, "DisplayBoard").map((b) => {
      const entry: Record<string, unknown> = {};
      const height = omit(getAttr(b, "Height"));
      const id = omit(getAttr(b, "Id"));
      const scrollOrigin = omit(getAttr(b, "ScrollOrigin"));
      const type = omit(getAttr(b, "Type"));
      const width = omit(getAttr(b, "Width"));
      const zoomLevel = omit(getAttr(b, "ZoomLevel"));
      if (height) entry.height = height;
      if (id) entry.id = id;
      if (scrollOrigin) entry.scrollOrigin = scrollOrigin;
      if (type) entry.type = type;
      if (width) entry.width = width;
      if (zoomLevel) entry.zoomLevel = zoomLevel;

      const lanesEl = findChild(b, "Lanes");
      if (lanesEl) {
        const lanes = findChildren(lanesEl, "Lane").map((l) => {
          const laneEntry: Record<string, unknown> = {};
          const lid = omit(getAttr(l, "Id"));
          const label = omit(getAttr(l, "Label"));
          const level = omit(getAttr(l, "Level"));
          const ltype = omit(getAttr(l, "Type"));
          if (lid) laneEntry.id = lid;
          if (label) laneEntry.label = label;
          if (level) laneEntry.level = level;
          if (ltype) laneEntry.type = ltype;
          return laneEntry;
        });
        const laneWrapper: Record<string, unknown> = {};
        if (lanes.length > 0) laneWrapper.lane = lanes;
        entry.lanes = laneWrapper;
      }
      return entry;
    });
    if (boards.length > 0) result.displayBoard = boards;
  }

  return pushCacheWarning(textResult(JSON.stringify(result)), warning);
}
