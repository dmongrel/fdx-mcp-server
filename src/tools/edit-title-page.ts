/**
 * edit_title_page — create, edit, or remove a screenplay's title page. Mirrors Go's
 * tools/edit_title_page.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";
import { findChild, cloneNode } from "../fdx/xml.ts";
import { readTextFile } from "../fdx/runtime.ts";
import { buildTitlePage, editExistingTitlePage, type EditTitlePageRequest } from "../fdx/title-page.ts";

const TEMPLATE_URL = new URL("../fdx/resources/NewFile.fdx", import.meta.url);

export const editTitlePageTool: FdxTool = {
  name: "edit_title_page",
  description: `Create, edit, or remove the title page of a screenplay. Use action=create only when no title page exists (requires title and author); it builds the full standard layout. Use action=edit to update an existing title page (a brand-new file from new_file already ships one, so use edit there). Use action=remove to reset the title page to a blank (new-document) title page. After editing, call save_fdx to persist changes to disk.

Fields: title, subtitle (optional), byLine (defaults to "Written by"), author, basedOn + originalAuthor (the based-on block, optional), the contact block: contactName, contactAddressLine1, contactAddressLine2 (optional), contactCityStateZip, contactPhone, and an optional copyright block via copyrightOwner (+ copyrightYear, copyrightAllRightsReserved) — or manage it separately with the edit_copyright / get_copyright tools.

You may pass every field in a single call. On edit, the contact block and the based-on block are each rebuilt wholesale from their fields whenever any one of that block's fields is supplied, so always pass the complete contact block together rather than one field at a time.

When acting as an agent gathering details from a user, collect: the title (and optional subtitle), the author, and the full contact block (name, address line 1, optional address line 2, city/state/ZIP, phone). Ask whether the screenplay is based on existing material: if so, gather the source (basedOn) and its original author (originalAuthor); if not, omit the based-on block.`,
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      action: { type: "string", description: "create, edit, or remove" },
      title: { type: "string", description: "film title (e.g., STAR TREK: EMPIRES)" },
      subtitle: { type: "string", description: "episode/act name in quotes, optional" },
      byLine: { type: "string", description: "literal text between title and author; defaults to 'Written by'" },
      author: { type: "string", description: "writer's full name" },
      basedOn: {
        type: "string",
        description: "adaptation source credit (e.g., 'Star Trek'); optional — include only when the work is based on existing material",
      },
      originalAuthor: {
        type: "string",
        description: "original creator credit shown after the 'By' line of a based-on block, e.g., 'Gene Roddenberry'; optional, pairs with basedOn",
      },
      contactName: { type: "string", description: "contact block: name" },
      contactAddressLine1: { type: "string", description: "contact block: address line 1 (street)" },
      contactAddressLine2: { type: "string", description: "contact block: address line 2 (optional, e.g. apartment/suite)" },
      contactCityStateZip: { type: "string", description: "contact block: city, state ZIP" },
      contactPhone: { type: "string", description: "contact block: phone number" },
      copyrightOwner: {
        type: "string",
        description:
          "copyright holder name; when set, adds a copyright block as the first two title-page lines (Copyright © <year> <owner>.). Also see the edit_copyright tool",
      },
      copyrightYear: { type: "string", description: "copyright year for the copyright block; defaults to the current year" },
      copyrightAllRightsReserved: {
        type: "boolean",
        description: "include the 'All Rights Reserved.' second line of the copyright block; defaults to true",
      },
    },
    required: ["path", "action"],
  },
};

function pastTense(action: string): string {
  if (action === "create") return "created";
  if (action === "edit") return "edited";
  if (action === "remove") return "removed";
  return `${action}d`;
}

async function loadBaselineTitlePage() {
  const template = await readTextFile(TEMPLATE_URL);
  const baseline = FdxDocument.parse(template);
  const tp = findChild(baseline.root, "TitlePage");
  if (!tp) throw new Error("blank-document template has no TitlePage block");
  return cloneNode(tp);
}

export async function handleEditTitlePage(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  const action = arg<string>(args, "action");
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");
  if (!action) return errResult("action is required");

  const req: EditTitlePageRequest = {
    title: arg<string>(args, "title"),
    subtitle: arg<string>(args, "subtitle"),
    byLine: arg<string>(args, "byLine"),
    author: arg<string>(args, "author"),
    basedOn: arg<string>(args, "basedOn"),
    originalAuthor: arg<string>(args, "originalAuthor"),
    contactName: arg<string>(args, "contactName"),
    contactAddressLine1: arg<string>(args, "contactAddressLine1"),
    contactAddressLine2: arg<string>(args, "contactAddressLine2"),
    contactCityStateZip: arg<string>(args, "contactCityStateZip"),
    contactPhone: arg<string>(args, "contactPhone"),
    copyrightOwner: arg<string>(args, "copyrightOwner"),
    copyrightYear: arg<string>(args, "copyrightYear"),
    copyrightAllRightsReserved: arg<boolean>(args, "copyrightAllRightsReserved"),
  };

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const existing = doc.getTitlePageParagraphs();
  const hasTitlePage = existing.length > 0;

  if (action === "create") {
    if (hasTitlePage) return errResult("failed to create title page: title page already exists; use action=edit");
    if (!(req.title ?? "").trim() || !(req.author ?? "").trim()) {
      return errResult("failed to create title page: create requires both title and author");
    }
    doc.setTitlePageParagraphs(buildTitlePage(req));
  } else if (action === "edit") {
    if (!hasTitlePage) return errResult("failed to edit title page: no title page exists to edit");
    doc.setTitlePageParagraphs(editExistingTitlePage(existing, req));
  } else if (action === "remove") {
    if (!hasTitlePage) return errResult("failed to remove title page: no title page to remove");
    let baselineTp;
    try {
      baselineTp = await loadBaselineTitlePage();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errResult(`failed to remove title page: failed to load blank-document baseline: ${message}`);
    }
    doc.replaceTitlePageElement(baselineTp);
  } else {
    return errResult(`failed to ${action} title page: action must be 'create', 'edit', or 'remove'`);
  }

  const dirtyWarning = documentCache.touchDirty(path, doc);
  const result = pushCacheWarning(
    pushCacheWarning(textResult(`Successfully ${pastTense(action)} title page. File updated in cache — call save_fdx to persist changes to disk.`), dirtyWarning),
    warning,
  );
  return result;
}
