import {
  RenderPlan,
  VisualActionSchema,
  type RenderSceneInput,
  type RenderSceneKind,
  type ScreenDefinition,
  type Script,
  type StudioConfig,
  type SubtitleTrack,
  type Tutorial,
  type VisualActionInput,
} from "@studio/shared";
import { choreographStep } from "./engine/choreography";

/**
 * Timeline + render plan (Module 12). Pure functions: given the script, the
 * narration durations and the screens, decide how long every scene lasts and
 * what animates when. Durations follow the narration, the complexity of the
 * action and a minimum read time — never fast cuts.
 */

export interface TimelineEntry {
  segmentId: string;
  kind: RenderSceneKind;
  stepId: string | null;
  from: number;
  durationInFrames: number;
  startSec: number;
  durationSec: number;
  /** When the narration for this scene starts (absolute seconds). */
  speechStartSec: number;
  speechSec: number;
  screenId: string | null;
  actions: VisualActionInput[];
  notes: string[];
}

export interface Timeline {
  fps: number;
  totalFrames: number;
  totalSec: number;
  entries: TimelineEntry[];
  /** Offset of narration inside each scene. */
  speechLeadSec: number;
}

export interface TimelineInput {
  tutorial: Tutorial;
  screens: ScreenDefinition[];
  script: Script;
  /** Actual TTS durations per segment id; falls back to script estimates. */
  voiceDurations?: Record<string, number> | null;
  fps: number;
  timing: StudioConfig["timing"];
}

const SPEECH_LEAD = 0.3;

export function computeTimeline(input: TimelineInput): Timeline {
  const { tutorial, script, fps, timing } = input;
  const screensById = new Map(input.screens.map((s) => [s.id, s]));
  const steps = [...tutorial.steps].sort((a, b) => a.order - b.order);
  const stepCount = steps.length;
  const entries: TimelineEntry[] = [];
  let from = 0;

  for (const seg of script.segments) {
    const speechSec = input.voiceDurations?.[seg.id] ?? seg.estimatedSec;
    let durationSec: number;
    let actions: VisualActionInput[] = [];
    let screenId: string | null = null;
    const notes: string[] = [];

    switch (seg.kind) {
      case "intro":
        durationSec = Math.max(timing.introSec, SPEECH_LEAD + speechSec + 0.35);
        break;
      case "hook":
        durationSec = Math.max(2.2, SPEECH_LEAD + speechSec + 0.5);
        break;
      case "summary":
        durationSec = Math.max(timing.summaryMinSec, SPEECH_LEAD + speechSec + 0.9, 1.2 + stepCount * 0.45);
        break;
      case "cta":
        durationSec = Math.max(timing.ctaSec, SPEECH_LEAD + speechSec + 0.8);
        break;
      case "step": {
        const step = steps.find((s) => s.id === seg.stepId);
        if (!step) throw new Error(`Script segment ${seg.id} refers to unknown step ${seg.stepId}`);
        const before = step.screen ? screensById.get(step.screen.before) : undefined;
        if (!before) throw new Error(`Step ${step.id} has no reconstructed screen (run screen reconstruction first)`);
        const after = step.screen?.after ? screensById.get(step.screen.after) ?? null : null;
        const idx = steps.indexOf(step);
        const c = choreographStep({
          step,
          before,
          after,
          narrationSec: SPEECH_LEAD + speechSec,
          minSec: timing.minStepSec,
          maxSec: Math.max(timing.maxStepSec, SPEECH_LEAD + speechSec + timing.readPaddingSec),
          calloutText: step.needs_callout ? step.action.required_real_label || step.action.target_label : null,
          isLastStep: idx === steps.length - 1,
        });
        durationSec = Math.max(c.durationSec, SPEECH_LEAD + speechSec + timing.readPaddingSec);
        actions = c.actions;
        screenId = before.id;
        notes.push(...c.notes);
        break;
      }
    }
    const durationInFrames = Math.ceil(durationSec * fps);
    entries.push({
      segmentId: seg.id,
      kind: seg.kind,
      stepId: seg.stepId,
      from,
      durationInFrames,
      startSec: from / fps,
      durationSec: durationInFrames / fps,
      speechStartSec: from / fps + SPEECH_LEAD,
      speechSec,
      screenId,
      actions,
      notes,
    });
    from += durationInFrames;
  }
  return { fps, totalFrames: from, totalSec: from / fps, entries, speechLeadSec: SPEECH_LEAD };
}

export interface RenderPlanInput {
  projectId: string;
  tutorial: Tutorial;
  screens: ScreenDefinition[];
  script: Script;
  timeline: Timeline;
  subtitles: SubtitleTrack;
  config: StudioConfig;
  /** Relative to the Remotion public dir (or absolute URL); null = silent. */
  audio: { src: string; durationSec: number } | null;
}

export function buildRenderPlan(input: RenderPlanInput): RenderPlan {
  const { tutorial, script, timeline, config } = input;
  const steps = [...tutorial.steps].sort((a, b) => a.order - b.order);
  const hook = script.hooks.find((h) => h.id === script.selectedHookId) ?? script.hooks[0]!;
  const scenes: RenderSceneInput[] = timeline.entries.map((e) => {
    const seg = script.segments.find((s) => s.id === e.segmentId)!;
    const base: RenderSceneInput = { id: e.segmentId, kind: e.kind, from: e.from, durationInFrames: e.durationInFrames, narrationSegmentId: e.segmentId };
    switch (e.kind) {
      case "intro":
        return { ...base, headline: tutorial.title_he, subheadline: `מדריך קצר · ${tutorial.app.name}` };
      case "hook":
        return { ...base, headline: hook.text };
      case "summary":
        return { ...base, headline: "סיכום", bullets: script.segments.filter((s) => s.kind === "step").map((s) => s.onScreenTitle ?? "") };
      case "cta":
        return { ...base, headline: config.style.ctaText, subheadline: config.style.channelName };
      case "step": {
        const step = steps.find((s) => s.id === e.stepId)!;
        return {
          ...base,
          title: seg.onScreenTitle,
          step: {
            index: steps.indexOf(step) + 1,
            total: steps.length,
            stepId: step.id,
            realLabel: step.action.required_real_label || step.action.target_label,
            labelHe: step.action.label_he,
          },
          screenId: e.screenId,
          actions: e.actions.map((a) => VisualActionSchema.parse(a)),
        };
      }
    }
  });

  // Only ship the screens the plan uses.
  const used = new Set<string>();
  for (const s of scenes) {
    if (s.screenId) used.add(s.screenId);
    for (const a of s.actions ?? []) {
      if (a.type === "set_screen") used.add(a.screenId);
      if (a.type === "before_after") {
        used.add(a.beforeScreenId);
        used.add(a.afterScreenId);
      }
    }
  }

  return RenderPlan.parse({
    projectId: input.projectId,
    title: tutorial.title_he,
    width: config.video.width,
    height: config.video.height,
    fps: timeline.fps,
    durationInFrames: timeline.totalFrames,
    stylePreset: tutorial.style_preset ?? config.style.preset,
    fidelityMode: tutorial.fidelity_mode ?? config.fidelity.mode,
    appName: tutorial.app.name,
    audio: input.audio,
    screens: input.screens.filter((s) => used.has(s.id)),
    scenes,
    // Burned-in subtitles only where the scene doesn't already show the same text large.
    subtitles: input.subtitles.cues.filter((c) => !["intro", "hook", "cta"].includes(timeline.entries.find((e) => e.segmentId === c.segmentId)?.kind ?? "")),
    subtitleStyle: { fontSize: config.subtitles.fontSize, burnIn: config.subtitles.burnIn },
    branding: { channelName: config.style.channelName, ctaText: config.style.ctaText, handle: config.style.handle },
  });
}
