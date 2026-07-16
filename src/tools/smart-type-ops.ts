/**
 * Shared machinery behind the six dedicated SmartType tool pairs (Characters, Extensions,
 * SceneIntros, Locations, TimesOfDay, Transitions) plus the spell-check ignore-words list, which
 * shares the same cleanup engine. Each get_<list>/edit_<list> tool file is a thin wrapper naming a
 * leaf-element type and deferring to runSmartListGet/runSmartListEdit here. Mirrors Go's
 * tools/smart_type_ops.go — every edit auto-alphabetizes the list case-insensitively.
 */

import type { FdxDocument } from "../fdx/document.ts";
import { documentCache } from "../fdx/cache.ts";
import { getCachedFdx, hasFdxExtension, pushCacheWarning, textResult, errResult } from "./shared.ts";
import type { ToolResult, FdxTool } from "./shared.ts";

/** The tool-agnostic description of one list mutation (create/edit/remove/fix). */
export interface SmartListEdit {
  action?: string;
  find?: string;
  replace?: string;
  value?: string;
  cs?: boolean;
  uppercase?: boolean;
  dedup?: boolean;
}

/** Renders an edit tool's action verb in the past tense for success messages. */
export function actionPastTense(a: string): string {
  switch (a) {
    case "create":
      return "created";
    case "edit":
      return "edited";
    case "remove":
      return "removed";
    default:
      return a + "d";
  }
}

/** Strips leading/trailing whitespace and line breaks. */
export function normalizeEntry(s: string): string {
  return s.trim();
}

/** Case-insensitive ASCII-fold comparator with raw-byte tiebreak, for deterministic sorting. */
function foldCompare(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la < lb) return -1;
  if (la > lb) return 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Alphabetizes the list in place, case-insensitively. */
export function sortListCI(list: string[]): void {
  list.sort(foldCompare);
}

/** Removes duplicate entries in place (exact, case-sensitive match), keeping the first occurrence. */
export function dedupList(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of list) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

/** Trims whitespace on every entry in place. */
function normalizeList(list: string[]): string[] {
  return list.map(normalizeEntry);
}

/** Uppercases every entry. */
function upperList(list: string[]): string[] {
  return list.map((v) => v.toUpperCase());
}

/**
 * The "fix" body: normalize whitespace on every entry, optionally uppercase, optionally dedup,
 * then always alphabetize case-insensitively. Returns a new array (does not mutate in place, since
 * JS arrays passed by reference are simpler to reassign at the call site).
 */
export function applyCleanups(list: string[], uppercase: boolean, dedup: boolean): string[] {
  let out = normalizeList(list);
  if (uppercase) out = upperList(out);
  if (dedup) out = dedupList(out);
  sortListCI(out);
  return out;
}

/** Returns the index of the first entry equal to find (case-insensitive unless cs), or -1. */
function findEntry(list: string[], find: string, cs: boolean): number {
  for (let i = 0; i < list.length; i++) {
    const v = list[i]!;
    if (v === find || (!cs && v.toLowerCase() === find.toLowerCase())) return i;
  }
  return -1;
}

/**
 * Applies one create/edit/remove/fix action to a SmartType-style string list, then runs the
 * shared cleanups. Returns the updated list on success, or a failure reason.
 */
export function editSmartList(
  list: string[],
  e: SmartListEdit,
): { ok: true; list: string[] } | { ok: false; reason: string } {
  let working = [...list];
  const action = (e.action ?? "").toLowerCase();

  switch (action) {
    case "create": {
      const v = normalizeEntry(e.value ?? "");
      if (v === "") return { ok: false, reason: "create requires a non-empty value" };
      working.push(v);
      break;
    }
    case "edit": {
      if (!e.find) return { ok: false, reason: "edit requires find" };
      const r = normalizeEntry(e.replace ?? "");
      if (r === "") return { ok: false, reason: "edit requires a non-empty replace" };
      const idx = findEntry(working, e.find, !!e.cs);
      if (idx === -1) return { ok: false, reason: "find value not found: " + e.find };
      working[idx] = r;
      break;
    }
    case "remove": {
      if (!e.find) return { ok: false, reason: "remove requires find" };
      const idx = findEntry(working, e.find, !!e.cs);
      if (idx === -1) return { ok: false, reason: "find value not found: " + e.find };
      working.splice(idx, 1);
      break;
    }
    case "fix":
      // No value change; the cleanups below do the work.
      break;
    default:
      return { ok: false, reason: "action must be 'create', 'edit', 'remove', or 'fix'" };
  }

  working = applyCleanups(working, !!e.uppercase, !!e.dedup);
  return { ok: true, list: working };
}

/** Leaf names that carry a container Separator attribute, with their per-list default. */
const SEPARATOR_DEFAULTS: Record<string, string> = {
  sceneintro: ". ",
  timeofday: " - ",
};

function separatorTarget(leaf: string): { wrapper: "SceneIntros" | "TimesOfDay"; def: string } | undefined {
  const key = leaf.toLowerCase();
  if (key === "sceneintro") return { wrapper: "SceneIntros", def: SEPARATOR_DEFAULTS.sceneintro! };
  if (key === "timeofday") return { wrapper: "TimesOfDay", def: SEPARATOR_DEFAULTS.timeofday! };
  return undefined;
}

/**
 * Renders a SmartType list for a get_<list> tool: newline-joined entries in document order, or a
 * friendly empty message. When the leaf carries a separator, the effective separator is reported
 * on a leading line, quoted so surrounding spaces are visible.
 */
export async function runSmartListGet(path: string, leaf: string, noun: string): Promise<ToolResult> {
  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const list = doc.getSmartTypeList(leaf);
  if (!list) return errResult(`internal error: unknown smart type ${leaf}`);

  const lines: string[] = [];
  const sepTarget = separatorTarget(leaf);
  if (sepTarget) {
    const sep = doc.getSmartTypeSeparator(sepTarget.wrapper) || sepTarget.def;
    lines.push(`Separator: ${JSON.stringify(sep)}`);
  }
  if (list.values.length === 0) {
    lines.push(`No ${noun} entries`);
  } else {
    lines.push(list.values.join("\n"));
  }

  return pushCacheWarning(textResult(lines.join("\n")), warning);
}

/**
 * Applies one create/edit/remove/fix action (and, for separator lists, an optional separator
 * change) to the cached document and re-stores it. `separator` is applied only when non-empty.
 */
export async function runSmartListEdit(
  path: string,
  leaf: string,
  noun: string,
  e: SmartListEdit,
  separator: string | undefined,
  setSeparator: boolean,
): Promise<ToolResult> {
  if (!hasFdxExtension(path)) {
    return errResult("only .fdx files are supported");
  }

  let doc: FdxDocument;
  let warning: string;
  try {
    ({ doc, warning } = await getCachedFdx(path));
  } catch (err) {
    return errResult(`read error: ${err instanceof Error ? err.message : String(err)}`);
  }

  const list = doc.getSmartTypeList(leaf);
  if (!list) return errResult(`internal error: unknown smart type ${leaf}`);

  let sepUpdated = false;
  if (setSeparator && separator) {
    const sepTarget = separatorTarget(leaf);
    if (sepTarget) {
      doc.setSmartTypeSeparator(sepTarget.wrapper, separator);
      sepUpdated = true;
    }
  }

  if (e.action) {
    const result = editSmartList(list.values, e);
    if (!result.ok) {
      return errResult(`failed to ${e.action} ${noun} entry: ${result.reason}`);
    }
    doc.setSmartTypeList(leaf, result.list);
  } else if (!sepUpdated) {
    return errResult("action is required (or provide a separator to change)");
  }

  const dirtyWarning = documentCache.touchDirty(path, doc);

  let msg: string;
  if (e.action) {
    msg = `Successfully ${actionPastTense(e.action)} ${noun} list.`;
  } else {
    msg = `Updated ${noun} separator.`;
  }
  if (sepUpdated && e.action) msg += " Separator updated.";
  msg += " File updated in cache — call save_fdx to persist changes to disk.";

  let result = textResult(msg);
  result = pushCacheWarning(result, warning);
  result = pushCacheWarning(result, dirtyWarning);
  return result;
}

/** Shared trailing help appended to every edit_<list> tool description. */
export const EDIT_ACTIONS_HELP =
  " action=create appends value; action=edit replaces the first entry equal to find (case-insensitive unless cs=true) with replace; action=remove deletes the first entry equal to find; action=fix just cleans the list. Optional uppercase and dedup flags post-process the list, which is always alphabetized case-insensitively after any change. After editing, call save_fdx to persist changes to disk.";

function badPath(): ToolResult {
  return errResult("path is required");
}

/** Builds a get_<list> tool + handler pair for a plain SmartType leaf. */
export function makeSmartListGetTool(name: string, description: string, leaf: string, noun: string) {
  const tool: FdxTool = {
    name,
    description,
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "the path to the .fdx file" },
      },
      required: ["path"],
    },
  };
  async function handler(args: Record<string, unknown> | undefined): Promise<ToolResult> {
    const path = args?.path as string | undefined;
    if (!path) return badPath();
    return runSmartListGet(path, leaf, noun);
  }
  return { tool, handler };
}

const EDIT_LIST_PROPERTIES = {
  path: { type: "string", description: "the path to the .fdx file" },
  action: { type: "string", description: "create, edit, remove, or fix" },
  find: { type: "string", description: "(edit/remove) the existing entry value to change or delete" },
  replace: { type: "string", description: "(edit) the value to replace the found entry with" },
  value: { type: "string", description: "(create) the new entry value to append to the end of the list" },
  cs: { type: "boolean", description: "(edit/remove) match find case-sensitively (default false)" },
  uppercase: { type: "boolean", description: "uppercase every entry in the list after the change" },
  dedup: { type: "boolean", description: "remove duplicate entries (exact, case-sensitive match) after the change" },
};

/** Builds an edit_<list> tool + handler pair for a plain (no-separator) SmartType leaf. */
export function makeSmartListEditTool(name: string, description: string, leaf: string, noun: string) {
  const tool: FdxTool = {
    name,
    description: description + EDIT_ACTIONS_HELP,
    inputSchema: {
      type: "object",
      properties: EDIT_LIST_PROPERTIES,
      required: ["path", "action"],
    },
  };
  async function handler(args: Record<string, unknown> | undefined): Promise<ToolResult> {
    const path = args?.path as string | undefined;
    if (!path) return badPath();
    const e: SmartListEdit = {
      action: args?.action as string | undefined,
      find: args?.find as string | undefined,
      replace: args?.replace as string | undefined,
      value: args?.value as string | undefined,
      cs: args?.cs as boolean | undefined,
      uppercase: args?.uppercase as boolean | undefined,
      dedup: args?.dedup as boolean | undefined,
    };
    return runSmartListEdit(path, leaf, noun, e, undefined, false);
  }
  return { tool, handler };
}

/** Builds an edit_<list> tool + handler pair for a separator-bearing SmartType leaf. */
export function makeSmartSeparatorEditTool(name: string, description: string, leaf: string, noun: string) {
  const tool: FdxTool = {
    name,
    description:
      description +
      " Pass separator to set the single container Separator attribute (may be sent alone)." +
      EDIT_ACTIONS_HELP,
    inputSchema: {
      type: "object",
      properties: {
        ...EDIT_LIST_PROPERTIES,
        action: { type: "string", description: "create, edit, remove, or fix (omit to change only the separator)" },
        separator: {
          type: "string",
          description: "set the container Separator attribute (the string joining scene-heading parts)",
        },
      },
      required: ["path"],
    },
  };
  async function handler(args: Record<string, unknown> | undefined): Promise<ToolResult> {
    const path = args?.path as string | undefined;
    if (!path) return badPath();
    const e: SmartListEdit = {
      action: args?.action as string | undefined,
      find: args?.find as string | undefined,
      replace: args?.replace as string | undefined,
      value: args?.value as string | undefined,
      cs: args?.cs as boolean | undefined,
      uppercase: args?.uppercase as boolean | undefined,
      dedup: args?.dedup as boolean | undefined,
    };
    const separator = args?.separator as string | undefined;
    return runSmartListEdit(path, leaf, noun, e, separator, true);
  }
  return { tool, handler };
}
