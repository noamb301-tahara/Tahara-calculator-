import { z } from "zod";

/**
 * VisualAction: one JSON-driven tutorial animation. The Remotion engine
 * interprets a list of these per scene; nothing is hardcoded per video.
 *
 * `at` and `duration` are in seconds, relative to the scene start.
 * `target` is an element id inside the scene's ScreenDefinition.
 */
const base = {
  id: z.string().optional(),
  at: z.number().nonnegative(),
  duration: z.number().nonnegative().default(0.6),
};

const Point = z.object({ x: z.number(), y: z.number() });

export const VisualActionSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("cursor_move"), target: z.string().optional(), point: Point.optional(), from: Point.optional() }),
  z.object({ ...base, type: z.literal("cursor_click"), target: z.string().optional() }),
  z.object({ ...base, type: z.literal("click_pulse"), target: z.string() }),
  z.object({ ...base, type: z.literal("highlight"), target: z.string(), label: z.string().optional(), until: z.number().optional() }),
  z.object({ ...base, type: z.literal("spotlight"), target: z.string(), padding: z.number().default(18), until: z.number().optional() }),
  z.object({ ...base, type: z.literal("zoom_in"), target: z.string(), scale: z.number().min(1).max(4).default(1.8) }),
  z.object({ ...base, type: z.literal("zoom_out") }),
  z.object({ ...base, type: z.literal("open_menu"), target: z.string() }),
  z.object({ ...base, type: z.literal("close_menu"), target: z.string() }),
  z.object({ ...base, type: z.literal("open_dialog"), target: z.string() }),
  z.object({ ...base, type: z.literal("close_dialog"), target: z.string() }),
  z.object({ ...base, type: z.literal("select_option"), target: z.string(), optionId: z.string() }),
  z.object({ ...base, type: z.literal("type_text"), target: z.string(), text: z.string() }),
  z.object({ ...base, type: z.literal("toggle"), target: z.string(), value: z.boolean().optional() }),
  z.object({ ...base, type: z.literal("scroll"), by: z.number() }),
  z.object({ ...base, type: z.literal("set_screen"), screenId: z.string() }),
  z.object({ ...base, type: z.literal("set_active"), target: z.string() }),
  z.object({ ...base, type: z.literal("before_after"), beforeScreenId: z.string(), afterScreenId: z.string() }),
  z.object({ ...base, type: z.literal("success_state"), text: z.string() }),
  z.object({ ...base, type: z.literal("warning_callout"), text: z.string(), target: z.string().optional() }),
  z.object({
    ...base,
    type: z.literal("callout"),
    text: z.string(),
    /** Secondary line, e.g. the real English label "Settings". */
    subtext: z.string().optional(),
    target: z.string().optional(),
    placement: z.enum(["auto", "top", "bottom"]).default("auto"),
  }),
  z.object({ ...base, type: z.literal("toast"), target: z.string() }),
]);
export type VisualAction = z.infer<typeof VisualActionSchema>;
export type VisualActionInput = z.input<typeof VisualActionSchema>;
export type VisualActionType = VisualAction["type"];

export const VISUAL_ACTION_TYPES = VisualActionSchema.options.map((o) => o.shape.type.value) as VisualActionType[];
