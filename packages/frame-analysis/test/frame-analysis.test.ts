import { describe, expect, it } from "vitest";
import { analyzeMotion, cleanButtonText, parseTsv, planFrameSamples } from "../src/index";

/** Build a synthetic gray motion stream: a small "cursor" square moving, then a big UI change. */
function stream() {
  const w = 60, h = 100, fps = 10, n = 30;
  const data = new Uint8Array(w * h * n).fill(240);
  for (let f = 0; f < n; f++) {
    const frame = data.subarray(f * w * h, (f + 1) * w * h);
    const cx = f < 10 ? 5 + f * 3 : 32; // moves for 1s then rests
    for (let y = 40; y < 43; y++) for (let x = cx; x < cx + 3; x++) frame[y * w + x] = 10;
    if (f >= 20) for (let y = 50; y < 95; y++) for (let x = 0; x < w; x++) frame[y * w + x] = 60; // dialog appears at 2.0s
  }
  return { data, width: w, height: h, fps, frameCount: n };
}

describe("motion analysis", () => {
  const m = analyzeMotion(stream(), 10);
  it("tracks the cursor and detects where it stops", () => {
    expect(m.cursor.length).toBeGreaterThan(5);
    const stop = m.events.find((e) => e.kind === "cursor_stop");
    expect(stop?.point?.x).toBeGreaterThanOrEqual(300);
    expect(stop!.start).toBeLessThan(1.2);
  });
  it("detects the large UI change and its area", () => {
    const ui = m.events.find((e) => e.kind === "ui_change");
    expect(ui?.start).toBeCloseTo(1.9, 1);
    expect(ui!.areaFraction).toBeGreaterThan(0.3);
  });
});

describe("frame sampling", () => {
  it("samples around changes, stops and cues, within budget", () => {
    const s = planFrameSamples({
      durationSec: 20,
      scenes: [{ time: 5, score: 0.5 }],
      motion: [{ kind: "ui_change", start: 10, end: 10.2, areaFraction: 0.4 }],
      transcript: [{ id: "s", start: 12, end: 14, text: "Now click Save" }],
      intervalSec: 4,
      maxFrames: 12,
    });
    expect(s.length).toBeLessThanOrEqual(12);
    expect(s.some((x) => x.reasons.includes("before_change") && x.time < 10)).toBe(true);
    expect(s.some((x) => x.reasons.includes("after_change") && x.time > 10.2)).toBe(true);
    expect(s.some((x) => x.reasons.includes("transcript_cue"))).toBe(true);
    expect(s.map((x) => x.time)).toEqual([...s.map((x) => x.time)].sort((a, b) => a - b));
  });
});

describe("OCR parsing", () => {
  it("parses tesseract TSV into lines, dropping low confidence", () => {
    const tsv = [
      "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext",
      "5\t1\t1\t1\t1\t1\t10\t10\t50\t20\t95\tInvite",
      "5\t1\t1\t1\t1\t2\t65\t10\t60\t20\t93\tmember",
      "5\t1\t2\t1\t1\t1\t400\t10\t40\t20\t20\tjunk",
    ].join("\n");
    const r = parseTsv(tsv, 55);
    expect(r.lines.map((l) => l.text)).toEqual(["Invite member"]);
    expect(r.lines[0]!.bbox).toEqual({ x: 10, y: 10, w: 115, h: 20 });
  });
  it("cleans cursor junk from button OCR", () => {
    expect(cleanButtonText(["BD", "invite", "member", "I"])).toBe("invite member");
    expect(cleanButtonText(["|"])).toBe("");
  });
});
