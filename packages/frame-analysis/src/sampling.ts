import type { ExtractedFrame, MotionEvent, SceneChange, TranscriptSegment } from "@studio/shared";
import { frameIdFor } from "@studio/shared";

type Reason = ExtractedFrame["reasons"][number];

/** Words in narration that usually announce an action. */
export const ACTION_CUE = /\b(click|tap|press|select|choose|pick|open|go to|head to|navigate|type|enter|fill|toggle|turn on|turn off|switch|enable|disable|scroll|drag|hover|check|uncheck)\b/i;

export interface SamplingInput {
  durationSec: number;
  scenes: SceneChange[];
  motion: MotionEvent[];
  transcript: TranscriptSegment[];
  intervalSec: number;
  maxFrames: number;
}

/**
 * Smart frame sampling: frames right before/after every visual change, at
 * cursor stops, at narration cues, plus a sparse interval grid. Duplicates
 * within 0.35s merge; if over budget, lower-priority reasons are dropped.
 */
export function planFrameSamples(input: SamplingInput): { time: number; reasons: Reason[] }[] {
  const cands: { time: number; reason: Reason; priority: number }[] = [];
  const end = Math.max(0, input.durationSec - 0.05);
  const add = (time: number, reason: Reason, priority: number) => cands.push({ time: Math.min(end, Math.max(0, time)), reason, priority });

  add(0.2, "first", 3);
  add(end - 0.2, "last", 3);
  for (const s of input.scenes) {
    add(s.time - 0.25, "before_change", 1);
    add(s.time + 0.5, "scene_change", 1);
  }
  for (const m of input.motion) {
    if (m.kind === "ui_change") {
      add(m.start - 0.15, "before_change", 0);
      add(m.end + 0.45, "after_change", 0);
    } else if (m.kind === "cursor_stop") add(m.start + 0.05, "cursor_stop", 2);
  }
  for (const seg of input.transcript) if (ACTION_CUE.test(seg.text)) add((seg.start + seg.end) / 2, "transcript_cue", 2);
  for (let t = input.intervalSec; t < end; t += input.intervalSec) add(t, "interval", 4);

  cands.sort((a, b) => a.time - b.time);
  const merged: { time: number; reasons: Set<Reason>; priority: number }[] = [];
  for (const c of cands) {
    const prev = merged[merged.length - 1];
    // Never merge a before-change frame into an after-change one: they must straddle the change.
    if (prev && c.time - prev.time < 0.35 && !(prev.reasons.has("before_change") !== (c.reason === "before_change"))) {
      prev.reasons.add(c.reason);
      prev.priority = Math.min(prev.priority, c.priority);
    } else merged.push({ time: c.time, reasons: new Set([c.reason]), priority: c.priority });
  }
  let keep = merged;
  if (keep.length > input.maxFrames) {
    keep = [...keep].sort((a, b) => a.priority - b.priority || a.time - b.time).slice(0, input.maxFrames).sort((a, b) => a.time - b.time);
  }
  return keep.map((k) => ({ time: Math.round(k.time * 1000) / 1000, reasons: [...k.reasons] }));
}

export function frameRef(time: number): { id: string } {
  return { id: frameIdFor(time) };
}
