import { labelSimilarity, type BBox, type CursorSample, type DetectedAction, type FrameAnalysis, type FramesAnalysisResult, type MotionEvent, type OcrLine, type Transcript } from "@studio/shared";
import { parseCues, type Cue } from "./cues";

/**
 * Module 4 — click/action detection. No single signal is trusted: narration
 * cues, OCR label matches, cursor position/stops and UI changes before/after
 * are fused into a confidence score.
 */

export const SIGNAL_WEIGHTS = {
  transcript_cue: 0.3,
  ocr_label_match: 0.25,
  cursor_near_label: 0.2,
  ui_change_after: 0.2,
  cursor_stop: 0.1,
  state_changed: 0.15,
  menu_opened: 0.1,
  vision: 0.2,
} as const;

interface VisualEvent {
  time: number;
  point: { x: number; y: number } | null;
  kind: "ui_change" | "cursor_stop";
  area: number;
  bbox?: BBox;
  used: boolean;
}

export interface DetectActionsInput {
  transcript: Transcript;
  frames: FramesAnalysisResult;
  minConfidence: number;
}

export function frameBefore(analyses: FrameAnalysis[], t: number): FrameAnalysis | null {
  let best: FrameAnalysis | null = null;
  for (const a of analyses) if (a.time <= t - 0.05 && (!best || a.time > best.time)) best = a;
  return best ?? analyses[0] ?? null;
}

export function frameAfter(analyses: FrameAnalysis[], t: number, minGap = 0.3): FrameAnalysis | null {
  let best: FrameAnalysis | null = null;
  for (const a of analyses) if (a.time >= t + minGap && (!best || a.time < best.time)) best = a;
  return best;
}

/** Cursor position shortly before time t (last sample within `maxAge`). */
export function cursorAt(track: CursorSample[], t: number, maxAge = 1.5): { x: number; y: number } | null {
  let best: CursorSample | null = null;
  for (const s of track) if (s.time <= t + 0.02 && s.time >= t - maxAge && (!best || s.time > best.time)) best = s;
  return best ? { x: best.x, y: best.y } : null;
}

/** Best OCR line for any of the target phrases. */
export function matchLabel(lines: OcrLine[], targets: string[]): { line: OcrLine; similarity: number; phrase: string } | null {
  let best: { line: OcrLine; similarity: number; phrase: string } | null = null;
  for (const [i, phrase] of targets.entries()) {
    for (const line of lines) {
      // Prefer the full phrase; shorter suffixes are penalised slightly.
      const sim = labelSimilarity(phrase, line.text) * (1 - i * 0.06);
      if (!best || sim > best.similarity) best = { line, similarity: sim, phrase };
    }
  }
  return best && best.similarity >= 0.62 ? best : null;
}

function distToBox(p: { x: number; y: number }, b: BBox): number {
  const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w));
  const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h));
  return Math.hypot(dx, dy);
}

export function lineAtPoint(lines: OcrLine[], p: { x: number; y: number }, maxDist = 60): OcrLine | null {
  let best: OcrLine | null = null;
  let bestD = Infinity;
  for (const l of lines) {
    const d = distToBox(p, l.bbox);
    if (d < bestD) {
      bestD = d;
      best = l;
    }
  }
  return bestD <= maxDist ? best : null;
}

function visualEvents(events: MotionEvent[], track: CursorSample[]): VisualEvent[] {
  const out: VisualEvent[] = [];
  for (const e of events) {
    if (e.kind === "ui_change") out.push({ time: e.start, point: cursorAt(track, e.start), kind: "ui_change", area: e.areaFraction, bbox: e.bbox, used: false });
    else if (e.kind === "cursor_stop" && e.point) out.push({ time: e.start, point: e.point, kind: "cursor_stop", area: 0, used: false });
  }
  return out.sort((a, b) => a.time - b.time);
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function detectActions(input: DetectActionsInput): DetectedAction[] {
  const { frames } = input;
  const analyses = frames.analyses;
  const track = frames.cursorTrack;
  const visuals = visualEvents(frames.motionEvents, track);
  const cues = parseCues(input.transcript.segments);
  const actions: DetectedAction[] = [];

  for (const cue of cues) {
    actions.push(fuseCue(cue, visuals, analyses, track));
  }

  // UI changes nobody narrated: still likely clicks.
  for (const v of visuals) {
    if (v.used || v.kind !== "ui_change" || !v.point) continue;
    const before = frameBefore(analyses, v.time);
    const line = before ? lineAtPoint(before.ocr.lines, v.point) : null;
    const signals: DetectedAction["signals"] = [
      { signal: "ui_change_after", weight: SIGNAL_WEIGHTS.ui_change_after, detail: `changed ${(v.area * 100).toFixed(1)}% of frame` },
      { signal: "cursor_stop", weight: SIGNAL_WEIGHTS.cursor_stop },
    ];
    if (line) signals.push({ signal: "cursor_near_label", weight: SIGNAL_WEIGHTS.cursor_near_label, detail: line.text });
    actions.push({
      id: "",
      action: "click",
      target: line?.text ?? null,
      targetType: null,
      timestamp: round(v.time),
      confidence: score(signals),
      signals,
      bbox: line?.bbox,
      point: v.point,
      beforeFrameId: before?.frameId ?? null,
      afterFrameId: frameAfter(analyses, v.time)?.frameId ?? null,
      transcriptSegmentId: null,
      value: null,
    });
  }

  const kept = dedupe(actions.filter((a) => a.confidence >= input.minConfidence).sort((a, b) => a.timestamp - b.timestamp));
  return kept.map((a, i) => ({ ...a, id: `act-${String(i + 1).padStart(2, "0")}` }));
}

function score(signals: DetectedAction["signals"]): number {
  return Math.min(0.99, Math.round(signals.reduce((s, x) => s + x.weight, 0) * 100) / 100);
}

function fuseCue(cue: Cue, visuals: VisualEvent[], analyses: FrameAnalysis[], track: CursorSample[]): DetectedAction {
  const signals: DetectedAction["signals"] = [{ signal: "transcript_cue", weight: SIGNAL_WEIGHTS.transcript_cue, detail: `"${cue.verb} ${cue.targets[0] ?? ""}"` }];
  const primaryTargets = cue.action === "select" && cue.container ? [cue.container, ...cue.targets.slice(1)] : cue.targets;

  // 1) Locate the label on screen in frames inside the cue window.
  const windowFrames = analyses.filter((a) => a.time >= cue.windowStart && a.time <= cue.windowEnd);
  const searchFrames = windowFrames.length ? windowFrames : [frameBefore(analyses, cue.time)].filter(Boolean) as FrameAnalysis[];
  let match: ReturnType<typeof matchLabel> = null;
  let matchFrame: FrameAnalysis | null = null;
  for (const f of searchFrames) {
    const m = matchLabel(f.ocr.lines, primaryTargets);
    if (m && (!match || m.similarity > match.similarity + 0.02)) {
      match = m;
      matchFrame = f;
    }
  }

  // 2) Find the visual event that best explains the cue.
  const candidates = visuals.filter((v) => !v.used && v.time >= cue.windowStart && v.time <= cue.windowEnd);
  let chosen: VisualEvent | null = null;
  let chosenScore = -Infinity;
  for (const v of candidates) {
    let s = v.kind === "ui_change" ? 2 : 1;
    if (match && v.point) s += Math.max(0, 3 - distToBox(v.point, match.line.bbox) / 40);
    s -= Math.abs(v.time - cue.time) * 0.25;
    if (s > chosenScore) {
      chosenScore = s;
      chosen = v;
    }
  }

  let timestamp = cue.time;
  let point: { x: number; y: number } | undefined;
  if (chosen) {
    chosen.used = true;
    // A cursor stop and the UI change it caused describe the same click.
    for (const v of candidates) if (!v.used && Math.abs(v.time - chosen.time) < 0.8) v.used = true;
    timestamp = chosen.time;
    point = chosen.point ?? undefined;
    if (chosen.kind === "ui_change") signals.push({ signal: "ui_change_after", weight: SIGNAL_WEIGHTS.ui_change_after, detail: `changed ${(chosen.area * 100).toFixed(1)}% of frame` });
    else signals.push({ signal: "cursor_stop", weight: SIGNAL_WEIGHTS.cursor_stop });
  } else {
    // No visual change: use where the cursor rests near the cue.
    point = cursorAt(track, cue.time + 1.5, 2.5) ?? undefined;
    if (point) signals.push({ signal: "cursor_stop", weight: SIGNAL_WEIGHTS.cursor_stop, detail: "cursor rest near cue" });
  }

  // Without a UI change, the click lands where the cursor first arrives at the label.
  if (match && (!chosen || chosen.kind === "cursor_stop")) {
    const arrival = track.find((p) => p.time >= cue.windowStart && p.time <= cue.windowEnd && distToBox(p, match.line.bbox) < 110);
    if (arrival) {
      timestamp = arrival.time + 0.25;
      point = { x: arrival.x, y: arrival.y };
    }
  }

  if (match) {
    signals.push({ signal: "ocr_label_match", weight: Math.round(SIGNAL_WEIGHTS.ocr_label_match * match.similarity * 100) / 100, detail: `"${match.line.text}" (${match.similarity.toFixed(2)})` });
    if (point && distToBox(point, match.line.bbox) < 70) signals.push({ signal: "cursor_near_label", weight: SIGNAL_WEIGHTS.cursor_near_label });
  }

  // 3) Typed value: new text that appears next to the field afterwards.
  let value = cue.value;
  if (cue.action === "type" && match) {
    const later = analyses.filter((a) => a.time > timestamp && a.time <= cue.windowEnd + 2).sort((a, b) => b.time - a.time);
    const b = match.line.bbox;
    for (const f of later) {
      const typed = f.ocr.lines.find((l) => l.bbox.y > b.y && l.bbox.y < b.y + b.h * 4 && Math.abs(l.bbox.x - b.x) < 60 && labelSimilarity(l.text, match!.line.text) < 0.5);
      if (typed) {
        value = typed.text;
        signals.push({ signal: "state_changed", weight: SIGNAL_WEIGHTS.state_changed, detail: `typed "${typed.text}"` });
        break;
      }
    }
  }

  const before = frameBefore(analyses, timestamp);
  return {
    id: "",
    action: cue.action,
    target: match ? preferCasing(match.line.text, match.phrase) : primaryTargets[0] ?? null,
    targetType: null,
    timestamp: round(timestamp),
    confidence: score(signals),
    signals,
    bbox: match?.line.bbox,
    point,
    beforeFrameId: (matchFrame && matchFrame.time <= timestamp ? matchFrame : before)?.frameId ?? null,
    afterFrameId: frameAfter(analyses, timestamp)?.frameId ?? null,
    transcriptSegmentId: cue.segmentId,
    value,
  };
}

/** OCR sometimes lowercases labels ("send invite"); use the narration's casing when they agree. */
export function preferCasing(ocr: string, spoken: string): string {
  if (ocr === ocr.toLowerCase() && labelSimilarity(ocr, spoken) > 0.8 && spoken.length >= ocr.length - 2) return spoken.charAt(0).toUpperCase() + spoken.slice(1);
  return ocr;
}

/** Merge near-duplicate actions on the same target. */
function dedupe(actions: DetectedAction[]): DetectedAction[] {
  const out: DetectedAction[] = [];
  for (const a of actions) {
    const dup = out.find((b) => Math.abs(b.timestamp - a.timestamp) < 0.8 && (b.target ?? "") === (a.target ?? ""));
    if (dup) {
      if (a.confidence > dup.confidence) Object.assign(dup, a);
    } else out.push(a);
  }
  return out;
}
