import { parseCues } from "./cues";
import {
  Tutorial,
  labelSimilarity,
  stepId,
  type BBox,
  type DetectedAction,
  type FrameAnalysis,
  type FramesAnalysisResult,
  type MediaInfo,
  type StudioConfig,
  type TargetType,
  type Transcript,
  type TutorialActionType,
  type TutorialStep,
} from "@studio/shared";
import { analyzeLayout } from "@studio/frame-analysis";
import { hebrewLocation, instructionFromAction } from "@studio/script-writer";
import { labelHe, titleHe } from "./lexicon";

/**
 * Module 5 — tutorial extraction (offline/heuristic path). Turns detected
 * actions + frame analysis into tutorial.json. The LLM path (when configured)
 * refines this result; it never replaces the need for review.
 */

export interface ExtractInput {
  transcript: Transcript;
  frames: FramesAnalysisResult;
  actions: DetectedAction[];
  media: MediaInfo;
  config: StudioConfig;
}

const ACTION_MAP: Record<DetectedAction["action"], TutorialActionType> = {
  click: "click",
  double_click: "double_click",
  type: "type",
  select: "select",
  toggle: "toggle",
  scroll: "scroll",
  hover: "hover",
  navigate: "click",
  open_menu: "open_menu",
  drag: "drag",
  observe: "observe",
};

const BUTTON_WORDS = /^(save|cancel|send|submit|invite|add|create|new|delete|remove|continue|next|back|done|apply|confirm|ok|close|upload|download|export|import|share|edit|update|connect|sign|log|get|manage|view|open)\b/i;
const TOAST_WORDS = /\b(sent|saved|success|successfully|enabled|disabled|created|added|updated|deleted|removed|invited|invitation|copied|done)\b/i;

function frameById(frames: FramesAnalysisResult, id: string | null): FrameAnalysis | null {
  return id ? frames.analyses.find((a) => a.frameId === id) ?? null : null;
}

function center(b: BBox) {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** Plain-English location of a box inside the app region. */
export function describeLocation(b: BBox | undefined, region: BBox, inSidebar: boolean, inDialog: boolean): string {
  if (!b) return "on the screen";
  if (inSidebar) return "left sidebar";
  if (inDialog) return "dialog";
  const c = center(b);
  const fx = (c.x - region.x) / region.w;
  const fy = (c.y - region.y) / region.h;
  // Same thin top strip as the layout analysis (not a share of a tall full-frame height).
  if (c.y - region.y < Math.min(region.h * 0.075, region.w * 0.1)) return fx > 0.66 ? "top bar, right" : fx < 0.33 ? "top bar, left" : "top bar";
  const v = fy < 0.33 ? "top" : fy > 0.7 ? "bottom" : "middle";
  const h = fx > 0.66 ? "right" : fx < 0.33 ? "left" : "center";
  return v === "middle" && h === "center" ? "center of the page" : `${v} ${h} of the page`;
}

/** New text in `after` that wasn't in `before` (by fuzzy match), largest first. */
export function newLines(before: FrameAnalysis | null, after: FrameAnalysis | null) {
  if (!after) return [];
  const prev = before?.ocr.lines ?? [];
  return after.ocr.lines
    .filter((l) => !prev.some((p) => labelSimilarity(p.text, l.text) > 0.85 && Math.abs(p.bbox.y - l.bbox.y) < 40))
    .sort((a, b) => b.bbox.h - a.bbox.h);
}

function afterDescription(a: DetectedAction, before: FrameAnalysis | null, after: FrameAnalysis | null, region: BBox): { he: string; kind: "dialog" | "page" | "toast" | "state" | "none"; title: string | null } {
  if (a.action === "type") return { he: a.value ? "הטקסט מופיע בשדה" : "השדה מתמלא", kind: "state", title: null };
  if (a.action === "select") return { he: a.value ? `'${a.value}' מופיע כאפשרות שנבחרה` : "האפשרות נבחרת", kind: "state", title: null };
  if (a.action === "toggle") return { he: a.value === "off" ? "המתג כבוי" : a.value === "on" ? "המתג דולק" : "המתג משנה את מצבו", kind: "state", title: null };
  const fresh = newLines(before, after).filter((l) => l.text.length > 2);
  const toast = fresh.find((l) => TOAST_WORDS.test(l.text));
  if (toast) return { he: `מופיעה הודעת אישור: '${toast.text}'`, kind: "toast", title: toast.text };
  const beforeTitle = before?.pageTitle ?? null;
  const afterTitle = after?.pageTitle ?? null;
  // A new large line near the vertical middle = dialog title; a changed page title = navigation.
  const top = fresh.find((l) => l.source !== "control");
  if (top) {
    const fy = (top.bbox.y - region.y) / region.h;
    const isDialog = fy > 0.2 && top.bbox.x > region.x + region.w * 0.15;
    if (isDialog) return { he: `נפתח החלון '${top.text}'`, kind: "dialog", title: top.text };
  }
  if (afterTitle && afterTitle !== beforeTitle) return { he: `נפתח העמוד '${afterTitle}'`, kind: "page", title: afterTitle };
  if (top && top.text.length > 3) return { he: `מופיע '${top.text}'`, kind: "page", title: top.text };
  return { he: "המסך מתעדכן בהתאם", kind: "none", title: null };
}

function inferTargetType(a: DetectedAction, inSidebar: boolean, inDialog: boolean, inTopbar: boolean, inTabRow: boolean): TargetType {
  if (a.action === "type") return "input";
  if (a.action === "select") return "dropdown";
  if (a.action === "toggle") return "toggle";
  if (inSidebar) return "sidebar_item";
  if (inTabRow && !inTopbar) return "tab";
  const label = a.target ?? "";
  if (inDialog && BUTTON_WORDS.test(label)) return "dialog_button";
  if (inTopbar) return /^[A-Z]{1,2}$/.test(label) ? "icon" : "button";
  if (BUTTON_WORDS.test(label)) return "button";
  return "link";
}

/** Title + app from narration ("Here's how to invite a teammate in Taskly") or on-screen caption. */
export function inferTitle(transcript: Transcript, frames: FramesAnalysisResult): { title: string; howTo: string | null; app: string | null } {
  const text = transcript.text;
  const how = /how (?:to|you can|do you) ([^.!?]+?)(?:\s+(?:in|on|with|using)\s+([A-Z][\w.]+))?[.!?]/i.exec(text);
  let app = how?.[2] ?? /\b(?:in|on|open|inside)\s+([A-Z][a-zA-Z0-9]+)\b/.exec(text)?.[1] ?? null;
  if (!app) {
    // Logo text = top-most sidebar line.
    for (const f of frames.analyses) {
      const L = analyzeLayout(f.ocr.lines, frames.region, frames.chrome);
      if (L.sidebar[0]) {
        app = L.sidebar[0].text;
        break;
      }
    }
  }
  const caption = frames.analyses[0] ? analyzeLayout(frames.analyses[0].ocr.lines, frames.region, frames.chrome).outside.filter((l) => l.bbox.y < frames.region.y).sort((a, b) => b.bbox.h - a.bbox.h)[0] : undefined;
  // Captions-only videos open with a title card ("Invite a teammate in 30 seconds").
  const opener = transcript.provider === "on-screen captions" ? transcript.segments[0]?.text : undefined;
  const openerHowTo = opener && parseCues([transcript.segments[0]!]).length === 0 ? opener.replace(/\s+(?:in\s+\d+\s+(?:seconds?|secs?|minutes?|mins?|steps?)|fast|quickly|easily)[.!]?$/i, "").replace(/[.!]+$/, "").trim() : null;
  const howTo = how?.[1]?.trim() ?? (caption ? /how to (.+)/i.exec(caption.text)?.[1] ?? null : null) ?? (openerHowTo ? openerHowTo.charAt(0).toLowerCase() + openerHowTo.slice(1) : null);
  const title = caption?.text ?? (howTo ? `How to ${howTo}` : "Tutorial");
  return { title: title.charAt(0).toUpperCase() + title.slice(1), howTo, app };
}

export function extractTutorial(input: ExtractInput): Tutorial {
  const { frames, actions, config } = input;
  const region = frames.region;
  const meta = inferTitle(input.transcript, frames);
  const app = meta.app ?? "the app";
  const steps: TutorialStep[] = [];
  let prevTime = 0;

  for (const [i, a] of actions.entries()) {
    const before = frameById(frames, a.beforeFrameId);
    const after = frameById(frames, a.afterFrameId);
    const layout = before ? analyzeLayout(before.ocr.lines, region, frames.chrome) : null;
    const hit = (lines: { bbox: BBox }[] | undefined) => Boolean(a.bbox && lines?.some((l) => Math.abs(l.bbox.x - a.bbox!.x) < 4 && Math.abs(l.bbox.y - a.bbox!.y) < 4));
    const inSidebar = hit(layout?.sidebar);
    const inTopbar = hit(layout?.topbar);
    // Dialog: a big UI change covering most of the screen happened before this action and is still open.
    const inDialog = !inSidebar && steps.some((s) => s.what_user_sees_after.startsWith("נפתח החלון")) && !steps.some((s) => s.action.target_type === "dialog_button");
    // A row of ≥3 short labels (the target among them) below the top bar = tabs.
    const tLine = a.bbox && before ? before.ocr.lines.find((l) => Math.abs(l.bbox.x - a.bbox!.x) < 4 && Math.abs(l.bbox.y - a.bbox!.y) < 4) : undefined;
    const inTabRow = Boolean(
      tLine && before && before.ocr.lines.filter((l) => Math.abs(l.bbox.y + l.bbox.h / 2 - (tLine.bbox.y + tLine.bbox.h / 2)) < 10 && l.text.split(/\s+/).length <= 2 && l.source !== "control").length >= 3,
    );
    const targetType = inferTargetType(a, inSidebar, inDialog, inTopbar, inTabRow);
    const label = a.target ?? "?";
    const baseDesc = afterDescription(a, before, after, region);
    // Clicking a tab opens that tab — say so instead of quoting a random new line.
    const desc = targetType === "tab" && inTabRowFor(a, before) && (baseDesc.kind === "page" || baseDesc.kind === "none") ? { ...baseDesc, he: `נפתחת הלשונית '${a.target}'` } : baseDesc;
    const location =
      inTopbar && targetType !== "icon"
        ? "top navigation bar"
        : targetType === "tab"
          ? "tabs row"
          : targetType === "toggle" && !inDialog
            ? "settings list"
            : describeLocation(a.bbox, region, inSidebar, inDialog);
    const small = a.bbox ? (a.bbox.w * a.bbox.h) / (region.w * region.h) < 0.02 : true;
    const step: TutorialStep = {
      id: stepId(i + 1),
      order: i + 1,
      goal: sentenceFor(input.transcript, a) ?? `${a.action} ${label}`,
      instruction_he: "",
      what_user_sees_before: before?.pageTitle ? `${before.pageTitle}` : "the current screen",
      action: {
        type: ACTION_MAP[a.action],
        target_label: label,
        target_type: targetType,
        location_description: location,
        required_real_label: label,
        label_he: labelHe(label),
        value: a.value,
      },
      what_user_sees_after: desc.he,
      visual_importance: a.confidence >= 0.8 && (desc.kind === "dialog" || desc.kind === "page") ? "high" : "medium",
      needs_zoom: small,
      needs_pointer: true,
      needs_callout: a.action !== "type",
      warning: null,
      tip: null,
      source: {
        start_time: Math.max(0, Math.round(Math.min(prevTime, a.timestamp - 0.5) * 100) / 100),
        end_time: Math.round((a.timestamp + 1.2) * 100) / 100,
        frame_before: before?.file ?? null,
        frame_after: after?.file ?? null,
        detected_action_id: a.id,
      },
      confidence: a.confidence,
      review: { status: a.confidence < config.thresholds.stepReview || !a.target ? "needs_review" : "auto", notes: reviewNotes(a), reviewed_at: null },
      screen: null,
    };
    step.instruction_he = instructionFromAction(step).replace(/ on the screen/, "");
    steps.push(step);
    prevTime = a.timestamp + 0.2;
  }

  if (steps.length === 0) {
    // Keep the project moving: one "observe" step flagged for manual editing.
    steps.push({
      id: stepId(1),
      order: 1,
      goal: meta.title,
      instruction_he: "שימו לב למסך.",
      what_user_sees_before: "the source screen",
      action: { type: "observe", target_label: "", target_type: "page", location_description: "", required_real_label: "", label_he: null, value: null },
      what_user_sees_after: "",
      visual_importance: "low",
      needs_zoom: false,
      needs_pointer: false,
      needs_callout: false,
      warning: null,
      tip: null,
      source: { start_time: 0, end_time: input.media.durationSec, frame_before: null, frame_after: null, detected_action_id: null },
      confidence: 0,
      review: { status: "needs_review", notes: "No actions were detected automatically — add steps manually.", reviewed_at: null },
      screen: null,
    });
  }

  const firstLabel = steps[0]?.action.required_real_label;
  const he = meta.howTo ? titleHe(meta.howTo, meta.app) : null;
  return Tutorial.parse({
    title: meta.title,
    title_he: he ?? `מדריך: ${meta.title}`,
    goal: meta.howTo ? `How to ${meta.howTo}` : meta.title,
    summary: steps.map((s) => `${s.action.type} "${s.action.required_real_label}"`).join(" → "),
    difficulty: steps.length > 6 ? "intermediate" : "beginner",
    original_language: input.transcript.language,
    estimated_final_duration: Math.round(8 + steps.length * 6),
    app: { name: app, url: null, category: null },
    topic_tags: [],
    prerequisites: [],
    troubleshooting: firstLabel ? [`אם אינכם רואים את '${firstLabel}', ייתכן שאין לחשבון שלכם הרשאה מתאימה או שהממשק עודכן — חפשו את האפשרות בתפריט הראשי או בהגדרות.`] : [],
    important_notes: [],
    fidelity_mode: config.fidelity.mode,
    style_preset: null,
    steps,
  });
}

function inTabRowFor(a: DetectedAction, before: FrameAnalysis | null): boolean {
  if (!a.bbox || !before) return false;
  const t = before.ocr.lines.find((l) => Math.abs(l.bbox.x - a.bbox!.x) < 4 && Math.abs(l.bbox.y - a.bbox!.y) < 4);
  if (!t) return false;
  return before.ocr.lines.filter((l) => Math.abs(l.bbox.y + l.bbox.h / 2 - (t.bbox.y + t.bbox.h / 2)) < 10 && l.text.split(/\s+/).length <= 2 && l.source !== "control").length >= 3;
}

function sentenceFor(t: Transcript, a: DetectedAction): string | null {
  return t.segments.find((s) => s.id === a.transcriptSegmentId)?.text ?? null;
}

function reviewNotes(a: DetectedAction): string | null {
  const missing: string[] = [];
  const has = (s: string) => a.signals.some((x) => x.signal === s);
  if (!has("transcript_cue")) missing.push("not mentioned in narration");
  if (!has("ocr_label_match") && !has("cursor_near_label")) missing.push("label not found on screen");
  if (!has("ui_change_after") && !has("state_changed")) missing.push("no visible change after the action");
  return missing.length ? missing.join("; ") : null;
}

export { hebrewLocation };
