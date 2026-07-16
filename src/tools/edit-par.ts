/**
 * edit_par — create, edit, or remove a top-level body paragraph in a loaded screenplay. Mirrors
 * Go's tools/edit_par.go, including its SmartType-dictionary refresh on successful create/edit
 * (Character paragraphs feed the Characters list; Scene Heading paragraphs are parsed via a
 * slugline splitter into SceneIntros/Locations/TimesOfDay).
 */

import type { FdxTool } from "./shared.ts";
import { textResult, errResult, getCachedFdx, pushCacheWarning, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { generateUuid } from "../fdx/uuid.ts";
import { knownType } from "./list-types.ts";
import {
  buildParagraphElement,
  getParagraphId,
  paragraphText,
  setParagraphAlignment,
  setParagraphTextRuns,
  setParagraphType,
  type TextRunInput,
} from "../fdx/paragraph.ts";
import type { XmlElement } from "../fdx/xml.ts";

export const editParTool: FdxTool = {
  name: "edit_par",
  description:
    "Create a new paragraph, edit an existing one, or remove one in a loaded screenplay. For create, use beforeParId or afterParId (each a paragraph id) to control insertion position (falls back to append). For edit, provide id (the paragraph id) and the fields to update. For remove, provide id and the paragraph is deleted. After editing, call save_fdx to persist changes to disk.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      action: { type: "string", description: "create, edit, or remove" },
      id: { type: "string", description: "id is the paragraph id to edit or remove (required for edit and remove)" },
      type: { type: "string", description: "paragraph type (e.g., Scene Heading, Action, Dialogue)" },
      alignment: { type: "string", description: "alignment setting" },
      textRuns: {
        type: "array",
        description: "array of text runs with content and optional style",
        items: {
          type: "object",
          properties: {
            content: { type: "string", description: "the text content" },
            style: { type: "string", description: "text style such as Bold, Italic, or Underline" },
          },
          required: ["content"],
        },
      },
      beforeParId: { type: "string", description: "beforeParId is the paragraph id to insert the new paragraph before" },
      afterParId: { type: "string", description: "afterParId is the paragraph id to insert the new paragraph after" },
    },
    required: ["path", "action"],
  },
};

/** Adds `value` to a SmartType list if not already present (exact match), re-sorting case-insensitively. */
function addSmartTypeValue(doc: FdxDocument, leaf: string, value: string): void {
  const list = doc.getSmartTypeList(leaf);
  if (!list) return;
  const v = value.trim();
  if (v === "" || list.values.includes(v)) return;
  const merged = [...list.values, v].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()) || a.localeCompare(b));
  doc.setSmartTypeList(leaf, merged);
}

const ALPHA_OR_SLASH = /^[a-zA-Z/]$/;

/** Splits Scene Heading text into intro ("INT./EXT."), location, and time-of-day, mirroring Go's parseSlugline. */
function parseSlugline(doc: FdxDocument, text: string): { intro: string; location: string; timeOfDay: string } {
  const trimmed = text.trim();
  if (trimmed === "") return { intro: "", location: "", timeOfDay: "" };

  let intro = "";
  let locAndTime = trimmed;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    if (ALPHA_OR_SLASH.test(ch)) continue;
    intro = trimmed.slice(0, i).replace(/\/+$/, "");
    locAndTime = trimmed.slice(i).trim();
    break;
  }

  locAndTime = locAndTime.replace(/^[./ ]+/, "").trim();
  if (locAndTime === "") return { intro, location: "", timeOfDay: "" };

  let location = locAndTime;
  let timeOfDay = "";
  const todList = doc.getSmartTypeList("TimeOfDay");
  if (todList) {
    const words = locAndTime.split(/\s+/).filter(Boolean);
    for (let end = words.length; end > 0; end--) {
      const candidate = words.slice(end - 1).join(" ");
      if (todList.values.some((v) => v.toLowerCase() === candidate.toLowerCase())) {
        timeOfDay = candidate;
        location = words.slice(0, end - 1).join(" ");
        break;
      }
    }
  }
  return { intro, location, timeOfDay };
}

/** Keeps the SmartType dictionaries in sync with a created/edited paragraph's type and text. */
function refreshSmartTypes(doc: FdxDocument, type: string, text: string): void {
  if (text.trim() === "") return;
  if (type === "Character") {
    addSmartTypeValue(doc, "Character", text);
  } else if (type === "Scene Heading") {
    const { intro, location, timeOfDay } = parseSlugline(doc, text);
    if (intro) addSmartTypeValue(doc, "SceneIntro", intro);
    if (location) addSmartTypeValue(doc, "Location", location);
    if (timeOfDay) addSmartTypeValue(doc, "TimeOfDay", timeOfDay);
  }
}

function pastTense(action: string): string {
  if (action === "create") return "created";
  if (action === "edit") return "edited";
  if (action === "remove") return "removed";
  return `${action}d`;
}

export async function handleEditPar(args: Record<string, unknown> | undefined) {
  const path = args?.path as string | undefined;
  const action = args?.action as string | undefined;
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");
  if (!action) return errResult("action is required");

  const id = args?.id as string | undefined;
  const type = (args?.type as string | undefined) ?? "";
  const alignment = args?.alignment as string | undefined;
  const textRuns = ((args?.textRuns as TextRunInput[] | undefined) ?? []).map((tr) => ({
    content: tr.content,
    style: tr.style,
  }));
  const beforeParId = args?.beforeParId as string | undefined;
  const afterParId = args?.afterParId as string | undefined;

  if (action !== "remove" && !knownType(type)) {
    return errResult(`invalid paragraph type "${type}"; call list_types to see valid types`);
  }

  let doc, warning;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const content = doc.getContentElement(true)!;
  const paragraphs = doc.getParagraphElements();

  let modifiedText = "";
  let modifiedType = "";
  let touched = false;

  if (action === "edit") {
    if (!id) return errResult("failed to edit paragraph: id is required");
    const para = paragraphs.find((p) => getParagraphId(p) === id);
    if (!para) return errResult("failed to edit paragraph: paragraph not found");
    setParagraphType(para, type);
    if (alignment) setParagraphAlignment(para, alignment);
    setParagraphTextRuns(para, textRuns);
    modifiedText = paragraphText(para);
    modifiedType = type;
    touched = true;
  } else if (action === "remove") {
    if (!id) return errResult("failed to remove paragraph: id is required");
    const idx = content.children.findIndex(
      (c): c is XmlElement => c.type === "element" && c.name === "Paragraph" && getParagraphId(c) === id,
    );
    if (idx === -1) return errResult("failed to remove paragraph: paragraph not found");
    content.children.splice(idx, 1);
    touched = true;
  } else if (action === "create") {
    const newPara = buildParagraphElement(type, generateUuid(), alignment, textRuns);
    if (beforeParId) {
      const idx = paragraphs.findIndex((p) => getParagraphId(p) === beforeParId);
      if (idx === -1) return errResult("failed to create paragraph: anchor paragraph not found");
      const contentIdx = content.children.indexOf(paragraphs[idx]!);
      content.children.splice(contentIdx, 0, newPara);
    } else if (afterParId) {
      const idx = paragraphs.findIndex((p) => getParagraphId(p) === afterParId);
      if (idx === -1) return errResult("failed to create paragraph: anchor paragraph not found");
      const contentIdx = content.children.indexOf(paragraphs[idx]!);
      content.children.splice(contentIdx + 1, 0, newPara);
    } else {
      content.children.push(newPara);
    }
    modifiedText = paragraphText(newPara);
    modifiedType = type;
    touched = true;
  } else {
    return errResult(`failed to ${action} paragraph`);
  }

  if (!touched) return errResult(`failed to ${action} paragraph`);

  if (modifiedType) refreshSmartTypes(doc, modifiedType, modifiedText);

  const dirtyWarning = documentCache.touchDirty(path, doc);
  const msg = `Successfully ${pastTense(action)} paragraph in script. File updated in cache — call save_fdx to persist changes to disk.`;
  let result = textResult(msg);
  result = pushCacheWarning(result, dirtyWarning);
  result = pushCacheWarning(result, warning);
  return result;
}
