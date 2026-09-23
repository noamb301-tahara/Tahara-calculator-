import { z } from "zod";

// ---------------------------------------------------------------------------
// Script (Hebrew narration) + hooks
// ---------------------------------------------------------------------------

export const Hook = z.object({
  id: z.string(),
  text: z.string().min(1),
  style: z.enum(["problem", "speed", "curiosity", "benefit"]),
  isDefault: z.boolean().default(false),
});
export type Hook = z.infer<typeof Hook>;

export const ScriptSegmentKind = z.enum(["hook", "intro", "step", "summary", "cta"]);
export type ScriptSegmentKind = z.infer<typeof ScriptSegmentKind>;

export const ScriptSegment = z.object({
  id: z.string(),
  kind: ScriptSegmentKind,
  stepId: z.string().nullable().default(null),
  /** What the narrator says. */
  text: z.string().min(1),
  /** Short on-screen title for the segment (e.g. "שלב 2 · הגדרות"). */
  onScreenTitle: z.string().nullable().default(null),
  estimatedSec: z.number().positive(),
});
export type ScriptSegment = z.infer<typeof ScriptSegment>;

export const Script = z.object({
  language: z.literal("he"),
  provider: z.string(),
  hooks: z.array(Hook).length(3),
  selectedHookId: z.string(),
  segments: z.array(ScriptSegment).min(3),
  fullText: z.string(),
  /** Quality checks: every step answers What / Where / What-after. */
  checks: z.array(z.object({ stepId: z.string(), what: z.boolean(), where: z.boolean(), after: z.boolean(), issues: z.array(z.string()) })),
});
export type Script = z.infer<typeof Script>;

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------

export const VoiceSegment = z.object({
  segmentId: z.string(),
  file: z.string(),
  textHash: z.string(),
  durationSec: z.number().nonnegative(),
  /** Offset of this segment inside voice.mp3 */
  startSec: z.number().nonnegative(),
  provider: z.string(),
  cached: z.boolean(),
  /** Character-level alignment if the provider returned it. */
  alignment: z
    .object({ chars: z.array(z.string()), starts: z.array(z.number()), ends: z.array(z.number()) })
    .nullable()
    .default(null),
});
export type VoiceSegment = z.infer<typeof VoiceSegment>;

export const VoiceTrack = z.object({
  provider: z.string(),
  voiceId: z.string().nullable(),
  file: z.string(),
  totalSec: z.number(),
  gapSec: z.number(),
  segments: z.array(VoiceSegment),
  characters: z.number().int(),
});
export type VoiceTrack = z.infer<typeof VoiceTrack>;

// ---------------------------------------------------------------------------
// Subtitles
// ---------------------------------------------------------------------------

export const SubtitleCue = z.object({
  index: z.number().int().positive(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
  text: z.string(),
  lines: z.array(z.string()).min(1).max(2),
  segmentId: z.string(),
});
export type SubtitleCue = z.infer<typeof SubtitleCue>;

export const SubtitleTrack = z.object({
  language: z.literal("he"),
  direction: z.literal("rtl"),
  maxCharsPerLine: z.number().int(),
  cues: z.array(SubtitleCue),
});
export type SubtitleTrack = z.infer<typeof SubtitleTrack>;

// ---------------------------------------------------------------------------
// SEO
// ---------------------------------------------------------------------------

export const SeoContent = z.object({
  topic: z.string(),
  search_intent: z.enum(["informational", "navigational", "transactional", "commercial"]),
  primary_query_he: z.string(),
  related_queries_he: z.array(z.string()),
  youtube: z.object({ title: z.string().max(100), description: z.string(), tags: z.array(z.string()) }),
  short_caption: z.string(),
  instagram_caption: z.string(),
  tiktok_caption: z.string(),
  hashtags: z.array(z.string()),
  article_angle: z.string(),
  faq: z.array(z.object({ q: z.string(), a: z.string() })),
  suggested_page_section: z.string(),
  cta: z.string(),
  related_topics: z.array(z.string()),
  /** We never invent metrics. */
  data: z.object({
    search_volume: z.null(),
    ranking: z.null(),
    ctr: z.null(),
    traffic: z.null(),
    note: z.string(),
  }),
  generated_by: z.string(),
});
export type SeoContent = z.infer<typeof SeoContent>;
