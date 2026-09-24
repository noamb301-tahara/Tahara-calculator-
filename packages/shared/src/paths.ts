/**
 * File naming conventions. Pure functions (no fs) so they are usable from the
 * admin UI and the renderer as well as from Node.
 */

/** Canonical relative paths inside a project directory. */
export const PROJECT_FILES = {
  project: "project.json",
  sourceDir: "source",
  media: "work/media.json",
  audio: "work/audio.wav",
  motion: "work/motion.gray",
  framesDir: "work/frames",
  thumbsDir: "work/thumbs",
  poster: "work/poster.jpg",
  transcriptJson: "analysis/transcript-original.json",
  transcriptTxt: "analysis/transcript-original.txt",
  transcriptHebrewDraft: "analysis/transcript-hebrew-draft.txt",
  framesAnalysis: "analysis/frames-analysis.json",
  actions: "analysis/actions.json",
  sourceAnalysis: "analysis/source-analysis.json",
  tutorial: "tutorial.json",
  tutorialAuto: "analysis/tutorial-auto.json",
  screens: "screens.json",
  script: "script.json",
  scriptText: "script-he.txt",
  hooks: "hooks.json",
  voiceDir: "voice",
  voiceTrack: "voice/voice.mp3",
  voiceMeta: "voice/voice.json",
  timeline: "timeline.json",
  subtitlesSrt: "subtitles.srt",
  subtitlesJson: "subtitles.json",
  renderPlan: "render-plan.json",
  renderJob: "render-job.json",
  guide: "guide.md",
  seo: "seo.json",
  log: "logs/pipeline.jsonl",
} as const;

export type ProjectFileKey = keyof typeof PROJECT_FILES;

/** Files copied to output/<projectId>/ as the deliverable bundle. */
export const DELIVERABLES: { key: ProjectFileKey | "final"; name: string }[] = [
  { key: "sourceAnalysis", name: "source-analysis.json" },
  { key: "tutorial", name: "tutorial.json" },
  { key: "scriptText", name: "script-he.txt" },
  { key: "voiceTrack", name: "voice.mp3" },
  { key: "subtitlesSrt", name: "subtitles.srt" },
  { key: "subtitlesJson", name: "subtitles.json" },
  { key: "guide", name: "guide.md" },
  { key: "seo", name: "seo.json" },
  { key: "final", name: "final-short.mp4" },
];

export const FINAL_VIDEO_NAME = "final-short.mp4";

const HEBREW_RANGE = /[֐-׿]/;

/** URL/file-safe slug. Hebrew and other non-latin text is dropped; falls back to "project". */
export function slugify(input: string, maxLength = 40): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return slug.length >= 3 ? slug : slug.length > 0 ? `${slug}-project` : "project";
}

/** Deterministic id: same source file => same project => cache hits. */
export function projectIdFor(filename: string, sha256: string): string {
  const base = filename.replace(/\.[^.]+$/, "");
  // Non-Latin names (Hebrew lesson titles) slug to little or nothing: keep the numbers, prefix "video".
  const latin = /[a-z]/i.test(base.replace(/[^\x00-\x7F]/g, ""));
  const digits = base.match(/\d+/g)?.join("-");
  const slug = latin ? slugify(base) : digits ? `video-${digits}` : "video";
  return `${slug}-${sha256.slice(0, 8)}`;
}

/** Name for an extracted frame, sortable by time: f-000012340.jpg for t=12.34s. */
export function frameFileName(timeSec: number, ext = "jpg"): string {
  const ms = Math.max(0, Math.round(timeSec * 1000));
  return `f-${String(ms).padStart(9, "0")}.${ext}`;
}

export function frameIdFor(timeSec: number): string {
  return frameFileName(timeSec).replace(/\.[^.]+$/, "");
}

export function voiceSegmentFileName(order: number, segmentId: string): string {
  return `seg-${String(order).padStart(3, "0")}-${slugify(segmentId, 30)}.mp3`;
}

export function stepId(order: number): string {
  return `step-${String(order).padStart(2, "0")}`;
}

export function isHebrew(text: string): boolean {
  return HEBREW_RANGE.test(text);
}

export const SUPPORTED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi"];

export function isSupportedVideo(filename: string): boolean {
  const lower = filename.toLowerCase();
  return SUPPORTED_VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}
