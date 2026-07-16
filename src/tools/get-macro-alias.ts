/**
 * get_macro_alias — Read-Only. Retrieve a specific macro by matching one or more of its
 * attributes. Mirrors Go's tools/get_macro_alias.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { getCachedFdx, pushCacheWarning, textResult, errResult } from "./shared.ts";
import { getMacros, formatMacro, type MacroInfo } from "./macro-data.ts";

export const getMacroAliasTool: FdxTool = {
  name: "get_macro_alias",
  description:
    "Read-Only. Retrieve a specific macro by matching one or more of its attributes (Element, Name, Shortcut, Text, Transition). At least one attribute must be supplied. All supplied attributes must match for a hit. Returns the full macro details including any Alias block and its ActivateIn list.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      element: { type: "string", description: "match Macro Element attribute (e.g. 'Scene Heading', 'Transition')" },
      name: { type: "string", description: "match Macro Name attribute (the trigger string, e.g. 'INT', 'NIGHT')" },
      shortcut: { type: "string", description: "match Macro Shortcut attribute (e.g. 'Ctrl+Alt+1')" },
      text: { type: "string", description: "match Macro Text attribute (the inserted text, e.g. 'INT. ')" },
      transition: { type: "string", description: "match Macro Transition attribute (e.g. 'None', 'Scene Heading')" },
    },
    required: ["path"],
  },
};

function macroMatches(m: MacroInfo, criteria: Record<string, string | undefined>): boolean {
  if (criteria.element && m.element.toLowerCase() !== criteria.element.toLowerCase()) return false;
  if (criteria.name && m.name !== criteria.name) return false;
  if (criteria.shortcut && m.shortcut !== criteria.shortcut) return false;
  if (criteria.text && m.text !== criteria.text) return false;
  if (criteria.transition && m.transition.toLowerCase() !== criteria.transition.toLowerCase()) return false;
  return true;
}

export async function handleGetMacroAlias(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = args?.path as string | undefined;
  if (!path) return errResult("path is required");

  const criteria = {
    element: args?.element as string | undefined,
    name: args?.name as string | undefined,
    shortcut: args?.shortcut as string | undefined,
    text: args?.text as string | undefined,
    transition: args?.transition as string | undefined,
  };

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

  if (!criteria.element && !criteria.name && !criteria.shortcut && !criteria.text && !criteria.transition) {
    return errResult("at least one of element, name, shortcut, text, or transition must be supplied");
  }

  const matches = macros.filter((m) => macroMatches(m, criteria));
  if (matches.length === 0) {
    return pushCacheWarning(textResult("No macro found matching the given criteria"), warning);
  }

  const text = matches.map((m) => formatMacro(m) + "\n").join("\n---\n");
  return pushCacheWarning(textResult(text), warning);
}
