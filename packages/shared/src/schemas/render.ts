import { z } from "zod";
import { FidelityMode, StylePresetName } from "./project";
import { ScreenDefinitionSchema } from "./screen";
import { VisualActionSchema } from "./visual-action";
import { SubtitleCue } from "./content";

export const RenderSceneKind = z.enum(["intro", "hook", "step", "summary", "cta"]);
export type RenderSceneKind = z.infer<typeof RenderSceneKind>;

export const RenderScene = z.object({
  id: z.string(),
  kind: RenderSceneKind,
  /** First frame of the scene within the composition. */
  from: z.number().int().nonnegative(),
  durationInFrames: z.number().int().positive(),
  /** Short title in the top bar. */
  title: z.string().nullable().default(null),
  /** Big text for intro/hook/cta scenes. */
  headline: z.string().nullable().default(null),
  subheadline: z.string().nullable().default(null),
  bullets: z.array(z.string()).default([]),
  step: z
    .object({
      index: z.number().int().positive(),
      total: z.number().int().positive(),
      stepId: z.string(),
      realLabel: z.string(),
      labelHe: z.string().nullable(),
    })
    .nullable()
    .default(null),
  screenId: z.string().nullable().default(null),
  actions: z.array(VisualActionSchema).default([]),
  narrationSegmentId: z.string().nullable().default(null),
});
export type RenderScene = z.infer<typeof RenderScene>;
export type RenderSceneInput = z.input<typeof RenderScene>;

export const RenderPlan = z.object({
  version: z.literal(1).default(1),
  projectId: z.string(),
  title: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive(),
  durationInFrames: z.number().int().positive(),
  stylePreset: StylePresetName,
  fidelityMode: FidelityMode,
  appName: z.string(),
  /** Audio path relative to the Remotion public dir, or an absolute URL. Null = silent. */
  audio: z.object({ src: z.string(), durationSec: z.number() }).nullable(),
  screens: z.array(ScreenDefinitionSchema),
  scenes: z.array(RenderScene).min(1),
  subtitles: z.array(SubtitleCue),
  subtitleStyle: z.object({ fontSize: z.number(), burnIn: z.boolean() }),
  branding: z.object({ channelName: z.string(), ctaText: z.string(), handle: z.string().nullable().default(null) }),
});
export type RenderPlan = z.infer<typeof RenderPlan>;
export type RenderPlanInput = z.input<typeof RenderPlan>;

export const RenderJob = z.object({
  id: z.string(),
  projectId: z.string(),
  status: z.enum(["queued", "bundling", "rendering", "complete", "error"]),
  planFile: z.string(),
  outputFile: z.string(),
  composition: z.string().default("TutorialShort"),
  codec: z.enum(["h264", "h265", "vp9"]).default("h264"),
  crf: z.number().int().min(0).max(51).default(20),
  width: z.number().int(),
  height: z.number().int(),
  fps: z.number().int(),
  durationInFrames: z.number().int(),
  progress: z.number().min(0).max(1).default(0),
  attempts: z.number().int().default(0),
  createdAt: z.string(),
  startedAt: z.string().nullable().default(null),
  finishedAt: z.string().nullable().default(null),
  error: z.string().nullable().default(null),
});
export type RenderJob = z.infer<typeof RenderJob>;
