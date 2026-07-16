/**
 * edit_header_and_footer — create, edit, or remove a HeaderAndFooter in the script body or the
 * title page. Mirrors Go's tools/edit_header_and_footer.go.
 */

import type { FdxTool } from "./shared.ts";
import { textResult, errResult, getCachedFdx, pushCacheWarning, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import { FdxDocument } from "../fdx/document.ts";
import { findChild, cloneNode } from "../fdx/xml.ts";
import { readTextFile } from "../fdx/runtime.ts";
import {
  applyHeaderFooterAttrs,
  applyHeaderFooterParts,
  buildHeaderAndFooterElement,
  titlePageHfExists,
  validateHeaderFooterParts,
  type EditHeaderFooterRequest,
  type HeaderFooterPartInput,
} from "../fdx/header-footer.ts";

const TEMPLATE_URL = new URL("../fdx/resources/NewFile.fdx", import.meta.url);

export const editHeaderAndFooterTool: FdxTool = {
  name: "edit_header_and_footer",
  description:
    "Create, edit, or remove a HeaderAndFooter in the script body (location='body', default) or the title page (location='titlePage'). Use action=create only when none exists at that location; action=edit requires one to exist. Supply headerParts and/or footerParts (each an ordered list of {text} or {label} pieces, where label is one of Page #, Date, Time, Script Title) to replace that header/footer's content wholesale. Tag attributes (headerVisible, footerVisible, headerFirstPage, footerFirstPage, startingPage) are applied when non-empty. action=remove resets the header/footer at that location to a blank (new-document) header/footer. After editing, call save_fdx to persist changes to disk.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      action: { type: "string", description: "create, edit, or remove" },
      location: { type: "string", description: "which HeaderAndFooter to target: 'body' (default) or 'titlePage'" },
      headerParts: {
        type: "array",
        description: "ordered header parts; when supplied, replaces the header content wholesale",
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "a literal text run (mutually exclusive with label)" },
            label: { type: "string", description: "a dynamic label type: one of Page #, Date, Time, Script Title" },
          },
        },
      },
      footerParts: {
        type: "array",
        description: "ordered footer parts; when supplied, replaces the footer content wholesale",
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "a literal text run (mutually exclusive with label)" },
            label: { type: "string", description: "a dynamic label type: one of Page #, Date, Time, Script Title" },
          },
        },
      },
      footerFirstPage: { type: "string", description: "whether the footer shows on the first page (Yes/No)" },
      footerVisible: { type: "string", description: "whether the footer is visible (Yes/No)" },
      headerFirstPage: { type: "string", description: "whether the header shows on the first page (Yes/No)" },
      headerVisible: { type: "string", description: "whether the header is visible (Yes/No)" },
      startingPage: { type: "string", description: "the starting page number (e.g., 1)" },
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

async function loadBaselineDoc(): Promise<FdxDocument> {
  const template = await readTextFile(TEMPLATE_URL);
  return FdxDocument.parse(template);
}

export async function handleEditHeaderAndFooter(args: Record<string, unknown> | undefined) {
  const path = args?.path as string | undefined;
  const action = args?.action as string | undefined;
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");
  if (!action) return errResult("action is required");

  const location = ((args?.location as string | undefined) ?? "").toLowerCase() || "body";
  if (location !== "body" && location !== "titlepage") {
    return errResult("location must be 'body' or 'titlePage'");
  }

  const req: EditHeaderFooterRequest = {
    headerParts: args?.headerParts as HeaderFooterPartInput[] | undefined,
    footerParts: args?.footerParts as HeaderFooterPartInput[] | undefined,
    footerFirstPage: args?.footerFirstPage as string | undefined,
    footerVisible: args?.footerVisible as string | undefined,
    headerFirstPage: args?.headerFirstPage as string | undefined,
    headerVisible: args?.headerVisible as string | undefined,
    startingPage: args?.startingPage as string | undefined,
  };

  const partsError = validateHeaderFooterParts(req);
  if (partsError) return errResult(`failed to ${action} header and footer: ${partsError}`);

  let doc, warning;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  if (action === "create") {
    const hf = buildHeaderAndFooterElement(req);
    if (location === "body") {
      if (doc.getBodyHeaderAndFooterElement()) {
        return errResult("failed to create header and footer: a body HeaderAndFooter already exists; use action=edit");
      }
      doc.setBodyHeaderAndFooterElement(hf);
    } else {
      if (titlePageHfExists(doc.getTitlePageHeaderAndFooterElement())) {
        return errResult("failed to create header and footer: a title page HeaderAndFooter already exists; use action=edit");
      }
      doc.setTitlePageHeaderAndFooterElement(hf);
    }
  } else if (action === "edit") {
    let hf;
    if (location === "body") {
      hf = doc.getBodyHeaderAndFooterElement();
      if (!hf) return errResult("failed to edit header and footer: no body HeaderAndFooter exists; use action=create");
    } else {
      hf = doc.getTitlePageHeaderAndFooterElement();
      if (!titlePageHfExists(hf)) return errResult("failed to edit header and footer: no title page HeaderAndFooter exists; use action=create");
    }
    applyHeaderFooterParts(hf!, req);
    applyHeaderFooterAttrs(hf!, req);
  } else if (action === "remove") {
    let baseline;
    try {
      baseline = await loadBaselineDoc();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return errResult(`failed to remove header and footer: failed to load blank-document baseline: ${message}`);
    }
    if (location === "body") {
      if (!doc.getBodyHeaderAndFooterElement()) {
        return errResult("failed to remove header and footer: no body HeaderAndFooter to remove");
      }
      const baseHf = findChild(baseline.root, "HeaderAndFooter");
      if (!baseHf) return errResult("failed to remove header and footer: blank-document template has no body HeaderAndFooter");
      doc.setBodyHeaderAndFooterElement(cloneNode(baseHf));
    } else {
      if (!titlePageHfExists(doc.getTitlePageHeaderAndFooterElement())) {
        return errResult("failed to remove header and footer: no title page HeaderAndFooter to remove");
      }
      const baseTp = findChild(baseline.root, "TitlePage");
      const baseHf = baseTp && findChild(baseTp, "HeaderAndFooter");
      if (!baseHf) return errResult("failed to remove header and footer: blank-document template has no title page HeaderAndFooter");
      doc.setTitlePageHeaderAndFooterElement(cloneNode(baseHf));
    }
  } else {
    return errResult(`failed to ${action} header and footer: action must be 'create', 'edit', or 'remove'`);
  }

  const dirtyWarning = documentCache.touchDirty(path, doc);
  let result = textResult(`Successfully ${pastTense(action)} header and footer. File updated in cache — call save_fdx to persist changes to disk.`);
  result = pushCacheWarning(result, dirtyWarning);
  result = pushCacheWarning(result, warning);
  return result;
}
