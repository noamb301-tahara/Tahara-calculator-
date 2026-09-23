import { SubtitleTrack, type SubtitleCue } from "@studio/shared";

/**
 * Subtitles (Module 14): short Hebrew cues split by meaning, max 2 lines,
 * sized for 9:16. Timing comes from TTS character alignment when available,
 * otherwise it is distributed by character count across the spoken segment.
 */

export interface TimedSegment {
  segmentId: string;
  text: string;
  /** Absolute start of the speech in the final video (seconds). */
  start: number;
  duration: number;
  alignment?: { chars: string[]; starts: number[]; ends: number[] } | null;
}

export interface SubtitleOptions {
  maxCharsPerLine: number;
  maxLines: number;
  minCueSec: number;
  maxCueSec: number;
}

/** Split text into phrases at punctuation first, then by length. */
export function splitIntoPhrases(text: string, maxChars: number): string[] {
  const clauses = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?,:;–—])\s+/u)
    .filter(Boolean);
  const out: string[] = [];
  for (const clause of clauses) {
    if (clause.length <= maxChars) {
      out.push(clause);
      continue;
    }
    // Greedy word wrap, balancing the last two chunks.
    const words = clause.split(" ");
    let cur = "";
    for (const w of words) {
      if (!cur) cur = w;
      else if ((cur + " " + w).length <= maxChars) cur += " " + w;
      else {
        out.push(cur);
        cur = w;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

/** Pack phrases into cues of at most `maxLines` lines. */
export function packCues(phrases: string[], maxChars: number, maxLines: number): string[][] {
  const cues: string[][] = [];
  let lines: string[] = [];
  for (const p of phrases) {
    const endsSentence = /[.!?]$/.test(p);
    // Merge short phrases on the same line when they fit.
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + " " + p).length <= maxChars && !/[.!?]$/.test(last)) {
      lines[lines.length - 1] = last + " " + p;
    } else if (lines.length < maxLines) {
      lines.push(p);
    } else {
      cues.push(lines);
      lines = [p];
    }
    if (endsSentence && lines.length >= maxLines) {
      cues.push(lines);
      lines = [];
    }
  }
  if (lines.length) cues.push(lines);
  return cues;
}

export function buildSubtitles(segments: TimedSegment[], opts: SubtitleOptions): SubtitleTrack {
  const cues: SubtitleCue[] = [];
  for (const seg of segments) {
    const phrases = splitIntoPhrases(seg.text, opts.maxCharsPerLine);
    const groups = packCues(phrases, opts.maxCharsPerLine, opts.maxLines);
    const totalChars = groups.reduce((n, g) => n + g.join(" ").length, 0) || 1;
    let cursorChars = 0;
    const times = groups.map((g) => {
      const len = g.join(" ").length;
      const range = timeRange(seg, cursorChars, cursorChars + len, totalChars);
      cursorChars += len + 1;
      return range;
    });
    groups.forEach((g, i) => {
      let { start, end } = times[i]!;
      // Keep cues readable: minimum duration, no overlap with the next cue.
      end = Math.max(end, start + opts.minCueSec);
      const nextStart = times[i + 1]?.start;
      if (nextStart !== undefined) end = Math.min(end, nextStart);
      end = Math.min(end, start + opts.maxCueSec * g.length);
      cues.push({ index: cues.length + 1, start: round(start), end: round(end), text: g.join(" "), lines: g, segmentId: seg.segmentId });
    });
  }
  // Global de-overlap across segments.
  for (let i = 1; i < cues.length; i++) {
    if (cues[i]!.start < cues[i - 1]!.end) cues[i - 1]!.end = cues[i]!.start;
  }
  return SubtitleTrack.parse({ language: "he", direction: "rtl", maxCharsPerLine: opts.maxCharsPerLine, cues: cues.filter((c) => c.end > c.start) });
}

function timeRange(seg: TimedSegment, fromChar: number, toChar: number, totalChars: number): { start: number; end: number } {
  const a = seg.alignment;
  if (a && a.chars.length > 0 && a.starts.length === a.chars.length) {
    // Map our character offsets onto the alignment (which may include extra spaces).
    const ratio = a.chars.length / Math.max(1, totalChars);
    const i0 = Math.min(a.chars.length - 1, Math.floor(fromChar * ratio));
    const i1 = Math.min(a.chars.length - 1, Math.max(i0, Math.ceil(toChar * ratio) - 1));
    return { start: seg.start + a.starts[i0]!, end: seg.start + a.ends[i1]! };
  }
  return { start: seg.start + (seg.duration * fromChar) / totalChars, end: seg.start + (seg.duration * Math.min(totalChars, toChar)) / totalChars };
}

const round = (n: number) => Math.round(n * 1000) / 1000;

function srtTime(sec: number): string {
  const ms = Math.round(sec * 1000);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const r = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(h)}:${p(m)}:${p(s)},${p(r, 3)}`;
}

/** SRT with RTL embedding marks so players render Hebrew lines correctly. */
export function toSrt(track: SubtitleTrack): string {
  const RLE = "‫";
  const PDF = "‬";
  return (
    track.cues
      .map((c) => `${c.index}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.lines.map((l) => `${RLE}${l}${PDF}`).join("\n")}`)
      .join("\n\n") + "\n"
  );
}
