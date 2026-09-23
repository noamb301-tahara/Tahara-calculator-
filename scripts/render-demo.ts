/**
 * Renders the hand-authored demo tutorial (data/templates/demo-2fa) without any
 * AI or source video: validates the JSON, writes the Hebrew script, computes
 * the timeline, builds subtitles and renders the Short.
 *
 *   pnpm demo:render [--preset dark] [--still 120] [--silent]
 */
import { resolve } from "node:path";
import { ScreenSetSchema, Tutorial } from "@studio/shared";
import { loadConfig, readJsonAs, writeJson, writeFileAtomic } from "@studio/shared/node";
import { writeScript, scriptToText } from "@studio/script-writer";
import { buildSubtitles, toSrt } from "@studio/subtitles";
import { buildRenderPlan, computeTimeline } from "@studio/remotion-scenes/plan";
import { renderPlan, renderPlanStill } from "@studio/renderer";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? "") : undefined;
};

const { config, root } = await loadConfig();
const dir = resolve(root, flag("dir") ?? "data/templates/demo-2fa");
const outName = flag("out") ?? "demo-2fa";
const tutorial = await readJsonAs(resolve(dir, "tutorial.json"), Tutorial);
const screens = await readJsonAs(resolve(dir, "screens.json"), ScreenSetSchema);
const preset = flag("preset");
if (preset) tutorial.style_preset = preset as Tutorial["style_preset"];

const script = writeScript(tutorial, { wordsPerSecond: config.timing.wordsPerSecond, ctaText: config.style.ctaText });
const timeline = computeTimeline({ tutorial, screens: screens.screens, script, fps: config.video.fps, timing: config.timing });
const subtitles = buildSubtitles(
  timeline.entries.map((e) => ({ segmentId: e.segmentId, text: script.segments.find((s) => s.id === e.segmentId)!.text, start: e.speechStartSec, duration: e.speechSec })),
  config.subtitles,
);
const plan = buildRenderPlan({ projectId: outName, tutorial, screens: screens.screens, script, timeline, subtitles, config, audio: null });

const out = resolve(root, "output", outName);
await writeJson(resolve(out, "render-plan.json"), plan);
await writeFileAtomic(resolve(out, "script-he.txt"), scriptToText(script, tutorial));
await writeFileAtomic(resolve(out, "subtitles.srt"), toSrt(subtitles));
// Keep the Remotion Studio sample in sync with the demo.
if (!flag("dir")) await writeJson(resolve(root, "apps/renderer/src/sample-plan.json"), plan);
for (const e of timeline.entries) if (e.notes.length) console.warn(`[${e.segmentId}]`, e.notes.join("; "));
console.log(`plan: ${plan.scenes.length} scenes, ${timeline.totalSec.toFixed(1)}s, ${plan.durationInFrames} frames`);

const still = flag("still");
if (still !== undefined) {
  const file = resolve(out, `still-${still}.png`);
  await renderPlanStill(plan, Number(still), file, config.render.browserExecutable);
  console.log("still:", file);
} else {
  const file = resolve(out, `final-short${preset ? `-${preset}` : ""}.mp4`);
  let last = -1;
  await renderPlan(plan, {
    outputFile: file,
    codec: config.video.codec,
    crf: config.video.crf,
    browserExecutable: config.render.browserExecutable,
    onProgress: ({ stage, progress }) => {
      const pct = Math.floor(progress * 10) * 10;
      if (pct !== last) {
        last = pct;
        console.log(`${stage} ${pct}%`);
      }
    },
  });
  console.log("video:", file);
}
