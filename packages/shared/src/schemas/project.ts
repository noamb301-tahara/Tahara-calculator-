import { z } from "zod";

/** Lifecycle status of a project, as shown in the admin dashboard. */
export const ProjectStatus = z.enum([
  "UPLOADED",
  "ANALYZING",
  "NEEDS_REVIEW",
  "READY_FOR_SCRIPT",
  "GENERATING_VOICE",
  "READY_TO_RENDER",
  "RENDERING",
  "COMPLETE",
  "ERROR",
]);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

/** Pipeline stages, in execution order. */
export const StageName = z.enum([
  "ingest",
  "transcribe",
  "analyze_frames",
  "detect_actions",
  "extract_tutorial",
  "reconstruct_screens",
  "write_script",
  "voice",
  "subtitles",
  "plan_render",
  "guide",
  "seo",
  "render",
]);
export type StageName = z.infer<typeof StageName>;
export const STAGE_ORDER: readonly StageName[] = StageName.options;

export const StageStatus = z.enum(["pending", "running", "complete", "skipped", "error"]);
export type StageStatus = z.infer<typeof StageStatus>;

export const StageRecord = z.object({
  status: StageStatus,
  /** Hash of everything the stage's output depends on. Used for caching. */
  inputHash: z.string().nullable().default(null),
  startedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  durationMs: z.number().nullable().default(null),
  attempts: z.number().int().default(0),
  error: z.string().nullable().default(null),
  /** Whether the output was reused from cache on the last run. */
  cached: z.boolean().default(false),
  /** Provider used (e.g. "elevenlabs", "espeak", "tesseract", "anthropic"). */
  provider: z.string().nullable().default(null),
  cost: z
    .object({
      usd: z.number().nullable().default(null),
      units: z.record(z.string(), z.number()).default({}),
    })
    .nullable()
    .default(null),
  outputs: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
});
export type StageRecord = z.infer<typeof StageRecord>;

export const MediaInfo = z.object({
  durationSec: z.number().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().positive(),
  hasAudio: z.boolean(),
  videoCodec: z.string().nullable(),
  audioCodec: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative(),
  container: z.string().nullable(),
});
export type MediaInfo = z.infer<typeof MediaInfo>;

export const StylePresetName = z.enum(["clean", "illustrated", "modern-saas", "dark"]);
export type StylePresetName = z.infer<typeof StylePresetName>;

export const FidelityMode = z.enum(["faithful", "simplified", "conceptual"]);
export type FidelityMode = z.infer<typeof FidelityMode>;

export const ProjectSettings = z.object({
  stylePreset: StylePresetName.optional(),
  fidelityMode: FidelityMode.optional(),
  voiceId: z.string().optional(),
  selectedHookId: z.string().optional(),
});
export type ProjectSettings = z.infer<typeof ProjectSettings>;

export const StatusChange = z.object({
  from: ProjectStatus.nullable(),
  to: ProjectStatus,
  at: z.string(),
  reason: z.string().optional(),
});

export const SourceFile = z.object({
  originalPath: z.string(),
  /** Path of the copy inside the project directory, relative to it. */
  storedFile: z.string(),
  filename: z.string(),
  sha256: z.string().length(64),
  sizeBytes: z.number().int().nonnegative(),
});
export type SourceFile = z.infer<typeof SourceFile>;

export const Project = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{2,80}$/),
  name: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: ProjectStatus,
  /** Null for hand-authored ("manual") projects that have no source video. */
  source: SourceFile.nullable(),
  media: MediaInfo.nullable().default(null),
  settings: ProjectSettings.default({}),
  stages: z.partialRecord(StageName, StageRecord).default({}),
  error: z.string().nullable().default(null),
  history: z.array(StatusChange).default([]),
  /** "manual" = hand-authored tutorial (no source analysis). */
  origin: z.enum(["video", "manual"]).default("video"),
});
export type Project = z.infer<typeof Project>;
