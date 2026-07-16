/**
 * Shared data aggregation + text/HTML renderers for get_fdx_breakdown. Mirrors Go's
 * tools/get_fdx_breakdown.go: buildBreakdownData runs every analysis builder once and derives the
 * summary metrics (scene-length extremes, production flags) shared by all three output renderers
 * (text/html/pdf — pdf lives in breakdown-pdf.ts since it's a materially different concern).
 */

import type { FdxDocument } from "../fdx/document.ts";
import { paragraphText } from "../fdx/paragraph.ts";
import {
  buildArcBeatData,
  buildCharacterAppearances,
  buildPageMap,
  buildSceneIndex,
  buildScriptStats,
  rankCharacters,
  type ArcBeatData,
  type CharacterAppearance,
  type PageMapEntry,
  type RankedCharacter,
  type SceneInfo,
  type ScriptStats,
} from "./breakdown.ts";

export interface BreakdownData {
  title: string;
  stats: ScriptStats;
  sortedTypes: string[];
  scenes: SceneInfo[];
  acts: SceneInfo[];
  appearances: Map<string, CharacterAppearance[]>;
  rankedChars: RankedCharacter[];
  pageMap: PageMapEntry[];
  arcs: ArcBeatData[];
  totalLength: number;
  shortestIdx: number;
  longestIdx: number;
  colorCoded: number;
  overOnePage: number;
  missingTime: number;
  noArcChars: string[];
}

function isActType(type: string): boolean {
  const t = type.toLowerCase();
  return t === "act&scene break" || t === "act break";
}

/** Runs every analysis builder once and derives the summary metrics get_fdx_breakdown reports. */
export function buildBreakdownData(doc: FdxDocument): BreakdownData {
  let title = "";
  for (const p of doc.getTitlePageParagraphs()) {
    const t = paragraphText(p).trim();
    if (t !== "") {
      title = t;
      break;
    }
  }

  const stats = buildScriptStats(doc);
  const allScenes = buildSceneIndex(doc);
  const appearances = buildCharacterAppearances(doc);
  const pageMap = buildPageMap(doc);
  const arcs = buildArcBeatData(doc);

  const scenes: SceneInfo[] = [];
  const acts: SceneInfo[] = [];
  for (const s of allScenes) {
    if (isActType(s.type)) acts.push(s);
    else scenes.push(s);
  }

  const sortedTypes = Object.keys(stats.byType).sort();
  const rankedChars = rankCharacters(appearances);

  const data: BreakdownData = {
    title,
    stats,
    sortedTypes,
    scenes,
    acts,
    appearances,
    rankedChars,
    pageMap,
    arcs,
    totalLength: 0,
    shortestIdx: -1,
    longestIdx: -1,
    colorCoded: 0,
    overOnePage: 0,
    missingTime: 0,
    noArcChars: [],
  };

  scenes.forEach((s, i) => {
    data.totalLength += s.length;
    if (data.shortestIdx === -1 || s.length < scenes[data.shortestIdx]!.length) data.shortestIdx = i;
    if (data.longestIdx === -1 || s.length > scenes[data.longestIdx]!.length) data.longestIdx = i;
    if (s.color) data.colorCoded++;
    if (s.length > 1) data.overOnePage++;
    if (!s.timeOfDay) data.missingTime++;
  });

  const arcNames = new Set<string>();
  for (const a of arcs) {
    for (const b of a.beats) arcNames.add(b.name.toUpperCase());
  }
  const noArc: string[] = [];
  for (const name of appearances.keys()) {
    if (!arcNames.has(name.toUpperCase())) noArc.push(name);
  }
  noArc.sort();
  data.noArcChars = noArc;

  return data;
}

const LINE_WIDTH = 80;

/**
 * Wraps a comma-joined string (e.g. the no-arc-beats character list) to lines no wider than
 * maxWidth, breaking only at ", " boundaries so names are never split mid-word. Mirrors Go's
 * writeWrapped.
 */
function wrapJoined(indent: string, s: string, maxWidth: number): string {
  const parts = s.split(", ");
  const lines: string[] = [];
  let line = indent;
  let first = true;
  for (const part of parts) {
    const candidate = first ? part : `, ${part}`;
    if (!first && line.length + candidate.length > maxWidth) {
      lines.push(line);
      line = indent + part;
    } else {
      line += candidate;
    }
    first = false;
  }
  if (line !== indent) lines.push(line);
  return lines.join("\n") + (lines.length ? "\n" : "");
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + " ".repeat(width - s.length);
}

/** Formats like Go's %.3g — up to 3 significant digits, trimming trailing zeros. */
function fmt3g(n: number): string {
  if (n === 0) return "0";
  return parseFloat(n.toPrecision(3)).toString();
}

export function renderBreakdownText(d: BreakdownData): string {
  const lines: string[] = [];
  const rule = "=".repeat(LINE_WIDTH);
  const title = d.title || "(untitled)";

  lines.push(rule);
  lines.push(`  SCRIPT BREAKDOWN - ${title}`);
  lines.push(rule, "");

  lines.push("DOCUMENT OVERVIEW");
  lines.push(`  Total Pages:        ${d.stats.totalPages}`);
  lines.push(`  Total Paragraphs:   ${d.stats.paragraphCount}`);
  lines.push(`  Scenes:             ${d.stats.sceneCount}`);
  lines.push(`  Act Breaks:         ${d.stats.actBreakCount}`, "");

  lines.push("PARAGRAPH BREAKDOWN");
  for (const t of d.sortedTypes) {
    lines.push(`  ${pad(t, 20)}${d.stats.byType[t]}`);
  }
  lines.push("");

  if (d.acts.length > 0) {
    lines.push("ACT STRUCTURE");
    for (const a of d.acts) {
      const label = a.text.trim() || a.type;
      lines.push(`  ${pad(label, 38)}(page ${a.page})`);
    }
    lines.push("");
  }

  lines.push(`SCENE CATALOG  (total scripted pages: ${fmt3g(d.totalLength)})`);
  lines.push("  #   Page  Len    Intro   Location");
  lines.push("  --  ----  -----  ------  --------");
  d.scenes.forEach((s, i) => {
    let loc = s.location ?? "";
    if (loc.length > 40) loc = loc.slice(0, 37) + "...";
    let line = `  ${pad(String(i + 1), 4)}${pad(String(s.page), 6)}${pad(s.length.toFixed(2), 7)}${pad(s.intro ?? "", 8)}${loc}`;
    if (s.timeOfDay) line += ` - ${s.timeOfDay}`;
    lines.push(line);
  });
  lines.push("");

  lines.push("CHARACTER FREQUENCY (top 10)");
  for (const c of d.rankedChars.slice(0, 10)) {
    lines.push(`  ${pad(c.name, 14)}${c.total} appearances in ${c.sceneCount} scenes`);
  }
  lines.push("");

  lines.push("SCENE-LENGTH ANALYSIS");
  if (d.shortestIdx >= 0) {
    lines.push(`  Shortest:     ${fmt3g(d.scenes[d.shortestIdx]!.length)} pages (scene #${d.shortestIdx + 1})`);
  }
  if (d.longestIdx >= 0) {
    lines.push(`  Longest:      ${fmt3g(d.scenes[d.longestIdx]!.length)} pages (scene #${d.longestIdx + 1})`);
  }
  if (d.scenes.length > 0) {
    lines.push(`  Average:      ${fmt3g(d.totalLength / d.scenes.length)} pages`);
  }
  lines.push(`  Total scripted: ${fmt3g(d.totalLength)} pages`, "");

  lines.push("PRODUCTION FLAGS");
  lines.push(`  Color-coded scenes:    ${d.colorCoded} of ${d.scenes.length}`);
  lines.push(`  Scenes > 1 page:       ${d.overOnePage}`);
  lines.push(`  Missing time-of-day:   ${d.missingTime}`);
  if (d.noArcChars.length > 0) {
    lines.push(`  Characters without arc beats: ${d.noArcChars.length}`);
    lines.push(wrapJoined("    ", d.noArcChars.join(", "), LINE_WIDTH).replace(/\n$/, ""));
  } else {
    lines.push("  Characters without arc beats: 0");
  }
  lines.push(rule);

  return lines.join("\n") + "\n";
}

const HTML_ESCAPE_MAP: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => HTML_ESCAPE_MAP[c]!);
}

function statDiv(label: string, value: number): string {
  return `<div class="stat"><div class="n">${value}</div><div class="l">${escapeHtml(label)}</div></div>`;
}

export function renderBreakdownHtml(d: BreakdownData): string {
  const title = d.title || "(untitled)";
  const parts: string[] = [];

  parts.push(`<!doctype html><html><head><meta charset="utf-8">`);
  parts.push(`<title>Script Breakdown &mdash; ${escapeHtml(title)}</title>`);
  parts.push(`<style>
body{font-family:system-ui,-apple-system,Segoe UI,Arial,sans-serif;margin:2rem;color:#1a1a1a;background:#fff}
h1{font-size:1.6rem;margin-bottom:.25rem}
h2{font-size:1.15rem;margin-top:2rem;border-bottom:2px solid #4A90D9;padding-bottom:.25rem}
.stats{display:flex;flex-wrap:wrap;gap:1rem;margin:1rem 0}
.stat{background:#f3f6fa;border:1px solid #dde5ee;border-radius:8px;padding:.75rem 1rem;min-width:120px}
.stat .n{font-size:1.5rem;font-weight:700;color:#2a5f9e}
.stat .l{font-size:.8rem;color:#556}
table{border-collapse:collapse;width:100%;font-size:.9rem}
th,td{text-align:left;padding:.35rem .6rem;border-bottom:1px solid #e3e8ee}
tr:nth-child(even) td{background:#f8fafc}
th{background:#4A90D9;color:#fff}
.mono{font-family:"Courier Final Draft",Courier,monospace}
.flags{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.75rem}
.flag{background:#f3f6fa;border-radius:8px;padding:.6rem .9rem}
@media print{table{page-break-inside:avoid}}
@media (prefers-color-scheme: dark){
body{background:#1a1d21;color:#e5e7eb}
.stat,.flag{background:#25292f;border-color:#333}
tr:nth-child(even) td{background:#20242a}
th,td{border-color:#333}
}
</style></head><body>`);

  parts.push(`<h1>Script Breakdown &mdash; ${escapeHtml(title)}</h1>`);

  parts.push(`<section id="overview"><h2>Document Overview</h2><div class="stats">`);
  parts.push(statDiv("Total Pages", d.stats.totalPages));
  parts.push(statDiv("Total Paragraphs", d.stats.paragraphCount));
  parts.push(statDiv("Scenes", d.stats.sceneCount));
  parts.push(statDiv("Act Breaks", d.stats.actBreakCount));
  parts.push(`</div></section>`);

  parts.push(`<section id="paragraphs"><h2>Paragraph Breakdown</h2><table><tr><th>Type</th><th>Count</th></tr>`);
  for (const t of d.sortedTypes) {
    parts.push(`<tr><td>${escapeHtml(t)}</td><td>${d.stats.byType[t]}</td></tr>`);
  }
  parts.push(`</table></section>`);

  if (d.acts.length > 0) {
    parts.push(`<section id="acts"><h2>Act Structure</h2><table><tr><th>Act</th><th>Page</th></tr>`);
    for (const a of d.acts) {
      const label = a.text.trim() || a.type;
      parts.push(`<tr><td>${escapeHtml(label)}</td><td>${a.page}</td></tr>`);
    }
    parts.push(`</table></section>`);
  }

  parts.push(`<section id="scenes"><h2>Scene Catalog (total scripted pages: ${fmt3g(d.totalLength)})</h2>`);
  parts.push(`<table><tr><th>#</th><th>Page</th><th>Length</th><th>Intro</th><th>Location</th><th>Time</th></tr>`);
  d.scenes.forEach((s, i) => {
    parts.push(
      `<tr><td>${i + 1}</td><td>${s.page}</td><td>${s.length.toFixed(2)}</td><td>${escapeHtml(s.intro ?? "")}</td><td>${escapeHtml(s.location ?? "")}</td><td>${escapeHtml(s.timeOfDay ?? "")}</td></tr>`,
    );
  });
  parts.push(`</table></section>`);

  parts.push(
    `<section id="characters"><h2>Character Frequency</h2><table><tr><th>#</th><th>Character</th><th>Appearances</th><th>Scenes</th></tr>`,
  );
  d.rankedChars.forEach((c, i) => {
    parts.push(`<tr><td>${i + 1}</td><td>${escapeHtml(c.name)}</td><td>${c.total}</td><td>${c.sceneCount}</td></tr>`);
  });
  parts.push(`</table></section>`);

  parts.push(`<section id="analysis"><h2>Scene-Length Analysis &amp; Production Flags</h2><div class="flags">`);
  if (d.shortestIdx >= 0) {
    parts.push(`<div class="flag">Shortest: ${fmt3g(d.scenes[d.shortestIdx]!.length)} pages (scene #${d.shortestIdx + 1})</div>`);
  }
  if (d.longestIdx >= 0) {
    parts.push(`<div class="flag">Longest: ${fmt3g(d.scenes[d.longestIdx]!.length)} pages (scene #${d.longestIdx + 1})</div>`);
  }
  if (d.scenes.length > 0) {
    parts.push(`<div class="flag">Average: ${fmt3g(d.totalLength / d.scenes.length)} pages</div>`);
  }
  parts.push(`<div class="flag">Color-coded scenes: ${d.colorCoded} of ${d.scenes.length}</div>`);
  parts.push(`<div class="flag">Scenes &gt; 1 page: ${d.overOnePage}</div>`);
  parts.push(`<div class="flag">Missing time-of-day: ${d.missingTime}</div>`);
  if (d.noArcChars.length > 0) {
    parts.push(`<div class="flag">Characters without arc beats: ${d.noArcChars.length} (${escapeHtml(d.noArcChars.join(", "))})</div>`);
  } else {
    parts.push(`<div class="flag">Characters without arc beats: 0</div>`);
  }
  parts.push(`</div></section>`);

  parts.push(`</body></html>`);
  return parts.join("");
}
