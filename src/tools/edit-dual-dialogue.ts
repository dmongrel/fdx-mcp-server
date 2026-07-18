/**
 * edit_dual_dialogue — restructure dual dialogue (side-by-side speech). Mirrors Go's
 * tools/edit_dual_dialogue.go. Only restructures the document; paragraph text/content is edited
 * with edit_par.
 *
 * action=create moves the top-level paragraphs named by ids (in order) into a new wrapper
 * paragraph (Type="General", fresh id) holding a <DualDialogue>, inserted where the first of them
 * was. action=remove deletes the wrapper named by id; extract=true moves the contained paragraphs
 * back to the top level first, extract=false (default) deletes the wrapper and its contents.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import { generateUuid } from "../fdx/uuid.ts";
import { getParagraphId } from "../fdx/paragraph.ts";
import { createElement, findChild, type XmlElement } from "../fdx/xml.ts";
import { actionPastTense } from "./smart-type-ops.ts";

export const editDualDialogueTool: FdxTool = {
  name: "edit_dual_dialogue",
  description:
    "Restructure dual dialogue (side-by-side speech). action=create moves the top-level paragraphs named by ids (in order) into a new wrapper paragraph holding a <DualDialogue>, inserted where the first of them was — edit the paragraphs' content beforehand with edit_par. action=remove deletes the wrapper named by id; pass extract=true to move the contained paragraphs back to the top level first, or extract=false to delete the wrapper and its contents. After editing, call save_fdx to persist changes to disk.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      action: { type: "string", description: "create or remove" },
      ids: {
        type: "array",
        items: { type: "string" },
        description: "(create) ordered top-level paragraph ids to move into a new dual dialogue",
      },
      id: { type: "string", description: "(remove) the wrapper paragraph id to remove" },
      extract: {
        type: "boolean",
        description:
          "(remove) move contained paragraphs back to the top level before removing the wrapper; false deletes the wrapper and its contents",
      },
    },
    required: ["path", "action"],
  },
};

export async function handleEditDualDialogue(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  const action = arg<string>(args, "action") ?? "";
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");

  let doc, warning;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const content = doc.getContentElement(true)!;

  if (action.toLowerCase() === "create") {
    const ids = arg<string[]>(args, "ids") ?? [];
    if (ids.length === 0) {
      return errResult("failed to create dual dialogue: create requires ids");
    }

    const paragraphs = doc.getParagraphElements();
    const moved: XmlElement[] = [];
    const movedSet = new Set<string>();
    let firstContentIdx = content.children.length;

    for (const id of ids) {
      const para = paragraphs.find((p) => getParagraphId(p) === id);
      if (!para) {
        return errResult(`failed to create dual dialogue: paragraph not found: ${id}`);
      }
      if (movedSet.has(id)) {
        return errResult(`failed to create dual dialogue: duplicate id in ids: ${id}`);
      }
      movedSet.add(id);
      moved.push(para);
      const contentIdx = content.children.indexOf(para);
      if (contentIdx !== -1 && contentIdx < firstContentIdx) firstContentIdx = contentIdx;
    }

    // Compute the insertion position among the remaining (non-moved) children.
    let insertPos = 0;
    for (let i = 0; i < firstContentIdx; i++) {
      if (!moved.includes(content.children[i] as XmlElement)) insertPos++;
    }

    content.children = content.children.filter((c) => !(c.type === "element" && moved.includes(c)));

    const dd = createElement("DualDialogue", [], moved);
    const wrapper = createElement("Paragraph", [
      ["Type", "General"],
      ["id", generateUuid()],
    ], [dd]);

    content.children.splice(insertPos, 0, wrapper);
  } else if (action.toLowerCase() === "remove") {
    const id = arg<string>(args, "id");
    if (!id) return errResult("failed to remove dual dialogue: remove requires id");

    const idx = content.children.findIndex(
      (c): c is XmlElement =>
        c.type === "element" && c.name === "Paragraph" && getParagraphId(c) === id && !!findChild(c, "DualDialogue"),
    );
    if (idx === -1) {
      return errResult(`failed to remove dual dialogue: dual-dialogue wrapper not found: ${id}`);
    }

    const extract = Boolean(arg<boolean>(args, "extract"));
    if (extract) {
      const wrapper = content.children[idx] as XmlElement;
      const dd = findChild(wrapper, "DualDialogue")!;
      const nested = dd.children.filter((c) => c.type === "element" && c.name === "Paragraph");
      content.children.splice(idx, 1, ...nested);
    } else {
      content.children.splice(idx, 1);
    }
  } else {
    return errResult("action must be 'create' or 'remove'");
  }

  const dirtyWarning = documentCache.touchDirty(path, doc);
  const result = pushCacheWarning(
    pushCacheWarning(
      textResult(`Successfully ${actionPastTense(action)} dual dialogue. File updated in cache — call save_fdx to persist changes to disk.`),
      warning,
    ),
    dirtyWarning,
  );
  return result;
}
