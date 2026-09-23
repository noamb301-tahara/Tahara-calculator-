import type { BBox, CursorSample, MotionEvent } from "@studio/shared";

/**
 * Motion analysis on the low-res grayscale stream (Module 3/4).
 *
 * For each pair of consecutive frames we compute the changed-pixel mask and
 * split it into connected components:
 *   - small compact blobs  → cursor (old + new position while it moves)
 *   - large changed areas  → UI change (page switch, dialog, menu)
 * From the cursor track we derive cursor stops, which together with a UI
 * change right after are strong click evidence.
 */

export interface MotionStream {
  data: Uint8Array;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
}

export interface Component {
  area: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
}

export interface FrameDiff {
  index: number;
  /** Time of the later frame. */
  time: number;
  changedFraction: number;
  components: Component[];
}

const DIFF_THRESHOLD = 22;

export function frameAt(s: MotionStream, i: number): Uint8Array {
  const size = s.width * s.height;
  return s.data.subarray(i * size, (i + 1) * size);
}

/** Connected components (4-neighbour) of a binary mask. */
export function components(mask: Uint8Array, w: number, h: number, minArea = 2): Component[] {
  const seen = new Uint8Array(mask.length);
  const out: Component[] = [];
  const stack: number[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    let area = 0;
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    let sx = 0;
    let sy = 0;
    stack.push(i);
    seen[i] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w;
      const y = (p - x) / w;
      area++;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const n = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1];
      for (const q of n) {
        if (q >= 0 && mask[q] && !seen[q]) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (area >= minArea) out.push({ area, minX, minY, maxX, maxY, cx: sx / area, cy: sy / area });
  }
  return out;
}

export function diffFrames(s: MotionStream): FrameDiff[] {
  const out: FrameDiff[] = [];
  const size = s.width * s.height;
  const mask = new Uint8Array(size);
  for (let i = 1; i < s.frameCount; i++) {
    const a = frameAt(s, i - 1);
    const b = frameAt(s, i);
    let changed = 0;
    for (let p = 0; p < size; p++) {
      const d = Math.abs(a[p]! - b[p]!) > DIFF_THRESHOLD ? 1 : 0;
      mask[p] = d;
      changed += d;
    }
    out.push({ index: i, time: i / s.fps, changedFraction: changed / size, components: changed ? components(mask, s.width, s.height) : [] });
  }
  return out;
}

export interface MotionAnalysis {
  diffs: FrameDiff[];
  cursor: CursorSample[];
  events: MotionEvent[];
}

/**
 * @param scale factor from motion-stream pixels to source pixels
 */
export function analyzeMotion(s: MotionStream, scale: number): MotionAnalysis {
  const diffs = diffFrames(s);
  const frameArea = s.width * s.height;
  // A cursor blob covers roughly 0.02%–0.6% of the frame at analysis resolution.
  const maxCursorArea = Math.max(12, frameArea * 0.006);
  const isCursorLike = (c: Component) => c.area <= maxCursorArea && c.maxX - c.minX < Math.max(8, s.width * 0.1) && c.maxY - c.minY < Math.max(8, s.height * 0.07);

  const cursor: CursorSample[] = [];
  let last: { x: number; y: number } | null = null;
  const events: MotionEvent[] = [];

  for (const d of diffs) {
    const small = d.components.filter(isCursorLike);
    const bigArea = d.components.filter((c) => !isCursorLike(c)).reduce((n, c) => n + c.area, 0);
    // Cursor: among small blobs, the one farthest from the last known position is the new one.
    if (small.length && bigArea < frameArea * 0.02) {
      let pick = small[0]!;
      if (last && small.length > 1) {
        pick = small.reduce((best, c) => (dist(c, last!) > dist(best, last!) ? c : best), pick);
      } else if (small.length > 1) {
        pick = small.reduce((best, c) => (c.area > best.area ? c : best), pick);
      }
      // Tip of an arrow cursor is top-left of the blob.
      const pt = { x: pick.minX + (pick.maxX - pick.minX) * 0.2, y: pick.minY + (pick.maxY - pick.minY) * 0.15 };
      cursor.push({ time: round(d.time), x: round(pt.x * scale), y: round(pt.y * scale), confidence: small.length <= 2 ? 0.8 : 0.5 });
      last = { x: pick.cx, y: pick.cy };
    }
    if (bigArea >= frameArea * 0.015) {
      const big = d.components.filter((c) => !isCursorLike(c));
      const box = unionBox(big);
      events.push({
        kind: "ui_change",
        start: round(d.time - 1 / s.fps),
        end: round(d.time),
        areaFraction: round(bigArea / frameArea),
        bbox: { x: box.x * scale, y: box.y * scale, w: box.w * scale, h: box.h * scale },
      });
    }
  }

  // Merge consecutive ui_change frames into one event (animations span frames).
  const merged: MotionEvent[] = [];
  for (const e of events) {
    const prev = merged[merged.length - 1];
    if (prev && e.start - prev.end <= 1.5 / s.fps) {
      prev.end = e.end;
      prev.areaFraction = Math.max(prev.areaFraction, e.areaFraction);
      prev.bbox = unionBBox(prev.bbox!, e.bbox!);
    } else merged.push({ ...e });
  }

  // Cursor moves and stops.
  const stops = cursorStops(cursor, 1 / s.fps);
  for (const st of stops) merged.push(st);
  return { diffs, cursor, events: merged.sort((a, b) => a.start - b.start) };
}

/** A stop = cursor moved, then no cursor motion for ≥ minStill seconds. */
export function cursorStops(track: CursorSample[], frameDt: number, minStill = 0.3): MotionEvent[] {
  const out: MotionEvent[] = [];
  for (let i = 0; i < track.length; i++) {
    const cur = track[i]!;
    const next = track[i + 1];
    const gap = next ? next.time - cur.time : Infinity;
    if (gap >= minStill + frameDt) {
      out.push({ kind: "cursor_stop", start: round(cur.time), end: round(next ? next.time : cur.time + minStill), areaFraction: 0, point: { x: cur.x, y: cur.y } });
    }
  }
  return out;
}

function dist(c: Component, p: { x: number; y: number }): number {
  return Math.hypot(c.cx - p.x, c.cy - p.y);
}

function unionBox(cs: Component[]): BBox {
  const minX = Math.min(...cs.map((c) => c.minX));
  const minY = Math.min(...cs.map((c) => c.minY));
  const maxX = Math.max(...cs.map((c) => c.maxX));
  const maxY = Math.max(...cs.map((c) => c.maxY));
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

export function unionBBox(a: BBox, b: BBox): BBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

const round = (n: number) => Math.round(n * 1000) / 1000;
