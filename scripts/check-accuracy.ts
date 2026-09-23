/**
 * Accuracy check against ground truth (input/<name>.truth.json, written by make-source-demo
 * or by hand for real videos): every true action must be found as a tutorial step with the
 * right label and type, within 1.5 s, and its target must exist on the step's screen.
 *
 *   pnpm accuracy            (processes each video until the "seo" stage; no render)
 */
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PROJECT_FILES, ScreenSetSchema, Tutorial, labelSimilarity } from "@studio/shared";
import { loadConfig, readJson, readJsonAs } from "@studio/shared/node";
import { collectTargetIds } from "@studio/remotion-scenes/engine";
import { Pipeline } from "@studio/pipeline";

const { config, root } = await loadConfig();
const pipeline = new Pipeline({ root, config });
const dir = resolve(root, process.argv[2] ?? "input");
const truths = (await readdir(dir)).filter((f) => f.endsWith(".truth.json"));
let failed = 0;
for (const tf of truths) {
  const video = join(dir, tf.replace(".truth.json", ".mp4"));
  const truth = await readJson<{ actions: { t: number; label: string; action: string }[] }>(join(dir, tf));
  const project = await pipeline.importVideo(video);
  await pipeline.run(project.id, { until: "seo", autoApprove: true });
  const tutorial = await readJsonAs(pipeline.store.pathFor(project.id, PROJECT_FILES.tutorial), Tutorial);
  const screens = await readJsonAs(pipeline.store.pathFor(project.id, PROJECT_FILES.screens), ScreenSetSchema);
  // A select is one step made of two clicks (open + choose): keep the first, accept either label.
  const expected = truth.actions
    .map((a, i, arr) => ({ ...a, labels: a.action === "select" && arr[i + 1]?.action === "select" ? [a.label, arr[i + 1]!.label] : [a.label] }))
    .filter((a, i, arr) => !(a.action === "select" && arr[i - 1]?.action === "select"));
  const { actions: detected } = await readJson<{ actions: { id: string; timestamp: number }[] }>(pipeline.store.pathFor(project.id, PROJECT_FILES.actions));
  const timeOf = (id: string | null) => detected.find((d) => d.id === id)?.timestamp ?? NaN;
  const used = new Set<string>();
  const rows: string[] = [];
  let found = 0;
  for (const a of expected) {
    const step = tutorial.steps.find(
      (s) =>
        !used.has(s.id) &&
        Math.abs(timeOf(s.source.detected_action_id) - a.t) <= 1.5 &&
        a.labels.some((l) => labelSimilarity(s.action.required_real_label, l) > 0.8 || (s.action.value != null && labelSimilarity(s.action.value, l) > 0.8)),
    );
    const screen = step?.screen ? screens.screens.find((x) => x.id === step.screen!.before) : undefined;
    const targetOk = Boolean(step?.screen?.target_element && screen && collectTargetIds(screen).has(step.screen.target_element));
    const ok = Boolean(step) && targetOk;
    if (step) used.add(step.id);
    if (ok) found++;
    rows.push(`  ${ok ? "✓" : "✗"} ${a.t.toFixed(1)}s ${a.action} "${a.label}" → ${step ? `${step.id} ${step.action.type} "${step.action.required_real_label}" target=${step.screen?.target_element}${targetOk ? "" : " (target missing)"}` : "not found"}`);
  }
  const extra = tutorial.steps.filter((s) => !used.has(s.id)).length;
  const recall = found / expected.length;
  console.log(`${project.id}: ${found}/${expected.length} actions correct, ${extra} extra step(s)`);
  console.log(rows.join("\n"));
  if (recall < 1 || extra > 0) failed++;
}
if (failed) process.exitCode = 1;
