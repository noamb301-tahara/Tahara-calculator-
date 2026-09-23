import { z } from "zod";
import { FidelityMode, StylePresetName } from "./schemas/project";

/** Central configuration (Module 25). Every field has a sensible default. */
export const StudioConfigSchema = z.object({
  language: z.literal("he").default("he"),
  video: z
    .object({
      width: z.number().int().default(1080),
      height: z.number().int().default(1920),
      fps: z.number().int().default(30),
      codec: z.enum(["h264", "h265", "vp9"]).default("h264"),
      crf: z.number().int().default(20),
    })
    .default({ width: 1080, height: 1920, fps: 30, codec: "h264", crf: 20 }),
  style: z
    .object({
      preset: StylePresetName.default("modern-saas"),
      channelName: z.string().default("הדרכות קצרות"),
      ctaText: z.string().default("שמרו את הסרטון ועקבו לעוד הדרכות קצרות"),
      handle: z.string().nullable().default(null),
    })
    .default({ preset: "modern-saas", channelName: "הדרכות קצרות", ctaText: "שמרו את הסרטון ועקבו לעוד הדרכות קצרות", handle: null }),
  subtitles: z
    .object({
      maxCharsPerLine: z.number().int().default(26),
      maxLines: z.number().int().min(1).max(2).default(2),
      minCueSec: z.number().default(0.9),
      maxCueSec: z.number().default(3.2),
      fontSize: z.number().default(54),
      burnIn: z.boolean().default(true),
    })
    .default({ maxCharsPerLine: 26, maxLines: 2, minCueSec: 0.9, maxCueSec: 3.2, fontSize: 54, burnIn: true }),
  fidelity: z.object({ mode: FidelityMode.default("faithful") }).default({ mode: "faithful" }),
  voice: z
    .object({
      /** "auto" = elevenlabs if ELEVENLABS_API_KEY is set, else espeak if installed, else silent. */
      provider: z.enum(["auto", "elevenlabs", "espeak", "silent"]).default("auto"),
      elevenlabs: z
        .object({
          voiceId: z.string().nullable().default(null),
          modelId: z.string().default("eleven_v3"),
          languageCode: z.string().default("he"),
          stability: z.number().min(0).max(1).default(0.5),
          similarityBoost: z.number().min(0).max(1).default(0.75),
          style: z.number().min(0).max(1).default(0.2),
          speed: z.number().min(0.7).max(1.2).default(1.0),
          outputFormat: z.string().default("mp3_44100_128"),
        })
        .default({ voiceId: null, modelId: "eleven_v3", languageCode: "he", stability: 0.5, similarityBoost: 0.75, style: 0.2, speed: 1, outputFormat: "mp3_44100_128" }),
      espeak: z.object({ voice: z.string().default("he"), wpm: z.number().default(175) }).default({ voice: "he", wpm: 150 }),
      retries: z.number().int().default(3),
      timeoutMs: z.number().int().default(60_000),
      gapSec: z.number().default(0.35),
    })
    .default({
      provider: "auto",
      elevenlabs: { voiceId: null, modelId: "eleven_v3", languageCode: "he", stability: 0.5, similarityBoost: 0.75, style: 0.2, speed: 1, outputFormat: "mp3_44100_128" },
      espeak: { voice: "he", wpm: 175 },
      retries: 3,
      timeoutMs: 60_000,
      gapSec: 0.35,
    }),
  transcription: z
    .object({
      /** "auto" = sidecar file if present, else elevenlabs if key, else whisper CLI if found, else none. */
      provider: z.enum(["auto", "sidecar", "elevenlabs", "whisper-cli", "none"]).default("auto"),
      elevenlabsModel: z.string().default("scribe_v1"),
      whisperCommand: z.string().default("whisper"),
      whisperModel: z.string().default("small"),
    })
    .default({ provider: "auto", elevenlabsModel: "scribe_v1", whisperCommand: "whisper", whisperModel: "small" }),
  llm: z
    .object({
      /** "auto" = anthropic if ANTHROPIC_API_KEY is set, else deterministic heuristics. */
      provider: z.enum(["auto", "anthropic", "none"]).default("auto"),
      model: z.string().default("claude-opus-5"),
      visionModel: z.string().default("claude-opus-5"),
      maxTokens: z.number().int().default(16000),
      maxVisionFrames: z.number().int().default(12),
    })
    .default({ provider: "auto", model: "claude-opus-5", visionModel: "claude-opus-5", maxTokens: 16000, maxVisionFrames: 12 }),
  analysis: z
    .object({
      sceneThreshold: z.number().min(0).max(1).default(0.25),
      intervalSec: z.number().default(2.0),
      maxFrames: z.number().int().default(48),
      motionFps: z.number().int().default(8),
      motionWidth: z.number().int().default(216),
      ocrLanguages: z.string().default("eng+heb"),
      ocrMinConfidence: z.number().default(55),
      thumbnails: z.number().int().default(4),
    })
    .default({ sceneThreshold: 0.25, intervalSec: 2, maxFrames: 48, motionFps: 8, motionWidth: 216, ocrLanguages: "eng+heb", ocrMinConfidence: 55, thumbnails: 4 }),
  thresholds: z
    .object({
      /** Steps below this confidence are flagged NEEDS REVIEW. */
      stepReview: z.number().min(0).max(1).default(0.7),
      /** Candidate actions below this are discarded. */
      actionMin: z.number().min(0).max(1).default(0.4),
    })
    .default({ stepReview: 0.7, actionMin: 0.4 }),
  review: z
    .object({
      /** If true, the pipeline stops at NEEDS_REVIEW until steps are approved. */
      requireApproval: z.boolean().default(false),
    })
    .default({ requireApproval: false }),
  timing: z
    .object({
      introSec: z.number().default(2.2),
      ctaSec: z.number().default(3.0),
      summaryMinSec: z.number().default(3.0),
      minStepSec: z.number().default(3.6),
      maxStepSec: z.number().default(14),
      /** Hebrew narration speaking rate used for estimates before TTS exists. */
      wordsPerSecond: z.number().default(2.3),
      /** Extra time per step for the viewer to take in the screen. */
      readPaddingSec: z.number().default(0.9),
    })
    .default({ introSec: 2.2, ctaSec: 3, summaryMinSec: 3, minStepSec: 3.6, maxStepSec: 14, wordsPerSecond: 2.3, readPaddingSec: 0.9 }),
  batch: z
    .object({ concurrency: z.number().int().min(1).default(2), retries: z.number().int().min(0).default(1) })
    .default({ concurrency: 2, retries: 1 }),
  render: z
    .object({
      browserExecutable: z.string().nullable().default(null),
      concurrency: z.number().int().nullable().default(null),
    })
    .default({ browserExecutable: null, concurrency: null }),
  paths: z.object({ data: z.string().default("data"), output: z.string().default("output") }).default({ data: "data", output: "output" }),
});
export type StudioConfig = z.infer<typeof StudioConfigSchema>;
export type StudioConfigInput = z.input<typeof StudioConfigSchema>;

export function parseConfig(input: unknown): StudioConfig {
  return StudioConfigSchema.parse(input ?? {});
}

/** Deep-merge plain objects (arrays and scalars are replaced). */
export function deepMerge<T>(base: T, override: unknown): T {
  if (override === undefined || override === null) return base;
  if (typeof base !== "object" || base === null || Array.isArray(base)) return override as T;
  if (typeof override !== "object" || Array.isArray(override)) return override as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    out[k] = deepMerge((base as Record<string, unknown>)[k], v);
  }
  return out as T;
}
