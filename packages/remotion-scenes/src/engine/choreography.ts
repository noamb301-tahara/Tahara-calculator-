import type { ScreenDefinition, TutorialStep, VisualActionInput } from "@studio/shared";
import { collectTargetIds, findElement } from "./runtime";

/**
 * Choreographer: turns a tutorial step (what to do, on which element, on which
 * screens) into a JSON VisualAction timeline. This is the only place where
 * "how a click looks" is decided, so every video shares the same grammar.
 */

export interface ChoreographyInput {
  step: TutorialStep;
  before: ScreenDefinition;
  after: ScreenDefinition | null;
  /** Narration length for this step in seconds. */
  narrationSec: number;
  minSec: number;
  maxSec: number;
  /** Real English label + Hebrew label for the callout. */
  calloutText?: string | null;
  isLastStep?: boolean;
}

export interface ChoreographyResult {
  actions: VisualActionInput[];
  durationSec: number;
  /** When the key interaction (click/toggle/type) happens, from scene start. */
  interactionAt: number;
  notes: string[];
}

const round = (n: number) => Math.round(n * 100) / 100;

export function choreographStep(input: ChoreographyInput): ChoreographyResult {
  const { step, before, after } = input;
  const notes: string[] = [];
  const actions: VisualActionInput[] = [];
  const target = step.screen?.target_element ?? null;
  const targetExists = target ? collectTargetIds(before).has(target) : false;
  if (target && !targetExists) notes.push(`target element "${target}" not found in screen "${before.id}" — pointer omitted`);
  const hasTarget = Boolean(target && targetExists);

  // Key interaction lands around the middle of the narration, never too early.
  const narration = Math.max(0.5, input.narrationSec);
  const approach = 1.0;
  const moveAt = 0.45;
  const interactionAt = round(Math.max(moveAt + approach + 0.55, Math.min(narration * 0.5, narration - 0.6)));
  const zoom = step.needs_zoom && hasTarget;
  const menuFromTarget = hasTarget ? before.overlays.find((o) => o.kind === "menu" && o.anchor === target) : undefined;

  if (hasTarget && step.needs_pointer !== false && step.action.type !== "observe" && step.action.type !== "scroll") {
    const moveStart = round(Math.max(moveAt, interactionAt - approach - 0.7));
    actions.push({ type: "cursor_move", at: moveStart, duration: approach, target: target! });
  }

  if (hasTarget) {
    const hlAt = round(interactionAt - 0.75);
    actions.push({ type: "highlight", at: hlAt, duration: 0.35, target: target!, until: round(interactionAt + 0.55) });
    if (step.visual_importance === "high" && !zoom) {
      actions.push({ type: "spotlight", at: hlAt, duration: 0.35, target: target!, until: round(interactionAt + 0.45) });
    }
    if (zoom) actions.push({ type: "zoom_in", at: round(interactionAt - 1.05), duration: 0.7, target: target!, scale: 1.7 });
    if (step.needs_callout && input.calloutText) {
      actions.push({ type: "callout", at: round(interactionAt - 0.6), duration: 0.3, target: target!, text: input.calloutText, subtext: labelSubtext(step) });
    }
  }

  let effectEnd = interactionAt + 0.4;
  const act = step.action.type;
  const clickLike = act === "click" || act === "double_click" || act === "right_click" || act === "navigate" || act === "open_menu" || act === "hover";

  if (hasTarget && (clickLike || act === "toggle" || act === "check" || act === "type" || act === "select")) {
    if (act !== "hover") {
      actions.push({ type: "cursor_click", at: interactionAt, duration: 0.28, target: target! });
      actions.push({ type: "click_pulse", at: round(interactionAt + 0.05), duration: 0.7, target: target! });
    }
  }

  const effectAt = round(interactionAt + 0.25);
  if (hasTarget && (act === "toggle" || act === "check")) {
    actions.push({ type: "toggle", at: effectAt, duration: 0.35, target: target! });
    effectEnd = effectAt + 0.35;
  } else if (hasTarget && act === "type") {
    const text = step.action.value ?? "";
    if (text) {
      const d = round(Math.min(2.2, Math.max(0.6, text.length * 0.06)));
      actions.push({ type: "type_text", at: effectAt, duration: d, target: target!, text });
      effectEnd = effectAt + d;
    } else notes.push("type action without a value — nothing typed");
  } else if (hasTarget && act === "select") {
    const optionId = step.action.value ?? "";
    const el = findElement(before, target!);
    const option = el && el.kind === "dropdown" ? el.options.find((o) => o.id === optionId || o.label === optionId) : undefined;
    if (option) {
      actions.push({ type: "select_option", at: effectAt, duration: 1.5, target: target!, optionId: option.id });
      effectEnd = effectAt + 1.5;
    } else notes.push(`select action: option "${optionId}" not found in dropdown "${target}"`);
  } else if (act === "scroll") {
    actions.push({ type: "scroll", at: 0.6, duration: 1.2, by: 320 });
    effectEnd = 1.8;
  } else if (menuFromTarget && clickLike) {
    actions.push({ type: "open_menu", at: effectAt, duration: 0.35, target: menuFromTarget.id });
    effectEnd = effectAt + 0.35;
  }

  // If "after" is the same screen with overlays (toast/dialog/menu) opened, animate the overlays instead of cutting.
  const overlayOnly = after && after.id !== before.id && !menuFromTarget ? newlyOpenedOverlays(before, after) : null;
  if (overlayOnly && overlayOnly.length) {
    const at = round(Math.max(effectAt, effectEnd) + 0.25);
    for (const o of overlayOnly) {
      actions.push(o.kind === "toast" ? { type: "toast", at, duration: 0.4, target: o.id } : o.kind === "dialog" ? { type: "open_dialog", at, duration: 0.4, target: o.id } : { type: "open_menu", at, duration: 0.35, target: o.id });
    }
    effectEnd = at + 0.4;
  } else if (after && after.id !== before.id && !menuFromTarget) {
    // Navigation to a different screen.
    const at = round(Math.max(effectAt, effectEnd - 0.1) + (act === "toggle" || act === "type" || act === "select" ? 0.5 : 0));
    actions.push({ type: "set_screen", at, duration: 0.45, screenId: after.id });
    effectEnd = at + 0.45;
  }

  if (zoom) {
    const at = round(Math.max(effectEnd + 0.25, interactionAt + 0.6));
    actions.push({ type: "zoom_out", at, duration: 0.6 });
    effectEnd = at + 0.6;
  }

  if (step.warning) {
    actions.push({ type: "warning_callout", at: round(effectEnd + 0.2), duration: 0.3, text: step.warning, target: undefined });
    effectEnd += 1.6;
  }
  if (input.isLastStep) {
    actions.push({ type: "success_state", at: round(effectEnd + 0.3), duration: 0.5, text: "בוצע!" });
    effectEnd += 1.3;
  }

  const durationSec = round(Math.min(input.maxSec, Math.max(input.minSec, narration + 0.5, effectEnd + 0.9)));
  return { actions: actions.map((a) => clampAction(a, durationSec)), durationSec, interactionAt, notes };
}

/**
 * Returns overlays that are open in `after` but closed in `before`, when the two
 * screens are otherwise the same (ignoring toggle/checkbox state). Null if the
 * screens differ in content.
 */
export function newlyOpenedOverlays(before: ScreenDefinition, after: ScreenDefinition): ScreenDefinition["overlays"] | null {
  const norm = (s: ScreenDefinition) =>
    JSON.stringify({ ...s, id: "", name: "", overlays: s.overlays.map((o) => ({ ...o, open: false })) }, (k, v) => (k === "on" || k === "checked" ? false : v));
  if (norm(before) !== norm(after)) return null;
  return after.overlays.filter((o) => o.open && !before.overlays.find((b) => b.id === o.id)?.open);
}

function labelSubtext(step: TutorialStep): string | undefined {
  const he = step.action.label_he;
  if (he && he !== step.action.required_real_label) return he;
  return undefined;
}

function clampAction(a: VisualActionInput, max: number): VisualActionInput {
  const at = Math.min(a.at, Math.max(0, max - 0.2));
  if ("until" in a && typeof a.until === "number") return { ...a, at, until: Math.min(a.until, max) } as VisualActionInput;
  return { ...a, at };
}
