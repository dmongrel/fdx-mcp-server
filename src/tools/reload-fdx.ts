/**
 * reload_fdx — forces a fresh re-parse of an .fdx file from disk, replacing whatever is cached
 * for that path. Refuses to discard unsaved edits unless force=true. Mirrors tools/reload_fdx.go.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, hasFdxExtension } from "./shared.ts";
import { FdxDocument } from "../fdx/document.ts";
import { documentCache } from "../fdx/cache.ts";
import { readTextFile } from "../fdx/runtime.ts";

export const reloadFdxTool: FdxTool = {
  name: "reload_fdx",
  description:
    "Force a fresh re-parse of an .fdx file from disk, replacing whatever is currently cached for that path — useful to intentionally discard unsaved in-memory edits, or to pick up changes made to the file externally (e.g. by FinalDraft itself). Unlike read_fdx, which serves the cached copy on a hit, reload_fdx always re-reads. If the cached copy has unsaved edits, this refuses and reports so unless force=true is passed. Call get_cache_status first to check.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file to re-read from disk" },
      force: {
        type: "boolean",
        description:
          "required to reload a document that has unsaved edits; without it, reload_fdx refuses and reports the risk instead of discarding them",
      },
    },
    required: ["path"],
  },
};

export async function handleReloadFdx(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) {
    return errResult("invalid file extension: only .fdx files are supported");
  }
  const force = Boolean(arg<boolean>(args, "force"));

  const { existed, dirty, removed } = documentCache.removeIf(path, force);
  if (existed && !removed) {
    return errResult(
      `refused: ${path} has unsaved edits — call save_fdx first, or pass force=true to reload and discard those edits.`,
    );
  }

  let doc: FdxDocument;
  try {
    const source = await readTextFile(path);
    doc = FdxDocument.parse(source, path);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }
  doc.dedupSmartTypeLists();
  const warning = documentCache.set(path, doc);

  let msg = `Reloaded ${path} from disk.`;
  if (existed && dirty) msg += " Previous unsaved edits were discarded (force=true).";
  if (warning) msg = `[cache warning] ${warning}\n\n${msg}`;
  return textResult(msg);
}
