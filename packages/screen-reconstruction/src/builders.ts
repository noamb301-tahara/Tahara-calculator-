import { labelSimilarity, slugify, type BBox, type FrameAnalysis, type FramesAnalysisResult, type NavItem, type OcrLine, type ScreenElement } from "@studio/shared";
import { analyzeLayout, cluster } from "@studio/frame-analysis";

/**
 * Builders that turn OCR'd source frames into ScreenDefinition parts.
 * Faithful by default: real labels, same hierarchy, same order, same rough
 * placement — new visuals come from the style preset, not from the source.
 */

export const BUTTON_WORDS = /^(save|cancel|send|submit|invite|add|create|new|delete|remove|continue|next|back|done|apply|confirm|ok|close|upload|download|export|import|share|edit|update|connect|sign in|sign up|log in|get started|manage|view all|learn more)\b/i;

const NAV_ICONS: [RegExp, string][] = [
  [/dashboard|overview/i, "dashboard"],
  [/home/i, "home"],
  [/project|folder|files?/i, "folder"],
  [/team|member|people|users|contacts/i, "users"],
  [/calendar|schedule|events?/i, "calendar"],
  [/setting|preferences/i, "settings"],
  [/report|analytic|insight|stats/i, "chart"],
  [/message|inbox|chat/i, "message"],
  [/billing|payment|invoice|plan/i, "credit-card"],
  [/help|support/i, "help"],
  [/task|todo/i, "check-circle"],
  [/product|store|shop/i, "store"],
  [/order|cart/i, "cart"],
  [/security|privacy/i, "shield"],
  [/notification|alerts?/i, "bell"],
  [/integration|apps?|plugins?/i, "layers"],
  [/profile|account/i, "user"],
  [/mail|email/i, "mail"],
  [/doc/i, "file-text"],
];

export function iconFor(label: string): string | undefined {
  return NAV_ICONS.find(([re]) => re.test(label))?.[1];
}

export function idFor(prefix: string, label: string): string {
  return `${prefix}-${slugify(label, 30)}`;
}

/** Remove OCR junk: single glyphs, stray capitals glued to labels ("Team IN"). */
export function cleanLabel(text: string): string {
  let t = text.replace(/[|_~`^]+/g, " ").replace(/\s+/g, " ").trim();
  t = t.replace(/\s+([A-Z]{1,2})$/, (m, tok: string) => (/^(ID|OK|UI|AI|TV|PM|AM|US|UK|EU|IP|QR|PC)$/.test(tok) ? m : "")).replace(/^[^\p{L}\p{N}$@#+(]+/u, "");
  return t.trim();
}

export function isJunk(line: OcrLine): boolean {
  const t = cleanLabel(line.text);
  if (t.length < 2) return true;
  if (!/[\p{L}\p{N}]{2}/u.test(t)) return true;
  if (/^[\p{L}]$/u.test(t)) return true;
  return false;
}

export interface AppModel {
  appName: string;
  region: BBox;
  chrome: FramesAnalysisResult["chrome"];
  /** Sidebar nav, labels voted across frames (OCR noise-tolerant). */
  nav: NavItem[];
  /** Horizontal navigation in the top bar (apps without a sidebar). */
  topNav: NavItem[];
  navRight: number;
  search: string | null;
  hasAvatar: boolean;
}

/** Build the persistent app chrome (sidebar, top bar) from all frames. */
export function buildAppModel(frames: FramesAnalysisResult, appName: string): AppModel {
  const region = frames.region;
  const sideLines: OcrLine[] = [];
  const topLines: OcrLine[] = [];
  let search: string | null = null;
  let hasAvatar = false;
  let navRight = region.x;
  for (const f of frames.analyses) {
    const L = analyzeLayout(f.ocr.lines.filter((l) => !isJunk(l)), region, frames.chrome);
    sideLines.push(...L.sidebar);
    for (const l of L.sidebar) navRight = Math.max(navRight, l.bbox.x + l.bbox.w);
    for (const l of L.topbar) {
      if (/^search/i.test(l.text)) search = cleanLabel(l.text);
      else if (!/^[A-Z0-9]{1,2}$/.test(l.text.trim()) && l.text.split(/\s+/).length <= 3 && l.source !== "control") topLines.push(l);
      if (/^[A-Z0-9]{1,2}$/.test(l.text.trim()) && l.bbox.x > region.x + region.w * 0.7) hasAvatar = true;
    }
  }
  // Vote labels per vertical slot.
  const slots = cluster(sideLines, (l) => l.bbox.y + l.bbox.h / 2, 14);
  const minVotes = Math.max(1, Math.floor(frames.analyses.length * 0.15));
  const nav: NavItem[] = [];
  let first = true;
  for (const lines of slots.values()) {
    if (lines.length < minVotes) continue;
    const counts = new Map<string, number>();
    for (const l of lines) {
      const c = cleanLabel(l.text);
      if (c.length >= 2) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const label = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!label) continue;
    // The top-most, usually larger line is the product logo.
    if (first && labelSimilarity(label, appName) > 0.8) {
      first = false;
      continue;
    }
    first = false;
    nav.push({ id: idFor("nav", label), label, icon: iconFor(label) });
  }
  // Top navigation: short labels voted per horizontal slot (brand excluded).
  const topNav: NavItem[] = [];
  for (const lines of cluster(topLines, (l) => l.bbox.x + l.bbox.w / 2, 30).values()) {
    if (lines.length < minVotes) continue;
    const counts = new Map<string, number>();
    for (const l of lines) {
      const c = cleanLabel(l.text);
      if (c.length >= 2) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    const label = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!label || labelSimilarity(label, appName) > 0.8) continue;
    topNav.push({ id: idFor("nav", label), label, icon: iconFor(label) });
  }
  return { appName, region, chrome: frames.chrome, nav, topNav: topNav.length >= 2 ? topNav : [], navRight, search, hasAvatar };
}

/** Lines of the page itself (not sidebar/topbar/captions/dialogs/junk). */
const TOAST_WORDS = /\b(sent|saved|success|successfully|enabled|disabled|created|added|updated|deleted|removed|invited|copied)\b/i;

export function pageLines(frame: FrameAnalysis, app: AppModel, exclude: BBox | null): OcrLine[] {
  const L = analyzeLayout(frame.ocr.lines.filter((l) => !isJunk(l)), app.region, app.chrome);
  return L.content.filter(
    (l) =>
      l.bbox.x > app.navRight - 2 &&
      !(exclude && inside(l.bbox, exclude)) &&
      // Lone 1–2 capital letters in the page are avatar initials, not content.
      !/^[A-Z]{1,2}$/.test(l.text.trim()) &&
      // Toasts are transient overlays, not page content.
      !(l.source === "control" && TOAST_WORDS.test(l.text) && l.bbox.y > app.region.y + app.region.h * 0.6),
  );
}

export function inside(b: BBox, r: BBox): boolean {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
}

export function unionOf(lines: { bbox: BBox }[]): BBox | null {
  if (!lines.length) return null;
  const x = Math.min(...lines.map((l) => l.bbox.x));
  const y = Math.min(...lines.map((l) => l.bbox.y));
  return { x, y, w: Math.max(...lines.map((l) => l.bbox.x + l.bbox.w)) - x, h: Math.max(...lines.map((l) => l.bbox.y + l.bbox.h)) - y };
}

export interface PageModel {
  title: string | null;
  headerActions: ScreenElement[];
  content: ScreenElement[];
}

/**
 * Page body from OCR lines: header (title + buttons on its row), tables,
 * metric cards, buttons and text — in source order.
 */
export function buildPage(lines: OcrLine[]): PageModel {
  const sorted = [...lines].sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  const textLines = sorted.filter((l) => l.source !== "control");
  const upper = textLines.slice(0, Math.max(1, Math.ceil(textLines.length / 3)));
  const titleLine = upper.length ? upper.reduce((a, b) => (b.bbox.h > a.bbox.h * 1.15 ? b : a)) : null;
  const used = new Set<OcrLine>();
  let title: string | null = null;
  const headerActions: ScreenElement[] = [];
  if (titleLine) {
    used.add(titleLine);
    title = cleanLabel(titleLine.text);
    const cy = titleLine.bbox.y + titleLine.bbox.h / 2;
    for (const l of sorted) {
      if (l === titleLine) continue;
      const lcy = l.bbox.y + l.bbox.h / 2;
      if (Math.abs(lcy - cy) < 45 && l.bbox.x > titleLine.bbox.x + titleLine.bbox.w && (l.source === "control" || BUTTON_WORDS.test(l.text))) {
        used.add(l);
        const label = cleanLabel(l.text);
        headerActions.push({ kind: "button", id: idFor("btn", label), label, variant: l.source === "control" ? "primary" : "secondary" });
      }
    }
  }

  type Block = { y: number; el: ScreenElement };
  const blocks: Block[] = [];

  // Tabs: a row of ≥3 short labels right under the title.
  if (titleLine) {
    const below = sorted.filter((l) => !used.has(l) && l.bbox.y > titleLine.bbox.y && l.bbox.y - (titleLine.bbox.y + titleLine.bbox.h) < 110 && l.source !== "control");
    for (const row of cluster(below, (l) => l.bbox.y + l.bbox.h / 2, 10).values()) {
      const short = row.filter((l) => l.text.split(/\s+/).length <= 2 && !BUTTON_WORDS.test(l.text));
      // A table header looks the same, but rows of cells aligned to its columns follow it.
      const xs = row.map((l) => l.bbox.x);
      const rowY = row[0]!.bbox.y;
      const isHeader = [...cluster(sorted.filter((l) => l.bbox.y > rowY + 10 && l.bbox.y < rowY + 260), (l) => l.bbox.y + l.bbox.h / 2, 9).values()].some(
        (r) => r.length >= 2 && r.filter((c) => xs.some((x) => Math.abs(c.bbox.x - x) < 25)).length >= Math.min(3, row.length),
      );
      if (short.length >= 3 && short.length === row.length && !isHeader) {
        const tabs = row.sort((a, b) => a.bbox.x - b.bbox.x).map((l) => ({ id: idFor("tab", cleanLabel(l.text)), label: cleanLabel(l.text) }));
        for (const l of row) used.add(l);
        blocks.push({ y: row[0]!.bbox.y, el: { kind: "tabs", id: idFor("tabs", tabs.map((t) => t.label).join(" ")), tabs, active: tabs[0]!.id } });
        break;
      }
    }
  }

  // Settings rows: a bold label with a muted description right under it and nothing
  // readable to its right (the control — usually a switch — is graphical).
  for (const l of sorted) {
    if (used.has(l) || l.source === "control" || /\d/.test(l.text)) continue;
    const desc = sorted.find((d) => d !== l && !used.has(d) && d.source !== "control" && d.bbox.y > l.bbox.y && d.bbox.y - (l.bbox.y + l.bbox.h) < 26 && Math.abs(d.bbox.x - l.bbox.x) < 12 && d.text.length > l.text.length);
    if (!desc || l.text.split(/\s+/).length > 4) continue;
    const rowRight = sorted.filter((o) => o !== l && Math.abs(o.bbox.y + o.bbox.h / 2 - (l.bbox.y + l.bbox.h / 2)) < 30 && o.bbox.x > l.bbox.x + l.bbox.w + 40 && /[a-z]{3}/i.test(o.text));
    if (rowRight.length) continue;
    used.add(l);
    used.add(desc);
    const label = cleanLabel(l.text);
    blocks.push({ y: l.bbox.y, el: { kind: "setting_row", id: idFor("row", label), label, description: cleanLabel(desc.text), control: { kind: "toggle", id: idFor("toggle", label), label, on: true } } });
  }

  // Tables: consecutive rows of ≥3 aligned cells.
  const rest = sorted.filter((l) => !used.has(l));
  let rows = [...cluster(rest, (l) => l.bbox.y + l.bbox.h / 2, 9).values()].filter((r) => r.length >= 3).map((r) => r.sort((a, b) => a.bbox.x - b.bbox.x));
  // Two-column tables: ≥3 consecutive rows of 2 cells with the same column starts.
  const pairs = [...cluster(rest, (l) => l.bbox.y + l.bbox.h / 2, 9).values()].filter((r) => r.length === 2).map((r) => r.sort((a, b) => a.bbox.x - b.bbox.x));
  const aligned = pairs.filter((p) => pairs.filter((q) => Math.abs(q[0]!.bbox.x - p[0]!.bbox.x) < 20 && Math.abs(q[1]!.bbox.x - p[1]!.bbox.x) < 20).length >= 3);
  rows = [...rows, ...aligned];
  if (rows.length >= 2) {
    // Group rows whose vertical gap is regular into one table.
    rows.sort((a, b) => a[0]!.bbox.y - b[0]!.bbox.y);
    let group: OcrLine[][] = [rows[0]!];
    const flush = () => {
      if (group.length >= 2) {
        const header = group[0]!;
        const colX = header.map((c) => c.bbox.x);
        const columns = header.map((c) => cleanLabel(c.text));
        const body = group.slice(1).map((r, i) => {
          const cells = columns.map(() => "");
          for (const c of r) {
            let best = 0;
            for (let k = 1; k < colX.length; k++) if (Math.abs(colX[k]! - c.bbox.x) < Math.abs(colX[best]! - c.bbox.x)) best = k;
            cells[best] = cells[best] ? `${cells[best]} ${cleanLabel(c.text)}` : cleanLabel(c.text);
          }
          return { id: `row-${i + 1}`, cells };
        });
        for (const r of group) for (const c of r) used.add(c);
        blocks.push({ y: header[0]!.bbox.y, el: { kind: "table", id: idFor("table", columns.join(" ")), columns, rows: body } });
      }
    };
    for (let i = 1; i < rows.length; i++) {
      const prev = group[group.length - 1]!;
      if (rows[i]![0]!.bbox.y - prev[0]!.bbox.y < 110) group.push(rows[i]!);
      else {
        flush();
        group = [rows[i]!];
      }
    }
    flush();
  }

  // Metric cards: small label with a larger value right below.
  const remaining = sorted.filter((l) => !used.has(l));
  const metrics: { y: number; x: number; el: ScreenElement }[] = [];
  for (const l of remaining) {
    if (used.has(l)) continue;
    const value = remaining.find((v) => !used.has(v) && v !== l && v.bbox.y > l.bbox.y && v.bbox.y - (l.bbox.y + l.bbox.h) < 30 && Math.abs(v.bbox.x - l.bbox.x) < 25 && v.bbox.h >= l.bbox.h * 1.05 && /\d/.test(v.text));
    if (value && !/\d/.test(l.text)) {
      used.add(l);
      used.add(value);
      metrics.push({ y: l.bbox.y, x: l.bbox.x, el: { kind: "metric", label: cleanLabel(l.text), value: cleanLabel(value.text) } });
    }
  }
  // Metrics on the same row → grid.
  for (const row of cluster(metrics, (m) => m.y, 20).values()) {
    const els = row.sort((a, b) => a.x - b.x).map((m) => m.el);
    blocks.push({ y: row[0]!.y, el: els.length > 1 ? { kind: "grid", columns: Math.min(els.length, 3), children: els } : els[0]! });
  }

  for (const l of sorted) {
    if (used.has(l)) continue;
    const label = cleanLabel(l.text);
    if (l.source === "control" || (BUTTON_WORDS.test(label) && label.split(" ").length <= 3)) {
      blocks.push({ y: l.bbox.y, el: { kind: "button", id: idFor("btn", label), label, variant: l.source === "control" ? "primary" : "secondary" } });
    } else {
      blocks.push({ y: l.bbox.y, el: { kind: "text", text: label, variant: l.bbox.h >= 26 ? "heading" : "muted" } });
    }
  }
  blocks.sort((a, b) => a.y - b.y);
  return { title, headerActions, content: blocks.map((b) => b.el) };
}

/** Wrap loose text/button runs into cards so the page reads like an app, not a list of strings. */
export function groupIntoCards(content: ScreenElement[]): ScreenElement[] {
  const out: ScreenElement[] = [];
  let run: ScreenElement[] = [];
  const flush = () => {
    if (run.length >= 2) out.push({ kind: "card", children: run });
    else out.push(...run);
    run = [];
  };
  for (const el of content) {
    if (el.kind === "text" || el.kind === "button") run.push(el);
    else {
      flush();
      out.push(el);
    }
  }
  flush();
  return out;
}
