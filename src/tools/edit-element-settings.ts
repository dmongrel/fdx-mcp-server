/**
 * edit_element_settings — create, edit, or remove the ElementSettings (formatting style) record
 * for a paragraph type. Mirrors Go's tools/edit_element_settings.go.
 */

import type { FdxTool } from "./shared.ts";
import { textResult, errResult, getCachedFdx, pushCacheWarning, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import {
  applyElementSettingsFields,
  buildElementSettingsElement,
  knownElementSettingType,
  type EditElementSettingsRequest,
} from "../fdx/element-settings.ts";

export const editElementSettingsTool: FdxTool = {
  name: "edit_element_settings",
  description:
    "Create, edit, or remove the ElementSettings (formatting style) for a paragraph type. There is no positioning — a type may exist only once, so action=create is rejected if the type already exists and action=edit/remove is rejected if it does not. For edit, only supplied (non-empty) fields change; the rest of the record is preserved. For remove, the record for the given type is deleted. The ParagraphSpec type is always kept equal to the element type. After editing, call save_fdx to persist changes to disk.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      action: { type: "string", description: "create, edit, or remove" },
      type: { type: "string", description: "the element settings type (must be one of the supported types; see list below)" },
      font: { type: "string", description: "font family (e.g., Courier Final Draft)" },
      fontSize: { type: "string", description: "font point size (e.g., 12)" },
      fontStyle: { type: "string", description: "font style flags (e.g., AllCaps, Bold+Underline+AllCaps)" },
      fontColor: { type: "string", description: "font color (e.g., #87878F8FE0E0); optional" },
      adornmentStyle: { type: "string", description: "font adornment style (e.g., 0)" },
      revisionId: { type: "string", description: "font revision id (e.g., 0)" },
      alignment: { type: "string", description: "paragraph alignment (e.g., Left, Center, Right)" },
      firstIndent: { type: "string", description: "first-line indent (e.g., 0.00)" },
      leading: { type: "string", description: "line leading (e.g., Regular)" },
      leftIndent: { type: "string", description: "left indent (e.g., 1.75)" },
      rightIndent: { type: "string", description: "right indent (e.g., 7.25)" },
      spaceBefore: { type: "string", description: "space before paragraph (e.g., 12)" },
      spacing: { type: "string", description: "line spacing (e.g., 1)" },
      startsNewPage: { type: "string", description: "whether the element starts a new page (Yes/No)" },
      paginateAs: { type: "string", description: "element type to paginate as" },
      returnKey: { type: "string", description: "element type the Return key transitions to" },
      shortcut: { type: "string", description: "Mac keyboard shortcut number" },
      tabKey: { type: "string", description: "element type the Tab key transitions to" },
      winShortcut: { type: "string", description: "Windows keyboard shortcut number" },
      canHide: { type: "string", description: "whether the element can be hidden in the outline (Yes/No)" },
      outlineLevel: { type: "string", description: "outline level (e.g., 1)" },
    },
    required: ["path", "action", "type"],
  },
};

function pastTense(action: string): string {
  if (action === "create") return "created";
  if (action === "edit") return "edited";
  if (action === "remove") return "removed";
  return `${action}d`;
}

export async function handleEditElementSettings(args: Record<string, unknown> | undefined) {
  const path = args?.path as string | undefined;
  const action = args?.action as string | undefined;
  const type = args?.type as string | undefined;
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");
  if (!action) return errResult("action is required");
  if (!type) return errResult("type is required");

  if (!knownElementSettingType(type)) {
    return errResult(`failed to ${action} element settings: invalid element settings type: ${type}`);
  }

  let doc, warning;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const req: EditElementSettingsRequest = {
    type,
    font: args?.font as string | undefined,
    fontSize: args?.fontSize as string | undefined,
    fontStyle: args?.fontStyle as string | undefined,
    fontColor: args?.fontColor as string | undefined,
    adornmentStyle: args?.adornmentStyle as string | undefined,
    revisionId: args?.revisionId as string | undefined,
    alignment: args?.alignment as string | undefined,
    firstIndent: args?.firstIndent as string | undefined,
    leading: args?.leading as string | undefined,
    leftIndent: args?.leftIndent as string | undefined,
    rightIndent: args?.rightIndent as string | undefined,
    spaceBefore: args?.spaceBefore as string | undefined,
    spacing: args?.spacing as string | undefined,
    startsNewPage: args?.startsNewPage as string | undefined,
    paginateAs: args?.paginateAs as string | undefined,
    returnKey: args?.returnKey as string | undefined,
    shortcut: args?.shortcut as string | undefined,
    tabKey: args?.tabKey as string | undefined,
    winShortcut: args?.winShortcut as string | undefined,
    canHide: args?.canHide as string | undefined,
    outlineLevel: args?.outlineLevel as string | undefined,
  };

  const existing = doc.findElementSettingsElement(type);

  if (action === "create") {
    if (existing) {
      return errResult(`failed to create element settings: element settings of type ${type} already exists; use action=edit`);
    }
    doc.addElementSettingsElement(buildElementSettingsElement(req));
  } else if (action === "edit") {
    if (!existing) {
      return errResult(`failed to edit element settings: no element settings of type ${type}; use action=create`);
    }
    applyElementSettingsFields(existing, req);
  } else if (action === "remove") {
    if (!existing) {
      return errResult(`failed to remove element settings: no element settings of type ${type} to remove`);
    }
    doc.removeElementSettingsElement(type);
  } else {
    return errResult(`failed to ${action} element settings: action must be 'create', 'edit', or 'remove'`);
  }

  const dirtyWarning = documentCache.touchDirty(path, doc);
  let result = textResult(
    `Successfully ${pastTense(action)} element settings for type "${type}". File updated in cache — call save_fdx to persist changes to disk.`,
  );
  result = pushCacheWarning(result, dirtyWarning);
  result = pushCacheWarning(result, warning);
  return result;
}
