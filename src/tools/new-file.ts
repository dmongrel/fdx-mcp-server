/**
 * new_file — creates a brand-new blank FinalDraft screenplay from the embedded NewFile.fdx
 * template, re-minting every id="..." attribute to a fresh UUID (so no two generated documents
 * share ids) and stamping <DocumentRef DateTime>. Mirrors Go's tools/new_file.go.
 */

import type { FdxTool } from "./shared.ts";
import { textResult, errResult, hasFdxExtension, RE_VERSION, RE_DOT_FDX } from "./shared.ts";
import { generateUuid, fdxDateTimeNow } from "../fdx/uuid.ts";
import { readTextFile, writeTextFile, fileExists } from "../fdx/runtime.ts";

const TEMPLATE_URL = new URL("../fdx/resources/NewFile.fdx", import.meta.url);

const RE_DOCUMENT_REF_DATETIME = /(<DocumentRef[^>]*\bDateTime=")(\d{8}T\d{6})(")/;
const RE_ID_ATTR = /\bid="([^"]*)"/g;

/** Rewrites every id="..." attribute with a freshly minted UUID, preserving shared references. */
function mintFreshIds(source: string): string {
  const remap = new Map<string, string>();
  return source.replace(RE_ID_ATTR, (_whole, oldId: string) => {
    let fresh = remap.get(oldId);
    if (!fresh) {
      fresh = generateUuid();
      remap.set(oldId, fresh);
    }
    return `id="${fresh}"`;
  });
}

/** Returns a fresh copy of the embedded template with a stamped DocumentRef and re-minted ids. */
export async function newFileBytes(): Promise<string> {
  const template = await readTextFile(TEMPLATE_URL);
  const step = template.replace(RE_DOCUMENT_REF_DATETIME, `$1${fdxDateTimeNow()}$3`);
  return mintFreshIds(step);
}

/** Resolves the path new_file will write to, searching upward from _v1 when versioned. */
export async function resolveNewFilePath(path: string, versioned: boolean): Promise<string> {
  if (!versioned) return path;
  const base = RE_VERSION.test(path) ? path.replace(RE_VERSION, "") : path.replace(RE_DOT_FDX, "");
  for (let n = 1; ; n++) {
    const candidate = `${base}_v${n}.fdx`;
    if (!(await fileExists(candidate))) return candidate;
  }
}

export async function createNewFile(path: string, versioned: boolean): Promise<string> {
  const target = await resolveNewFilePath(path, versioned);
  await writeTextFile(target, await newFileBytes());
  return target;
}

export const newFileTool: FdxTool = {
  name: "new_file",
  description:
    "Create a brand-new blank FinalDraft screenplay at the given path. version defaults to true and appends a version suffix (_v#) before the .fdx extension, searching upward from _v1 for the first filename that does not exist (writes _v1 even when the base name is free). Pass version=false to write the exact path, overwriting it if it exists. The document's FinalDraft file-format Version attribute is preserved from the template (not incremented); versioning is filename-based.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the new .fdx file" },
      version: {
        type: "boolean",
        description:
          "whether to append a version suffix (_v#) to the filename; defaults to true when omitted, set to false to write the exact path",
      },
    },
    required: ["path"],
  },
};

export async function handleNewFile(args: Record<string, unknown> | undefined) {
  const path = args?.path as string | undefined;
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) {
    return errResult("only .fdx files are supported");
  }

  const versioned = args?.version === undefined ? true : Boolean(args.version);
  try {
    const target = await createNewFile(path, versioned);
    return textResult(`Created new file at ${target}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`write error: ${message}`);
  }
}
