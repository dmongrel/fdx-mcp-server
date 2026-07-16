/**
 * get_spell_check_lists — Read-Only. Retrieve the document's spell-check ignore words (the single
 * <IgnoredWords> list), in document order, with a note of how many ignore-ranges are preserved.
 * Mirrors Go's tools/get_spell_check_lists.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { getCachedFdx, pushCacheWarning, textResult, errResult } from "./shared.ts";

export const getSpellCheckListsTool: FdxTool = {
  name: "get_spell_check_lists",
  description:
    "Read-Only. Retrieve the spell-check ignore-words list as newline-joined entries in document order, or an empty message if none exist. Ignore-ranges are not included — only the word list.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
    },
    required: ["path"],
  },
};

function pluralizeRanges(n: number): string {
  return n === 1 ? "1 ignore-range" : `${n} ignore-ranges`;
}

export async function handleGetSpellCheckLists(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = args?.path as string | undefined;
  if (!path) return errResult("path is required");

  let warning: string;
  let doc;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const words = doc.getIgnoredWords();
  let text = words.length === 0 ? "No ignored words" : words.join("\n");
  const rangeCount = doc.getIgnoredRangeCount();
  if (rangeCount > 0) {
    text += `\n\n(${pluralizeRanges(rangeCount)} preserved)`;
  }

  return pushCacheWarning(textResult(text), warning);
}
