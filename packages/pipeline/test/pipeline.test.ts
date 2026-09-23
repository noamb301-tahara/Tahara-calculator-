import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PROJECT_FILES, RenderPlan, SeoContent, parseConfig } from "@studio/shared";
import { Logger, readJsonAs } from "@studio/shared/node";
import { Pipeline, isHumanEdited } from "../src/index";

const repo = resolve(import.meta.dirname, "../../..");

async function makePipeline() {
  const root = await mkdtemp(join(tmpdir(), "studio-"));
  const config = parseConfig({ voice: { provider: "silent" }, llm: { provider: "none" } });
  return new Pipeline({ root, config, logger: new Logger({}, null, "error", true), llm: null });
}

describe("pipeline (manual demo project, no render)", () => {
  it("runs script → voice → subtitles → plan → guide → seo, then caches everything", async () => {
    const pl = await makePipeline();
    const p = await pl.createManualProject(resolve(repo, "data/templates/demo-2fa"), "demo-test");
    const done = await pl.run(p.id, { until: "seo" });
    expect(done.status).toBe("READY_TO_RENDER");
    expect(done.stages.ingest?.status).toBe("skipped");
    for (const s of ["write_script", "voice", "subtitles", "plan_render", "guide", "seo"] as const) expect(done.stages[s]?.status).toBe("complete");
    const dir = pl.store.dirFor(p.id);
    const plan = await readJsonAs(join(dir, PROJECT_FILES.renderPlan), RenderPlan);
    expect(plan.scenes.map((s) => s.kind)).toEqual(["intro", "hook", "step", "step", "step", "step", "summary", "cta"]);
    const seo = await readJsonAs(join(dir, PROJECT_FILES.seo), SeoContent);
    expect(seo.data.search_volume).toBeNull();
    expect(await readFile(join(dir, PROJECT_FILES.subtitlesSrt), "utf8")).toMatch(/-->/);
    expect(await readFile(join(dir, PROJECT_FILES.guide), "utf8")).toMatch(/## שלב 1/);

    const again = await pl.run(p.id, { until: "seo" });
    for (const s of ["write_script", "voice", "subtitles", "plan_render", "guide", "seo"] as const) expect(again.stages[s]?.cached).toBe(true);
    expect(again.history.length).toBeGreaterThan(1);
  }, 120_000);

  it("re-runs only what depends on an edited tutorial", async () => {
    const pl = await makePipeline();
    const p = await pl.createManualProject(resolve(repo, "data/templates/demo-2fa"), "demo-edit");
    await pl.run(p.id, { until: "seo" });
    const file = pl.store.pathFor(p.id, PROJECT_FILES.tutorial);
    const t = JSON.parse(await readFile(file, "utf8"));
    t.steps[0].instruction_he = "לחצו על תמונת הפרופיל למעלה מימין.";
    t.steps[0].review.status = "edited";
    await writeFile(file, JSON.stringify(t));
    const after = await pl.run(p.id, { until: "seo" });
    expect(after.stages.write_script?.cached).toBe(false);
    expect(isHumanEdited(t)).toBe(true);
    const script = await readFile(pl.store.pathFor(p.id, PROJECT_FILES.scriptText), "utf8");
    expect(script).toContain("למעלה מימין");
  }, 120_000);

  it("marks the project ERROR with the failing stage and message", async () => {
    const pl = await makePipeline();
    const p = await pl.createManualProject(resolve(repo, "data/templates/demo-2fa"), "demo-broken");
    await writeFile(pl.store.pathFor(p.id, PROJECT_FILES.screens), "{ not json");
    await expect(pl.run(p.id, { until: "seo" })).rejects.toThrow();
    const failed = await pl.store.require(p.id);
    expect(failed.status).toBe("ERROR");
    expect(failed.error).toMatch(/voice/);
  }, 60_000);
});
