// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * Shared ElementSettings (paragraph-type formatting style) machinery: the type catalog and the
 * create/edit field-application logic used by edit_element_settings. Mirrors Go's
 * tools/edit_element_settings.go.
 */

import { type XmlElement, createElement, getAttr, getOrCreateChild, setAttr } from "./xml.ts";

/**
 * The hardcoded catalog of paragraph types that can carry an ElementSettings record. Separate from
 * list_types' sectionTypes/otherTypes catalog: it includes Header/Footer and excludes Act&Scene
 * Break, matching FinalDraft's element-settings type set rather than the section/other classification.
 */
export const elementSettingTypes: string[] = [
  "Act Break",
  "Action",
  "Book Part",
  "Cast List",
  "Character",
  "Character Extension",
  "Concl",
  "Dialogue",
  "Dual Dialogue",
  "End of Act",
  "Episode Head",
  "Footer",
  "General",
  "Header",
  "New Act",
  "Note",
  "Outline 1",
  "Outline 2",
  "Outline Body",
  "Parenthetical",
  "Scene Heading",
  "Scene Summary",
  "Script Note",
  "Section Heading",
  "Sequence Heading",
  "Shot",
  "Show/Ep. Title",
  "Subtitle",
  "Tag",
  "Teaser",
  "Title",
  "Transition",
];

/** Exact (case-sensitive) membership test against the ElementSettings type catalog. */
export function knownElementSettingType(t: string): boolean {
  return elementSettingTypes.includes(t);
}

export interface EditElementSettingsRequest {
  type: string;
  font?: string;
  fontSize?: string;
  fontStyle?: string;
  fontColor?: string;
  adornmentStyle?: string;
  revisionId?: string;
  alignment?: string;
  firstIndent?: string;
  leading?: string;
  leftIndent?: string;
  rightIndent?: string;
  spaceBefore?: string;
  spacing?: string;
  startsNewPage?: string;
  paginateAs?: string;
  returnKey?: string;
  shortcut?: string;
  tabKey?: string;
  winShortcut?: string;
  canHide?: string;
  outlineLevel?: string;
}

/** Builds a fresh <ElementSettings Type="..."> element with the four child specs (all attrs present, empty when unset). */
export function buildElementSettingsElement(req: EditElementSettingsRequest): XmlElement {
  const es = createElement("ElementSettings", [["Type", req.type]]);
  applyElementSettingsFields(es, req);
  return es;
}

/** Applies only non-empty request fields onto an existing (or freshly built) <ElementSettings> element. */
export function applyElementSettingsFields(es: XmlElement, req: EditElementSettingsRequest): void {
  const fontSpec = getOrCreateChild(es, "FontSpec");
  const paragraphSpec = getOrCreateChild(es, "ParagraphSpec");
  const behavior = getOrCreateChild(es, "Behavior");
  const outline = getOrCreateChild(es, "Outline");

  const apply = (el: XmlElement, attr: string, val: string | undefined) => {
    if (val) setAttr(el, attr, val);
  };

  apply(fontSpec, "Font", req.font);
  apply(fontSpec, "Size", req.fontSize);
  apply(fontSpec, "Style", req.fontStyle);
  apply(fontSpec, "Color", req.fontColor);
  apply(fontSpec, "AdornmentStyle", req.adornmentStyle);
  apply(fontSpec, "RevisionID", req.revisionId);

  apply(paragraphSpec, "Alignment", req.alignment);
  apply(paragraphSpec, "FirstIndent", req.firstIndent);
  apply(paragraphSpec, "Leading", req.leading);
  apply(paragraphSpec, "LeftIndent", req.leftIndent);
  apply(paragraphSpec, "RightIndent", req.rightIndent);
  apply(paragraphSpec, "SpaceBefore", req.spaceBefore);
  apply(paragraphSpec, "Spacing", req.spacing);
  apply(paragraphSpec, "StartsNewPage", req.startsNewPage);

  apply(behavior, "PaginateAs", req.paginateAs);
  apply(behavior, "ReturnKey", req.returnKey);
  apply(behavior, "Shortcut", req.shortcut);
  apply(behavior, "TabKey", req.tabKey);
  apply(behavior, "WinShortcut", req.winShortcut);

  apply(outline, "CanHide", req.canHide);
  apply(outline, "Level", req.outlineLevel);

  // Enforce the invariant: ParagraphSpec.Type always mirrors the ElementSettings.Type.
  setAttr(paragraphSpec, "Type", req.type);
}

export function getElementSettingsType(es: XmlElement): string {
  return getAttr(es, "Type") ?? "";
}

