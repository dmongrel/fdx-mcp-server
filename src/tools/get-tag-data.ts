/**
 * get_tag_data — Read-Only. Retrieve the document's <TagData> block as JSON. Mirrors Go's
 * tools/get_tag_data.go (fdx.TagData/TagCategories/TagCategory struct shape).
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { getCachedFdx, pushCacheWarning, textResult, errResult } from "./shared.ts";
import { findChild, findChildren, getAttr } from "../fdx/xml.ts";

export const getTagDataTool: FdxTool = {
  name: "get_tag_data",
  description:
    "Read-Only. Retrieve the document's <TagData> block as JSON — the production tag categories (Props, Vehicles, Camera, Cast Members, etc.) available for production breakdown. Returns an empty object if the document has no TagData block.",
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

export async function handleGetTagData(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = args?.path as string | undefined;
  if (!path) return errResult("path is required");

  let doc, warning;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const tagDataEl = findChild(doc.root, "TagData");
  const result: Record<string, unknown> = {};
  const categoriesEl = tagDataEl && findChild(tagDataEl, "TagCategories");
  if (categoriesEl) {
    const categories = findChildren(categoriesEl, "TagCategory").map((c) => {
      const entry: Record<string, unknown> = {};
      const color = omit(getAttr(c, "Color"));
      const id = omit(getAttr(c, "Id"));
      const name = omit(getAttr(c, "Name"));
      const number = omit(getAttr(c, "Number"));
      const style = omit(getAttr(c, "Style"));
      if (color) entry.color = color;
      if (id) entry.id = id;
      if (name) entry.name = name;
      if (number) entry.number = number;
      if (style) entry.style = style;
      return entry;
    });
    const tagCategories: Record<string, unknown> = {};
    if (categories.length > 0) tagCategories.tagCategory = categories;
    result.tagCategories = tagCategories;
  }

  return pushCacheWarning(textResult(JSON.stringify(result)), warning);
}
