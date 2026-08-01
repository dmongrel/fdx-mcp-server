// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * fix_duplicate_ids — repairs top-level body paragraphs that share the same id. The first
 * occurrence (document order) keeps its id — any id a caller already holds keeps pointing at the
 * paragraph it pointed at before the repair — every later occurrence is assigned a freshly minted
 * uuid, written back under its paragraph's original attribute name (id/Id/ID) unchanged. See
 * HANDOFF-duplicate-paragraph-ids.md.
 */

import type { FdxTool, ToolResult } from "./shared.ts";
import { arg, textResult, errResult, getCachedFdx, pushCacheWarning, hasFdxExtension } from "./shared.ts";
import { documentCache } from "../fdx/cache.ts";
import type { FdxDocument } from "../fdx/document.ts";
import { applyDuplicateIdFixes, planDuplicateIdFixes } from "../fdx/duplicate-ids.ts";

export const fixDuplicateIdsTool: FdxTool = {
  name: "fix_duplicate_ids",
  description:
    "Repairs top-level body paragraphs that share the same id (see find_duplicate_ids). action=report previews the repair without changing anything; action=fix applies it: the first occurrence of each duplicated id (document order) keeps its id, every later occurrence gets a freshly minted uuid. After action=fix, call save_fdx to persist changes to disk.",
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string", description: "the path to the .fdx file" },
      action: { type: "string", description: "report (preview only) or fix (apply and mark the document dirty)" },
    },
    required: ["path", "action"],
  },
};

export async function handleFixDuplicateIds(args: Record<string, unknown> | undefined): Promise<ToolResult> {
  const path = arg<string>(args, "path");
  const action = arg<string>(args, "action");
  if (!path) return errResult("path is required");
  if (!hasFdxExtension(path)) return errResult("only .fdx files are supported");
  if (action !== "report" && action !== "fix") return errResult('action must be "report" or "fix"');

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errResult(`read error: ${message}`);
  }

  const plan = planDuplicateIdFixes(doc);
  if (plan.length === 0) {
    return pushCacheWarning(textResult("No duplicate paragraph ids found; nothing to fix."), warning);
  }

  if (action === "report") {
    return pushCacheWarning(textResult(JSON.stringify(plan, null, 2)), warning);
  }

  applyDuplicateIdFixes(doc, plan);
  const dirtyWarning = documentCache.touchDirty(path, doc);
  const msg = `Reassigned ids for ${plan.reduce((n, g) => n + g.reassigned.length, 0)} duplicate paragraph(s) across ${plan.length} id(s). File updated in cache — call save_fdx to persist changes to disk.\n${JSON.stringify(plan, null, 2)}`;
  return pushCacheWarning(pushCacheWarning(textResult(msg), dirtyWarning), warning);
}
