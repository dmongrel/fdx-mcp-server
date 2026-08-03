// SPDX-FileCopyrightText: 2026 Joel L. Caesar
// SPDX-License-Identifier: MIT

/**
 * Shared analysis engine behind get_script_stats, get_scene_index, get_character_appearances,
 * get_page_map, get_scene_arc_beats, get_scene_properties, and get_fdx_breakdown. Mirrors Go's
 * tools/breakdown.go: each tool is a thin wrapper that calls one of the build* functions here and
 * serializes the result to JSON, so the analysis logic is exercised once (breakdown.test.ts) and
 * reused identically everywhere.
 */

import type { FdxDocument } from "../fdx/document.ts";
import { createElement, findChild, findChildren, getAttr, type XmlElement, type XmlNode } from "../fdx/xml.ts";
import { getParagraphId, getParagraphType, paragraphText } from "../fdx/paragraph.ts";
import { isSectionType } from "../fdx/sections.ts";

export interface SceneInfo {
  id: string;
  type: string;
  text: string;
  page: number;
  length: number;
  color?: string;
  intro?: string;
  location?: string;
  timeOfDay?: string;
}

export interface CharacterAppearance {
  sceneId: string;
  sceneText: string;
  page: number;
  count: number;
}

export interface RankedCharacter {
  name: string;
  total: number;
  sceneCount: number;
}

export interface PageMapEntry {
  page: number;
  startIndex: number;
  endIndex: number;
}

export interface ScriptStats {
  totalPages: number;
  sceneCount: number;
  actBreakCount: number;
  paragraphCount: number;
  byType: Record<string, number>;
  adornmentStyleCount: number;
  winVoiceCount: number;
  totalTextRuns: number;
  curlyQuoteCount: number;
  flaggedWordCount: number;
  placeholderCount: number;
}

export interface CharacterArc {
  name: string;
  noteCount: number;
}

export interface ArcBeatData {
  sceneId: string;
  sceneText: string;
  beats: CharacterArc[];
}

export interface ScenePropertiesResult {
  color?: string;
  length?: string;
  lengthEights: number;
  page: number;
  title?: string;
}

/** Raw <Color>/<Length>/<Page>/<Title> attributes from a paragraph's <SceneProperties>, if present. */
export function getSceneProperties(p: XmlElement): { color: string; length: string; page: string; title: string } | undefined {
  const sp = findChild(p, "SceneProperties");
  if (!sp) return undefined;
  return {
    color: getAttr(sp, "Color") ?? "",
    length: getAttr(sp, "Length") ?? "",
    page: getAttr(sp, "Page") ?? "",
    title: getAttr(sp, "Title") ?? "",
  };
}

/** Returns a paragraph's <SceneProperties> element, creating an empty one if absent. */
export function getOrCreateSceneProperties(p: XmlElement): XmlElement {
  let sp = findChild(p, "SceneProperties");
  if (!sp) {
    sp = createElement("SceneProperties");
    p.children.push(sp);
  }
  return sp;
}

const PLACEHOLDER_RE = /^\[[\s\S]*\]$/;

/** True when a paragraph's full trimmed text is entirely one [...] span, regardless of Type. */
export function isPlaceholderParagraph(p: XmlElement): boolean {
  return PLACEHOLDER_RE.test(paragraphText(p).trim());
}

/** The <SceneArcBeats><CharacterArcBeat> entries nested inside a paragraph's <SceneProperties>. */
function getArcBeats(p: XmlElement): CharacterArc[] {
  const sp = findChild(p, "SceneProperties");
  const arcBeatsEl = sp && findChild(sp, "SceneArcBeats");
  if (!arcBeatsEl) return [];
  return findChildren(arcBeatsEl, "CharacterArcBeat").map((b) => ({
    name: getAttr(b, "Name") ?? "",
    noteCount: findChildren(b, "Paragraph").length,
  }));
}

/**
 * Converts a Length attribute string to a float count of eighths-of-a-page, FinalDraft's scene-
 * length unit. Recognized forms: "4/8" (fraction only), "1 4/8" (whole + fraction, space-
 * separated), and a bare integer like "6" (treated as 6/8, matching FinalDraft's own display). An
 * empty or unparsable string returns 0. Mirrors Go's parseSceneLength.
 */
export function parseSceneLength(s: string): number {
  const trimmed = s.trim();
  if (trimmed === "") return 0;

  let whole = 0;
  let frac = trimmed;
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx !== -1) {
    const w = parseInt(trimmed.slice(0, spaceIdx), 10);
    if (Number.isNaN(w)) return 0;
    whole = w;
    frac = trimmed.slice(spaceIdx + 1).trim();
  }

  const slashIdx = frac.indexOf("/");
  if (slashIdx !== -1) {
    const num = frac.slice(0, slashIdx).trim();
    const den = frac.slice(slashIdx + 1).trim();
    const n = parseInt(num, 10);
    const d = parseInt(den, 10);
    if (Number.isNaN(n) || Number.isNaN(d) || d === 0) return whole;
    return whole + n / d;
  }

  // Bare integer: FinalDraft reports scene length in eighths, so a lone number like "6" means 6/8.
  if (whole !== 0) {
    // A whole-number component already parsed alongside a non-fraction remainder is malformed;
    // fall back to just the whole part.
    return whole;
  }
  const n = parseInt(frac, 10);
  if (Number.isNaN(n)) return 0;
  return n / 8;
}

const ALPHA_OR_SLASH = /^[a-zA-Z/]$/;

/** Default TimesOfDay separator, matching SEPARATOR_DEFAULTS.timeofday in smart-type-ops.ts. */
const DEFAULT_TIME_OF_DAY_SEPARATOR = " - ";

/**
 * Parses a scene-heading (or similar) text into an intro token (e.g. "INT", "EXT", "I/E"), a
 * location, and a time of day.
 *
 * The time of day is whatever follows the *last* occurrence of the document's declared TimesOfDay
 * separator (its SmartType Separator attribute, defaulting to " - ") — structural, not dictionary-
 * gated. The TimesOfDay SmartType dictionary is an autocomplete history, not a description of the
 * document: FinalDraft never prunes it, so it accumulates stale entries (including ones that are
 * actually room names) and can equally be missing genuine time-of-day words the script uses. Matching
 * against it produced two failure modes: real times of day like "ALERT" or "MONTAGE" that never
 * made it into the dictionary stayed glued to the location, fragmenting one room into several
 * differently-keyed locations; and stale dictionary entries that happened to equal a location's
 * last word (e.g. a room called "BRIDGE" sitting in the dictionary from an old draft) got sliced
 * off the location entirely, inventing a phantom location out of what remained. If the separator
 * is absent from the heading, the entire remainder after the intro is the location and timeOfDay
 * is empty. Diverges from Go's parseSlugline, which matched dictionary-gated and had both defects.
 */
export function parseSlugline(doc: FdxDocument, text: string): { intro: string; location: string; timeOfDay: string } {
  const trimmed = text.trim();
  if (trimmed === "") return { intro: "", location: "", timeOfDay: "" };

  let intro = "";
  let locAndTime = trimmed;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]!;
    if (ALPHA_OR_SLASH.test(ch)) continue;
    intro = trimmed.slice(0, i).replace(/\/+$/, "");
    locAndTime = trimmed.slice(i).trim();
    break;
  }

  locAndTime = locAndTime.replace(/^[./ ]+/, "").trim();
  if (locAndTime === "") return { intro, location: "", timeOfDay: "" };

  const separator = doc.getSmartTypeSeparator("TimesOfDay") || DEFAULT_TIME_OF_DAY_SEPARATOR;
  const sepIndex = locAndTime.lastIndexOf(separator);
  if (sepIndex === -1) return { intro, location: locAndTime, timeOfDay: "" };

  const location = locAndTime.slice(0, sepIndex).trim();
  const timeOfDay = locAndTime.slice(sepIndex + separator.length).trim();
  if (timeOfDay === "") return { intro, location: locAndTime, timeOfDay: "" };
  return { intro, location, timeOfDay };
}

export interface SluglineLocation {
  intro: string;
  location: string;
  timeOfDay: string;
  /** Character offset of `location` within the original `text`, for splicing a replacement in. */
  start: number;
  end: number;
}

/**
 * Like parseSlugline, but also returns the character range the location occupies within `text` —
 * needed to splice a rename into a Scene Heading's actual <Text> runs without disturbing the
 * intro token, separators, or time-of-day around it.
 */
export function locateSluglineLocation(doc: FdxDocument, text: string): SluglineLocation | undefined {
  const { intro, location, timeOfDay } = parseSlugline(doc, text);
  if (location === "") return undefined;
  const searchFrom = intro ? text.indexOf(intro) + intro.length : 0;
  const start = text.indexOf(location, Math.max(searchFrom, 0));
  if (start === -1) return undefined;
  return { intro, location, timeOfDay, start, end: start + location.length };
}

/**
 * Scans every section-type paragraph (Scene Heading, Act Break, Act&Scene Break, etc.), extracts
 * its SceneProperties (Color/Length/Page) when present, and parses its text into
 * intro/location/timeOfDay via parseSlugline. Mirrors Go's buildSceneIndex.
 */
export function buildSceneIndex(doc: FdxDocument): SceneInfo[] {
  const out: SceneInfo[] = [];
  for (const p of doc.getParagraphElements()) {
    const type = getParagraphType(p);
    if (!isSectionType(type)) continue;
    const text = paragraphText(p);
    const sp = getSceneProperties(p);
    const page = sp ? parseInt(sp.page, 10) || 0 : 0;
    const { intro, location, timeOfDay } = parseSlugline(doc, text);
    out.push({
      id: getParagraphId(p),
      type,
      text,
      page,
      length: parseSceneLength(sp?.length ?? ""),
      color: sp?.color ?? undefined,
      intro: intro ?? undefined,
      location: location ?? undefined,
      timeOfDay: timeOfDay ?? undefined,
    });
  }
  return out;
}

/** The paragraph types buildCharacterAppearances scans for a character-name mention. */
const CHARACTER_PARAGRAPH_TYPES = new Set(["Character", "Parenthetical", "Dialogue"]);

/** Builds a lookup set from a SmartType Characters list for characterCueName. */
function characterNameSet(values: string[] | undefined): Set<string> {
  const set = new Set<string>();
  for (const name of values ?? []) {
    if (name !== "") set.add(name);
  }
  return set;
}

/**
 * Extracts the character name from a Character-paragraph's cue text (which may carry a trailing
 * extension/continuation like " (V.O.)" or " (CONT'D)") by matching the longest known-name prefix
 * against `names`. Falls back to the whole trimmed cue text when no known name matches. Mirrors
 * Go's characterCueName.
 */
function characterCueName(names: Set<string>, cue: string): string {
  const trimmed = cue.trim();
  if (trimmed === "") return "";
  if (names.has(trimmed)) return trimmed;
  const words = trimmed.split(/\s+/).filter(Boolean);
  for (let end = words.length - 1; end > 0; end--) {
    const candidate = words.slice(0, end).join(" ");
    if (names.has(candidate)) return candidate;
  }
  return trimmed;
}

/**
 * Walks the document scene by scene (using section-type boundaries) and, within each scene,
 * counts Character/Parenthetical/Dialogue paragraphs whose Character-cue name matches a known
 * SmartType Characters entry. Mirrors Go's buildCharacterAppearances.
 */
export function buildCharacterAppearances(doc: FdxDocument): Map<string, CharacterAppearance[]> {
  const result = new Map<string, CharacterAppearance[]>();
  const names = characterNameSet(doc.getSmartTypeList("Character")?.values);

  let sceneStarted = false;
  let sceneId = "";
  let sceneText = "";
  let scenePage = 0;
  let counts = new Map<string, number>();
  let currentSpeaker = "";

  const flush = () => {
    if (!sceneStarted) return;
    for (const [name, count] of counts) {
      if (count === 0) continue;
      const list = result.get(name) ?? [];
      list.push({ sceneId, sceneText, page: scenePage, count });
      result.set(name, list);
    }
  };

  for (const p of doc.getParagraphElements()) {
    const type = getParagraphType(p);
    if (isSectionType(type)) {
      flush();
      sceneStarted = true;
      sceneId = getParagraphId(p);
      sceneText = paragraphText(p);
      const sp = getSceneProperties(p);
      scenePage = sp ? parseInt(sp.page, 10) || 0 : 0;
      counts = new Map();
      currentSpeaker = "";
      continue;
    }
    if (!sceneStarted || !CHARACTER_PARAGRAPH_TYPES.has(type)) continue;
    if (type === "Character") {
      currentSpeaker = characterCueName(names, paragraphText(p));
    }
    if (currentSpeaker !== "") {
      counts.set(currentSpeaker, (counts.get(currentSpeaker) ?? 0) + 1);
    }
  }
  flush();

  return result;
}

/** Case-insensitive comparator with a stable raw-string tiebreak, for ranking ties. */
function compareNamesCI(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la < lb) return -1;
  if (la > lb) return 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Summarizes and sorts a character-appearances map by total mention count descending, tie-
 * breaking case-insensitively by name. Mirrors Go's rankCharacters.
 */
export function rankCharacters(appearances: Map<string, CharacterAppearance[]>): RankedCharacter[] {
  const ranked = [...appearances].map(([name, list]) => ({
    name,
    total: list.reduce((sum, a) => sum + a.count, 0),
    sceneCount: list.length,
  }));
  ranked.sort((a, b) => (a.total !== b.total ? b.total - a.total : compareNamesCI(a.name, b.name)));
  return ranked;
}

export interface LocationScene {
  id: string;
  text: string;
  page: number;
}

/**
 * Walks every Scene Heading paragraph (only Scene Heading — other section types like Act Break
 * don't carry a real location, and parseSlugline would misparse them as if they did) and groups
 * them by parsed location.
 */
export function buildLocationAppearances(doc: FdxDocument): Map<string, LocationScene[]> {
  const result = new Map<string, LocationScene[]>();
  for (const p of doc.getParagraphElements()) {
    if (getParagraphType(p) !== "Scene Heading") continue;
    const text = paragraphText(p);
    const loc = locateSluglineLocation(doc, text);
    if (!loc) continue;
    const sp = getSceneProperties(p);
    const page = sp ? parseInt(sp.page, 10) || 0 : 0;
    const list = result.get(loc.location) ?? [];
    list.push({ id: getParagraphId(p), text, page });
    result.set(loc.location, list);
  }
  return result;
}

export interface RankedLocation {
  location: string;
  total: number;
}

/** Summarizes and sorts a location-appearances map by scene count descending, tie-breaking
 *  case-insensitively by name. Mirrors rankCharacters. */
export function rankLocations(appearances: Map<string, LocationScene[]>): RankedLocation[] {
  const ranked = [...appearances].map(([location, scenes]) => ({ location, total: scenes.length }));
  ranked.sort((a, b) => (a.total !== b.total ? b.total - a.total : compareNamesCI(a.location, b.location)));
  return ranked;
}

/**
 * Walks the top-level paragraphs and groups paragraph indices by the most recent SceneProperties
 * Page value seen so far (paragraphs before the first page-bearing SceneProperties are attributed
 * to page 1). Mirrors Go's buildPageMap.
 */
export function buildPageMap(doc: FdxDocument): PageMapEntry[] {
  const paragraphs = doc.getParagraphElements();
  const out: PageMapEntry[] = [];
  let currentPage = 1;
  let start = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const sp = getSceneProperties(paragraphs[i]!);
    if (!sp || sp.page === "") continue;
    const page = parseInt(sp.page, 10);
    if (Number.isNaN(page) || page === currentPage) continue;
    if (i > start) {
      out.push({ page: currentPage, startIndex: start, endIndex: i - 1 });
    }
    start = i;
    currentPage = page;
  }
  if (paragraphs.length > 0) {
    out.push({ page: currentPage, startIndex: start, endIndex: paragraphs.length - 1 });
  }
  return out;
}

const CURLY_QUOTE_RE = /[“”‘’]/g;

interface IntegrityCounts {
  totalTextRuns: number;
  adornmentStyleCount: number;
  flaggedWordCount: number;
  curlyQuoteCount: number;
}

/**
 * Walks the whole document tree once, counting every <Text> run (styled or not), how many carry an
 * AdornmentStyle attribute at all, how many are specifically "-1" (Final Draft's proofing flag,
 * covering spelling and grammar both), and curly-quote characters in text-node content. Scoped to
 * the whole tree (not just top-level body paragraphs) since a raw-regex sweep isn't scoped that way
 * either. Never inspects attribute values for curly quotes, so <Actors>' WinVoice/MacVoice blobs
 * are excluded by construction, not by special-casing them.
 */
function walkIntegrityCounts(node: XmlNode, acc: IntegrityCounts): void {
  if (node.type === "text") {
    const matches = node.value.match(CURLY_QUOTE_RE);
    if (matches) acc.curlyQuoteCount += matches.length;
    return;
  }
  if (node.type !== "element") return;
  if (node.name === "Text") {
    acc.totalTextRuns++;
    const adornment = getAttr(node, "AdornmentStyle");
    if (adornment !== undefined) acc.adornmentStyleCount++;
    if (adornment === "-1") acc.flaggedWordCount++;
  }
  for (const child of node.children) walkIntegrityCounts(child, acc);
}

/** Counts <Actor> rows under <Actors> with a non-empty WinVoice value (not merely a present one — a
 *  default/never-assigned row still carries WinVoice="", which isn't a real voice occurrence). */
function countWinVoiceOccurrences(root: XmlElement): number {
  const actors = findChild(root, "Actors");
  if (!actors) return 0;
  return findChildren(actors, "Actor").filter((a) => (getAttr(a, "WinVoice") ?? "") !== "").length;
}

/**
 * Computes high-level document metrics: the highest SceneProperties.Page value seen (total
 * pages), the count of Scene Heading and Act&Scene Break/Act Break paragraphs, total paragraph
 * count, a per-type breakdown, and document integrity counts (AdornmentStyle/WinVoice/Text-run/
 * curly-quote/flagged-word occurrences). Mirrors Go's buildScriptStats plus the integrity counts.
 */
export function buildScriptStats(doc: FdxDocument, opts?: { excludePlaceholders?: boolean }): ScriptStats {
  const paragraphs = doc.getParagraphElements();
  const excludePlaceholders = opts?.excludePlaceholders ?? false;
  const stats: ScriptStats = {
    totalPages: 0,
    sceneCount: 0,
    actBreakCount: 0,
    paragraphCount: 0,
    byType: {},
    adornmentStyleCount: 0,
    winVoiceCount: 0,
    totalTextRuns: 0,
    curlyQuoteCount: 0,
    flaggedWordCount: 0,
    placeholderCount: 0,
  };
  for (const p of paragraphs) {
    const isPlaceholder = isPlaceholderParagraph(p);
    if (isPlaceholder) stats.placeholderCount++;

    // Computed unconditionally, before the exclusion check below, so totalPages is identical
    // whether or not excludePlaceholders is set.
    const sp = getSceneProperties(p);
    if (sp && sp.page !== "") {
      const page = parseInt(sp.page, 10);
      if (!Number.isNaN(page) && page > stats.totalPages) stats.totalPages = page;
    }

    if (excludePlaceholders && isPlaceholder) continue;

    stats.paragraphCount++;
    const type = getParagraphType(p);
    stats.byType[type] = (stats.byType[type] ?? 0) + 1;
    if (type.toLowerCase() === "scene heading") stats.sceneCount++;
    if (type.toLowerCase() === "act&scene break" || type.toLowerCase() === "act break") stats.actBreakCount++;
  }

  const integrity: IntegrityCounts = { totalTextRuns: 0, adornmentStyleCount: 0, flaggedWordCount: 0, curlyQuoteCount: 0 };
  walkIntegrityCounts(doc.root, integrity);
  stats.totalTextRuns = integrity.totalTextRuns;
  stats.adornmentStyleCount = integrity.adornmentStyleCount;
  stats.flaggedWordCount = integrity.flaggedWordCount;
  stats.curlyQuoteCount = integrity.curlyQuoteCount;
  stats.winVoiceCount = countWinVoiceOccurrences(doc.root);

  return stats;
}

/**
 * Extracts CharacterArcBeat entries from every paragraph's SceneProperties. Only scenes with at
 * least one arc beat are included. Mirrors Go's buildArcBeatData.
 */
export function buildArcBeatData(doc: FdxDocument): ArcBeatData[] {
  const out: ArcBeatData[] = [];
  for (const p of doc.getParagraphElements()) {
    const beats = getArcBeats(p);
    if (beats.length === 0) continue;
    out.push({ sceneId: getParagraphId(p), sceneText: paragraphText(p), beats });
  }
  return out;
}

/**
 * Counts Cast <Member> rows and CharacterArcBeat entries (across every scene) whose name matches
 * `name`, case-insensitively unless `cs`. Used to warn a caller removing a SmartType Characters
 * entry that Cast/arc-beat data still references the name they're about to orphan.
 */
export function countCharacterReferences(doc: FdxDocument, name: string, cs: boolean): { cast: number; arcBeats: number; highlighting: number; cueParagraphsExact: number; cueParagraphsSubstringOnly: number } {
  const match = (v: string) => (cs ? v === name : v.toLowerCase() === name.toLowerCase());
  const contains = (v: string) => (cs ? v.includes(name) : v.toLowerCase().includes(name.toLowerCase()));

  const cast = doc.getCastMembers().filter((m) => match(getAttr(m, "Character") ?? "")).length;

  let arcBeats = 0;
  for (const p of doc.getParagraphElements()) {
    const sp = findChild(p, "SceneProperties");
    const arcBeatsEl = sp && findChild(sp, "SceneArcBeats");
    if (!arcBeatsEl) continue;
    arcBeats += findChildren(arcBeatsEl, "CharacterArcBeat").filter((b) => match(getAttr(b, "Name") ?? "")).length;
  }

  const highlighting = doc.getHighlightedCharacters().filter((c) => match(getAttr(c, "Name") ?? "")).length;

  let cueParagraphsExact = 0;
  let cueParagraphsSubstringOnly = 0;
  for (const p of doc.getParagraphElements()) {
    if (getParagraphType(p) !== "Character") continue;
    const text = paragraphText(p);
    if (match(text)) cueParagraphsExact++;
    else if (contains(text)) cueParagraphsSubstringOnly++;
  }

  return { cast, arcBeats, highlighting, cueParagraphsExact, cueParagraphsSubstringOnly };
}

/** Retrieves one paragraph's SceneProperties by id, parsed into the get_scene_properties JSON shape. */
export function getScenePropertiesById(doc: FdxDocument, id: string): ScenePropertiesResult | null | undefined {
  const p = doc.getParagraphElements().find((el) => getParagraphId(el) === id);
  if (!p) return null; // not found
  const sp = getSceneProperties(p);
  if (!sp) return undefined; // found but no SceneProperties
  return {
    color: sp.color ?? undefined,
    length: sp.length ?? undefined,
    lengthEights: parseSceneLength(sp.length),
    page: parseInt(sp.page, 10) || 0,
    title: sp.title ?? undefined,
  };
}

