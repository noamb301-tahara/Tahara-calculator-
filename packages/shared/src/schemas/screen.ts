import { z } from "zod";
import { FidelityMode } from "./project";

/**
 * ScreenDefinition: a JSON description of a demo screen. The React engine in
 * @studio/remotion-scenes renders any ScreenDefinition, so hundreds of videos
 * can share one UI engine instead of hand-built screens.
 *
 * Every element that an action can target MUST have an `id`.
 */

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";
const ToneSchema = z.enum(["neutral", "info", "success", "warning", "danger", "accent"]);

export type Option = { id: string; label: string };
const OptionSchema = z.object({ id: z.string(), label: z.string() });

export type ScreenElement =
  | { kind: "text"; id?: string; text: string; variant?: "title" | "heading" | "body" | "muted" | "label" | "code" }
  | {
      kind: "button";
      id: string;
      label: string;
      variant?: "primary" | "secondary" | "ghost" | "danger" | "link";
      icon?: string;
      size?: "sm" | "md" | "lg";
    }
  | { kind: "icon_button"; id: string; icon: string; label: string }
  | {
      kind: "input";
      id: string;
      label?: string;
      placeholder?: string;
      value?: string;
      inputType?: "text" | "email" | "password" | "search" | "number" | "url";
      helper?: string;
      multiline?: boolean;
    }
  | { kind: "dropdown"; id: string; label?: string; value: string; options: Option[] }
  | { kind: "toggle"; id: string; label: string; description?: string; on: boolean }
  | { kind: "checkbox"; id: string; label: string; description?: string; checked: boolean }
  | { kind: "radio_group"; id: string; label?: string; value: string; options: Option[] }
  | { kind: "metric"; id?: string; label: string; value: string; delta?: string; trend?: "up" | "down" | "flat" }
  | { kind: "card"; id?: string; title?: string; subtitle?: string; children: ScreenElement[]; actions?: ScreenElement[] }
  | { kind: "table"; id?: string; columns: string[]; rows: { id: string; cells: string[]; badge?: { text: string; tone?: Tone } }[] }
  | { kind: "tabs"; id: string; tabs: Option[]; active: string }
  | { kind: "list"; id?: string; items: { id: string; label: string; description?: string; icon?: string; meta?: string }[] }
  | { kind: "setting_row"; id: string; label: string; description?: string; control?: ScreenElement }
  | { kind: "row"; id?: string; gap?: number; align?: "start" | "center" | "end" | "stretch"; justify?: "start" | "center" | "end" | "between"; wrap?: boolean; children: ScreenElement[] }
  | { kind: "stack"; id?: string; gap?: number; children: ScreenElement[] }
  | { kind: "grid"; id?: string; columns: number; gap?: number; children: ScreenElement[] }
  | { kind: "divider"; id?: string }
  | { kind: "badge"; id?: string; text: string; tone?: Tone }
  | { kind: "avatar"; id?: string; name: string; size?: number }
  | { kind: "media"; id?: string; label?: string; aspect?: number; icon?: string }
  | { kind: "empty_state"; id?: string; title: string; description?: string; icon?: string; action?: ScreenElement }
  | { kind: "progress"; id?: string; label?: string; value: number }
  | { kind: "chart"; id?: string; variant: "bar" | "line"; values: number[]; label?: string }
  | { kind: "spacer"; size: number }
  /** Conceptual-mode placeholder: grey skeleton bars. */
  | { kind: "skeleton"; id?: string; lines?: number; height?: number };

export const ScreenElementSchema: z.ZodType<ScreenElement> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("text"), id: z.string().optional(), text: z.string(), variant: z.enum(["title", "heading", "body", "muted", "label", "code"]).optional() }),
    z.object({
      kind: z.literal("button"),
      id: z.string(),
      label: z.string(),
      variant: z.enum(["primary", "secondary", "ghost", "danger", "link"]).optional(),
      icon: z.string().optional(),
      size: z.enum(["sm", "md", "lg"]).optional(),
    }),
    z.object({ kind: z.literal("icon_button"), id: z.string(), icon: z.string(), label: z.string() }),
    z.object({
      kind: z.literal("input"),
      id: z.string(),
      label: z.string().optional(),
      placeholder: z.string().optional(),
      value: z.string().optional(),
      inputType: z.enum(["text", "email", "password", "search", "number", "url"]).optional(),
      helper: z.string().optional(),
      multiline: z.boolean().optional(),
    }),
    z.object({ kind: z.literal("dropdown"), id: z.string(), label: z.string().optional(), value: z.string(), options: z.array(OptionSchema).min(1) }),
    z.object({ kind: z.literal("toggle"), id: z.string(), label: z.string(), description: z.string().optional(), on: z.boolean() }),
    z.object({ kind: z.literal("checkbox"), id: z.string(), label: z.string(), description: z.string().optional(), checked: z.boolean() }),
    z.object({ kind: z.literal("radio_group"), id: z.string(), label: z.string().optional(), value: z.string(), options: z.array(OptionSchema).min(1) }),
    z.object({ kind: z.literal("metric"), id: z.string().optional(), label: z.string(), value: z.string(), delta: z.string().optional(), trend: z.enum(["up", "down", "flat"]).optional() }),
    z.object({
      kind: z.literal("card"),
      id: z.string().optional(),
      title: z.string().optional(),
      subtitle: z.string().optional(),
      children: z.array(ScreenElementSchema),
      actions: z.array(ScreenElementSchema).optional(),
    }),
    z.object({
      kind: z.literal("table"),
      id: z.string().optional(),
      columns: z.array(z.string()).min(1),
      rows: z.array(z.object({ id: z.string(), cells: z.array(z.string()), badge: z.object({ text: z.string(), tone: ToneSchema.optional() }).optional() })),
    }),
    z.object({ kind: z.literal("tabs"), id: z.string(), tabs: z.array(OptionSchema).min(1), active: z.string() }),
    z.object({
      kind: z.literal("list"),
      id: z.string().optional(),
      items: z.array(z.object({ id: z.string(), label: z.string(), description: z.string().optional(), icon: z.string().optional(), meta: z.string().optional() })),
    }),
    z.object({ kind: z.literal("setting_row"), id: z.string(), label: z.string(), description: z.string().optional(), control: ScreenElementSchema.optional() }),
    z.object({
      kind: z.literal("row"),
      id: z.string().optional(),
      gap: z.number().optional(),
      align: z.enum(["start", "center", "end", "stretch"]).optional(),
      justify: z.enum(["start", "center", "end", "between"]).optional(),
      wrap: z.boolean().optional(),
      children: z.array(ScreenElementSchema),
    }),
    z.object({ kind: z.literal("stack"), id: z.string().optional(), gap: z.number().optional(), children: z.array(ScreenElementSchema) }),
    z.object({ kind: z.literal("grid"), id: z.string().optional(), columns: z.number().int().min(1).max(6), gap: z.number().optional(), children: z.array(ScreenElementSchema) }),
    z.object({ kind: z.literal("divider"), id: z.string().optional() }),
    z.object({ kind: z.literal("badge"), id: z.string().optional(), text: z.string(), tone: ToneSchema.optional() }),
    z.object({ kind: z.literal("avatar"), id: z.string().optional(), name: z.string(), size: z.number().optional() }),
    z.object({ kind: z.literal("media"), id: z.string().optional(), label: z.string().optional(), aspect: z.number().optional(), icon: z.string().optional() }),
    z.object({
      kind: z.literal("empty_state"),
      id: z.string().optional(),
      title: z.string(),
      description: z.string().optional(),
      icon: z.string().optional(),
      action: ScreenElementSchema.optional(),
    }),
    z.object({ kind: z.literal("progress"), id: z.string().optional(), label: z.string().optional(), value: z.number().min(0).max(100) }),
    z.object({ kind: z.literal("chart"), id: z.string().optional(), variant: z.enum(["bar", "line"]), values: z.array(z.number()).min(2), label: z.string().optional() }),
    z.object({ kind: z.literal("spacer"), size: z.number() }),
    z.object({ kind: z.literal("skeleton"), id: z.string().optional(), lines: z.number().int().optional(), height: z.number().optional() }),
  ]),
);

export type NavItem = { id: string; label: string; icon?: string; active?: boolean; badge?: string; children?: NavItem[]; expanded?: boolean };
export const NavItemSchema: z.ZodType<NavItem> = z.lazy(() =>
  z.object({
    id: z.string(),
    label: z.string(),
    icon: z.string().optional(),
    active: z.boolean().optional(),
    badge: z.string().optional(),
    children: z.array(NavItemSchema).optional(),
    expanded: z.boolean().optional(),
  }),
);

export const MenuItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  icon: z.string().optional(),
  shortcut: z.string().optional(),
  description: z.string().optional(),
  danger: z.boolean().optional(),
  dividerBefore: z.boolean().optional(),
});
export type MenuItem = z.infer<typeof MenuItemSchema>;

export const OverlaySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("menu"),
    id: z.string(),
    /** Element id the menu opens from. */
    anchor: z.string(),
    placement: z.enum(["bottom-start", "bottom-end", "right-start", "left-start", "top-start"]).default("bottom-start"),
    title: z.string().optional(),
    items: z.array(MenuItemSchema).min(1),
    open: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal("dialog"),
    id: z.string(),
    title: z.string(),
    description: z.string().optional(),
    body: z.array(ScreenElementSchema).default([]),
    actions: z.array(ScreenElementSchema).default([]),
    open: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal("toast"),
    id: z.string(),
    text: z.string(),
    tone: ToneSchema.default("success"),
    open: z.boolean().default(false),
  }),
]);
export type Overlay = z.infer<typeof OverlaySchema>;
export type OverlayInput = z.input<typeof OverlaySchema>;

export const ScreenDefinitionSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  /** "app" = sidebar + topbar shell, "centered" = single centered panel (login, wizard), "blank" = content only. */
  layout: z.enum(["app", "dashboard", "settings", "form", "list", "centered", "blank"]).default("app"),
  frame: z.enum(["browser", "window", "mobile", "none"]).default("browser"),
  /** Direction of the reconstructed product UI (usually the real product's, often "ltr"). */
  direction: z.enum(["ltr", "rtl"]).default("ltr"),
  browser: z.object({ url: z.string(), tabTitle: z.string().optional() }).optional(),
  app: z.object({ name: z.string(), logoText: z.string().optional(), accentColor: z.string().optional() }),
  topbar: z
    .object({
      title: z.string().optional(),
      search: z.object({ placeholder: z.string() }).optional(),
      actions: z.array(ScreenElementSchema).default([]),
      user: z.object({ name: z.string(), id: z.string().optional() }).optional(),
    })
    .optional(),
  sidebar: z
    .object({
      position: z.enum(["left", "right"]).default("left"),
      items: z.array(NavItemSchema),
      footer: z.array(NavItemSchema).default([]),
      sectionTitle: z.string().optional(),
    })
    .optional(),
  header: z
    .object({
      title: z.string(),
      subtitle: z.string().optional(),
      breadcrumbs: z.array(z.string()).optional(),
      actions: z.array(ScreenElementSchema).default([]),
    })
    .optional(),
  content: z.array(ScreenElementSchema).default([]),
  overlays: z.array(OverlaySchema).default([]),
  /** Element highlighted as "current" (e.g. active nav item). */
  activeElement: z.string().optional(),
  notes: z.string().optional(),
});
export type ScreenDefinition = z.infer<typeof ScreenDefinitionSchema>;
export type ScreenDefinitionInput = z.input<typeof ScreenDefinitionSchema>;

export const ScreenSetSchema = z.object({
  version: z.literal(1).default(1),
  fidelityMode: FidelityMode,
  screens: z.array(ScreenDefinitionSchema).min(1),
  /** Demo-data substitutions applied (originals are only stored as hashes). */
  substitutions: z
    .array(z.object({ kind: z.string(), originalHash: z.string(), replacement: z.string() }))
    .default([]),
});
export type ScreenSet = z.infer<typeof ScreenSetSchema>;
