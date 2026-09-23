import { describe, expect, it } from "vitest";
import { FramesAnalysisResult, Transcript, type OcrLine } from "@studio/shared";
import { detectActions, parseCues, titleHe } from "../src/index";

describe("narration cues", () => {
  const cues = parseCues([
    { id: "s1", start: 0, end: 3, text: "First, click Team in the left sidebar." },
    { id: "s2", start: 3, end: 6, text: "Now click the Invite member button at the top right." },
    { id: "s3", start: 6, end: 9, text: "Then open the Role menu and choose Editor." },
    { id: "s4", start: 9, end: 11, text: "Type your teammate's email address." },
  ]);
  it("extracts action, target and location", () => {
    expect(cues[0]).toMatchObject({ action: "click", targets: ["Team"], location: "left sidebar" });
    expect(cues[1]!.targets[0]).toBe("Invite member");
    expect(cues[1]!.location).toBe("top right");
  });
  it("merges 'open X menu and choose Y' into a select", () => {
    expect(cues[2]).toMatchObject({ action: "select", container: "Role", value: "Editor" });
  });
  it("offers shorter target suffixes for fuzzy matching", () => {
    expect(cues[3]!.targets).toContain("email address");
  });
  it("translates simple how-to titles offline", () => {
    expect(titleHe("invite a teammate", "Taskly")).toBe("איך להזמין חבר צוות");
    expect(titleHe("frobnicate the widget", null)).toBeNull();
  });
});

describe("action fusion", () => {
  const line = (text: string, x: number, y: number): OcrLine => ({ text, confidence: 90, bbox: { x, y, w: 100, h: 20 } });
  const frames = FramesAnalysisResult.parse({
    frames: [],
    analyses: [
      { frameId: "f1", time: 1, file: "a.jpg", ocr: { lines: [line("Team", 40, 500), line("Dashboard", 40, 400)], words: [], meanConfidence: 90 } },
      { frameId: "f2", time: 3, file: "b.jpg", ocr: { lines: [line("Team", 300, 100)], words: [], meanConfidence: 90 } },
    ],
    motionEvents: [
      { kind: "cursor_stop", start: 1.6, end: 2, areaFraction: 0, point: { x: 60, y: 505 } },
      { kind: "ui_change", start: 2.1, end: 2.3, areaFraction: 0.3 },
      { kind: "ui_change", start: 8, end: 8.2, areaFraction: 0.2 },
    ],
    cursorTrack: [{ time: 1.5, x: 60, y: 505, confidence: 0.8 }, { time: 7.9, x: 800, y: 900, confidence: 0.8 }],
    sensitive: [],
    providers: { ocr: "test", vision: null },
    region: { x: 0, y: 0, w: 1080, h: 1920 },
  });
  const transcript = Transcript.parse({ language: "en", provider: "test", text: "", segments: [{ id: "s1", start: 0.5, end: 2.5, text: "Click Team in the sidebar." }] });
  const actions = detectActions({ transcript, frames, minConfidence: 0.3 });
  it("combines narration, OCR, cursor and UI change into a confident click", () => {
    const team = actions.find((a) => a.target === "Team")!;
    expect(team.action).toBe("click");
    expect(team.timestamp).toBeCloseTo(2.1);
    expect(team.confidence).toBeGreaterThan(0.9);
    expect(team.signals.map((s) => s.signal)).toEqual(expect.arrayContaining(["transcript_cue", "ocr_label_match", "cursor_near_label", "ui_change_after"]));
  });
  it("keeps un-narrated UI changes as low-confidence candidates", () => {
    const other = actions.find((a) => a.timestamp === 8);
    expect(other).toBeDefined();
    expect(other!.confidence).toBeLessThan(0.7);
  });
});

describe("toggle cues", () => {
  it("keeps the direction of a toggle", () => {
    const c = parseCues([
      { id: "a", start: 0, end: 2, text: "Turn off Email notifications." },
      { id: "b", start: 2, end: 4, text: "Enable Dark mode." },
    ]);
    expect(c[0]).toMatchObject({ action: "toggle", value: "off" });
    expect(c[1]).toMatchObject({ action: "toggle", value: "on" });
  });
});
