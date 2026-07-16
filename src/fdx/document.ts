/**
 * FdxDocument wraps a parsed FinalDraft .fdx XML tree (see xml.ts) and provides the small set of
 * typed operations Phase 0/1 tooling needs: round-trip parse/serialize, SmartType dictionary
 * dedup, spell-check-word consolidation, and DocumentRef timestamp stamping.
 *
 * Everything this server does not yet model in detail (revisions, macros, tag data, page layout,
 * ...) simply stays in the generic XmlElement tree untouched, so it survives parse -> save
 * losslessly without needing a bespoke TypeScript type for every Go struct up front. Later phases
 * add focused accessors (paragraphs, title page, element settings, ...) directly on top of this
 * same tree as each tool is ported.
 */

import {
  type ParsedXmlDocument,
  type XmlElement,
  parseXml,
  serializeXml,
  getAttr,
  setAttr,
  findChild,
  findChildren,
  getOrCreateChild,
  textContent,
  createElement,
  cloneNode,
} from "./xml.ts";
import { fdxDateTimeNow } from "./uuid.ts";

/** The six SmartType auto-complete dictionaries, as (wrapper element, leaf element) name pairs. */
const SMART_TYPE_LEAVES: Array<{ wrapper: string; leaf: string }> = [
  { wrapper: "Characters", leaf: "Character" },
  { wrapper: "Extensions", leaf: "Extension" },
  { wrapper: "SceneIntros", leaf: "SceneIntro" },
  { wrapper: "Locations", leaf: "Location" },
  { wrapper: "TimesOfDay", leaf: "TimeOfDay" },
  { wrapper: "Transitions", leaf: "Transition" },
];

export function isKnownSmartTypeLeaf(leaf: string): boolean {
  return SMART_TYPE_LEAVES.some((l) => l.leaf.toLowerCase() === leaf.toLowerCase());
}

function findAllDescendants(el: XmlElement, name: string, out: XmlElement[] = []): XmlElement[] {
  for (const child of el.children) {
    if (child.type !== "element") continue;
    if (child.name === name) out.push(child);
    findAllDescendants(child, name, out);
  }
  return out;
}

function dedupPreserveOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

function sortCaseInsensitive(values: string[]): string[] {
  return [...values].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()) || a.localeCompare(b));
}

export class FdxDocument {
  constructor(
    private parsed: ParsedXmlDocument,
    /** The filesystem path this document was loaded from/saved to most recently, if any. */
    public path?: string,
  ) {}

  static parse(source: string, path?: string): FdxDocument {
    const parsed = parseXml(source);
    if (parsed.root.name !== "FinalDraft") {
      throw new Error(`expected <FinalDraft> root element, found <${parsed.root.name}>`);
    }
    return new FdxDocument(parsed, path);
  }

  /** The raw root <FinalDraft> element; unmodeled blocks live directly under here untouched. */
  get root(): XmlElement {
    return this.parsed.root;
  }

  get version(): string {
    return getAttr(this.root, "Version") ?? "";
  }

  clone(): FdxDocument {
    return new FdxDocument(
      { declaration: this.parsed.declaration, root: cloneNode(this.parsed.root) },
      this.path,
    );
  }

  serialize(): string {
    return serializeXml(this.parsed);
  }

  /* ---------------------------------------------------------------- */
  /*  DocumentRef                                                      */
  /* ---------------------------------------------------------------- */

  /** Refreshes <DocumentRef DateTime="..."> to the current time; a no-op if the block is absent. */
  touchDocumentRef(now: Date = new Date()): void {
    const ref = findChild(this.root, "DocumentRef");
    if (!ref) return;
    setAttr(ref, "DateTime", fdxDateTimeNow(now));
  }

  /* ---------------------------------------------------------------- */
  /*  Content > Paragraph (top-level body paragraphs)                 */
  /* ---------------------------------------------------------------- */

  getContentElement(create = false): XmlElement | undefined {
    let content = findChild(this.root, "Content");
    if (!content && create) {
      content = createElement("Content");
      // <Content> is written immediately after <DocumentRef> in FinalDraft's own ordering.
      const refIdx = this.root.children.findIndex((c) => c.type === "element" && c.name === "DocumentRef");
      if (refIdx === -1) this.root.children.unshift(content);
      else this.root.children.splice(refIdx + 1, 0, content);
    }
    return content;
  }

  /** All top-level body paragraphs, in document order (does not descend into DualDialogue). */
  getParagraphElements(): XmlElement[] {
    const content = this.getContentElement();
    return content ? findChildren(content, "Paragraph") : [];
  }

  /* ---------------------------------------------------------------- */
  /*  TitlePage > Content > Paragraph                                  */
  /* ---------------------------------------------------------------- */

  getTitlePageElement(create = false): XmlElement | undefined {
    let tp = findChild(this.root, "TitlePage");
    if (!tp && create) {
      tp = createElement("TitlePage");
      this.root.children.push(tp);
    }
    return tp;
  }

  getTitlePageContentElement(create = false): XmlElement | undefined {
    const tp = this.getTitlePageElement(create);
    if (!tp) return undefined;
    return create ? getOrCreateChild(tp, "Content") : findChild(tp, "Content");
  }

  /** All title-page body paragraphs, in document order. */
  getTitlePageParagraphs(): XmlElement[] {
    const content = this.getTitlePageContentElement();
    return content ? findChildren(content, "Paragraph") : [];
  }

  /** Replaces the title page's <Content> paragraph list wholesale, in the given order. */
  setTitlePageParagraphs(paragraphs: XmlElement[]): void {
    const content = this.getTitlePageContentElement(true)!;
    content.children = paragraphs;
  }

  /** Replaces the entire <TitlePage> element (HeaderAndFooter/Content/TextState) with `newTp`. */
  replaceTitlePageElement(newTp: XmlElement): void {
    const idx = this.root.children.findIndex((c) => c.type === "element" && c.name === "TitlePage");
    if (idx === -1) this.root.children.push(newTp);
    else this.root.children[idx] = newTp;
  }

  /* ---------------------------------------------------------------- */
  /*  ElementSettings (top-level, repeated by Type)                    */
  /* ---------------------------------------------------------------- */

  /** All <ElementSettings> elements, in document order. */
  getElementSettingsElements(): XmlElement[] {
    return findChildren(this.root, "ElementSettings");
  }

  /** The <ElementSettings Type="..."> element for an exact (case-sensitive) type match, if any. */
  findElementSettingsElement(type: string): XmlElement | undefined {
    return this.getElementSettingsElements().find((es) => getAttr(es, "Type") === type);
  }

  /** Appends a new <ElementSettings> element. Caller is responsible for checking it doesn't already exist. */
  addElementSettingsElement(es: XmlElement): void {
    this.root.children.push(es);
  }

  /** Removes the <ElementSettings Type="..."> element for an exact type match. Returns whether one was removed. */
  removeElementSettingsElement(type: string): boolean {
    const idx = this.root.children.findIndex((c) => c.type === "element" && c.name === "ElementSettings" && getAttr(c, "Type") === type);
    if (idx === -1) return false;
    this.root.children.splice(idx, 1);
    return true;
  }

  /* ---------------------------------------------------------------- */
  /*  HeaderAndFooter (top-level body slot; title page slot lives on   */
  /*  the TitlePage element and is handled by the title-page helpers)  */
  /* ---------------------------------------------------------------- */

  /** The body <HeaderAndFooter> element (FinalDraft writes at most one), if any. */
  getBodyHeaderAndFooterElement(): XmlElement | undefined {
    return findChild(this.root, "HeaderAndFooter");
  }

  /** Replaces the body <HeaderAndFooter> element wholesale (inserting if absent). */
  setBodyHeaderAndFooterElement(hf: XmlElement): void {
    const idx = this.root.children.findIndex((c) => c.type === "element" && c.name === "HeaderAndFooter");
    if (idx === -1) this.root.children.push(hf);
    else this.root.children[idx] = hf;
  }

  /** Removes the body <HeaderAndFooter> element. Returns whether one was present. */
  removeBodyHeaderAndFooterElement(): boolean {
    const idx = this.root.children.findIndex((c) => c.type === "element" && c.name === "HeaderAndFooter");
    if (idx === -1) return false;
    this.root.children.splice(idx, 1);
    return true;
  }

  /** The title page's <HeaderAndFooter> element, if any (TitlePage must already exist). */
  getTitlePageHeaderAndFooterElement(create = false): XmlElement | undefined {
    const tp = this.getTitlePageElement(create);
    if (!tp) return undefined;
    return create ? getOrCreateChild(tp, "HeaderAndFooter") : findChild(tp, "HeaderAndFooter");
  }

  /** Replaces the title page's <HeaderAndFooter> element wholesale (inserting if absent). */
  setTitlePageHeaderAndFooterElement(hf: XmlElement): void {
    const tp = this.getTitlePageElement(true)!;
    const idx = tp.children.findIndex((c) => c.type === "element" && c.name === "HeaderAndFooter");
    if (idx === -1) tp.children.unshift(hf);
    else tp.children[idx] = hf;
  }

  /* ---------------------------------------------------------------- */
  /*  SmartType dictionaries                                           */
  /* ---------------------------------------------------------------- */

  private getSmartTypeElement(create = false): XmlElement | undefined {
    let st = findChild(this.root, "SmartType");
    if (!st && create) {
      st = createElement("SmartType");
      this.root.children.push(st);
    }
    return st;
  }

  /** Returns the leaf element name and entry strings (in document order) for a SmartType leaf. */
  getSmartTypeList(leaf: string): { leaf: string; wrapper: string; values: string[] } | undefined {
    const spec = SMART_TYPE_LEAVES.find((l) => l.leaf.toLowerCase() === leaf.toLowerCase());
    if (!spec) return undefined;
    const st = this.getSmartTypeElement();
    const wrapper = st ? findChild(st, spec.wrapper) : undefined;
    const values = wrapper ? findChildren(wrapper, spec.leaf).map(textContent) : [];
    return { leaf: spec.leaf, wrapper: spec.wrapper, values };
  }

  /** Replaces a SmartType leaf list's entries with `values`, in the given order. */
  setSmartTypeList(leaf: string, values: string[]): void {
    const spec = SMART_TYPE_LEAVES.find((l) => l.leaf.toLowerCase() === leaf.toLowerCase());
    if (!spec) throw new Error(`unknown SmartType list: ${leaf}`);
    const st = this.getSmartTypeElement(true)!;
    const wrapper = getOrCreateChild(st, spec.wrapper);
    wrapper.children = wrapper.children.filter((c) => !(c.type === "element" && c.name === spec.leaf));
    for (const v of values) {
      wrapper.children.push(createElement(spec.leaf, [], [{ type: "text", value: v }]));
    }
  }

  /** Returns the effective Separator attribute for SceneIntros/TimesOfDay (undefined if absent). */
  getSmartTypeSeparator(wrapperName: "SceneIntros" | "TimesOfDay"): string | undefined {
    const st = this.getSmartTypeElement();
    const wrapper = st ? findChild(st, wrapperName) : undefined;
    return wrapper ? getAttr(wrapper, "Separator") : undefined;
  }

  /** Sets the container Separator attribute on a SceneIntros/TimesOfDay wrapper, creating it if absent. */
  setSmartTypeSeparator(wrapperName: "SceneIntros" | "TimesOfDay", value: string): void {
    const st = this.getSmartTypeElement(true)!;
    const wrapper = getOrCreateChild(st, wrapperName);
    setAttr(wrapper, "Separator", value);
  }

  /**
   * Removes duplicate entries (exact, case-sensitive match) from all six SmartType lists in
   * place, keeping the first occurrence, then alphabetizes each list case-insensitively. Mirrors
   * Go's dedupAllLists, run once after loading a document.
   */
  dedupSmartTypeLists(): void {
    for (const { leaf } of SMART_TYPE_LEAVES) {
      const list = this.getSmartTypeList(leaf);
      if (!list || list.values.length === 0) continue;
      const deduped = sortCaseInsensitive(dedupPreserveOrder(list.values));
      this.setSmartTypeList(leaf, deduped);
    }
  }

  /* ---------------------------------------------------------------- */
  /*  Spell-check ignore words                                         */
  /* ---------------------------------------------------------------- */

  private getTopLevelIgnoredWordsElement(create = false): XmlElement | undefined {
    let scil = findChild(this.root, "SpellCheckIgnoreLists");
    if (!scil) {
      if (!create) return undefined;
      scil = createElement("SpellCheckIgnoreLists");
      this.root.children.push(scil);
    }
    return getOrCreateChild(scil, "IgnoredWords");
  }

  getIgnoredWords(): string[] {
    const iw = this.getTopLevelIgnoredWordsElement();
    return iw ? findChildren(iw, "Word").map(textContent) : [];
  }

  setIgnoredWords(words: string[]): void {
    const iw = this.getTopLevelIgnoredWordsElement(true)!;
    iw.children = iw.children.filter((c) => !(c.type === "element" && c.name === "Word"));
    for (const w of words) {
      iw.children.push(createElement("Word", [], [{ type: "text", value: w }]));
    }
  }

  /** Reports how many ignore-in-place <Range> spans the top-level SpellCheckIgnoreLists carries. */
  getIgnoredRangeCount(): number {
    const scil = findChild(this.root, "SpellCheckIgnoreLists");
    const ranges = scil && findChild(scil, "IgnoredRanges");
    return ranges ? findChildren(ranges, "Range").length : 0;
  }

  /**
   * Folds any stray <Word> entries nested inside a DualDialogue's own <SpellCheckIgnoreLists>
   * into the single canonical top-level list, deduping and alphabetizing the merged result.
   * Returns the number of words harvested from nested blocks. Safe (no-op) to call on every save.
   */
  consolidateSpellCheckWords(): number {
    const content = this.getContentElement();
    if (!content) return 0;

    const harvested: string[] = [];
    for (const para of findAllDescendants(content, "Paragraph")) {
      const dd = findChild(para, "DualDialogue");
      const nestedScil = dd && findChild(dd, "SpellCheckIgnoreLists");
      const nestedWords = nestedScil && findChild(nestedScil, "IgnoredWords");
      if (!nestedWords) continue;
      for (const wordEl of findChildren(nestedWords, "Word")) {
        const w = textContent(wordEl).trim();
        if (w !== "") harvested.push(w);
      }
      nestedWords.children = nestedWords.children.filter((c) => !(c.type === "element" && c.name === "Word"));
    }

    if (harvested.length === 0) return 0;
    const merged = sortCaseInsensitive(dedupPreserveOrder([...this.getIgnoredWords(), ...harvested]));
    this.setIgnoredWords(merged);
    return harvested.length;
  }
}
