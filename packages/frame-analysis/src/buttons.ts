import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OcrLine } from "@studio/shared";
import { ffmpeg, run } from "@studio/shared/node";
import { components } from "./motion";
import { parseTsv } from "./ocr";

/**
 * Second OCR pass for text inside solid colored controls (primary buttons,
 * badges, toasts). Tesseract's page segmentation treats a filled rectangle as
 * an image and skips the text in it, so we find saturated rectangles, crop
 * each one, invert it and OCR it as a single text line.
 */
const W = 540;

export async function ocrColoredControls(file: string, frameW: number, frameH: number, languages: string): Promise<OcrLine[]> {
  const h = Math.max(2, Math.round((frameH / frameW) * W / 2) * 2);
  const raw = (await ffmpeg(["-i", file, "-vf", `scale=${W}:${h}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { binaryStdout: true })).stdoutBuffer;
  const mask = new Uint8Array(W * h);
  for (let i = 0; i < W * h; i++) {
    const r = raw[i * 3]!;
    const g = raw[i * 3 + 1]!;
    const b = raw[i * 3 + 2]!;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    // Saturated color, or very dark fill (dark buttons / toasts) — but not text-thin strokes.
    mask[i] = (sat > 0.45 && max > 70) || max < 45 ? 1 : 0;
  }
  const comps = components(mask, W, h, 40).filter((c) => {
    const cw = c.maxX - c.minX + 1;
    const ch = c.maxY - c.minY + 1;
    const fill = c.area / (cw * ch);
    const areaFrac = (cw * ch) / (W * h);
    return cw / ch >= 1.6 && cw / ch <= 26 && fill > 0.42 && areaFrac > 0.0012 && areaFrac < 0.05 && ch >= 12;
  });
  if (!comps.length) return [];
  const sx = frameW / W;
  const sy = frameH / h;
  const dir = await mkdtemp(join(tmpdir(), "btn-ocr-"));
  const out: OcrLine[] = [];
  try {
    for (const [i, c] of comps.entries()) {
      const x = Math.max(0, Math.floor(c.minX * sx) - 4);
      const y = Math.max(0, Math.floor(c.minY * sy) - 4);
      const w = Math.min(frameW - x, Math.ceil((c.maxX - c.minX + 1) * sx) + 8);
      const hh = Math.min(frameH - y, Math.ceil((c.maxY - c.minY + 1) * sy) + 8);
      const inv = "255-min(min(r(X,Y),g(X,Y)),b(X,Y))";
      // Tesseract is sensitive to glyph size: try a couple of scales, keep the most confident read.
      let best: { text: string; conf: number } | null = null;
      for (const scale of [1, 1.6, 2.2]) {
        const crop = join(dir, `c${i}-${scale}.png`);
        await ffmpeg(["-i", file, "-vf", `crop=${w}:${hh}:${x}:${y},format=gbrp,geq=r='${inv}':g='${inv}':b='${inv}',format=gray,scale=iw*${scale}:-1,pad=iw+40:ih+40:20:20:white`, crop]);
        const res = await run("tesseract", [crop, "stdout", "-l", languages, "--psm", "7", "tsv"], { allowFailure: true, env: { OMP_THREAD_LIMIT: "1" } });
        if (res.code !== 0) continue;
        const words = parseTsv(res.stdout, 30).words;
        const text = cleanButtonText(words.map((w) => w.text));
        if (!text) continue;
        const conf = words.reduce((s, w) => s + w.confidence, 0) / words.length;
        if (!best || conf > best.conf) best = { text, conf };
        if (conf > 90) break;
      }
      if (!best) continue;
      const { text } = best;
      const conf = best.conf;
      out.push({ text, confidence: Math.round(conf * 10) / 10, bbox: { x, y, w, h: hh }, source: "control" });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return out;
}

/** Drop OCR junk at the edges (cursor fragments, icon glyphs): "BD invite member I" → "invite member". */
export function cleanButtonText(tokens: string[]): string {
  const t = tokens.map((x) => x.replace(/[^\p{L}\p{N}@.&'+-]/gu, "")).filter(Boolean);
  while (t.length > 1 && t[0]!.length <= 2) t.shift();
  while (t.length > 1 && t[t.length - 1]!.length <= 2) t.pop();
  const s = t.join(" ").trim();
  if (s.length < 2 || !/[\p{L}]{2}/u.test(s)) return "";
  // Restore Title Case for the first word if OCR lowercased it.
  return s;
}
