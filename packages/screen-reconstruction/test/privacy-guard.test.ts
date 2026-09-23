import { describe, expect, it } from "vitest";
import { FramesAnalysisResult } from "@studio/shared";
import { DemoDataReplacer } from "@studio/demo-data";
import { guardLeaks, PrivacyLeakError } from "../src/index";

const frames = FramesAnalysisResult.parse({
  frames: [],
  analyses: [],
  motionEvents: [],
  cursorTrack: [],
  sensitive: [
    { kind: "person_name", text: "John Smith" },
    { kind: "money", text: "$17,428" },
    { kind: "email", text: "john.smith@acme.com" },
  ],
  providers: { ocr: "test", vision: null },
  region: { x: 0, y: 0, w: 100, h: 100 },
});

describe("privacy guard", () => {
  it("replaces source PII that slipped into screens (e.g. mistaken for a nav label)", () => {
    const value = { screens: [{ sidebar: { items: [{ id: "nav-john", label: "John Smith" }, { id: "nav-rev", label: "$17,428" }] } }], note: "mail john.smith@acme.com" };
    const out = guardLeaks(frames, value, new DemoDataReplacer([], "t"), new Set());
    const json = JSON.stringify(out.value);
    expect(json).not.toContain("John Smith");
    expect(json).not.toContain("$17,428");
    expect(json).not.toContain("acme.com");
    expect(out.fixed).toBe(3);
  });
  it("leaves real UI labels the viewer must find untouched", () => {
    const out = guardLeaks(frames, { label: "John Smith" }, new DemoDataReplacer([], "t"), new Set(["John Smith"]));
    expect(out.value.label).toBe("John Smith");
  });
  it("is a typed error when something cannot be replaced", () => {
    expect(new PrivacyLeakError(["email"]).message).toMatch(/refusing/);
  });
});
