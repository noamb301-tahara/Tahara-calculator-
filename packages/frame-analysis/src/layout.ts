import type { BBox, DetectedUiElement, MotionEvent, OcrLine, CursorSample } from "@studio/shared";

/**
 * Heuristic layout understanding from OCR lines (works offline). A vision
 * model, when configured, refines this; the reconstruction never depends on
 * vision being available.
 */

export interface LayoutAnalysis {
  region: BBox;
  sidebar: OcrLine[];
  topbar: OcrLine[];
  title: OcrLine | null;
  /** Rows of ≥3 horizontally aligned lines (tables), top to bottom. */
  tableRows: OcrLine[][];
  /** Everything else inside the region, top to bottom. */
  content: OcrLine[];
  /** Lines outside the app region (captions, creator handle). */
  outside: OcrLine[];
}

/** The app/screen area inside the video (excludes captions, black bars). */
export function estimateScreenRegion(frameW: number, frameH: number, events: MotionEvent[], cursor: CursorSample[]): BBox {
  // Any real UI change (page switch, dialog) tells us where the app is. No hard size cut-off:
  // a page switch can touch only ~2–3% of the pixels, and missing it drops the sidebar out of the region.
  const boxes = events.filter((e) => e.kind === "ui_change" && e.bbox && e.areaFraction > 0.01).map((e) => e.bbox!);
  let x = Infinity;
  let y = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const b of boxes) {
    x = Math.min(x, b.x);
    y = Math.min(y, b.y);
    x2 = Math.max(x2, b.x + b.w);
    y2 = Math.max(y2, b.y + b.h);
  }
  // Cursor samples only confirm the region; stray blobs must not stretch it.
  void cursor;
  if (!Number.isFinite(x) || (x2 - x) * (y2 - y) < frameW * frameH * 0.15) return { x: 0, y: 0, w: frameW, h: frameH };
  const pad = 8;
  return { x: Math.max(0, x - pad), y: Math.max(0, y - pad), w: Math.min(frameW, x2 + pad) - Math.max(0, x - pad), h: Math.min(frameH, y2 + pad) - Math.max(0, y - pad) };
}

const inside = (b: BBox, r: BBox) => b.x + b.w / 2 >= r.x && b.x + b.w / 2 <= r.x + r.w && b.y + b.h / 2 >= r.y && b.y + b.h / 2 <= r.y + r.h;

export function analyzeLayout(lines: OcrLine[], region: BBox): LayoutAnalysis {
  const outside = lines.filter((l) => !inside(l.bbox, region));
  const inRegion = lines.filter((l) => inside(l.bbox, region));

  // Sidebar: ≥3 short lines, left-aligned, in the left ~26% of the region.
  const leftCands = inRegion.filter((l) => l.bbox.x + l.bbox.w / 2 < region.x + region.w * 0.26 && l.text.split(/\s+/).length <= 4);
  const byLeft = cluster(leftCands, (l) => l.bbox.x, 16);
  let sidebar: OcrLine[] = [];
  for (const g of byLeft.values()) if (g.length >= 3 && g.length > sidebar.length) sidebar = g;
  if (sidebar.length) {
    // Include the logo/app name above the nav (also left).
    const sideRight = Math.max(...sidebar.map((l) => l.bbox.x + l.bbox.w));
    sidebar = inRegion.filter((l) => l.bbox.x + l.bbox.w <= sideRight + 30 && l.bbox.x < region.x + region.w * 0.26);
  }
  const sideSet = new Set(sidebar);
  const contentLeft = sidebar.length ? Math.max(...sidebar.map((l) => l.bbox.x + l.bbox.w)) + 10 : region.x;

  const rest = inRegion.filter((l) => !sideSet.has(l));
  const topH = region.h * 0.075;
  const topbar = rest.filter((l) => l.bbox.y < region.y + topH && l.bbox.x >= contentLeft - 5);
  const topSet = new Set(topbar);
  const content = rest.filter((l) => !topSet.has(l)).sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);

  // Page title: tallest text in the upper part of the content.
  const upper = content.filter((l) => l.bbox.y < region.y + region.h * 0.4 && l.source !== "control");
  const title = upper.length ? upper.reduce((a, b) => (b.bbox.h > a.bbox.h * 1.15 ? b : a)) : null;

  // Table rows: lines sharing a baseline.
  const rows = cluster(content, (l) => l.bbox.y + l.bbox.h / 2, 9);
  const tableRows = [...rows.values()].filter((r) => r.length >= 3).map((r) => r.sort((a, b) => a.bbox.x - b.bbox.x)).sort((a, b) => a[0]!.bbox.y - b[0]!.bbox.y);

  return { region, sidebar: sidebar.sort((a, b) => a.bbox.y - b.bbox.y), topbar, title, tableRows, content, outside };
}

const BUTTON_WORDS = /^(save|cancel|send|submit|invite|add|create|new|delete|remove|continue|next|back|done|apply|confirm|ok|close|upload|download|export|import|share|edit|update|connect|sign in|log in|sign up|get started|manage|view|open)\b/i;

/** Coarse element typing from layout + wording (used when no vision model). */
export function heuristicElements(layout: LayoutAnalysis): DetectedUiElement[] {
  const out: DetectedUiElement[] = [];
  for (const l of layout.sidebar) out.push({ kind: "sidebar_item", label: l.text, bbox: l.bbox, confidence: 0.6, source: "heuristic" });
  for (const l of layout.topbar) {
    const kind = /^search/i.test(l.text) ? "input" : /^[A-Z]{2}$/.test(l.text) ? "icon" : "text";
    out.push({ kind, label: l.text, bbox: l.bbox, confidence: 0.5, source: "heuristic" });
  }
  const tableSet = new Set(layout.tableRows.flat());
  for (const l of layout.content) {
    if (tableSet.has(l)) continue;
    const words = l.text.split(/\s+/).length;
    const kind = BUTTON_WORDS.test(l.text) && words <= 3 ? "button" : l === layout.title ? "text" : "text";
    out.push({ kind, label: l.text, bbox: l.bbox, confidence: kind === "button" ? 0.55 : 0.4, source: "heuristic" });
  }
  if (layout.tableRows.length >= 2) {
    const all = layout.tableRows.flat();
    const x = Math.min(...all.map((l) => l.bbox.x));
    const y = Math.min(...all.map((l) => l.bbox.y));
    const x2 = Math.max(...all.map((l) => l.bbox.x + l.bbox.w));
    const y2 = Math.max(...all.map((l) => l.bbox.y + l.bbox.h));
    out.push({ kind: "table", label: layout.tableRows[0]!.map((l) => l.text).join(" | "), bbox: { x, y, w: x2 - x, h: y2 - y }, confidence: 0.6, source: "heuristic" });
  }
  return out;
}

/** 1-D clustering: sorted values join a group while within `tol` of the group's first value. */
export function cluster<T>(xs: T[], value: (x: T) => number, tol: number): Map<number, T[]> {
  const sorted = [...xs].sort((a, b) => value(a) - value(b));
  const m = new Map<number, T[]>();
  let anchor: number | null = null;
  for (const x of sorted) {
    const v = value(x);
    if (anchor === null || v - anchor > tol) {
      anchor = v;
      m.set(anchor, []);
    }
    m.get(anchor)!.push(x);
  }
  return m;
}
