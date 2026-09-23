import { z } from "zod";
import { FidelityMode, StylePresetName } from "./project";

export const TutorialActionType = z.enum([
  "click",
  "double_click",
  "right_click",
  "type",
  "select",
  "toggle",
  "check",
  "scroll",
  "hover",
  "drag",
  "navigate",
  "open_menu",
  "observe",
]);
export type TutorialActionType = z.infer<typeof TutorialActionType>;

export const TargetType = z.enum([
  "button",
  "menu_item",
  "link",
  "tab",
  "input",
  "dropdown",
  "option",
  "checkbox",
  "toggle",
  "icon",
  "card",
  "row",
  "sidebar_item",
  "dialog_button",
  "page",
  "other",
]);
export type TargetType = z.infer<typeof TargetType>;

export const ReviewStatus = z.enum(["auto", "needs_review", "approved", "edited"]);
export type ReviewStatus = z.infer<typeof ReviewStatus>;

export const TutorialAction = z.object({
  type: TutorialActionType,
  /** Label as displayed in the reconstructed UI. */
  target_label: z.string(),
  target_type: TargetType,
  /** Where the target is, in plain words ("left sidebar, bottom"). */
  location_description: z.string(),
  /**
   * The exact label the viewer must look for in the real product.
   * Preserved verbatim in the reconstruction (Teaching Accuracy rule).
   */
  required_real_label: z.string(),
  /** Hebrew rendering of the label, shown next to the real one when useful. */
  label_he: z.string().nullable().default(null),
  /** For type/select actions: the text typed or the option chosen (demo value). */
  value: z.string().nullable().default(null),
});
export type TutorialAction = z.infer<typeof TutorialAction>;

export const TutorialStep = z.object({
  id: z.string().regex(/^step-[a-z0-9-]+$/),
  order: z.number().int().positive(),
  goal: z.string(),
  instruction_he: z.string().min(1),
  what_user_sees_before: z.string(),
  action: TutorialAction,
  what_user_sees_after: z.string(),
  visual_importance: z.enum(["low", "medium", "high"]).default("medium"),
  needs_zoom: z.boolean().default(false),
  needs_pointer: z.boolean().default(true),
  needs_callout: z.boolean().default(false),
  warning: z.string().nullable().default(null),
  tip: z.string().nullable().default(null),
  source: z.object({
    start_time: z.number().nonnegative(),
    end_time: z.number().nonnegative(),
    frame_before: z.string().nullable().default(null),
    frame_after: z.string().nullable().default(null),
    detected_action_id: z.string().nullable().default(null),
  }),
  confidence: z.number().min(0).max(1),
  review: z
    .object({
      status: ReviewStatus.default("auto"),
      notes: z.string().nullable().default(null),
      reviewed_at: z.string().nullable().default(null),
    })
    .default({ status: "auto", notes: null, reviewed_at: null }),
  /** Links into screens.json (filled by screen reconstruction). */
  screen: z
    .object({
      before: z.string(),
      after: z.string().nullable().default(null),
      target_element: z.string().nullable().default(null),
    })
    .nullable()
    .default(null),
});
export type TutorialStep = z.infer<typeof TutorialStep>;

export const Tutorial = z.object({
  version: z.literal(1).default(1),
  title: z.string().min(1),
  /** Short Hebrew title used on screen (<= ~30 chars). */
  title_he: z.string().min(1),
  goal: z.string(),
  summary: z.string(),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  original_language: z.string().nullable(),
  target_language: z.literal("he").default("he"),
  estimated_final_duration: z.number().positive(),
  app: z.object({
    /** Real product name — preserved, because the viewer must find it. */
    name: z.string(),
    url: z.string().nullable().default(null),
    category: z.string().nullable().default(null),
  }),
  topic_tags: z.array(z.string()).default([]),
  prerequisites: z.array(z.string()).default([]),
  /** "If you don't see it" troubleshooting notes. */
  troubleshooting: z.array(z.string()).default([]),
  important_notes: z.array(z.string()).default([]),
  fidelity_mode: FidelityMode.default("faithful"),
  style_preset: StylePresetName.nullable().default(null),
  steps: z.array(TutorialStep).min(1),
});
export type Tutorial = z.infer<typeof Tutorial>;

/** Input type (defaults optional) for authoring tutorials by hand. */
export type TutorialInput = z.input<typeof Tutorial>;
export type TutorialStepInput = z.input<typeof TutorialStep>;
