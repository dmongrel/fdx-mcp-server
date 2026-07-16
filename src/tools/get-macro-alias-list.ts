/**
 * get_macro_alias_list — Read-Only. Retrieve the list of all macros defined in a loaded
 * screenplay. Mirrors Go's tools/get_macro_alias_list.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { getCachedFdx, pushCacheWarning, textResult, errResult } from "./shared.ts";
import { getMacros, formatMacro } from "./macro-data.ts";

export const getMacroAliasListTool: FdxTool = {
  name: "get_macro_alias_list",
  description:
    "Read-Only. Retrieve the list of all macros defined in a loaded screenplay. Each entry shows Element, Name, Shortcut, Text, and Transition attributes. Aliases (if present) are listed under their parent macro.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
    },
    required: ["path"],
  },
};

export async function handleGetMacroAliasList(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = args?.path as string | undefined;
  if (!path) return errResult("path is required");

  let doc, warning;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const macros = getMacros(doc);
  if (macros.length === 0) {
    return pushCacheWarning(textResult("No macros defined in this document"), warning);
  }

  const text = macros.map((m) => formatMacro(m) + "\n").join("");
  return pushCacheWarning(textResult(text), warning);
}
