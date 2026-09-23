import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ScreenSetSchema, Tutorial, VisualActionSchema, parseConfig, type ScreenDefinition } from "@studio/shared";
import { choreographStep, collectTargetIds, computeCamera, computeCursor, computeRuntime, newlyOpenedOverlays } from "../src/engine/index";
import { buildRenderPlan, computeTimeline } from "../src/plan";
import { writeScript } from "@studio/script-writer";
import { buildSubtitles } from "@studio/subtitles";

const root = resolve(import.meta.dirname, "../../..");
const tutorial = Tutorial.parse(JSON.parse(readFileSync(resolve(root, "data/templates/demo-2fa/tutorial.json"), "utf8")));
const screenSet = ScreenSetSchema.parse(JSON.parse(readFileSync(resolve(root, "data/templates/demo-2fa/screens.json"), "utf8")));
const screens = Object.fromEntries(screenSet.screens.map((s) => [s.id, s])) as Record<string, ScreenDefinition>;
const config = parseConfig({});

describe("visual action runtime", () => {
  it("opens menus, toggles, types and switches screens over time", () => {
    const actions = [
      { type: "open_menu", at: 1, duration: 0.4, target: "user-menu" },
      { type: "toggle", at: 2, duration: 0.3, target: "toggle-2fa" },
      { type: "type_text", at: 3, duration: 1, target: "input-workspace", text: "abcd" },
      { type: "set_screen", at: 5, duration: 0.5, screenId: "settings-general" },
    ].map((a) => VisualActionSchema.parse(a));
    expect(computeRuntime(screens, "dashboard", actions, 0.5).overlays["user-menu"]).toBe(0);
    expect(computeRuntime(screens, "dashboard", actions, 1.5).overlays["user-menu"]).toBe(1);
    expect(computeRuntime(screens, "dashboard", actions, 2.5).toggles["toggle-2fa"]).toBe(true);
    expect(computeRuntime(screens, "dashboard", actions, 3.5).values["input-workspace"]).toBe("ab");
    const mid = computeRuntime(screens, "dashboard", actions, 5.25);
    expect(mid.screenId).toBe("settings-general");
    expect(mid.prevScreenId).toBe("dashboard");
    expect(computeRuntime(screens, "dashboard", actions, 6).prevScreenId).toBeNull();
  });
  it("is independent of evaluation order (any frame can render first)", () => {
    const actions = [VisualActionSchema.parse({ type: "toggle", at: 1, duration: 0.3, target: "toggle-2fa" })];
    const late = computeRuntime(screens, "settings-security", actions, 10);
    const early = computeRuntime(screens, "settings-security", actions, 0);
    expect(late.toggles["toggle-2fa"]).toBe(true);
    expect(early.toggles["toggle-2fa"]).toBeUndefined();
  });
});

describe("cursor and camera", () => {
  const rect = { x: 100, y: 200, w: 80, h: 40 };
  const stage = { w: 1000, h: 1200 };
  it("moves the cursor onto the target and presses on click", () => {
    const actions = [VisualActionSchema.parse({ type: "cursor_move", at: 0, duration: 1, target: "t" }), VisualActionSchema.parse({ type: "cursor_click", at: 1.2, duration: 0.3, target: "t" })];
    const end = computeCursor(actions, 1.1, () => rect, stage);
    expect(end.x).toBeCloseTo(140);
    expect(end.y).toBeCloseTo(220);
    expect(computeCursor(actions, 1.35, () => rect, stage).press).toBeGreaterThan(0.5);
  });
  it("zooms in on the target without revealing outside the stage", () => {
    const actions = [VisualActionSchema.parse({ type: "zoom_in", at: 0, duration: 0.5, target: "t", scale: 2 })];
    const cam = computeCamera(actions, 1, () => rect, stage);
    expect(cam.scale).toBe(2);
    expect(cam.tx).toBeLessThanOrEqual(0);
    expect(cam.tx).toBeGreaterThanOrEqual(stage.w - stage.w * 2);
  });
});

describe("choreography", () => {
  it("every step's target exists and gets pointer + click + effect", () => {
    for (const step of tutorial.steps) {
      const before = screens[step.screen!.before]!;
      expect(collectTargetIds(before).has(step.screen!.target_element!)).toBe(true);
      const c = choreographStep({ step, before, after: step.screen!.after ? screens[step.screen!.after]! : null, narrationSec: 4, minSec: 3.6, maxSec: 14 });
      const types = c.actions.map((a) => a.type);
      expect(types).toContain("cursor_move");
      expect(types).toContain("cursor_click");
      expect(c.notes).toEqual([]);
    }
  });
  it("animates a toast instead of cutting when only overlays change", () => {
    expect(newlyOpenedOverlays(screens["settings-security"]!, screens["settings-security-done"]!)?.map((o) => o.id)).toEqual(["toast-2fa"]);
    expect(newlyOpenedOverlays(screens["dashboard"]!, screens["settings-general"]!)).toBeNull();
  });
});

describe("timeline + render configuration", () => {
  const script = writeScript(tutorial, { wordsPerSecond: 2.3, ctaText: config.style.ctaText });
  const timeline = computeTimeline({ tutorial, screens: screenSet.screens, script, fps: 30, timing: config.timing });
  it("orders INTRO → HOOK → steps → SUMMARY → CTA and never cuts faster than the narration", () => {
    expect(timeline.entries.map((e) => e.kind)).toEqual(["intro", "hook", "step", "step", "step", "step", "summary", "cta"]);
    for (const e of timeline.entries) {
      expect(e.durationSec).toBeGreaterThanOrEqual(e.speechSec + 0.3);
      if (e.kind === "step") expect(e.durationSec).toBeGreaterThanOrEqual(config.timing.minStepSec);
    }
    expect(timeline.entries.every((e, i) => i === 0 || e.from === timeline.entries[i - 1]!.from + timeline.entries[i - 1]!.durationInFrames)).toBe(true);
  });
  it("stretches scenes to real TTS durations", () => {
    const long = computeTimeline({ tutorial, screens: screenSet.screens, script, fps: 30, timing: config.timing, voiceDurations: { "step-01": 9 } });
    expect(long.entries.find((e) => e.segmentId === "step-01")!.durationSec).toBeGreaterThanOrEqual(9.3);
  });
  it("builds a 1080x1920 @30fps plan with only the screens it uses", () => {
    const subs = buildSubtitles(timeline.entries.map((e) => ({ segmentId: e.segmentId, text: script.segments.find((s) => s.id === e.segmentId)!.text, start: e.speechStartSec, duration: e.speechSec })), config.subtitles);
    const plan = buildRenderPlan({ projectId: "t", tutorial, screens: screenSet.screens, script, timeline, subtitles: subs, config, audio: null });
    expect([plan.width, plan.height, plan.fps]).toEqual([1080, 1920, 30]);
    expect(plan.durationInFrames).toBe(timeline.totalFrames);
    expect(plan.scenes.filter((s) => s.kind === "step").every((s) => s.screenId && plan.screens.some((x) => x.id === s.screenId))).toBe(true);
    expect(plan.subtitles.every((c) => !["intro", "hook", "cta"].includes(c.segmentId))).toBe(true);
  });
});
