/**
 * Render PNG stills from a render plan for visual checks.
 *   tsx scripts/stills.ts <render-plan.json> <outDir> [sceneId:sec ...]
 * Without scene args: one frame per step at 3 moments (start, interaction, end).
 */
import { resolve } from "node:path";
import { RenderPlan } from "@studio/shared";
import { readJsonAs } from "@studio/shared/node";
import { renderPlanStill } from "@studio/renderer";

const [planPath, outDir, ...specs] = process.argv.slice(2);
if (!planPath || !outDir) throw new Error("usage: stills.ts <plan> <outDir> [scene:sec...]");
const plan = await readJsonAs(resolve(planPath), RenderPlan);
const frames: { name: string; frame: number }[] = [];
if (specs.length) {
  for (const s of specs) {
    const [id, sec] = s.split(":");
    const scene = plan.scenes.find((x) => x.id === id);
    if (!scene) throw new Error(`no scene ${id}`);
    frames.push({ name: `${id}-${sec}`, frame: scene.from + Math.round(Number(sec) * plan.fps) });
  }
} else {
  for (const scene of plan.scenes.filter((s) => s.kind === "step")) {
    const click = scene.actions.find((a) => a.type === "cursor_click")?.at ?? scene.durationInFrames / plan.fps / 2;
    for (const [label, sec] of [["a", 0.6], ["b", click - 0.15], ["c", click + 1.2]] as const) {
      frames.push({ name: `${scene.id}-${label}`, frame: Math.min(scene.from + scene.durationInFrames - 1, scene.from + Math.round(sec * plan.fps)) });
    }
  }
}
for (const f of frames) {
  const file = resolve(outDir, `${f.name}.png`);
  await renderPlanStill(plan, f.frame, file);
  console.log(file);
}
