import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { Tutorial } from "@studio/shared";
import { courseOutline, planAcademy } from "../src/index";

const base = Tutorial.parse(JSON.parse(readFileSync(resolve(import.meta.dirname, "../../../data/templates/demo-2fa/tutorial.json"), "utf8")));

describe("academy", () => {
  it("groups by app, flags duplicates and missing topics, orders basic → advanced", () => {
    const advanced = { ...base, title: "Advanced security audit", difficulty: "advanced" as const };
    const plan = planAcademy([
      { projectId: "a", tutorial: base, navLabels: ["Home", "Projects", "Team"] },
      { projectId: "b", tutorial: { ...base }, navLabels: [] },
      { projectId: "c", tutorial: advanced, navLabels: [] },
    ]);
    expect(plan.apps).toHaveLength(1);
    const app = plan.apps[0]!;
    expect(app.duplicates.some((d) => d.a === "a" && d.b === "b")).toBe(true);
    expect(app.missingTopics).toEqual(["Home", "Projects", "Team"]);
    const order = app.chapters.flatMap((c) => c.tutorials.map((t) => t.projectId));
    expect(order.indexOf("c")).toBeGreaterThan(order.indexOf("a"));
    expect(courseOutline(plan)).toContain("פרק 1");
  });
});
