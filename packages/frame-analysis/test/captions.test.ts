import { describe, expect, it } from "vitest";
import { FrameAnalysis, type OcrLine } from "@studio/shared";
import { detectCaptions, maskCaptionMotion, stripCaptions } from "../src/captions";

const W = 1080;
const line = (text: string, x: number, y: number, w: number, h = 36): OcrLine => ({ text, confidence: 90, bbox: { x, y, w, h } });
const centred = (text: string, y = 1468) => line(text, (W - text.length * 24) / 2, y, text.length * 24);
const ui = [line("Taskly", 26, 35, 104), line("Team", 280, 122, 115), line("Invite member", 812, 106, 242, 64)];
const frame = (time: number, caption: OcrLine[]) =>
  FrameAnalysis.parse({ frameId: `f-${time}`, time, file: `f-${time}.jpg`, ocr: { lines: [...ui, ...caption], words: [], meanConfidence: 90 } });

const video = [
  frame(0.5, [centred("Invite a teammate in 30 seconds")]),
  frame(2, [centred("Invite a teammate in 30 seconds"), line("א", 864, 1505, 19, 29)]),
  frame(4, [centred("1. Click Team in the sideba")]),
  frame(6, [centred("1. Click Team in the sidebar")]),
  frame(8, [centred('2. Click "Invite member"')]),
  frame(10, [centred("4. Open the Role menu and"), centred("choose Editor", 1525)]),
  frame(12, [centred("Done! They'll get an invite by"), centred("email", 1525)]),
];

describe("on-screen captions", () => {
  const track = detectCaptions(video, W)!;
  it("finds the caption band and turns it into timed segments (wraps joined, OCR prefixes merged)", () => {
    expect(track).not.toBeNull();
    expect(track.segments.map((s) => s.text)).toEqual([
      "Invite a teammate in 30 seconds",
      "1. Click Team in the sidebar",
      '2. Click "Invite member"',
      "4. Open the Role menu and choose Editor",
      "Done! They'll get an invite by email",
    ]);
    expect(track.segments[1]).toMatchObject({ start: 4, end: 7.95 });
  });
  it("removes caption text (and box crumbs) from the UI OCR but keeps the UI", () => {
    const texts = stripCaptions(video[1]!, track, W).ocr.lines.map((l) => l.text);
    expect(texts).toEqual(["Taskly", "Team", "Invite member"]);
    expect(stripCaptions(video[5]!, track, W).ocr.lines).toHaveLength(3);
  });
  it("ignores UI text that stays put (no band without changing text)", () => {
    const still = [1, 2, 3, 4, 5].map((t) => frame(t, [centred("Notification preferences", 600)]));
    expect(detectCaptions(still, W)).toBeNull();
  });
  it("drops visual changes confined to the band, keeps real UI changes", () => {
    const ev = (y: number, h: number) => ({ kind: "ui_change" as const, start: 1, end: 1.2, areaFraction: 0.03, bbox: { x: 200, y, w: 600, h } });
    expect(maskCaptionMotion([ev(1450, 120), ev(200, 900)], track.band)).toHaveLength(1);
  });
});
