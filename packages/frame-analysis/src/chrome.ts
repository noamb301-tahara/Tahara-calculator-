import type { BBox } from "@studio/shared";
import { ffmpeg } from "@studio/shared/node";
import { components } from "./motion";

/**
 * Image-based layout detection (no motion needed):
 *  - screen region: the largest block that differs from the video background
 *    (captions, bars and creator handles sit outside it);
 *  - app chrome: a sidebar band or a top bar whose background colour differs
 *    from the page next to it.
 * Works on one representative frame; returns null parts when unsure.
 */

export interface AppChrome {
  region: BBox | null;
  sidebar: BBox | null;
  topbar: BBox | null;
}

const W = 270;

interface Img {
  w: number;
  h: number;
  px: Buffer;
}

async function loadSmall(file: string, frameW: number, frameH: number): Promise<Img> {
  const h = Math.max(2, Math.round((frameH / frameW) * W / 2) * 2);
  const px = (await ffmpeg(["-i", file, "-vf", `scale=${W}:${h}:flags=area`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { binaryStdout: true })).stdoutBuffer;
  return { w: W, h, px };
}

const at = (img: Img, x: number, y: number) => {
  const i = (y * img.w + x) * 3;
  return [img.px[i]!, img.px[i + 1]!, img.px[i + 2]!] as const;
};
const dist = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

/** Typical colour of a rectangle (per-channel median of a sparse grid). */
function colorOf(img: Img, x0: number, y0: number, x1: number, y1: number): [number, number, number] {
  const r: number[] = [];
  const g: number[] = [];
  const b: number[] = [];
  const sx = Math.max(1, Math.floor((x1 - x0) / 12));
  const sy = Math.max(1, Math.floor((y1 - y0) / 24));
  for (let y = Math.max(0, y0); y < Math.min(img.h, y1); y += sy)
    for (let x = Math.max(0, x0); x < Math.min(img.w, x1); x += sx) {
      const c = at(img, x, y);
      r.push(c[0]);
      g.push(c[1]);
      b.push(c[2]);
    }
  return [median(r), median(g), median(b)];
}

export function detectRegion(img: Img): BBox | null {
  // Background = dominant colour of the frame border.
  const border: (readonly number[])[] = [];
  for (let x = 0; x < img.w; x += 3) border.push(at(img, x, 1), at(img, x, img.h - 2));
  for (let y = 0; y < img.h; y += 3) border.push(at(img, 1, y), at(img, img.w - 2, y));
  const bg = [median(border.map((c) => c[0]!)), median(border.map((c) => c[1]!)), median(border.map((c) => c[2]!))];
  const uniform = border.filter((c) => dist(c, bg) < 30).length / border.length;
  // A recording that fills the whole frame has no uniform background border.
  if (uniform < 0.6) return null;
  const mask = new Uint8Array(img.w * img.h);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) mask[y * img.w + x] = dist(at(img, x, y), bg) > 28 ? 1 : 0;
  const comps = components(mask, img.w, img.h, 50);
  if (!comps.length) return null;
  const best = comps.reduce((a, c) => ((c.maxX - c.minX) * (c.maxY - c.minY) > (a.maxX - a.minX) * (a.maxY - a.minY) ? c : a));
  const area = ((best.maxX - best.minX + 1) * (best.maxY - best.minY + 1)) / (img.w * img.h);
  if (area < 0.25) return null;
  return { x: best.minX, y: best.minY, w: best.maxX - best.minX + 1, h: best.maxY - best.minY + 1 };
}

/** Left band whose colour differs from the page to its right along most of the height. */
export function detectSidebar(img: Img, r: BBox): BBox | null {
  const y0 = r.y + Math.round(r.h * 0.12);
  const y1 = r.y + Math.round(r.h * 0.9);
  let bestX: number | null = null;
  let bestScore = 0;
  for (let x = r.x + Math.round(r.w * 0.12); x <= r.x + Math.round(r.w * 0.34); x++) {
    const left = colorOf(img, r.x + 2, y0, x - 2, y1);
    const right = colorOf(img, x + 2, y0, Math.min(r.x + r.w - 2, x + Math.round(r.w * 0.2)), y1);
    const d = dist(left, right);
    // Consistency: the boundary must hold on most rows, not just on average.
    let rows = 0;
    let ok = 0;
    for (let y = y0; y < y1; y += 4) {
      rows++;
      if (dist(at(img, Math.max(r.x + 1, x - 4), y), at(img, Math.min(r.x + r.w - 1, x + 4), y)) > 22) ok++;
    }
    const score = ok / Math.max(1, rows);
    if (d > 35 && score > 0.7 && score > bestScore) {
      bestScore = score;
      bestX = x;
    }
  }
  return bestX === null ? null : { x: r.x, y: r.y, w: bestX - r.x, h: r.h };
}

/** Top band (up to 14% of the region height) whose colour differs from the page below. */
export function detectTopbar(img: Img, r: BBox, sidebar: BBox | null): BBox | null {
  const x0 = sidebar ? sidebar.x + sidebar.w + 3 : r.x + 3;
  const x1 = r.x + r.w - 3;
  const band = colorOf(img, x0, r.y + 1, x1, r.y + Math.max(2, Math.round(r.h * 0.02)));
  const page = colorOf(img, x0, r.y + Math.round(r.h * 0.2), x1, r.y + Math.round(r.h * 0.3));
  if (dist(band, page) < 35) return null;
  // First row (after a minimum height) that no longer has the band colour.
  for (let y = r.y + Math.round(r.h * 0.025); y <= r.y + Math.round(r.h * 0.14); y++) {
    if (dist(colorOf(img, x0, y, x1, y + 1), band) > 35) return { x: x0, y: r.y, w: x1 - x0, h: y - r.y };
  }
  return null;
}

/** Detect region + chrome on a frame, in source-pixel coordinates. */
export async function detectAppChrome(file: string, frameW: number, frameH: number): Promise<AppChrome> {
  const img = await loadSmall(file, frameW, frameH);
  const sx = frameW / img.w;
  const sy = frameH / img.h;
  const scale = (b: BBox | null): BBox | null => (b ? { x: Math.round(b.x * sx), y: Math.round(b.y * sy), w: Math.round(b.w * sx), h: Math.round(b.h * sy) } : null);
  const regionSmall = detectRegion(img) ?? { x: 0, y: 0, w: img.w, h: img.h };
  const sidebar = detectSidebar(img, regionSmall);
  const topbar = detectTopbar(img, regionSmall, sidebar);
  return { region: detectRegion(img) ? scale(regionSmall) : null, sidebar: scale(sidebar), topbar: scale(topbar) };
}

/** Agree across several frames: a part counts only if most frames see it (median box). */
export function combineChrome(list: AppChrome[]): AppChrome {
  const pick = (key: keyof AppChrome): BBox | null => {
    const boxes = list.map((c) => c[key]).filter((b): b is BBox => Boolean(b));
    if (boxes.length < Math.ceil(list.length / 2)) return null;
    return { x: median(boxes.map((b) => b.x)), y: median(boxes.map((b) => b.y)), w: median(boxes.map((b) => b.w)), h: median(boxes.map((b) => b.h)) };
  };
  return { region: pick("region"), sidebar: pick("sidebar"), topbar: pick("topbar") };
}
