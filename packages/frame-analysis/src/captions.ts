import { labelSimilarity, type BBox, type FrameAnalysis, type MotionEvent, type OcrLine, type TranscriptSegment } from "@studio/shared";

/**
 * Burned-in captions: many Shorts teach with on-screen text instead of narration
 * ("1. Click Team in the sidebar"). A caption band is a horizontally centred
 * line of sentence-like text that stays at the same height across the video
 * while its text keeps changing — UI text at a fixed spot does not change like that.
 *
 * The band's lines are (a) turned into timed segments that can stand in for a
 * transcript and (b) removed from the frame OCR, so a caption never becomes a
 * button, a page title, or dummy-data-free "UI text" in the reconstruction.
 */

export interface CaptionTrack {
  band: BBox;
  segments: TranscriptSegment[];
}

const cx = (b: BBox) => b.x + b.w / 2;
const cy = (b: BBox) => b.y + b.h / 2;
const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

function centred(l: OcrLine, width: number, tol: number): boolean {
  return Math.abs(cx(l.bbox) - width / 2) < width * tol;
}

/** Sentence-like, centred text: the only kind of line that can start a caption. */
function isCaptionLike(l: OcrLine, width: number): boolean {
  return words(l.text) >= 2 && l.text.trim().length >= 8 && l.bbox.h >= 22 && centred(l, width, 0.1);
}

const sameCaption = (a: string, b: string) => {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  return labelSimilarity(x, y) > 0.8 || x.startsWith(y) || y.startsWith(x);
};

/** Caption lines of one frame: a caption-like line in the band plus centred wrap lines right below it. */
function captionLines(lines: OcrLine[], band: BBox, width: number): OcrLine[] {
  const inBand = lines.filter((l) => cy(l.bbox) >= band.y && cy(l.bbox) <= band.y + band.h);
  const heads = inBand.filter((l) => isCaptionLike(l, width));
  if (!heads.length) return [];
  const out = new Set<OcrLine>(heads);
  // Wrapped continuation ("choose Editor") and OCR crumbs from the caption box edge.
  const top = Math.min(...heads.map((h) => h.bbox.y));
  const lineH = Math.max(...heads.map((h) => h.bbox.h));
  for (const l of inBand) {
    if (out.has(l)) continue;
    const crumb = l.bbox.w < lineH && l.text.trim().length <= 2;
    if (l.bbox.y >= top - 4 && (centred(l, width, 0.2) || crumb)) out.add(l);
  }
  return [...out].sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
}

/** The text shown in the caption box (crumbs dropped). */
function captionText(lines: OcrLine[]): string {
  return lines
    .filter((l) => !(l.text.trim().length <= 2 && l.bbox.w < 30))
    .map((l) => l.text.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectCaptions(analyses: FrameAnalysis[], width: number, motion: MotionEvent[] = []): CaptionTrack | null {
  const withText = analyses.filter((a) => a.ocr.lines.length);
  if (withText.length < 4) return null;

  // 1) Group caption-like lines by height on screen.
  const buckets: { y: number; lines: { frame: FrameAnalysis; line: OcrLine }[] }[] = [];
  for (const f of withText) {
    for (const l of f.ocr.lines) {
      if (!isCaptionLike(l, width)) continue;
      const b = buckets.find((k) => Math.abs(k.y - l.bbox.y) < 30);
      if (b) b.lines.push({ frame: f, line: l });
      else buckets.push({ y: l.bbox.y, lines: [{ frame: f, line: l }] });
    }
  }
  // 2) A caption band shows ≥3 different texts and is present in a good share of the video.
  let best: { bucket: (typeof buckets)[number]; distinct: number } | null = null;
  for (const b of buckets) {
    const texts: string[] = [];
    for (const { line } of b.lines) if (!texts.some((t) => sameCaption(t, line.text))) texts.push(line.text);
    const frames = new Set(b.lines.map((x) => x.frame.frameId)).size;
    if (texts.length < 3 || frames < withText.length * 0.35) continue;
    if (!best || texts.length > best.distinct) best = { bucket: b, distinct: texts.length };
  }
  if (!best) return null;

  const heads = best.bucket.lines.map((x) => x.line.bbox);
  const lineH = Math.max(...heads.map((b) => b.h));
  const y0 = Math.min(...heads.map((b) => b.y)) - Math.round(lineH * 0.6);
  // Room for two wrapped lines under the first one.
  const y1 = Math.max(...heads.map((b) => b.y + b.h)) + Math.round(lineH * 2.6);
  const x0 = Math.min(...heads.map((b) => b.x)) - 40;
  const x1 = Math.max(...heads.map((b) => b.x + b.w)) + 40;
  const band: BBox = { x: Math.max(0, x0), y: Math.max(0, y0), w: Math.min(width, x1) - Math.max(0, x0), h: y1 - Math.max(0, y0) };

  // 3) Timed segments: consecutive frames showing the same caption.
  const sorted = [...analyses].sort((a, b) => a.time - b.time);
  const groups: { text: string; first: number; last: number; prev: number | null }[] = [];
  let prevTime: number | null = null;
  for (const f of sorted) {
    const text = captionText(captionLines(f.ocr.lines, band, width));
    if (text) {
      const g = groups[groups.length - 1];
      if (g && g.last === prevTime && sameCaption(g.text, text)) {
        g.last = f.time;
        if (text.length > g.text.length) g.text = text;
      } else groups.push({ text, first: f.time, last: f.time, prev: prevTime });
    }
    prevTime = f.time;
  }
  if (groups.length < 3) return null;
  const lastTime = sorted[sorted.length - 1]!.time;
  const touchesBand = (e: MotionEvent) => e.bbox && e.bbox.y < band.y + band.h && e.bbox.y + e.bbox.h > band.y;
  const segments: TranscriptSegment[] = groups.map((g, i) => {
    // The caption appeared between the previous sample and this one; a change in the band pins it down.
    const change = g.prev === null ? null : motion.find((e) => touchesBand(e) && e.start > g.prev! && e.start <= g.first + 0.01);
    const start = change ? change.start : g.prev === null ? Math.min(g.first, 0.2) : g.first;
    return { id: `cap-${i + 1}`, start: round(start), end: round(g.last), text: g.text };
  });
  for (let i = 0; i < segments.length; i++) {
    const next = segments[i + 1];
    segments[i]!.end = round(next ? Math.max(segments[i]!.end, next.start - 0.05) : Math.max(segments[i]!.end, lastTime));
  }
  return { band, segments };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Remove caption text from a frame's OCR (lines and words inside the caption box of that frame). */
export function stripCaptions(frame: FrameAnalysis, track: CaptionTrack, width: number): FrameAnalysis {
  const lines = captionLines(frame.ocr.lines, track.band, width);
  if (!lines.length) return frame;
  const set = new Set(lines);
  const xs = lines.map((l) => l.bbox);
  const box = { x: Math.min(...xs.map((b) => b.x)) - 30, y: Math.min(...xs.map((b) => b.y)) - 20, x2: Math.max(...xs.map((b) => b.x + b.w)) + 30, y2: Math.max(...xs.map((b) => b.y + b.h)) + 20 };
  const inBox = (b: BBox) => cx(b) >= box.x && cx(b) <= box.x2 && cy(b) >= box.y && cy(b) <= box.y2;
  return {
    ...frame,
    ocr: {
      ...frame.ocr,
      lines: frame.ocr.lines.filter((l) => !set.has(l) && !inBox(l.bbox)),
      words: frame.ocr.words.filter((w) => !inBox(w.bbox)),
    },
  };
}

/** Caption changes are not UI changes: drop visual-change events confined to the caption band. */
export function maskCaptionMotion(events: MotionEvent[], band: BBox): MotionEvent[] {
  return events.filter((e) => {
    if (!e.bbox || (e.kind !== "ui_change" && e.kind !== "small_change")) return true;
    const ix = Math.max(0, Math.min(e.bbox.x + e.bbox.w, band.x + band.w) - Math.max(e.bbox.x, band.x));
    const iy = Math.max(0, Math.min(e.bbox.y + e.bbox.h, band.y + band.h) - Math.max(e.bbox.y, band.y));
    return (ix * iy) / Math.max(1, e.bbox.w * e.bbox.h) < 0.8;
  });
}
