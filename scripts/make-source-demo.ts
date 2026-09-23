/**
 * Generates a synthetic SOURCE Short for testing the analysis pipeline:
 * an English screen-recorded tutorial of a fake SaaS app ("Taskly"), with a
 * visible cursor, clicks, a dialog, typing, a dropdown, English narration
 * (espeak-ng) and deliberately realistic-looking fake PII.
 *
 * Outputs (input/):
 *   short-demo.mp4               the source video
 *   short-demo.transcript.json   sidecar transcript (exact narration timing)
 *   short-demo.truth.json        ground-truth actions, for measuring detection accuracy
 */
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";
import { ffmpeg, mediaDuration, run, writeJson } from "@studio/shared/node";
import { findBrowserExecutable } from "@studio/renderer";

type Ev =
  | { type: "move"; dt: number; to: string; dur: number }
  | { type: "click"; dt: number; target: string; label: string; action: string }
  | { type: "set"; dt: number; state: Record<string, unknown> }
  | { type: "type"; dt: number; text: string; dur: number };

const beats: { text: string; events: Ev[] }[] = [
  { text: "Here's how to invite a teammate in Taskly.", events: [] },
  {
    text: "First, click Team in the left sidebar.",
    events: [
      { type: "move", dt: 0.6, to: "nav-team", dur: 1.3 },
      { type: "click", dt: 2.2, target: "nav-team", label: "Team", action: "click" },
      { type: "set", dt: 2.3, state: { page: "team" } },
    ],
  },
  {
    text: "Now click the Invite member button at the top right.",
    events: [
      { type: "move", dt: 0.8, to: "btn-invite", dur: 1.4 },
      { type: "click", dt: 2.6, target: "btn-invite", label: "Invite member", action: "click" },
      { type: "set", dt: 2.7, state: { dialog: true } },
    ],
  },
  {
    text: "Type your teammate's email address.",
    events: [
      { type: "move", dt: 0.4, to: "in-email", dur: 1.0 },
      { type: "click", dt: 1.6, target: "in-email", label: "Email address", action: "type" },
      { type: "set", dt: 1.65, state: { focus: "email" } },
      { type: "type", dt: 1.9, text: "sarah.connor@acme-corp.com", dur: 1.8 },
    ],
  },
  {
    text: "Then open the Role menu and choose Editor.",
    events: [
      { type: "set", dt: 0.1, state: { focus: null } },
      { type: "move", dt: 0.5, to: "in-role", dur: 1.0 },
      { type: "click", dt: 1.7, target: "in-role", label: "Role", action: "select" },
      { type: "set", dt: 1.8, state: { roleOpen: true } },
      { type: "move", dt: 2.2, to: "opt-editor", dur: 0.7 },
      { type: "set", dt: 2.9, state: { hover: "editor" } },
      { type: "click", dt: 3.2, target: "opt-editor", label: "Editor", action: "select" },
      { type: "set", dt: 3.3, state: { roleOpen: false, role: "Editor", hover: null } },
    ],
  },
  {
    text: "Finally, click Send invite.",
    events: [
      { type: "move", dt: 0.4, to: "btn-send", dur: 1.0 },
      { type: "click", dt: 1.7, target: "btn-send", label: "Send invite", action: "click" },
      { type: "set", dt: 1.8, state: { dialog: false, toast: true, newRow: true } },
    ],
  },
  { text: "That's it. Your teammate will get an email invitation.", events: [] },
];

const root = resolve(import.meta.dirname, "..");
const outDir = resolve(root, "input");
const work = await mkdtemp(join(tmpdir(), "source-demo-"));
const FPS = 15;

// 1) Narration clips + beat timing
const clips: { file: string; start: number; dur: number; text: string }[] = [];
let t = 0.4;
const absEvents: (Ev & { t: number })[] = [];
for (const [i, b] of beats.entries()) {
  const wav = join(work, `n${i}.wav`);
  await run("espeak-ng", ["-v", "en-us", "-s", "155", "-w", wav, b.text]);
  const dur = await mediaDuration(wav);
  clips.push({ file: wav, start: t, dur, text: b.text });
  for (const e of b.events) absEvents.push({ ...e, t: Number((t + e.dt).toFixed(2)) });
  const lastEvent = b.events.reduce((m, e) => Math.max(m, e.dt + ("dur" in e ? e.dur : 0)), 0);
  t += Math.max(dur + 0.5, lastEvent + 1.3);
}
const total = t + 0.6;

// 2) Frames via Playwright (deterministic, frame by frame)
const exe = (await findBrowserExecutable()) ?? undefined;
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(`file://${resolve(import.meta.dirname, "source-demo/app.html")}`);
await page.evaluate((e) => (window as unknown as { setEvents: (x: unknown) => void }).setEvents(e), absEvents.map(({ dt: _dt, ...e }) => e));
const frames = Math.ceil(total * FPS);
for (let f = 0; f < frames; f++) {
  await page.evaluate((time) => (window as unknown as { renderAt: (t: number) => void }).renderAt(time), f / FPS);
  await page.screenshot({ path: join(work, `f${String(f).padStart(5, "0")}.jpg`), type: "jpeg", quality: 88 });
}
await browser.close();

// 3) Audio track + mux
const inputs = clips.flatMap((c) => ["-i", c.file]);
const filters = clips.map((c, i) => `[${i}:a]aresample=44100,adelay=${Math.round(c.start * 1000)}:all=1[a${i}]`);
filters.push(`${clips.map((_, i) => `[a${i}]`).join("")}amix=inputs=${clips.length}:normalize=0,apad=whole_dur=${total.toFixed(2)}[out]`);
const narration = join(work, "narration.wav");
await ffmpeg([...inputs, "-filter_complex", filters.join(";"), "-map", "[out]", "-t", total.toFixed(2), narration]);
const video = resolve(outDir, "short-demo.mp4");
await ffmpeg(["-framerate", String(FPS), "-i", join(work, "f%05d.jpg"), "-i", narration, "-r", "30", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-c:a", "aac", "-shortest", video]);

// 4) Sidecar transcript + ground truth
await writeJson(resolve(outDir, "short-demo.transcript.json"), {
  language: "en",
  source: "narration script (synthetic source video)",
  segments: clips.map((c, i) => ({ id: `seg-${i + 1}`, start: Number(c.start.toFixed(2)), end: Number((c.start + c.dur).toFixed(2)), text: c.text })),
});
await writeJson(resolve(outDir, "short-demo.truth.json"), {
  actions: absEvents.filter((e) => e.type === "click").map((e) => ({ t: e.t, target: (e as { target: string }).target, label: (e as { label: string }).label, action: (e as { action: string }).action })),
});
await writeFile(resolve(outDir, "README.txt"), "short-demo.* are generated by `pnpm demo:source` (synthetic test input).\n");
await rm(work, { recursive: true, force: true });
console.log(`source video: ${video} (${total.toFixed(1)}s, ${frames} frames)`);
