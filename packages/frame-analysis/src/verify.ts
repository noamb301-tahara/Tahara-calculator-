import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpeg } from "@studio/shared/node";
import { mapLimit } from "./index";
import { ocrImage } from "./ocr";

/**
 * Post-render privacy check: OCR the finished video and look for any
 * sensitive string that was found in the source. This checks what the
 * viewer will actually see, not just the JSON that produced it.
 */
export interface VideoTextHit {
  time: number;
  needle: string;
  line: string;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export async function findTextInVideo(video: string, needles: string[], opts: { fps?: number; languages?: string } = {}): Promise<VideoTextHit[]> {
  const wanted = [...new Set(needles.map((n) => n.trim()).filter((n) => n.length >= 4))];
  if (!wanted.length) return [];
  const fps = opts.fps ?? 1;
  const dir = await mkdtemp(join(tmpdir(), "verify-"));
  try {
    await ffmpeg(["-i", video, "-vf", `fps=${fps}`, "-q:v", "2", join(dir, "v-%05d.jpg")]);
    const files = (await readdir(dir)).filter((f) => f.endsWith(".jpg")).sort();
    const perFrame = await mapLimit(files, 3, async (f, i) => {
      const { lines } = await ocrImage(join(dir, f), opts.languages ?? "eng", 40);
      const hits: VideoTextHit[] = [];
      for (const l of lines) {
        const text = norm(l.text);
        for (const n of wanted) if (text.includes(norm(n))) hits.push({ time: Math.round((i / fps) * 10) / 10, needle: n, line: l.text });
      }
      return hits;
    });
    return perFrame.flat();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
