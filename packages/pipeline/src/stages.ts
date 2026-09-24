import { copyFile, readFile, rename } from "node:fs/promises";
import { cpus } from "node:os";
import { join, resolve } from "node:path";
import {
  DELIVERABLES,
  FINAL_VIDEO_NAME,
  FramesAnalysisResult,
  IngestResult,
  PROJECT_FILES,
  RenderPlan,
  ScreenSetSchema,
  Script,
  SourceAnalysis,
  SubtitleTrack,
  Transcript,
  Tutorial,
  VoiceTrack,
  isHebrew,
  type DetectedAction,
  type Project,
  type StageName,
  type StudioConfig,
} from "@studio/shared";
import { ensureDir, exists, readJson, readJsonAs, sha256File, writeFileAtomic, writeJson, type Logger } from "@studio/shared/node";
import { ingestVideo } from "@studio/video-ingestion";
import { transcribe, transcriptToText } from "@studio/transcription";
import { analyzeFrames, findTextInVideo } from "@studio/frame-analysis";
import { detectActions, extractTutorial, narrationFor } from "@studio/tutorial-extractor";
import { reconstructScreens } from "@studio/screen-reconstruction";
import { scriptToText, writeScript } from "@studio/script-writer";
import { assembleVoiceTrack, buildVoiceTrack, chooseProvider, synthesizeSegments } from "@studio/voice";
import { buildSubtitles, toSrt } from "@studio/subtitles";
import { buildRenderPlan, computeTimeline, type Timeline } from "@studio/remotion-scenes/plan";
import { generateGuide } from "@studio/guide-generator";
import { generateSeo } from "@studio/seo-engine";
import { isDummy, redact } from "@studio/demo-data";
import { claudeVision, createLlm, hebrewDraft, refineTutorial, writeScriptWithLlm, type ClaudeClient } from "@studio/llm";

/** Everything a stage needs. */
export interface StageContext {
  project: Project;
  dir: string;
  root: string;
  config: StudioConfig;
  outputDir: string;
  log: Logger;
  llm: ClaudeClient | null;
  /** Shared caches (voice), outside project dirs. */
  cacheDir: string;
}

export interface StageResult {
  outputs: string[];
  notes?: string[];
  provider?: string | null;
  cost?: { usd: number | null; units: Record<string, number> } | null;
  /** Stop the run after this stage (e.g. waiting for human review). */
  halt?: { status: "NEEDS_REVIEW"; reason: string };
}

export interface StageDef {
  name: StageName;
  /** Bump when the stage's logic changes, to invalidate caches. */
  version: number;
  /** Files (relative to project dir) whose content this stage depends on. */
  inputs: (ctx: StageContext) => string[];
  /** Config slice / settings this stage depends on. */
  params: (ctx: StageContext) => unknown;
  /** Outputs that must exist for a cached result to be valid. */
  outputs: (ctx: StageContext) => string[];
  skip?: (ctx: StageContext) => string | null;
  /** The stage rewrites one of its own inputs (tutorial.json): hash after running. */
  rehashAfterRun?: boolean;
  run: (ctx: StageContext) => Promise<StageResult>;
}

const p = (ctx: StageContext, rel: string) => join(ctx.dir, rel);
const isManual = (ctx: StageContext) => (ctx.project.origin === "manual" ? "manual project: tutorial authored by hand" : null);

async function loadTutorial(ctx: StageContext) {
  return readJsonAs(p(ctx, PROJECT_FILES.tutorial), Tutorial);
}

/** A tutorial touched in the review UI must never be overwritten by re-analysis. */
export function isHumanEdited(t: Tutorial): boolean {
  return t.steps.some((s) => s.review.status === "approved" || s.review.status === "edited");
}

function llmCost(ctx: StageContext, before: { input: number; output: number }) {
  if (!ctx.llm) return null;
  const input = ctx.llm.usage.inputTokens - before.input;
  const output = ctx.llm.usage.outputTokens - before.output;
  if (!input && !output) return null;
  return { usd: Math.round(((input * 5 + output * 25) / 1_000_000) * 10000) / 10000, units: { input_tokens: input, output_tokens: output } };
}
const usageSnap = (ctx: StageContext) => ({ input: ctx.llm?.usage.inputTokens ?? 0, output: ctx.llm?.usage.outputTokens ?? 0 });

export const STAGES: StageDef[] = [
  {
    name: "ingest",
    version: 1,
    inputs: (ctx) => (ctx.project.source ? [ctx.project.source.storedFile] : []),
    params: (ctx) => ({ a: ctx.config.analysis.sceneThreshold, fps: ctx.config.analysis.motionFps, w: ctx.config.analysis.motionWidth, t: ctx.config.analysis.thumbnails }),
    outputs: () => [PROJECT_FILES.media, PROJECT_FILES.motion],
    skip: isManual,
    async run(ctx) {
      const src = p(ctx, ctx.project.source!.storedFile);
      const res = await ingestVideo(src, ctx.dir, ctx.config);
      await writeJson(p(ctx, PROJECT_FILES.media), res);
      return { outputs: [PROJECT_FILES.media, PROJECT_FILES.motion, ...(res.audioFile ? [res.audioFile] : []), ...res.thumbnails, res.posterFile], provider: "ffmpeg", notes: [`${res.media.width}x${res.media.height}, ${res.media.durationSec.toFixed(1)}s, ${res.scenes.length} scene changes`] };
    },
  },
  {
    name: "transcribe",
    version: 1,
    inputs: () => [PROJECT_FILES.media],
    params: (ctx) => ({ t: ctx.config.transcription, llm: Boolean(ctx.llm) }),
    outputs: () => [PROJECT_FILES.transcriptJson, PROJECT_FILES.transcriptTxt],
    skip: isManual,
    async run(ctx) {
      const ingest = await readJsonAs(p(ctx, PROJECT_FILES.media), IngestResult);
      const before = usageSnap(ctx);
      const t = await transcribe({ audioFile: ingest.audioFile ? p(ctx, ingest.audioFile) : null, sourcePath: ctx.project.source!.originalPath, config: ctx.config, log: (m) => ctx.log.warn(m) });
      await writeJson(p(ctx, PROJECT_FILES.transcriptJson), t);
      await writeFileAtomic(p(ctx, PROJECT_FILES.transcriptTxt), transcriptToText(t));
      const outputs: string[] = [PROJECT_FILES.transcriptJson, PROJECT_FILES.transcriptTxt];
      const notes = [...t.notes];
      if (t.language && t.language !== "he" && t.segments.length) {
        // A reference draft only — the final script is written, not translated.
        let draft: string;
        if (ctx.llm) {
          try {
            draft = await hebrewDraft(ctx.llm, t);
          } catch (err) {
            draft = `# טיוטת תרגום לא נוצרה: ${(err as Error).message}\n`;
          }
        } else draft = "# טיוטת תרגום לעברית לא זמינה: לא הוגדר מודל שפה (ANTHROPIC_API_KEY).\n# התסריט העברי נכתב מחדש מתוך שלבי ההדרכה ולא מתורגם מילה במילה.\n";
        await writeFileAtomic(p(ctx, PROJECT_FILES.transcriptHebrewDraft), draft);
        outputs.push(PROJECT_FILES.transcriptHebrewDraft);
      }
      return { outputs, provider: t.provider, notes: [`language=${t.language ?? "?"}, ${t.segments.length} segments`, ...notes], cost: llmCost(ctx, before) };
    },
  },
  {
    name: "analyze_frames",
    version: 9,
    inputs: () => [PROJECT_FILES.media, PROJECT_FILES.transcriptJson, PROJECT_FILES.motion],
    params: (ctx) => ({ a: ctx.config.analysis, vision: ctx.llm ? ctx.config.llm.visionModel : null }),
    outputs: () => [PROJECT_FILES.framesAnalysis],
    skip: isManual,
    async run(ctx) {
      const ingest = await readJsonAs(p(ctx, PROJECT_FILES.media), IngestResult);
      const transcript = await readJsonAs(p(ctx, PROJECT_FILES.transcriptJson), Transcript);
      const before = usageSnap(ctx);
      const vision = ctx.llm ? claudeVision(ctx.llm, ctx.config.llm.visionModel) : null;
      const res = await analyzeFrames({ projectDir: ctx.dir, sourceFile: p(ctx, ctx.project.source!.storedFile), ingest, transcript, config: ctx.config, vision, log: (m) => ctx.log.warn(m) });
      await writeJson(p(ctx, PROJECT_FILES.framesAnalysis), res);
      const stops = res.motionEvents.filter((e) => e.kind === "cursor_stop").length;
      const changes = res.motionEvents.filter((e) => e.kind === "ui_change").length;
      return {
        outputs: [PROJECT_FILES.framesAnalysis, ...res.frames.map((f) => f.file)],
        provider: `${res.providers.ocr}${res.providers.vision ? ` + ${res.providers.vision}` : ""}`,
        notes: [`${res.frames.length} frames sampled, ${changes} UI changes, ${stops} cursor stops, ${res.sensitive.length} sensitive strings found`],
        cost: llmCost(ctx, before),
      };
    },
  },
  {
    name: "detect_actions",
    version: 5,
    inputs: () => [PROJECT_FILES.framesAnalysis, PROJECT_FILES.transcriptJson],
    params: (ctx) => ctx.config.thresholds.actionMin,
    outputs: () => [PROJECT_FILES.actions],
    skip: isManual,
    async run(ctx) {
      const frames = await readJsonAs(p(ctx, PROJECT_FILES.framesAnalysis), FramesAnalysisResult);
      const transcript = narrationFor(await readJsonAs(p(ctx, PROJECT_FILES.transcriptJson), Transcript), frames);
      const actions = detectActions({ transcript, frames, minConfidence: ctx.config.thresholds.actionMin });
      await writeJson(p(ctx, PROJECT_FILES.actions), { actions });
      return { outputs: [PROJECT_FILES.actions], provider: "fusion", notes: actions.map((a) => `${a.timestamp.toFixed(2)}s ${a.action} "${a.target ?? "?"}" (${a.confidence})`) };
    },
  },
  {
    name: "extract_tutorial",
    version: 9,
    inputs: () => [PROJECT_FILES.actions, PROJECT_FILES.framesAnalysis, PROJECT_FILES.transcriptJson, PROJECT_FILES.media],
    params: (ctx) => ({ th: ctx.config.thresholds, f: ctx.config.fidelity, llm: ctx.llm ? ctx.config.llm.model : null }),
    outputs: () => [PROJECT_FILES.tutorialAuto, PROJECT_FILES.sourceAnalysis],
    skip: isManual,
    async run(ctx) {
      const frames = await readJsonAs(p(ctx, PROJECT_FILES.framesAnalysis), FramesAnalysisResult);
      const transcript = narrationFor(await readJsonAs(p(ctx, PROJECT_FILES.transcriptJson), Transcript), frames);
      const ingest = await readJsonAs(p(ctx, PROJECT_FILES.media), IngestResult);
      const { actions } = await readJson<{ actions: DetectedAction[] }>(p(ctx, PROJECT_FILES.actions));
      let tutorial = extractTutorial({ transcript, frames, actions, media: ingest.media, config: ctx.config });
      const notes: string[] = [];
      const before = usageSnap(ctx);
      let provider = "heuristic";
      if (ctx.llm) {
        try {
          tutorial = await refineTutorial(ctx.llm, tutorial, transcript, frames);
          provider = `heuristic + anthropic:${ctx.config.llm.model}`;
        } catch (err) {
          notes.push(`LLM refinement failed, kept heuristic tutorial: ${(err as Error).message}`);
        }
      }
      await writeJson(p(ctx, PROJECT_FILES.tutorialAuto), tutorial);

      // tutorial.json belongs to the reviewer once they touch it.
      const tPath = p(ctx, PROJECT_FILES.tutorial);
      let wrote = true;
      if (await exists(tPath)) {
        const current = await readJsonAs(tPath, Tutorial).catch(() => null);
        if (current && isHumanEdited(current)) {
          wrote = false;
          notes.push("tutorial.json has human edits — kept as is (new detection saved to analysis/tutorial-auto.json)");
        }
      }
      if (wrote) await writeJson(tPath, tutorial);

      const analysis = SourceAnalysis.parse({
        projectId: ctx.project.id,
        generatedAt: new Date().toISOString(),
        media: ingest.media,
        scenes: ingest.scenes,
        transcript: { language: transcript.language, provider: transcript.provider, segmentCount: transcript.segments.length, text: redact(transcript.text) },
        frames: frames.analyses.map((a) => ({ id: a.frameId, time: a.time, file: a.file, pageTitle: a.pageTitle ? redact(a.pageTitle) : null, topText: a.ocr.lines.slice(0, 8).map((l) => redact(l.text)), elementCount: a.elements.length })),
        actions: actions.map((a) => ({ ...a, target: a.target ? redact(a.target) : null, value: a.value ? redact(a.value) : null, signals: a.signals.map((sg) => ({ ...sg, detail: sg.detail ? redact(sg.detail) : undefined })) })),
        sensitiveSummary: frames.sensitive.reduce<Record<string, number>>((m, s) => ({ ...m, [s.kind]: (m[s.kind] ?? 0) + 1 }), {}),
        providers: { transcription: transcript.provider, ocr: frames.providers.ocr, vision: frames.providers.vision, tutorial: provider },
        warnings: [...transcript.notes, ...notes],
      });
      // The aggregate never carries raw PII strings (redacted text + counts by kind).
      await writeJson(p(ctx, PROJECT_FILES.sourceAnalysis), analysis);

      const review = tutorial.steps.filter((s) => s.review.status === "needs_review");
      notes.push(`${tutorial.steps.length} steps, ${review.length} need review`);
      const result: StageResult = { outputs: [PROJECT_FILES.tutorialAuto, PROJECT_FILES.sourceAnalysis, ...(wrote ? [PROJECT_FILES.tutorial] : [])], provider, notes, cost: llmCost(ctx, before) };
      if (ctx.config.review.requireApproval && review.length && !(await readJson<Tutorial>(tPath).then(isHumanEdited))) {
        result.halt = { status: "NEEDS_REVIEW", reason: `${review.length} step(s) below confidence ${ctx.config.thresholds.stepReview}` };
      }
      return result;
    },
  },
  {
    name: "reconstruct_screens",
    version: 11,
    inputs: () => [PROJECT_FILES.tutorial, PROJECT_FILES.framesAnalysis],
    params: (ctx) => ({ f: ctx.project.settings.fidelityMode ?? ctx.config.fidelity.mode }),
    outputs: () => [PROJECT_FILES.screens, PROJECT_FILES.tutorial],
    skip: isManual,
    rehashAfterRun: true,
    async run(ctx) {
      const frames = await readJsonAs(p(ctx, PROJECT_FILES.framesAnalysis), FramesAnalysisResult);
      const tutorial = await loadTutorial(ctx);
      const fidelity = ctx.project.settings.fidelityMode ?? ctx.config.fidelity.mode;
      const res = reconstructScreens({ tutorial, frames, fidelity, salt: ctx.project.id });
      await writeJson(p(ctx, PROJECT_FILES.screens), res.screens);
      await writeJson(p(ctx, PROJECT_FILES.tutorial), res.tutorial);
      return { outputs: [PROJECT_FILES.screens, PROJECT_FILES.tutorial], provider: `reconstruction:${fidelity}`, notes: [`${res.screens.screens.length} screens, ${res.screens.substitutions.length} dummy-data substitutions`, ...res.notes] };
    },
  },
  {
    name: "write_script",
    version: 4,
    inputs: () => [PROJECT_FILES.tutorial],
    params: (ctx) => ({ wps: ctx.config.timing.wordsPerSecond, cta: ctx.config.style.ctaText, hook: ctx.project.settings.selectedHookId ?? null, llm: ctx.llm ? ctx.config.llm.model : null }),
    outputs: () => [PROJECT_FILES.script, PROJECT_FILES.scriptText, PROJECT_FILES.hooks],
    async run(ctx) {
      const tutorial = await loadTutorial(ctx);
      let script = writeScript(tutorial, { wordsPerSecond: ctx.config.timing.wordsPerSecond, ctaText: ctx.config.style.ctaText, selectedHookId: ctx.project.settings.selectedHookId });
      const notes: string[] = [];
      const before = usageSnap(ctx);
      if (ctx.llm) {
        try {
          script = await writeScriptWithLlm(ctx.llm, tutorial, script, ctx.config.timing.wordsPerSecond);
        } catch (err) {
          notes.push(`LLM script failed, using template script: ${(err as Error).message}`);
        }
      }
      const bad = script.checks.filter((c) => c.issues.length);
      for (const c of bad) notes.push(`${c.stepId}: ${c.issues.join(", ")}`);
      const nonHebrew = script.segments.filter((s) => !isHebrew(s.text));
      if (nonHebrew.length) notes.push(`segments without Hebrew text: ${nonHebrew.map((s) => s.id).join(", ")}`);
      await writeJson(p(ctx, PROJECT_FILES.script), script);
      await writeFileAtomic(p(ctx, PROJECT_FILES.scriptText), scriptToText(script, tutorial));
      await writeJson(p(ctx, PROJECT_FILES.hooks), { selected: script.selectedHookId, hooks: script.hooks });
      return { outputs: [PROJECT_FILES.script, PROJECT_FILES.scriptText, PROJECT_FILES.hooks], provider: script.provider, notes, cost: llmCost(ctx, before) };
    },
  },
  {
    name: "voice",
    version: 1,
    inputs: () => [PROJECT_FILES.script, PROJECT_FILES.tutorial, PROJECT_FILES.screens],
    params: (ctx) => ({ v: ctx.config.voice, vid: ctx.project.settings.voiceId ?? null, timing: ctx.config.timing, fps: ctx.config.video.fps }),
    outputs: () => [PROJECT_FILES.voiceTrack, PROJECT_FILES.voiceMeta, PROJECT_FILES.timeline],
    async run(ctx) {
      const script = await readJsonAs(p(ctx, PROJECT_FILES.script), Script);
      const tutorial = await loadTutorial(ctx);
      const screens = await readJsonAs(p(ctx, PROJECT_FILES.screens), ScreenSetSchema);
      const cfg = ctx.project.settings.voiceId ? { ...ctx.config, voice: { ...ctx.config.voice, elevenlabs: { ...ctx.config.voice.elevenlabs, voiceId: ctx.project.settings.voiceId } } } : ctx.config;
      const choice = await chooseProvider(cfg, process.env, (m) => ctx.log.warn(m));
      ctx.log.info(`voice provider: ${choice.provider.name} (${choice.reason})`);
      const { segments, billedCharacters } = await synthesizeSegments(
        script.segments.map((s) => ({ id: s.id, text: s.text })),
        { provider: choice.provider, cacheDir: join(ctx.cacheDir, "voice"), outDir: p(ctx, PROJECT_FILES.voiceDir), onSegment: (s) => ctx.log.debug(`segment ${s.id}: ${s.durationSec.toFixed(2)}s${s.cached ? " (cached)" : ""}`) },
      );
      // Scene timing follows real narration length.
      const timeline = computeTimeline({ tutorial, screens: screens.screens, script, voiceDurations: Object.fromEntries(segments.map((s) => [s.segmentId, s.durationSec])), fps: ctx.config.video.fps, timing: ctx.config.timing });
      await writeJson(p(ctx, PROJECT_FILES.timeline), timeline);
      const offsets = Object.fromEntries(timeline.entries.map((e) => [e.segmentId, e.speechStartSec]));
      const placed = await assembleVoiceTrack(segments, offsets, timeline.totalSec, p(ctx, PROJECT_FILES.voiceDir), p(ctx, PROJECT_FILES.voiceTrack));
      const track = buildVoiceTrack({ provider: choice.provider.name, voiceId: choice.provider.voiceId, file: PROJECT_FILES.voiceTrack, totalSec: timeline.totalSec, gapSec: ctx.config.voice.gapSec, segments: placed, characters: billedCharacters });
      await writeJson(p(ctx, PROJECT_FILES.voiceMeta), track);
      const cached = segments.filter((s) => s.cached).length;
      return {
        outputs: [PROJECT_FILES.voiceTrack, PROJECT_FILES.voiceMeta, PROJECT_FILES.timeline],
        provider: choice.provider.name,
        notes: [choice.reason, `${segments.length} segments (${cached} from cache), ${timeline.totalSec.toFixed(1)}s total`],
        cost: billedCharacters ? { usd: null, units: { tts_characters: billedCharacters } } : null,
      };
    },
  },
  {
    name: "subtitles",
    version: 1,
    inputs: () => [PROJECT_FILES.voiceMeta, PROJECT_FILES.timeline, PROJECT_FILES.script],
    params: (ctx) => ctx.config.subtitles,
    outputs: () => [PROJECT_FILES.subtitlesSrt, PROJECT_FILES.subtitlesJson],
    async run(ctx) {
      const script = await readJsonAs(p(ctx, PROJECT_FILES.script), Script);
      const track = await readJsonAs(p(ctx, PROJECT_FILES.voiceMeta), VoiceTrack);
      const timeline = await readJson<Timeline>(p(ctx, PROJECT_FILES.timeline));
      const subs = buildSubtitles(
        timeline.entries.map((e) => {
          const seg = track.segments.find((s) => s.segmentId === e.segmentId);
          return { segmentId: e.segmentId, text: script.segments.find((s) => s.id === e.segmentId)!.text, start: e.speechStartSec, duration: seg?.durationSec ?? e.speechSec, alignment: seg?.alignment ?? null };
        }),
        ctx.config.subtitles,
      );
      await writeJson(p(ctx, PROJECT_FILES.subtitlesJson), subs);
      await writeFileAtomic(p(ctx, PROJECT_FILES.subtitlesSrt), toSrt(subs));
      return { outputs: [PROJECT_FILES.subtitlesSrt, PROJECT_FILES.subtitlesJson], provider: track.segments.some((s) => s.alignment) ? "tts-alignment" : "proportional", notes: [`${subs.cues.length} cues`] };
    },
  },
  {
    name: "plan_render",
    version: 1,
    inputs: () => [PROJECT_FILES.tutorial, PROJECT_FILES.screens, PROJECT_FILES.script, PROJECT_FILES.timeline, PROJECT_FILES.subtitlesJson, PROJECT_FILES.voiceMeta],
    params: (ctx) => ({ v: ctx.config.video, s: ctx.config.style, sub: ctx.config.subtitles, preset: ctx.project.settings.stylePreset ?? null }),
    outputs: () => [PROJECT_FILES.renderPlan],
    async run(ctx) {
      const tutorial = await loadTutorial(ctx);
      if (ctx.project.settings.stylePreset) tutorial.style_preset = ctx.project.settings.stylePreset;
      const screens = await readJsonAs(p(ctx, PROJECT_FILES.screens), ScreenSetSchema);
      const script = await readJsonAs(p(ctx, PROJECT_FILES.script), Script);
      const timeline = await readJson<Timeline>(p(ctx, PROJECT_FILES.timeline));
      const subtitles = await readJsonAs(p(ctx, PROJECT_FILES.subtitlesJson), SubtitleTrack);
      const track = await readJsonAs(p(ctx, PROJECT_FILES.voiceMeta), VoiceTrack);
      const plan = buildRenderPlan({
        projectId: ctx.project.id,
        tutorial,
        screens: screens.screens,
        script,
        timeline,
        subtitles,
        config: ctx.config,
        audio: track.provider === "silent" ? null : { src: PROJECT_FILES.voiceTrack, durationSec: track.totalSec },
      });
      await writeJson(p(ctx, PROJECT_FILES.renderPlan), plan);
      const notes = timeline.entries.flatMap((e) => e.notes.map((n) => `${e.segmentId}: ${n}`));
      return { outputs: [PROJECT_FILES.renderPlan], provider: "remotion-plan", notes: [`${plan.scenes.length} scenes, ${(plan.durationInFrames / plan.fps).toFixed(1)}s @ ${plan.fps}fps, preset ${plan.stylePreset}`, ...notes] };
    },
  },
  {
    name: "guide",
    version: 1,
    inputs: () => [PROJECT_FILES.tutorial, PROJECT_FILES.script],
    params: () => null,
    outputs: () => [PROJECT_FILES.guide],
    async run(ctx) {
      const tutorial = await loadTutorial(ctx);
      const script = await readJsonAs(p(ctx, PROJECT_FILES.script), Script);
      await writeFileAtomic(p(ctx, PROJECT_FILES.guide), generateGuide(tutorial, { projectId: ctx.project.id, script }));
      return { outputs: [PROJECT_FILES.guide], provider: "template" };
    },
  },
  {
    name: "seo",
    version: 1,
    inputs: () => [PROJECT_FILES.tutorial],
    params: (ctx) => ({ cta: ctx.config.style.ctaText, ch: ctx.config.style.channelName }),
    outputs: () => [PROJECT_FILES.seo],
    async run(ctx) {
      const tutorial = await loadTutorial(ctx);
      await writeJson(p(ctx, PROJECT_FILES.seo), generateSeo(tutorial, { ctaText: ctx.config.style.ctaText, channelName: ctx.config.style.channelName }));
      return { outputs: [PROJECT_FILES.seo], provider: "template", notes: ["no search metrics invented (none connected)"] };
    },
  },
  {
    name: "render",
    version: 2,
    inputs: () => [PROJECT_FILES.renderPlan, PROJECT_FILES.voiceTrack],
    params: (ctx) => ({ v: ctx.config.video, r: ctx.config.render.concurrency, pv: ctx.config.privacy.verifyRender }),
    outputs: (ctx) => [relOut(ctx, FINAL_VIDEO_NAME)],
    async run(ctx) {
      const plan = await readJsonAs(p(ctx, PROJECT_FILES.renderPlan), RenderPlan);
      const { renderPlan } = await import("@studio/renderer");
      const out = join(ctx.outputDir, ctx.project.id, FINAL_VIDEO_NAME);
      await ensureDir(join(ctx.outputDir, ctx.project.id));
      const started = new Date().toISOString();
      let last = -1;
      await renderPlan(plan, {
        outputFile: out,
        audioFile: plan.audio ? p(ctx, PROJECT_FILES.voiceTrack) : null,
        codec: ctx.config.video.codec,
        crf: ctx.config.video.crf,
        browserExecutable: ctx.config.render.browserExecutable,
        concurrency: ctx.config.render.concurrency ?? cpus().length,
        onProgress: ({ stage, progress }) => {
          const pct = Math.floor(progress * 4) * 25;
          if (pct !== last) {
            last = pct;
            ctx.log.info(`${stage} ${pct}%`);
          }
        },
      });
      await writeJson(p(ctx, PROJECT_FILES.renderJob), {
        id: `render-${Date.now()}`,
        projectId: ctx.project.id,
        status: "complete",
        planFile: PROJECT_FILES.renderPlan,
        outputFile: out,
        composition: "TutorialShort",
        codec: ctx.config.video.codec,
        crf: ctx.config.video.crf,
        width: plan.width,
        height: plan.height,
        fps: plan.fps,
        durationInFrames: plan.durationInFrames,
        progress: 1,
        attempts: 1,
        createdAt: started,
        startedAt: started,
        finishedAt: new Date().toISOString(),
        error: null,
      });
      // Privacy check on the pixels the viewer will see (Module 22).
      const notes: string[] = [];
      if (ctx.config.privacy.verifyRender && (await exists(p(ctx, PROJECT_FILES.framesAnalysis)))) {
        const frames = await readJsonAs(p(ctx, PROJECT_FILES.framesAnalysis), FramesAnalysisResult);
        const tutorial = await loadTutorial(ctx);
        const allowed = new Set(tutorial.steps.map((s) => s.action.required_real_label.toLowerCase()));
        const needles = [...new Set(frames.sensitive.map((f) => f.text.trim()))].filter((t) => !isDummy(t) && !allowed.has(t.toLowerCase()));
        const hits = await findTextInVideo(out, needles);
        if (hits.length) {
          const rejected = out.replace(/\.mp4$/, ".REJECTED.mp4");
          await rename(out, rejected);
          const kinds = [...new Set(hits.map((h) => frames.sensitive.find((f) => f.text.trim() === h.needle)?.kind ?? "sensitive"))];
          ctx.log.error(`privacy check failed: ${hits.length} hit(s) of source ${kinds.join("/")} at ${[...new Set(hits.map((h) => h.time))].slice(0, 8).join(", ")}s`);
          throw new Error(`Rendered video shows source personal data (${kinds.join(", ")}) — moved to ${rejected}`);
        }
        notes.push(`privacy check: OCR of rendered frames found none of ${needles.length} source-sensitive strings`);
      }
      // Deliverable bundle next to the video.
      const copied = await copyDeliverables(ctx);
      return { outputs: [relOut(ctx, FINAL_VIDEO_NAME)], provider: "remotion", notes: [`output: ${out}`, `deliverables: ${copied.join(", ")}`, ...notes] };
    },
  },
];

function relOut(ctx: StageContext, name: string): string {
  // Outputs outside the project dir are tracked by absolute path.
  return resolve(ctx.outputDir, ctx.project.id, name);
}

export async function copyDeliverables(ctx: StageContext): Promise<string[]> {
  const dest = join(ctx.outputDir, ctx.project.id);
  await ensureDir(dest);
  const copied: string[] = [];
  for (const d of DELIVERABLES) {
    if (d.key === "final") continue;
    const src = p(ctx, PROJECT_FILES[d.key]);
    if (await exists(src)) {
      await copyFile(src, join(dest, d.name));
      copied.push(d.name);
    }
  }
  return copied;
}

/** Content hash of the stage's inputs + params + version. */
export async function stageInputHash(stage: StageDef, ctx: StageContext): Promise<string> {
  const { hashOf } = await import("@studio/shared/node");
  const files: Record<string, string | null> = {};
  for (const rel of stage.inputs(ctx)) {
    const abs = p(ctx, rel);
    files[rel] = (await exists(abs)) ? await sha256File(abs) : null;
  }
  return hashOf(stage.name, stage.version, stage.params(ctx), files);
}

export async function outputsExist(stage: StageDef, ctx: StageContext): Promise<boolean> {
  for (const rel of stage.outputs(ctx)) {
    const abs = rel.startsWith("/") ? rel : p(ctx, rel);
    if (!(await exists(abs))) return false;
  }
  return true;
}

export { readFile };
