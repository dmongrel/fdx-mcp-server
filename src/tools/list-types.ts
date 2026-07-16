/**
 * list_types — curated catalog of known FinalDraft paragraph types, grouped by class (section /
 * other) and alphabetized within each class. Reads no document. Mirrors Go's tools/list_types.go;
 * `sectionTypes`/`otherTypes`/`knownType` are also the shared source of truth used by edit_par
 * (type validation) and the get_section* tools (section-boundary detection).
 */

import type { FdxTool } from "./shared.ts";
import { textResult } from "./shared.ts";

/** Structural / section-heading paragraph types. */
export const sectionTypes: string[] = [
  "Act Break",
  "Act&Scene Break",
  "Book Part",
  "Concl",
  "End of Act",
  "Episode Head",
  "Outline 1",
  "Outline 2",
  "Scene Heading",
  "Script Note",
  "Section Heading",
  "Sequence Heading",
  "Subtitle",
  "Tag",
  "Teaser",
  "Title",
];

/** Dialogue-level, camera direction, and general body paragraph types. */
export const otherTypes: string[] = [
  "Action",
  "Cast List",
  "Character",
  "Character Extension",
  "Dialogue",
  "Dual Dialogue",
  "General",
  "Note",
  "Outline Body",
  "Parenthetical",
  "Scene Summary",
  "Shot",
  "Transition",
];

const sectionTypeSet = new Set(sectionTypes.map((t) => t.toLowerCase()));

/** Case-insensitive membership test against the full curated catalog (section + other). */
export function knownType(t: string): boolean {
  if (!t) return false;
  const lower = t.toLowerCase();
  return sectionTypeSet.has(lower) || otherTypes.some((o) => o.toLowerCase() === lower);
}

/** Case-insensitive membership test against just the section-type catalog. */
export function isSectionType(t: string): boolean {
  return sectionTypeSet.has(t.toLowerCase());
}

function sortCI(values: string[]): string[] {
  return [...values].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

function writeClass(lines: string[], name: string, types: string[]): void {
  lines.push(`${name}:`);
  for (const t of sortCI(types)) lines.push(`  ${t}`);
}

/** Renders the curated catalog as readable text, grouped by class; class filters to one class. */
export function listTypesText(cls?: string): string {
  const lines: string[] = [];
  switch ((cls ?? "").toLowerCase()) {
    case "section":
      writeClass(lines, "section", sectionTypes);
      break;
    case "other":
      writeClass(lines, "other", otherTypes);
      break;
    default:
      writeClass(lines, "section", sectionTypes);
      writeClass(lines, "other", otherTypes);
      break;
  }
  return lines.join("\n") + "\n";
}

export const listTypesTool: FdxTool = {
  name: "list_types",
  description:
    "List all known FinalDraft paragraph types by class (section / other), alphabetized within each class. Use this to discover valid paragraph type values for edit_par and element settings lookups. Optionally pass class ('section' or 'other') to show just one class; both are shown (section first) when omitted.",
  inputSchema: {
    type: "object",
    properties: {
      class: {
        type: "string",
        description: "optional class filter: 'section', 'other', or 'all' (default)",
      },
    },
  },
};

export function handleListTypes(args: Record<string, unknown> | undefined) {
  const cls = args?.class as string | undefined;
  return textResult(listTypesText(cls));
}
