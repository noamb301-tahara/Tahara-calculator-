import { describe, expect, it } from "vitest";
import { Tutorial, type TutorialStepInput } from "@studio/shared";
import { checkStep, generateHooks, hebrewLocation, instructionFromAction, spokenAfter, stepTitle, writeScript } from "../src/index";

const step = (o: Partial<TutorialStepInput> & { order: number }): TutorialStepInput => ({
  id: `step-0${o.order}`,
  goal: "g",
  instruction_he: "",
  what_user_sees_before: "",
  action: { type: "click", target_label: "Settings", target_type: "sidebar_item", location_description: "left sidebar", required_real_label: "Settings" },
  what_user_sees_after: "נפתח מסך ההגדרות",
  source: { start_time: 0, end_time: 1 },
  confidence: 0.9,
  ...o,
});
const tutorial = Tutorial.parse({
  title: "t",
  title_he: "הפעלת מצב כהה",
  goal: "",
  summary: "",
  original_language: "en",
  estimated_final_duration: 30,
  app: { name: "Acme" },
  steps: [step({ order: 2, instruction_he: "לחצו על 'Settings' בתפריט השמאלי." }), step({ order: 1, instruction_he: "פתחו את 'Settings' בתפריט השמאלי." })],
});

describe("Hebrew script", () => {
  it("keeps step order by `order`, not array position", () => {
    const s = writeScript(tutorial, { wordsPerSecond: 2.3, ctaText: "עקבו" });
    expect(s.segments.map((x) => x.id)).toEqual(["intro", "hook", "step-01", "step-02", "summary", "cta"]);
  });
  it("writes natural imperative Hebrew with the real label and location", () => {
    const text = instructionFromAction(Tutorial.parse({ ...tutorial }).steps[1]!);
    expect(text).toBe("לחצו על 'Settings' בתפריט הצד משמאל.");
    expect(hebrewLocation("top right corner")).toBe("בפינה הימנית העליונה");
  });
  it("adds what appears after the action and checks what/where/after", () => {
    const s = writeScript(tutorial, { wordsPerSecond: 2.3, ctaText: "עקבו" });
    const seg = s.segments.find((x) => x.id === "step-02")!;
    expect(seg.text).toContain("נפתח מסך ההגדרות");
    expect(s.checks.every((c) => c.what && c.where && c.after)).toBe(true);
    const bad = checkStep({ ...tutorial.steps[0]!, what_user_sees_after: "" }, "Settings");
    expect(bad.issues.length).toBe(3);
  });
  it("produces exactly three honest hooks with one default", () => {
    const hooks = generateHooks(tutorial);
    expect(hooks).toHaveLength(3);
    expect(hooks.filter((h) => h.isDefault)).toHaveLength(1);
    expect(hooks.every((h) => h.text.includes("Acme"))).toBe(true);
  });
  it("never reads emails or long UI strings aloud", () => {
    expect(spokenAfter("מופיעה הודעת אישור: 'Invitation sent to noa.park@example.com'")).toBe("מופיעה הודעת אישור");
    expect(spokenAfter("הטקסט מופיע בשדה")).toBeNull();
    const t = Tutorial.parse({ ...tutorial, steps: [step({ order: 1, instruction_he: "x", action: { type: "type", target_label: "Email", target_type: "input", location_description: "dialog", required_real_label: "Email", value: "a.b@example.com" } })] });
    expect(instructionFromAction(t.steps[0]!)).not.toContain("@");
  });
  it("uses short on-screen titles", () => {
    expect(stepTitle(tutorial.steps[0]!)).toBe("לוחצים על Settings");
  });
});
