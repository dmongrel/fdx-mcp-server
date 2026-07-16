/**
 * Shared read helpers for the <Macros> block, used by get_macro_alias_list and get_macro_alias.
 * Mirrors the Macro/Alias/ActivateIn shape modeled in Go's fdx/fdx.go (fdx-mcp-server side reads
 * it straight out of the generic XML tree rather than a typed struct — see src/fdx/document.ts's
 * header comment on the "typed accessors only where a tool needs them" approach).
 */

import type { FdxDocument } from "../fdx/document.ts";
import { findChild, findChildren, getAttr, type XmlElement } from "../fdx/xml.ts";

export interface MacroInfo {
  element: string;
  name: string;
  shortcut: string;
  text: string;
  transition: string;
  alias?: {
    confirm: string;
    matchCase: string;
    smartReplace: string;
    wordOnly: string;
    text: string;
    activateIn: string[];
  };
}

function readMacro(el: XmlElement): MacroInfo {
  const info: MacroInfo = {
    element: getAttr(el, "Element") ?? "",
    name: getAttr(el, "Name") ?? "",
    shortcut: getAttr(el, "Shortcut") ?? "",
    text: getAttr(el, "Text") ?? "",
    transition: getAttr(el, "Transition") ?? "",
  };
  const aliasEl = findChild(el, "Alias");
  if (aliasEl) {
    info.alias = {
      confirm: getAttr(aliasEl, "Confirm") ?? "",
      matchCase: getAttr(aliasEl, "MatchCase") ?? "",
      smartReplace: getAttr(aliasEl, "SmartReplace") ?? "",
      wordOnly: getAttr(aliasEl, "WordOnly") ?? "",
      text: getAttr(aliasEl, "Text") ?? "",
      activateIn: findChildren(aliasEl, "ActivateIn").map((ai) => getAttr(ai, "Element") ?? ""),
    };
  }
  return info;
}

/** Returns every <Macro> under the document's top-level <Macros> block, in document order. */
export function getMacros(doc: FdxDocument): MacroInfo[] {
  const macrosEl = findChild(doc.root, "Macros");
  if (!macrosEl) return [];
  return findChildren(macrosEl, "Macro").map(readMacro);
}

/** Renders one macro the way Go's get_macro_alias_list/get_macro_alias format each entry. */
export function formatMacro(m: MacroInfo): string {
  let out = `Element=${JSON.stringify(m.element)} Name=${JSON.stringify(m.name)} Shortcut=${JSON.stringify(m.shortcut)} Text=${JSON.stringify(m.text)} Transition=${JSON.stringify(m.transition)}`;
  if (m.alias) {
    out += `\n  Alias: Confirm=${JSON.stringify(m.alias.confirm)} MatchCase=${JSON.stringify(m.alias.matchCase)} SmartReplace=${JSON.stringify(m.alias.smartReplace)} WordOnly=${JSON.stringify(m.alias.wordOnly)} Text=${JSON.stringify(m.alias.text)}`;
    if (m.alias.activateIn.length > 0) {
      out += `\n    ActivateIn: ${m.alias.activateIn.join(", ")}`;
    }
  }
  return out;
}
