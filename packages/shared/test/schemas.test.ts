import { describe, expect, it } from "vitest";
import {
  Tutorial,
  ScreenDefinitionSchema,
  VisualActionSchema,
  canTransition,
  assertTransition,
  projectIdFor,
  frameFileName,
  slugify,
  stepId,
  voiceSegmentFileName,
  isSupportedVideo,
  labelSimilarity,
  parseConfig,
  deepMerge,
  VISUAL_ACTION_TYPES,
} from "../src/index";

const minimalStep = {
  id: "step-01",
  order: 1,
  goal: "Open settings",
  instruction_he: "לחצו על 'Settings' בתפריט השמאלי.",
  what_user_sees_before: "Dashboard",
  action: { type: "click", target_label: "Settings", target_type: "sidebar_item", location_description: "left sidebar", required_real_label: "Settings" },
  what_user_sees_after: "Settings page",
  source: { start_time: 1, end_time: 3 },
  confidence: 0.9,
};

describe("Tutorial schema", () => {
  it("accepts a minimal tutorial and fills defaults", () => {
    const t = Tutorial.parse({
      title: "Enable 2FA",
      title_he: "הפעלת אימות דו-שלבי",
      goal: "g",
      summary: "s",
      original_language: "en",
      estimated_final_duration: 40,
      app: { name: "Acme" },
      steps: [minimalStep],
    });
    expect(t.target_language).toBe("he");
    expect(t.fidelity_mode).toBe("faithful");
    expect(t.steps[0]!.review.status).toBe("auto");
    expect(t.steps[0]!.needs_pointer).toBe(true);
  });

  it("rejects steps with bad ids, empty instruction or out-of-range confidence", () => {
    const bad = (patch: object) =>
      Tutorial.safeParse({ title: "t", title_he: "ת", goal: "", summary: "", original_language: null, estimated_final_duration: 10, app: { name: "A" }, steps: [{ ...minimalStep, ...patch }] }).success;
    expect(bad({ id: "one" })).toBe(false);
    expect(bad({ instruction_he: "" })).toBe(false);
    expect(bad({ confidence: 1.4 })).toBe(false);
    expect(bad({})).toBe(true);
  });

  it("requires at least one step", () => {
    expect(Tutorial.safeParse({ title: "t", title_he: "ת", goal: "", summary: "", original_language: null, estimated_final_duration: 10, app: { name: "A" }, steps: [] }).success).toBe(false);
  });
});

describe("ScreenDefinition schema", () => {
  it("validates nested elements and overlays", () => {
    const screen = ScreenDefinitionSchema.parse({
      id: "s1",
      app: { name: "Acme" },
      sidebar: { items: [{ id: "nav-settings", label: "Settings", icon: "settings", children: [{ id: "nav-sec", label: "Security" }] }] },
      content: [{ kind: "card", title: "Profile", children: [{ kind: "toggle", id: "t1", label: "2FA", on: false }, { kind: "row", children: [{ kind: "button", id: "b1", label: "Save" }] }] }],
      overlays: [{ kind: "menu", id: "m1", anchor: "b1", items: [{ id: "i1", label: "Edit" }] }],
    });
    expect(screen.layout).toBe("app");
    expect(screen.overlays[0]!.open).toBe(false);
  });

  it("rejects unknown element kinds and buttons without id", () => {
    expect(ScreenDefinitionSchema.safeParse({ id: "s", app: { name: "A" }, content: [{ kind: "hologram" }] }).success).toBe(false);
    expect(ScreenDefinitionSchema.safeParse({ id: "s", app: { name: "A" }, content: [{ kind: "button", label: "x" }] }).success).toBe(false);
  });
});

describe("VisualAction schema", () => {
  it("covers every action type required by the spec", () => {
    for (const t of ["cursor_move", "cursor_click", "click_pulse", "highlight", "spotlight", "zoom_in", "zoom_out", "open_menu", "open_dialog", "select_option", "type_text", "toggle", "scroll", "before_after", "success_state", "warning_callout"]) {
      expect(VISUAL_ACTION_TYPES).toContain(t);
    }
  });
  it("applies defaults and validates params", () => {
    const a = VisualActionSchema.parse({ type: "zoom_in", at: 1, target: "x" });
    expect(a.duration).toBe(0.6);
    expect(a.type === "zoom_in" && a.scale).toBe(1.8);
    expect(VisualActionSchema.safeParse({ type: "type_text", at: 0, target: "x" }).success).toBe(false);
    expect(VisualActionSchema.safeParse({ type: "zoom_in", at: -1, target: "x" }).success).toBe(false);
  });
});

describe("project state transitions", () => {
  it("allows the happy path", () => {
    const path = ["UPLOADED", "ANALYZING", "NEEDS_REVIEW", "READY_FOR_SCRIPT", "GENERATING_VOICE", "READY_TO_RENDER", "RENDERING", "COMPLETE"] as const;
    for (let i = 1; i < path.length; i++) expect(canTransition(path[i - 1]!, path[i]!)).toBe(true);
  });
  it("blocks skipping ahead and allows ERROR everywhere", () => {
    expect(canTransition("UPLOADED", "RENDERING")).toBe(false);
    expect(canTransition("ANALYZING", "COMPLETE")).toBe(false);
    expect(() => assertTransition("UPLOADED", "COMPLETE")).toThrow(/UPLOADED -> COMPLETE/);
    for (const s of ["UPLOADED", "ANALYZING", "NEEDS_REVIEW", "READY_FOR_SCRIPT", "GENERATING_VOICE", "READY_TO_RENDER", "RENDERING", "COMPLETE"] as const) {
      expect(canTransition(s, "ERROR")).toBe(true);
    }
    expect(canTransition("ERROR", "ANALYZING")).toBe(true);
  });
});

describe("file naming", () => {
  it("builds deterministic project ids", () => {
    const sha = "a".repeat(64);
    expect(projectIdFor("My Short #1.mp4", sha)).toBe("my-short-1-aaaaaaaa");
    expect(projectIdFor("סרטון.mp4", sha)).toBe("video-aaaaaaaa");
    expect(projectIdFor("שיעור 3 - מילות מפתח.mp4", sha)).toBe("video-3-aaaaaaaa");
    expect(projectIdFor("My Short #1.mp4", sha)).toBe(projectIdFor("My Short #1.mp4", sha));
  });
  it("names frames sortably and steps/segments consistently", () => {
    expect(frameFileName(12.34)).toBe("f-000012340.jpg");
    expect(frameFileName(0)).toBe("f-000000000.jpg");
    expect([frameFileName(100), frameFileName(9)].sort()[0]).toBe(frameFileName(9));
    expect(stepId(3)).toBe("step-03");
    expect(voiceSegmentFileName(2, "step-03")).toBe("seg-002-step-03.mp3");
    expect(slugify("  Hello, World!  ")).toBe("hello-world");
  });
  it("recognises supported video formats", () => {
    expect(isSupportedVideo("a.MP4")).toBe(true);
    expect(isSupportedVideo("a.webm")).toBe(true);
    expect(isSupportedVideo("a.mov")).toBe(true);
    expect(isSupportedVideo("a.gif")).toBe(false);
  });
});

describe("config", () => {
  it("has spec defaults (1080x1920 @30fps, faithful, he)", () => {
    const c = parseConfig({});
    expect([c.video.width, c.video.height, c.video.fps]).toEqual([1080, 1920, 30]);
    expect(c.fidelity.mode).toBe("faithful");
    expect(c.language).toBe("he");
  });
  it("deep merges overrides", () => {
    const c = deepMerge(parseConfig({}), { video: { fps: 60 }, style: { preset: "dark" } });
    expect(c.video.fps).toBe(60);
    expect(c.video.width).toBe(1080);
    expect(c.style.preset).toBe("dark");
  });
});

describe("text helpers", () => {
  it("matches labels tolerant to OCR noise", () => {
    expect(labelSimilarity("Settings", "settings")).toBe(1);
    expect(labelSimilarity("Settings", "Setting5")).toBeGreaterThan(0.8);
    expect(labelSimilarity("Settings", "Billing")).toBeLessThan(0.5);
  });
});

describe(".env loading", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { loadDotEnv } = await import("../src/node/load-config");
  it("loads keys from .env without overriding real environment variables", () => {
    const dir = mkdtempSync(join(tmpdir(), "env-"));
    writeFileSync(join(dir, ".env"), "STUDIO_TEST_A=from-file\nSTUDIO_TEST_B=from-file\n");
    process.env.STUDIO_TEST_B = "from-env";
    const added = loadDotEnv(dir);
    expect(process.env.STUDIO_TEST_A).toBe("from-file");
    expect(process.env.STUDIO_TEST_B).toBe("from-env");
    expect(added).toContain("STUDIO_TEST_A");
    expect(loadDotEnv(join(dir, "missing"))).toEqual([]);
  });
});
