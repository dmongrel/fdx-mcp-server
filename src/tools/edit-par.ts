// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * edit_par — create, edit, or remove a top-level body paragraph in a loaded screenplay. Mirrors
 * Go's tools/edit_par.go, including its SmartType-dictionary refresh on successful create/edit
 * (Character paragraphs feed the Characters list; Scene Heading paragraphs are parsed via a
 * slugline splitter into SceneIntros/Locations/TimesOfDay).
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, pushWarning, hasFdxExtension } from "./shared.ts";
import { duplicateIdWarning } from "../fdx/duplicate-ids.ts";
import { documentCache } from "../fdx/cache.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { generateUuid } from "../fdx/uuid.ts";
import { knownType } from "./list-types.ts";
import {
  buildParagraphElement,
  getParagraphId,
  getParagraphType,
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
        description:
          "array of text runs with content and optional style/attrs. To preserve existing run styling (AdornmentStyle, Font, Color, Size, RevisionID, ...), call get_par_runs first and pass each run's attrs back unchanged alongside the edited content.",
        items: {
          type: "object",
          properties: {
            content: { type: "string", description: "the text content" },
            style: { type: "string", description: "text style such as Bold, Italic, or Underline (shorthand for attrs.Style)" },
            attrs: {
              type: "object",
              description: "arbitrary passthrough <Text> attributes (e.g. AdornmentStyle, Font, Color, Size, RevisionID), written verbatim",
              additionalProperties: { type: "string" },
            },
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

export async function handleEditPar(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  const action = arg<string>(args, "action");
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");
  if (!action) return errResult("action is required");

  const id = arg<string>(args, "id");
  const typeArg = arg<string>(args, "type");
  const alignment = arg<string>(args, "alignment");
  const textRuns = (arg<TextRunInput[]>(args, "textRuns") ?? []).map((tr) => ({
    content: tr.content,
    style: tr.style,
    attrs: tr.attrs,
  }));
  const beforeParId = arg<string>(args, "beforeParId");
  const afterParId = arg<string>(args, "afterParId");

  // For create, type must be an explicit known type — there's no existing paragraph to infer it
  // from. For edit, an omitted type defaults to the paragraph's current type (resolved after the
  // paragraph lookup below); an explicit type is still validated. remove doesn't use type at all.
  if (action === "create" && !knownType(typeArg ?? "")) {
    return errResult(`invalid paragraph type "${typeArg ?? ""}"; call list_types to see valid types`);
  }

  let doc: FdxDocument;
  let warning: string;
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
  let dupWarning = "";

  if (action === "edit") {
    if (!id) return errResult("failed to edit paragraph: id is required");
    const matches = paragraphs.filter((p) => getParagraphId(p) === id);
    if (matches.length === 0) return errResult("failed to edit paragraph: paragraph not found");
    const para = matches[0]!;
    dupWarning = duplicateIdWarning(matches.length);
    const type = typeArg ?? getParagraphType(para);
    if (typeArg !== undefined && !knownType(type)) {
      return errResult(`invalid paragraph type "${type}"; call list_types to see valid types`);
    }
    setParagraphType(para, type);
    if (alignment) setParagraphAlignment(para, alignment);
    setParagraphTextRuns(para, textRuns);
    modifiedText = paragraphText(para);
    modifiedType = type;
    touched = true;
  } else if (action === "remove") {
    if (!id) return errResult("failed to remove paragraph: id is required");
    const matchCount = paragraphs.filter((p) => getParagraphId(p) === id).length;
    if (matchCount === 0) return errResult("failed to remove paragraph: paragraph not found");
    dupWarning = duplicateIdWarning(matchCount);
    const idx = content.children.findIndex(
      (c): c is XmlElement => c.type === "element" && c.name === "Paragraph" && getParagraphId(c) === id,
    );
    content.children.splice(idx, 1);
    touched = true;
  } else if (action === "create") {
    const type = typeArg ?? "";
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
  const result = pushCacheWarning(
    pushCacheWarning(pushWarning(textResult(msg), dupWarning), dirtyWarning),
    warning,
  );
  return result;
}

