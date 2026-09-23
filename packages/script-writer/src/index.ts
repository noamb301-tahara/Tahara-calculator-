import { estimateSpeechSec, isHebrew, Script, type Hook, type ScriptSegment, type Tutorial, type TutorialStep } from "@studio/shared";
import { checkStep, instructionFromAction, stepTitle } from "./hebrew";

export * from "./hebrew";

export interface ScriptOptions {
  wordsPerSecond: number;
  ctaText: string;
  selectedHookId?: string;
}

/**
 * Hebrew hooks (Module 8): three honest options, one default. No false
 * promises — every hook describes exactly what the video shows.
 */
export function generateHooks(tutorial: Tutorial): Hook[] {
  const app = tutorial.app.name;
  const n = tutorial.steps.length;
  const title = tutorial.title_he;
  return [
    { id: "hook-speed", style: "speed", text: `${title} ב-${app}, בפחות מדקה.`, isDefault: true },
    { id: "hook-benefit", style: "benefit", text: `${title} ב-${app}: ${n === 1 ? "שלב אחד" : `${n} שלבים`} פשוטים וזהו.`, isDefault: false },
    { id: "hook-curiosity", style: "curiosity", text: `מחפשים איפה ב-${app} מסתתרת האפשרות הזאת? תכף תראו.`, isDefault: false },
  ];
}

/** The narration for a step: the instruction plus what appears afterwards. */
export function stepNarration(step: TutorialStep): string {
  let text = step.instruction_he?.trim() || instructionFromAction(step);
  if (!/[.!?]$/.test(text)) text += ".";
  const after = step.what_user_sees_after?.trim();
  if (after && isHebrew(after) && !text.includes(after)) text += ` ${after.replace(/[.!?]*$/, "")}.`;
  if (step.warning && isHebrew(step.warning)) text += ` שימו לב: ${step.warning.replace(/[.!?]*$/, "")}.`;
  return text;
}

/**
 * Deterministic Hebrew script. Short sentences, imperative plural, the real
 * UI label named explicitly. Used as-is when no LLM is configured, and as the
 * baseline/fallback when one is.
 */
export function writeScript(tutorial: Tutorial, opts: ScriptOptions): Script {
  const hooks = generateHooks(tutorial);
  const selected = hooks.find((h) => h.id === opts.selectedHookId) ?? hooks.find((h) => h.isDefault)!;
  const est = (text: string) => Math.round(estimateSpeechSec(text, opts.wordsPerSecond) * 100) / 100;
  const segments: ScriptSegment[] = [];
  const push = (s: Omit<ScriptSegment, "estimatedSec">) => segments.push({ ...s, estimatedSec: est(s.text) });

  push({ id: "intro", kind: "intro", stepId: null, text: `מדריך קצר: ${tutorial.title_he} ב-${tutorial.app.name}.`, onScreenTitle: tutorial.title_he });
  push({ id: "hook", kind: "hook", stepId: null, text: selected.text, onScreenTitle: null });
  const steps = [...tutorial.steps].sort((a, b) => a.order - b.order);
  const checks = [];
  for (const step of steps) {
    const text = stepNarration(step);
    push({ id: step.id, kind: "step", stepId: step.id, text, onScreenTitle: stepTitle(step) });
    checks.push(checkStep(step, text));
  }
  push({ id: "summary", kind: "summary", stepId: null, text: `וזהו, סיימתם! ככה עושים את זה ב-${steps.length === 1 ? "שלב אחד" : `${steps.length} שלבים`}.`, onScreenTitle: "סיכום" });
  push({ id: "cta", kind: "cta", stepId: null, text: opts.ctaText.replace(/[.!?]*$/, "."), onScreenTitle: null });

  return Script.parse({
    language: "he",
    provider: "template",
    hooks,
    selectedHookId: selected.id,
    segments,
    fullText: segments.map((s) => s.text).join("\n"),
    checks,
  });
}

/** Plain-text script (script-he.txt), one block per segment. */
export function scriptToText(script: Script, tutorial: Tutorial): string {
  const lines = [`# ${tutorial.title_he}`, ""];
  for (const s of script.segments) {
    const label = s.kind === "step" ? `[${s.stepId}] ${s.onScreenTitle ?? ""}` : `[${s.kind}]`;
    lines.push(label, s.text, "");
  }
  lines.push("# Hooks", ...script.hooks.map((h) => `${h.id === script.selectedHookId ? "*" : "-"} (${h.style}) ${h.text}`), "");
  return lines.join("\n");
}
