import { describe, expect, it } from "vitest";
import { FrameAnalysis, type OcrLine } from "@studio/shared";
import { mergedPageLines, type AppModel } from "../src/index";

const app: AppModel = {
  appName: "Demo",
  region: { x: 0, y: 0, w: 1080, h: 1920 },
  chrome: null,
  nav: [],
  topNav: [],
  navRight: 0,
  search: null,
  hasAvatar: false,
};
const line = (text: string, y: number, source?: OcrLine["source"]): OcrLine => ({ text, confidence: 90, bbox: { x: 60, y, w: 400, h: 40 }, source });
const frame = (time: number, lines: OcrLine[]) =>
  FrameAnalysis.parse({ frameId: `f-${time}`, time, file: `f-${time}.jpg`, ocr: { lines, words: [], meanConfidence: 90 }, pageTitle: "Settings" });

describe("multi-frame page lines", () => {
  const main = frame(1, [line("Notification preferences", 200), line("Email notifications", 400)]);
  it("adds an element OCR saw only in a later frame of the same state", () => {
    const later = frame(3, [line("Notification preferences", 202), line("Save changes", 800, "control")]);
    const texts = mergedPageLines({ page: main, companions: [later], dialog: null }, app).map((l) => l.text);
    expect(texts).toEqual(["Notification preferences", "Email notifications", "Save changes"]);
  });
  it("never duplicates or overlaps what the main frame already has", () => {
    const noisy = frame(2, [line("Notificaton preferences", 205), line("Emall notifications", 410)]);
    expect(mergedPageLines({ page: main, companions: [noisy], dialog: null }, app)).toHaveLength(2);
  });
  it("skips text the user types (field values belong to the state machine)", () => {
    const typing = frame(2, [line("dana@example.com", 600)]);
    expect(mergedPageLines({ page: main, companions: [typing], dialog: null }, app, ["dana@example.com"])).toHaveLength(2);
  });
});
