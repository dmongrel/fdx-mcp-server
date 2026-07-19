/**
 * get_dual_dialogue — Read-Only. Retrieve the contents of a dual-dialogue block, including its
 * nested paragraphs (each speaker's Character/Dialogue column). Mirrors Go's
 * tools/get_dual_dialogue.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { getCachedFdx, pushCacheWarning, textResult, errResult } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { findChild, findChildren } from "../fdx/xml.ts";
import { getParagraphId, getParagraphType, paragraphText } from "../fdx/paragraph.ts";

export const getDualDialogueTool: FdxTool = {
  name: "get_dual_dialogue",
  description:
    "Read-Only. Retrieve the contents of a dual-dialogue block, including its nested paragraphs (each speaker's Character/Dialogue column). id is the wrapper paragraph id.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      id: { type: "string", description: "id of the wrapper paragraph that contains the dual dialogue" },
    },
    required: ["path", "id"],
  },
};

export async function handleGetDualDialogue(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = args?.path as string | undefined;
  const id = args?.id as string | undefined;
  if (!path) return errResult("path is required");
  if (!id) return errResult("id is required");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const paragraphs = doc.getParagraphElements();
  const wrapper = paragraphs.find((p) => getParagraphId(p) === id);
  if (!wrapper) return errResult(`paragraph id not found: ${id}`);

  const dd = findChild(wrapper, "DualDialogue");
  if (!dd) return errResult(`paragraph is not a dual-dialogue wrapper: ${id}`);

  const nested = findChildren(dd, "Paragraph");
  if (nested.length === 0) {
    return pushCacheWarning(textResult(`Dual dialogue ${id} has no nested paragraphs`), warning);
  }

  const lines = nested.map((np) => `${getParagraphType(np)} [${getParagraphId(np)}]: ${paragraphText(np)}`);
  return pushCacheWarning(textResult(lines.join("\n")), warning);
}
