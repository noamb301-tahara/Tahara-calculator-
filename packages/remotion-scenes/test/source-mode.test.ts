import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { FramesAnalysisResult, Tutorial } from "@studio/shared";
import { buildSourceClips, sourceHint } from "../src/plan";
import { cameraFor } from "../src/scenes/SourceStepScene";

const frames = FramesAnalysisResult.parse({
  frames: [],
  analyses: [0, 2, 4, 6, 8].map((t) => ({ frameId: `f${t}`, time: t, file: `f${t}.jpg`, ocr: { lines: [], words: [], meanConfidence: null } })),
  motionEvents: [],
  cursorTrack: [],
  sensitive: [
    { kind: "email", text: "dana@acme.com", frameId: "f2", bbox: { x: 100, y: 500, w: 200, h: 20 } },
    { kind: "email", text: "dana@acme.com", frameId: "f4", bbox: { x: 102, y: 501, w: 198, h: 20 } },
    { kind: "money", text: "₪2", frameId: "f4", bbox: { x: 900, y: 700, w: 70, h: 40 } },
  ],
  providers: { ocr: "t", vision: null },
  region: { x: 0, y: 0, w: 1080, h: 1920 },
});

// The hand-authored demo tutorial, with two steps retargeted for the test.
const base = Tutorial.parse(JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../data/templates/demo-2fa/tutorial.json"), "utf8")));
const mk = (i: number, type: string, label: string, actionId: string) => {
  const s = structuredClone(base.steps[i]!);
  s.id = `step-${i + 1}`;
  s.action = { ...s.action, type: type as typeof s.action.type, required_real_label: label, target_label: label };
  s.source = { ...s.source, start_time: 0, end_time: 8, detected_action_id: actionId };
  return s;
};
const tutorial = { ...base, steps: [mk(0, "click", "Search", "a1"), mk(1, "toggle", "Email notifications", "a2")] };
const act = (id: string, t: number, bbox: { x: number; y: number; w: number; h: number }, point: { x: number; y: number }) => ({ id, action: "click" as const, target: "x", targetType: null, timestamp: t, confidence: 0.9, signals: [], bbox, point, beforeFrameId: null, afterFrameId: null, transcriptSegmentId: null, value: null });

describe("source mode (real screen)", () => {
  const clips = buildSourceClips(tutorial, [act("a1", 3, { x: 400, y: 100, w: 120, h: 30 }, { x: 460, y: 115 }), act("a2", 5, { x: 60, y: 600, w: 250, h: 20 }, { x: 900, y: 300 })], frames);
  it("blurs personal data from the last frame without it to the next one without it", () => {
    expect(clips["step-1"]!.blur).toEqual([{ x: 100, y: 500, w: 200, h: 20, from: 0, to: 6 }]);
  });
  it("ignores OCR crumbs that look like tiny amounts", () => {
    expect(clips["step-1"]!.blur.some((b) => b.x === 900)).toBe(false);
  });
  it("keeps a click point on the label, drops one far away, and marks a switch's whole row", () => {
    expect(clips["step-1"]!.point).toEqual({ x: 460, y: 115 });
    expect(clips["step-2"]!.point).toBeNull();
    expect(clips["step-2"]!.target!.x + clips["step-2"]!.target!.w).toBeGreaterThan(1000);
  });
  it("hints in Hebrew by action", () => {
    expect(sourceHint(tutorial.steps[0]!)).toBe("חפשו כאן");
    expect(sourceHint(tutorial.steps[1]!)).toBe("לחצו על המתג");
  });
  it("zooms toward the target but never cuts a wide target off", () => {
    const stage = { w: 1000, h: 1180 };
    const src = { width: 1920, height: 1080 };
    const wide = { x: 100, y: 500, w: 1700, h: 60 };
    const cam = cameraFor(src, stage, { x: 950, y: 530 }, 1, wide);
    expect(wide.w * cam.s).toBeLessThanOrEqual(stage.w * 0.9 + 0.01);
    const small = cameraFor(src, stage, { x: 1800, y: 100 }, 1, { x: 1750, y: 80, w: 100, h: 40 });
    expect(small.s).toBeGreaterThan(1000 / 1920);
    // The frame never slides past the recording's edge.
    expect(small.x).toBeGreaterThanOrEqual(stage.w - src.width * small.s - 0.01);
  });
});
