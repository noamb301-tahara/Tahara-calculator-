import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  FramesAnalysisResult,
  PROJECT_FILES,
  frameFileName,
  frameIdFor,
  type DetectedUiElement,
  type ExtractedFrame,
  type FrameAnalysis,
  type IngestResult,
  type SensitiveFinding,
  type StudioConfig,
  type Transcript,
} from "@studio/shared";
import { ensureDir, ffmpeg } from "@studio/shared/node";
import { detectSensitive } from "@studio/demo-data";
import { analyzeMotion } from "./motion";
import { ocrAvailable, ocrImage } from "./ocr";
import { ocrColoredControls } from "./buttons";
import { planFrameSamples } from "./sampling";
import { analyzeLayout, estimateScreenRegion, heuristicElements } from "./layout";

export * from "./motion";
export * from "./ocr";
export * from "./sampling";
export * from "./layout";
export * from "./buttons";

/** Optional vision model hook (Claude vision), injected by the pipeline. */
export interface VisionAnalyzer {
  readonly name: string;
  analyzeFrame(input: { file: string; ocrText: string[]; time: number }): Promise<{ description: string | null; pageTitle: string | null; elements: DetectedUiElement[] }>;
}

export interface AnalyzeFramesInput {
  projectDir: string;
  sourceFile: string;
  ingest: IngestResult;
  transcript: Transcript;
  config: StudioConfig;
  vision?: VisionAnalyzer | null;
  log?: (m: string) => void;
}

/** Module 3 — visual analysis over smartly sampled frames. */
export async function analyzeFrames(input: AnalyzeFramesInput): Promise<FramesAnalysisResult> {
  const { projectDir, ingest, config } = input;
  const raw = new Uint8Array(await readFile(join(projectDir, ingest.motion.file)));
  const scale = ingest.media.width / ingest.motion.width;
  const motion = analyzeMotion({ data: raw, width: ingest.motion.width, height: ingest.motion.height, fps: ingest.motion.fps, frameCount: ingest.motion.frameCount }, scale);

  const samples = planFrameSamples({
    durationSec: ingest.media.durationSec,
    scenes: ingest.scenes,
    motion: motion.events,
    transcript: input.transcript.segments,
    intervalSec: config.analysis.intervalSec,
    maxFrames: config.analysis.maxFrames,
  });

  await ensureDir(join(projectDir, PROJECT_FILES.framesDir));
  const frames: ExtractedFrame[] = [];
  for (const s of samples) {
    const rel = `${PROJECT_FILES.framesDir}/${frameFileName(s.time)}`;
    await ffmpeg(["-ss", s.time.toFixed(3), "-i", input.sourceFile, "-frames:v", "1", "-q:v", "2", join(projectDir, rel)]);
    frames.push({ id: frameIdFor(s.time), time: s.time, file: rel, reasons: s.reasons });
  }

  const region = estimateScreenRegion(ingest.media.width, ingest.media.height, motion.events, motion.cursor);
  const canOcr = await ocrAvailable();
  if (!canOcr) input.log?.("tesseract not installed — OCR skipped (install tesseract-ocr for label detection)");

  const analyses: FrameAnalysis[] = [];
  const sensitive: SensitiveFinding[] = [];
  const visionBudget = { left: input.vision ? config.llm.maxVisionFrames : 0 };
  const results = await mapLimit(frames, 3, async (f) => {
    const ocr = canOcr ? await ocrImage(join(projectDir, f.file), config.analysis.ocrLanguages, config.analysis.ocrMinConfidence) : { words: [], lines: [], meanConfidence: null };
    if (canOcr) {
      // Text inside filled buttons/toasts is missed by the main pass.
      const extra = await ocrColoredControls(join(projectDir, f.file), ingest.media.width, ingest.media.height, config.analysis.ocrLanguages).catch(() => []);
      for (const l of extra) {
        const dup = ocr.lines.some((o) => overlap(o.bbox, l.bbox) > 0.5);
        if (!dup) ocr.lines.push(l);
      }
      ocr.lines.sort((a, b) => a.bbox.y - b.bbox.y || a.bbox.x - b.bbox.x);
    }
    const layout = analyzeLayout(ocr.lines, region);
    let elements = heuristicElements(layout);
    let description: string | null = null;
    let pageTitle = layout.title?.text ?? null;
    const important = f.reasons.some((r) => r === "before_change" || r === "after_change" || r === "cursor_stop");
    if (input.vision && important && visionBudget.left > 0) {
      visionBudget.left--;
      try {
        const v = await input.vision.analyzeFrame({ file: join(projectDir, f.file), ocrText: ocr.lines.map((l) => l.text), time: f.time });
        description = v.description;
        pageTitle = v.pageTitle ?? pageTitle;
        if (v.elements.length) elements = [...v.elements, ...elements.filter((e) => !v.elements.some((ve) => ve.label === e.label))];
      } catch (err) {
        input.log?.(`vision failed for ${f.id}: ${(err as Error).message}`);
      }
    }
    const found = ocr.lines.flatMap((l) => detectSensitive(l.text, { frameId: f.id }).map((s) => ({ ...s, bbox: l.bbox })));
    return { frame: f, analysis: { frameId: f.id, time: f.time, file: f.file, ocr, elements, description, pageTitle, sensitive: found } satisfies FrameAnalysis };
  });
  for (const r of results) {
    analyses.push(r.analysis);
    sensitive.push(...r.analysis.sensitive);
  }

  return FramesAnalysisResult.parse({
    frames,
    analyses,
    motionEvents: motion.events,
    cursorTrack: motion.cursor,
    sensitive,
    providers: { ocr: canOcr ? "tesseract" : "none", vision: input.vision?.name ?? null },
    region,
  });
}

function overlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return (ix * iy) / Math.max(1, Math.min(a.w * a.h, b.w * b.h));
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}
