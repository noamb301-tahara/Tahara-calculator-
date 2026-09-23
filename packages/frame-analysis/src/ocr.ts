import type { OcrLine, OcrWord } from "@studio/shared";
import { hasCommand, run } from "@studio/shared/node";

/**
 * OCR via the Tesseract CLI (TSV output → words with boxes → lines).
 * Run only on sampled frames, never on every frame.
 */
export async function ocrAvailable(): Promise<boolean> {
  return hasCommand("tesseract");
}

export async function ocrImage(file: string, languages: string, minConfidence: number): Promise<{ words: OcrWord[]; lines: OcrLine[]; meanConfidence: number | null }> {
  // psm 11 = sparse text: best for UI screenshots with scattered labels.
  const res = await run("tesseract", [file, "stdout", "-l", languages, "--psm", "11", "tsv"], {
    allowFailure: true,
    // Tesseract's OpenMP threads oversubscribe the CPU when frames are OCR'd in parallel (minutes per frame).
    env: { OMP_THREAD_LIMIT: "1" },
  });
  if (res.code !== 0) throw new Error(`tesseract failed: ${res.stderr.split("\n").slice(-3).join(" ")}`);
  return parseTsv(res.stdout, minConfidence);
}

export function parseTsv(tsv: string, minConfidence: number): { words: OcrWord[]; lines: OcrLine[]; meanConfidence: number | null } {
  const rows = tsv.split("\n").slice(1);
  const words: (OcrWord & { key: string })[] = [];
  for (const r of rows) {
    const c = r.split("\t");
    if (c.length < 12) continue;
    const [level, , block, par, line, , left, top, width, height, conf, ...rest] = c;
    const text = rest.join("\t").trim();
    if (level !== "5" || !text) continue;
    const confidence = Number(conf);
    if (!(confidence >= minConfidence)) continue;
    if (!/[\p{L}\p{N}@$€₪%]/u.test(text)) continue;
    words.push({ text, confidence, bbox: { x: +left!, y: +top!, w: +width!, h: +height! }, key: `${block}.${par}.${line}` });
  }
  // Group words by tesseract line id, then split lines on large horizontal gaps.
  const groups = new Map<string, (OcrWord & { key: string })[]>();
  for (const w of words) groups.set(w.key, [...(groups.get(w.key) ?? []), w]);
  const lines: OcrLine[] = [];
  for (const ws of groups.values()) {
    ws.sort((a, b) => a.bbox.x - b.bbox.x);
    let cur: OcrWord[] = [];
    const flush = () => {
      if (!cur.length) return;
      const x = Math.min(...cur.map((w) => w.bbox.x));
      const y = Math.min(...cur.map((w) => w.bbox.y));
      const x2 = Math.max(...cur.map((w) => w.bbox.x + w.bbox.w));
      const y2 = Math.max(...cur.map((w) => w.bbox.y + w.bbox.h));
      lines.push({ text: cur.map((w) => w.text).join(" "), confidence: avg(cur.map((w) => w.confidence)), bbox: { x, y, w: x2 - x, h: y2 - y } });
      cur = [];
    };
    for (const w of ws) {
      const prev = cur[cur.length - 1];
      if (prev && w.bbox.x - (prev.bbox.x + prev.bbox.w) > Math.max(prev.bbox.h, w.bbox.h) * 1.6) flush();
      cur.push(w);
    }
    flush();
  }
  lines.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
  return { words: words.map(({ key: _key, ...w }) => w), lines, meanConfidence: words.length ? avg(words.map((w) => w.confidence)) : null };
}

const avg = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
