import { z } from "zod";
import { MediaInfo } from "./project";

/** Axis-aligned box in source-video pixel coordinates. */
export const BBox = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().nonnegative(),
  h: z.number().nonnegative(),
});
export type BBox = z.infer<typeof BBox>;

export const SceneChange = z.object({
  time: z.number().nonnegative(),
  score: z.number(),
});
export type SceneChange = z.infer<typeof SceneChange>;

export const ExtractedFrame = z.object({
  id: z.string(),
  time: z.number().nonnegative(),
  /** Relative to the project directory. */
  file: z.string(),
  reasons: z.array(
    z.enum(["scene_change", "interval", "cursor_stop", "visual_change", "transcript_cue", "before_change", "after_change", "first", "last"]),
  ),
});
export type ExtractedFrame = z.infer<typeof ExtractedFrame>;

/** Output of the ingestion stage: media.json */
export const IngestResult = z.object({
  media: MediaInfo,
  audioFile: z.string().nullable(),
  scenes: z.array(SceneChange),
  thumbnails: z.array(z.string()),
  posterFile: z.string(),
  /** Low-res grayscale motion samples for cursor/change detection. */
  motion: z.object({
    fps: z.number(),
    width: z.number().int(),
    height: z.number().int(),
    file: z.string(),
    frameCount: z.number().int(),
  }),
});
export type IngestResult = z.infer<typeof IngestResult>;

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------

export const TranscriptWord = z.object({
  text: z.string(),
  start: z.number(),
  end: z.number(),
});
export type TranscriptWord = z.infer<typeof TranscriptWord>;

export const TranscriptSegment = z.object({
  id: z.string(),
  start: z.number(),
  end: z.number(),
  text: z.string(),
  words: z.array(TranscriptWord).optional(),
});
export type TranscriptSegment = z.infer<typeof TranscriptSegment>;

export const Transcript = z.object({
  language: z.string().nullable(),
  languageConfidence: z.number().nullable().default(null),
  provider: z.string(),
  text: z.string(),
  segments: z.array(TranscriptSegment),
  hasWordTimestamps: z.boolean().default(false),
  notes: z.array(z.string()).default([]),
});
export type Transcript = z.infer<typeof Transcript>;

// ---------------------------------------------------------------------------
// Frame / visual analysis
// ---------------------------------------------------------------------------

export const OcrWord = z.object({
  text: z.string(),
  confidence: z.number(),
  bbox: BBox,
  line: z.number().int().optional(),
});
export type OcrWord = z.infer<typeof OcrWord>;

/** A line of OCR text (words merged), the unit we match labels against. */
export const OcrLine = z.object({
  text: z.string(),
  confidence: z.number(),
  bbox: BBox,
  /** "control" = text read from inside a filled button/badge (second OCR pass). */
  source: z.enum(["text", "control"]).optional(),
});
export type OcrLine = z.infer<typeof OcrLine>;

export const SensitiveKind = z.enum([
  "email",
  "phone",
  "person_name",
  "account_id",
  "address",
  "payment_card",
  "api_key",
  "password",
  "token",
  "url",
  "money",
  "number",
]);
export type SensitiveKind = z.infer<typeof SensitiveKind>;

export const SensitiveFinding = z.object({
  kind: SensitiveKind,
  text: z.string(),
  frameId: z.string().optional(),
  bbox: BBox.optional(),
});
export type SensitiveFinding = z.infer<typeof SensitiveFinding>;

export const UiElementKind = z.enum([
  "button",
  "menu",
  "menu_item",
  "tab",
  "input",
  "dropdown",
  "checkbox",
  "toggle",
  "dialog",
  "sidebar",
  "sidebar_item",
  "navigation",
  "card",
  "table",
  "text",
  "link",
  "icon",
  "other",
]);
export type UiElementKind = z.infer<typeof UiElementKind>;

export const DetectedUiElement = z.object({
  kind: UiElementKind,
  label: z.string(),
  bbox: BBox.optional(),
  state: z.string().optional(),
  confidence: z.number().min(0).max(1),
  source: z.enum(["ocr", "vision", "heuristic"]),
});
export type DetectedUiElement = z.infer<typeof DetectedUiElement>;

export const FrameAnalysis = z.object({
  frameId: z.string(),
  time: z.number(),
  file: z.string(),
  ocr: z.object({
    lines: z.array(OcrLine),
    words: z.array(OcrWord),
    meanConfidence: z.number().nullable(),
  }),
  elements: z.array(DetectedUiElement).default([]),
  /** Short description of what the screen shows (vision model), if available. */
  description: z.string().nullable().default(null),
  pageTitle: z.string().nullable().default(null),
  sensitive: z.array(SensitiveFinding).default([]),
});
export type FrameAnalysis = z.infer<typeof FrameAnalysis>;

/** A motion event computed from the low-res motion stream. */
export const MotionEvent = z.object({
  kind: z.enum(["cursor_move", "cursor_stop", "ui_change", "scroll", "small_change"]),
  start: z.number(),
  end: z.number(),
  /** Changed area as a fraction of the frame. */
  areaFraction: z.number(),
  /** Where it happened, in source pixel coordinates. */
  bbox: BBox.optional(),
  point: z.object({ x: z.number(), y: z.number() }).optional(),
});
export type MotionEvent = z.infer<typeof MotionEvent>;

export const CursorSample = z.object({
  time: z.number(),
  x: z.number(),
  y: z.number(),
  confidence: z.number(),
});
export type CursorSample = z.infer<typeof CursorSample>;

export const FramesAnalysisResult = z.object({
  frames: z.array(ExtractedFrame),
  analyses: z.array(FrameAnalysis),
  motionEvents: z.array(MotionEvent),
  cursorTrack: z.array(CursorSample),
  sensitive: z.array(SensitiveFinding),
  providers: z.object({ ocr: z.string(), vision: z.string().nullable() }),
  /** App/screen area inside the video frame (excludes captions and bars). */
  region: BBox,
});
export type FramesAnalysisResult = z.infer<typeof FramesAnalysisResult>;

// ---------------------------------------------------------------------------
// Action detection
// ---------------------------------------------------------------------------

export const ActionSignal = z.enum([
  "transcript_cue",
  "ocr_label_match",
  "cursor_stop",
  "cursor_near_label",
  "ui_change_after",
  "menu_opened",
  "state_changed",
  "vision",
]);
export type ActionSignal = z.infer<typeof ActionSignal>;

export const DetectedAction = z.object({
  id: z.string(),
  action: z.enum(["click", "double_click", "type", "select", "toggle", "scroll", "hover", "navigate", "open_menu", "drag", "observe"]),
  target: z.string().nullable(),
  targetType: z.string().nullable().default(null),
  timestamp: z.number(),
  confidence: z.number().min(0).max(1),
  signals: z.array(z.object({ signal: ActionSignal, weight: z.number(), detail: z.string().optional() })),
  bbox: BBox.optional(),
  point: z.object({ x: z.number(), y: z.number() }).optional(),
  beforeFrameId: z.string().nullable().default(null),
  afterFrameId: z.string().nullable().default(null),
  transcriptSegmentId: z.string().nullable().default(null),
  value: z.string().nullable().default(null),
});
export type DetectedAction = z.infer<typeof DetectedAction>;

/** Aggregate of all source analysis, written as source-analysis.json. */
export const SourceAnalysis = z.object({
  projectId: z.string(),
  generatedAt: z.string(),
  media: MediaInfo,
  scenes: z.array(SceneChange),
  transcript: z.object({
    language: z.string().nullable(),
    provider: z.string(),
    segmentCount: z.number().int(),
    text: z.string(),
  }),
  frames: z.array(
    z.object({
      id: z.string(),
      time: z.number(),
      file: z.string(),
      pageTitle: z.string().nullable(),
      topText: z.array(z.string()),
      elementCount: z.number().int(),
    }),
  ),
  actions: z.array(DetectedAction),
  sensitiveSummary: z.record(z.string(), z.number()),
  providers: z.record(z.string(), z.string().nullable()),
  warnings: z.array(z.string()),
});
export type SourceAnalysis = z.infer<typeof SourceAnalysis>;
