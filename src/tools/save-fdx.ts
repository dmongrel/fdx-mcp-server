// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * save_fdx — writes the cached (in-memory, possibly edited) document for a path back to disk,
 * with filename-based versioning on by default (script.fdx -> script_v1.fdx -> script_v2.fdx).
 *
 * Deviation from the Go implementation: Go's save_fdx accepts an optional `data` parameter
 * carrying a complete FinalDraft struct as JSON, letting a caller supply the whole document
 * inline instead of relying on the cache. This TS port models FinalDraft as a generic XML tree
 * (see src/fdx/document.ts) rather than a full JSON-Schema-reflectable struct, so that inline-data
 * path is not supported here; save_fdx always persists the cached document for `path` (populated
 * by read_fdx / new_file and mutated in place by edit_* tools). Logged in PROGRESS.md.
 */

import type { FdxTool } from "./shared.ts";
import { textResult, errResult, bumpFilenameVersion } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import { writeTextFile } from "../fdx/runtime.ts";

export const saveFdxTool: FdxTool = {
  name: "save_fdx",
  description:
    "Save the cached FinalDraft document for a path back to disk (use this after edit_par, edit_title_page, etc.). Document versioning is filename-based and defaults to on: the path's _v# suffix is read and bumped (script.fdx -> script_v1.fdx -> script_v2.fdx). The FinalDraft file-format Version attribute is preserved, not incremented. Pass version=false to overwrite the same file in place. On a versioned save the returned path becomes the active document: the in-memory document is cached under that new path, so future read/edit tools should use the returned path.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      version: {
        type: "boolean",
        description:
          "whether to increment the version number in the filename; defaults to true when omitted, set to false to overwrite the same file",
      },
    },
    required: ["path"],
  },
};

export async function handleSaveFdx(args: Record<string, unknown> | undefined) {
  const path = args?.path as string | undefined;
  if (!path) return errResult("path is required");

  const cached = documentCache.get(path);
  if (!cached) {
    return errResult("save error: nothing cached for path; call read_fdx first");
  }

  cached.consolidateSpellCheckWords();
  cached.touchDocumentRef();

  const versioned = args?.version === undefined ? true : Boolean(args.version);
  const targetPath = versioned ? bumpFilenameVersion(path) : path;

  try {
    await writeTextFile(targetPath, cached.serialize());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`save error: ${message}`);
  }

  cached.path = targetPath;
  const warning = documentCache.set(targetPath, cached);

  let msg = `Saved successfully to ${targetPath}. This file (${targetPath}) is now the active document; the cache has been updated, so future read/edit tools should use this path.`;
  if (warning) msg = `[cache warning] ${warning}\n\n${msg}`;
  return textResult(msg);
}

