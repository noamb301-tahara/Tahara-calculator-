import type { FramesAnalysisResult, Transcript } from "@studio/shared";

/**
 * What the video "says". Spoken narration wins; a video with no speech but
 * burned-in captions teaches through the captions, so they become the
 * transcript for cue parsing, step goals and the title.
 */
export function narrationFor(transcript: Transcript, frames: FramesAnalysisResult): Transcript {
  const spoken = transcript.segments.some((s) => s.text.trim().length > 0);
  const caps = frames.captions?.segments ?? [];
  if (spoken || !caps.length) return transcript;
  const text = caps.map((s) => s.text).join(" ");
  return {
    language: /[֐-׿]/.test(text) ? "he" : "en",
    languageConfidence: null,
    provider: "on-screen captions",
    text,
    segments: caps,
    hasWordTimestamps: false,
    notes: [...transcript.notes, `no narration — ${caps.length} on-screen caption(s) used as the transcript`],
  };
}
