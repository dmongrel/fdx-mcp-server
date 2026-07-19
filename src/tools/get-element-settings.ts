/**
 * get_element_settings — retrieves the ElementSettings (formatting style) record for a paragraph
 * type. Mirrors Go's tools/get_element_settings.go.
 */

import type { FdxTool } from "./shared.ts";
import { textResult, errResult, getCachedFdx, pushCacheWarning } from "./shared.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { serializeNodeStandalone } from "../fdx/xml.ts";

export const getElementSettingsTool: FdxTool = {
  name: "get_element_settings",
  description:
    "Read-Only. Retrieve the ElementSettings by type (one of: General, Scene Heading, Action, Character, Parenthetical, Dialogue, Transition, Shot, Cast List, Scene Number, Extension, Cue).",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      type: { type: "string", description: "the paragraph type to find" },
    },
    required: ["path", "type"],
  },
};

export async function handleGetElementSettings(args: Record<string, unknown> | undefined) {
  const path = args?.path as string | undefined;
  const type = args?.type as string | undefined;
  if (!path) return errResult("path is required");
  if (!type) return errResult("type is required");

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const es = doc.findElementSettingsElement(type);
  if (!es) return errResult(`ElementSettings of type not found: ${type}`);

  return pushCacheWarning(textResult(serializeNodeStandalone(es)), warning);
}
