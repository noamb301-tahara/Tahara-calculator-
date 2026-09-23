import { readFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
  Hook,
  Script,
  Tutorial,
  estimateSpeechSec,
  type DetectedUiElement,
  type FramesAnalysisResult,
  type StudioConfig,
  type Transcript,
} from "@studio/shared";
import type { VisionAnalyzer } from "@studio/frame-analysis";

/**
 * Claude integration (optional). Every task here has a deterministic
 * fallback elsewhere in the pipeline; the LLM only improves quality.
 * Credentials come from the environment (ANTHROPIC_API_KEY / SDK profiles).
 */

export interface LlmUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export class LlmRefusalError extends Error {
  constructor(public readonly category: string | null) {
    super(`Claude declined the request${category ? ` (${category})` : ""}`);
    this.name = "LlmRefusalError";
  }
}

export class ClaudeClient {
  readonly usage: LlmUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };
  private readonly client: Anthropic;

  constructor(
    private readonly cfg: StudioConfig["llm"],
    client?: Anthropic,
  ) {
    this.client = client ?? new Anthropic();
  }

  get model(): string {
    return this.cfg.model;
  }

  /** Structured call: validated against a zod schema. */
  async structured<S extends z.ZodType>(params: {
    schema: S;
    system: string;
    content: Anthropic.Beta.BetaContentBlockParam[];
    model?: string;
    effort?: "low" | "medium" | "high";
  }): Promise<z.infer<S>> {
    const res = await this.client.beta.messages.parse({
      model: params.model ?? this.cfg.model,
      max_tokens: this.cfg.maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      thinking: { type: "adaptive" },
      output_config: { effort: params.effort ?? "medium", format: betaZodOutputFormat(params.schema) },
      system: params.system,
      messages: [{ role: "user", content: params.content }],
    });
    this.usage.calls++;
    this.usage.inputTokens += res.usage.input_tokens;
    this.usage.outputTokens += res.usage.output_tokens;
    if (res.stop_reason === "refusal") throw new LlmRefusalError(res.stop_details?.category ?? null);
    if (res.parsed_output == null) throw new Error(`Claude returned no parseable output (stop_reason=${res.stop_reason})`);
    return res.parsed_output as z.infer<S>;
  }

  /** Rough USD cost at Claude Opus 5 list prices ($5 / $25 per MTok). */
  costUsd(): number {
    return Math.round(((this.usage.inputTokens * 5 + this.usage.outputTokens * 25) / 1_000_000) * 10000) / 10000;
  }
}

/** Returns a client if the config/env allow it, else null (heuristic mode). */
export function createLlm(config: StudioConfig, env = process.env): ClaudeClient | null {
  if (config.llm.provider === "none") return null;
  const hasCreds = Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
  if (config.llm.provider === "auto" && !hasCreds) return null;
  return new ClaudeClient(config.llm);
}

async function imageBlock(file: string): Promise<Anthropic.Beta.BetaImageBlockParam> {
  const data = (await readFile(file)).toString("base64");
  return { type: "image", source: { type: "base64", media_type: "image/jpeg", data } };
}

// ---------------------------------------------------------------------------
// Vision: describe a frame's UI (Module 3)
// ---------------------------------------------------------------------------

const VisionSchema = z.object({
  description: z.string(),
  page_title: z.string().nullable(),
  elements: z.array(
    z.object({
      kind: z.enum(["button", "menu", "menu_item", "tab", "input", "dropdown", "checkbox", "toggle", "dialog", "sidebar_item", "card", "table", "text", "link", "icon", "other"]),
      label: z.string(),
      state: z.string().nullable(),
    }),
  ),
});

export function claudeVision(llm: ClaudeClient, model: string): VisionAnalyzer {
  return {
    name: `anthropic:${model}`,
    async analyzeFrame({ file, ocrText }) {
      const out = await llm.structured({
        schema: VisionSchema,
        model,
        effort: "low",
        system:
          "You analyze frames of screen-recorded software tutorials. List the interactive UI elements you can see with their exact visible labels (keep the original language and spelling). Note open menus, dialogs, toggles' on/off state. Do not invent elements. Never include personal data in descriptions.",
        content: [await imageBlock(file), { type: "text", text: `OCR text found on this frame (may contain errors):\n${ocrText.join("\n")}` }],
      });
      return {
        description: out.description,
        pageTitle: out.page_title,
        elements: out.elements.map((e): DetectedUiElement => ({ kind: e.kind, label: e.label, state: e.state ?? undefined, confidence: 0.8, source: "vision" })),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Tutorial refinement (Module 5 + 7): better Hebrew, same structure
// ---------------------------------------------------------------------------

const RefineSchema = z.object({
  title_he: z.string(),
  summary: z.string(),
  topic_tags: z.array(z.string()),
  troubleshooting: z.array(z.string()),
  important_notes: z.array(z.string()),
  steps: z.array(
    z.object({
      id: z.string(),
      instruction_he: z.string(),
      what_user_sees_after: z.string(),
      label_he: z.string().nullable(),
      warning: z.string().nullable(),
      tip: z.string().nullable(),
      location_description: z.string(),
    }),
  ),
});

const HEBREW_STYLE = `Hebrew style rules:
- Simple, professional, natural spoken Hebrew for a short video. Short sentences. Not robotic.
- Plural imperative ("לחצו", "בחרו", "הפעילו").
- Say exactly what to do, where, and what appears afterwards.
- Keep the REAL UI label exactly as it appears in the product, in quotes (e.g. 'Settings'); you may add the Hebrew meaning.
- Never translate a real button/menu name into something the viewer won't find in the product.
- Bad: "כעת יש לנווט לכיוון אזור ההגדרות." Good: "עכשיו לחצו על 'Settings' בתפריט השמאלי."`;

export async function refineTutorial(llm: ClaudeClient, tutorial: Tutorial, transcript: Transcript, frames: FramesAnalysisResult): Promise<Tutorial> {
  const frameNotes = frames.analyses
    .filter((a) => a.description || a.pageTitle)
    .slice(0, 20)
    .map((a) => `t=${a.time.toFixed(1)}s: ${a.pageTitle ?? ""} — ${a.description ?? ""}`)
    .join("\n");
  const out = await llm.structured({
    schema: RefineSchema,
    system: `You turn detected tutorial steps into a clear Hebrew tutorial. Keep every step id, its order and its action exactly; improve only the wording fields. Teaching accuracy beats everything else. Do not add steps that the source does not show. Do not include personal data (names, emails, numbers) from the source.\n\n${HEBREW_STYLE}`,
    content: [
      {
        type: "text",
        text: `Source transcript (${transcript.language ?? "unknown"}):\n${transcript.text || "(no speech)"}\n\nScreen notes:\n${frameNotes || "(none)"}\n\nDetected tutorial JSON:\n${JSON.stringify({ ...tutorial, steps: tutorial.steps.map(({ source: _s, review: _r, ...s }) => s) }, null, 1)}`,
      },
    ],
  });
  const byId = new Map(out.steps.map((s) => [s.id, s]));
  return Tutorial.parse({
    ...tutorial,
    title_he: out.title_he || tutorial.title_he,
    summary: out.summary || tutorial.summary,
    topic_tags: out.topic_tags,
    troubleshooting: out.troubleshooting.length ? out.troubleshooting : tutorial.troubleshooting,
    important_notes: out.important_notes,
    steps: tutorial.steps.map((s) => {
      const r = byId.get(s.id);
      if (!r) return s;
      return {
        ...s,
        instruction_he: r.instruction_he || s.instruction_he,
        what_user_sees_after: r.what_user_sees_after || s.what_user_sees_after,
        warning: r.warning,
        tip: r.tip,
        action: { ...s.action, label_he: r.label_he ?? s.action.label_he, location_description: r.location_description || s.action.location_description },
      };
    }),
  });
}

// ---------------------------------------------------------------------------
// Hebrew script + hooks (Modules 7, 8)
// ---------------------------------------------------------------------------

const ScriptOut = z.object({
  hooks: z.array(z.object({ style: z.enum(["problem", "speed", "curiosity", "benefit"]), text: z.string() })).length(3),
  default_hook_index: z.number().int().min(0).max(2),
  intro: z.string(),
  steps: z.array(z.object({ id: z.string(), narration: z.string(), on_screen_title: z.string() })),
  summary: z.string(),
});

export async function writeScriptWithLlm(llm: ClaudeClient, tutorial: Tutorial, base: Script, wordsPerSecond: number): Promise<Script> {
  const out = await llm.structured({
    schema: ScriptOut,
    system: `You write Hebrew narration for a 30–60 second tutorial Short. Every step's narration answers: what to do, where, and what you'll see after. 1–2 short sentences per step. Hooks must be honest (no false clickbait) and describe exactly what the video shows. on_screen_title: max 4 words.\n\n${HEBREW_STYLE}`,
    content: [{ type: "text", text: `Tutorial:\n${JSON.stringify({ title_he: tutorial.title_he, app: tutorial.app.name, steps: tutorial.steps.map((s) => ({ id: s.id, instruction_he: s.instruction_he, after: s.what_user_sees_after, label: s.action.required_real_label, warning: s.warning })) }, null, 1)}` }],
  });
  const est = (t: string) => Math.round(estimateSpeechSec(t, wordsPerSecond) * 100) / 100;
  const hooks = out.hooks.map((h, i) => Hook.parse({ id: `hook-${i + 1}`, style: h.style, text: h.text, isDefault: i === out.default_hook_index }));
  const selected = hooks[out.default_hook_index]!;
  const byId = new Map(out.steps.map((s) => [s.id, s]));
  const segments = base.segments.map((seg) => {
    if (seg.kind === "intro") return { ...seg, text: out.intro, estimatedSec: est(out.intro) };
    if (seg.kind === "hook") return { ...seg, text: selected.text, estimatedSec: est(selected.text) };
    if (seg.kind === "summary") return { ...seg, text: out.summary, estimatedSec: est(out.summary) };
    if (seg.kind === "step" && seg.stepId && byId.has(seg.stepId)) {
      const s = byId.get(seg.stepId)!;
      return { ...seg, text: s.narration, onScreenTitle: s.on_screen_title, estimatedSec: est(s.narration) };
    }
    return seg;
  });
  return Script.parse({ ...base, provider: `anthropic:${llm.model}`, hooks, selectedHookId: selected.id, segments, fullText: segments.map((s) => s.text).join("\n") });
}

// ---------------------------------------------------------------------------
// Hebrew draft translation of the transcript (Module 2) — reference only
// ---------------------------------------------------------------------------

const DraftOut = z.object({ lines: z.array(z.string()) });

export async function hebrewDraft(llm: ClaudeClient, transcript: Transcript): Promise<string> {
  const out = await llm.structured({
    schema: DraftOut,
    effort: "low",
    system: "Translate each transcript line to Hebrew, one output line per input line. This is a reference draft, not the final script. Keep UI labels (button/menu names) in their original language.",
    content: [{ type: "text", text: transcript.segments.map((s) => s.text).join("\n") }],
  });
  return out.lines.join("\n") + "\n";
}
