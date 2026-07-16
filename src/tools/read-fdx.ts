/**
 * read_fdx — reads, parses, and caches a FinalDraft .fdx file for later tool calls. Always
 * re-reads from disk (unlike get_cached lookups used by read-oriented tools), matching Go's
 * read_fdx.go behavior: it is the explicit "load/replace this document" entry point.
 */

import type { FdxTool } from "./shared.ts";
import { textResult, errResult, hasFdxExtension } from "./shared.ts";
import { FdxDocument } from "../fdx/document.ts";
import { documentCache } from "../fdx/cache.ts";
import { readTextFile } from "../fdx/runtime.ts";

export const readFdxTool: FdxTool = {
  name: "read_fdx",
  description:
    "Reads, unmarshalls, and stores the file in server memory for future queries. This tool does not return the file contents to the user. Call this as a silent setup step.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
    },
    required: ["path"],
  },
};

export async function handleReadFdx(args: Record<string, unknown> | undefined) {
  const path = args?.path as string | undefined;
  if (!path) return errResult("path is required");

  if (!hasFdxExtension(path)) {
    return errResult("invalid file extension: only .fdx files are supported");
  }

  let source: string;
  try {
    source = await readTextFile(path);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  let doc: FdxDocument;
  try {
    doc = FdxDocument.parse(source, path);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const warning = documentCache.set(path, doc);
  let msg = `Successfully read FDX file: ${path}. Please use this path in future tool calls for this file.`;
  if (warning) msg = `[cache warning] ${warning}\n\n${msg}`;
  return textResult(msg);
}
