/**
 * Shared helpers used across fdx-mcp-server tool handlers: MCP result builders, the document
 * cache accessor, and filename-versioning logic (mirrors Go's tools/util.go + tools/cache.go
 * getCachedFDX).
 */

import { FdxDocument } from "../fdx/document.ts";
import { documentCache } from "../fdx/cache.ts";
import { readTextFile } from "../fdx/runtime.ts";

export interface FdxTool {
  name: string;
  description: string;
  inputSchema: object;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

export function errResult(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

/** Prepends a "[cache warning] ..." line to a result's text, if warning is non-empty. */
export function pushCacheWarning(result: ToolResult, warning: string): ToolResult {
  if (!warning) return result;
  return {
    ...result,
    content: [{ type: "text", text: `[cache warning] ${warning}` }, ...result.content],
  };
}

export const RE_VERSION = /_v(\d+)\.fdx$/i;
export const RE_DOT_FDX = /\.fdx$/i;

/** Bumps a path's _v# filename suffix (foo_v1.fdx -> foo_v2.fdx), or inserts _v1 if absent. */
export function bumpFilenameVersion(path: string): string {
  const match = path.match(RE_VERSION);
  if (match) {
    const next = parseInt(match[1]!, 10) + 1;
    return path.replace(RE_VERSION, `_v${next}.fdx`);
  }
  return path.replace(RE_DOT_FDX, "_v1.fdx");
}

/**
 * Returns a cached document for `path` on a hit, or loads, dedups its SmartType lists, and
 * caches it on a miss. Mirrors Go's getCachedFDX: the single shared entry point read-oriented
 * tools use. The second element is a non-empty eviction warning when loading this path evicted a
 * dirty entry.
 */
export async function getCachedFdx(path: string): Promise<{ doc: FdxDocument; warning: string }> {
  const cached = documentCache.get(path);
  if (cached) return { doc: cached, warning: "" };

  const source = await readTextFile(path);
  const doc = FdxDocument.parse(source, path);
  doc.dedupSmartTypeLists();
  const warning = documentCache.set(path, doc);
  return { doc, warning };
}

export function hasFdxExtension(path: string): boolean {
  return path.toLowerCase().endsWith(".fdx");
}
