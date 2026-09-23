import type { ScreenDefinition, ScreenElement, VisualAction } from "@studio/shared";

/**
 * Pure interpreter for VisualActions. Given the scene's actions and a time
 * `t` (seconds from scene start) it derives the UI state to render. No React,
 * no DOM: fully deterministic and unit-testable, so any frame can be rendered
 * independently (Remotion renders frames out of order across tabs).
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export type RectMap = Record<string, Rect>;

export interface ScreenRuntime {
  screenId: string;
  /** Previous screen during a set_screen crossfade. */
  prevScreenId: string | null;
  /** 0..1 progress of the screen transition (1 = done). */
  screenTransition: number;
  /** Overlay id -> open progress (0 closed .. 1 fully open). */
  overlays: Record<string, number>;
  toggles: Record<string, boolean>;
  /** Toggle id -> 0..1 animation progress of the last change. */
  toggleAnim: Record<string, number>;
  values: Record<string, string>;
  /** Input currently being typed into (shows caret). */
  typing: string | null;
  selections: Record<string, string>;
  /** Dropdown id -> open progress while select_option runs. */
  dropdownOpen: Record<string, number>;
  /** Dropdown id -> option being hovered in the open list. */
  dropdownHover: Record<string, string>;
  active: string | null;
  scrollY: number;
  /** Element being pressed right now (cursor_click), for pressed styling. */
  pressed: string | null;
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeOutBack = (t: number) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export function progressOf(a: { at: number; duration: number }, t: number): number {
  if (t < a.at) return 0;
  if (a.duration <= 0) return 1;
  return clamp01((t - a.at) / a.duration);
}

export function sortActions<T extends { at: number }>(actions: readonly T[]): T[] {
  // Stable sort by start time.
  return actions.map((a, i) => ({ a, i })).sort((x, y) => x.a.at - y.a.at || x.i - y.i).map((x) => x.a);
}

/** Depth-first search for an element by id in a screen definition. */
export function findElement(screen: ScreenDefinition, id: string): ScreenElement | null {
  const visit = (els: readonly ScreenElement[] | undefined): ScreenElement | null => {
    if (!els) return null;
    for (const el of els) {
      if ("id" in el && el.id === id) return el;
      const kids: ScreenElement[] = [];
      if ("children" in el && Array.isArray(el.children)) kids.push(...el.children);
      if (el.kind === "card" && el.actions) kids.push(...el.actions);
      if (el.kind === "setting_row" && el.control) kids.push(el.control);
      if (el.kind === "empty_state" && el.action) kids.push(el.action);
      const found = visit(kids);
      if (found) return found;
    }
    return null;
  };
  return (
    visit(screen.content) ??
    visit(screen.header?.actions) ??
    visit(screen.topbar?.actions) ??
    visit(screen.overlays.flatMap((o) => (o.kind === "dialog" ? [...o.body, ...o.actions] : [])))
  );
}

/**
 * Every id an action may target in a screen: elements, nav items, tabs,
 * options, list/table rows, overlays and menu items. The renderer puts a
 * data-el attribute on each of these.
 */
export function collectTargetIds(screen: ScreenDefinition): Set<string> {
  const ids = new Set<string>();
  const visitEls = (els: readonly ScreenElement[] | undefined) => {
    for (const el of els ?? []) {
      if ("id" in el && el.id) ids.add(el.id);
      switch (el.kind) {
        case "card":
          visitEls(el.children);
          visitEls(el.actions);
          break;
        case "row":
        case "stack":
        case "grid":
          visitEls(el.children);
          break;
        case "setting_row":
          if (el.control) visitEls([el.control]);
          break;
        case "empty_state":
          if (el.action) visitEls([el.action]);
          break;
        case "tabs":
        case "dropdown":
        case "radio_group":
          for (const o of el.kind === "tabs" ? el.tabs : el.options) ids.add(o.id);
          break;
        case "list":
          for (const it of el.items) ids.add(it.id);
          break;
        case "table":
          for (const r of el.rows) ids.add(r.id);
          break;
        default:
          break;
      }
    }
  };
  const visitNav = (items: readonly { id: string; children?: readonly unknown[] }[] | undefined) => {
    for (const it of items ?? []) {
      ids.add(it.id);
      visitNav(it.children as { id: string; children?: unknown[] }[] | undefined);
    }
  };
  visitEls(screen.content);
  visitEls(screen.header?.actions);
  visitEls(screen.topbar?.actions);
  visitNav(screen.sidebar?.items);
  visitNav(screen.sidebar?.footer);
  if (screen.topbar?.search) ids.add("topbar-search");
  if (screen.topbar?.user) ids.add(screen.topbar.user.id ?? "topbar-user");
  for (const o of screen.overlays) {
    ids.add(o.id);
    if (o.kind === "menu") for (const it of o.items) ids.add(it.id);
    if (o.kind === "dialog") {
      visitEls(o.body);
      visitEls(o.actions);
    }
  }
  return ids;
}

export function initialRuntime(screen: ScreenDefinition): ScreenRuntime {
  const overlays: Record<string, number> = {};
  for (const o of screen.overlays) overlays[o.id] = o.open ? 1 : 0;
  return {
    screenId: screen.id,
    prevScreenId: null,
    screenTransition: 1,
    overlays,
    toggles: {},
    toggleAnim: {},
    values: {},
    typing: null,
    selections: {},
    dropdownOpen: {},
    dropdownHover: {},
    active: screen.activeElement ?? null,
    scrollY: 0,
    pressed: null,
  };
}

/**
 * Compute the runtime state at time t.
 * @param screens all screens available to the scene, by id
 * @param startScreenId the scene's initial screen
 */
export function computeRuntime(
  screens: Record<string, ScreenDefinition>,
  startScreenId: string,
  actions: readonly VisualAction[],
  t: number,
): ScreenRuntime {
  const start = screens[startScreenId];
  if (!start) throw new Error(`Unknown screen "${startScreenId}"`);
  const st = initialRuntime(start);

  for (const a of sortActions(actions)) {
    if (t < a.at) break;
    const p = progressOf(a, t);
    switch (a.type) {
      case "set_screen": {
        if (!screens[a.screenId]) break;
        if (st.screenId !== a.screenId) {
          st.prevScreenId = st.screenId;
          st.screenId = a.screenId;
          const next = screens[a.screenId]!;
          // Overlays of the new screen start from their defined state.
          st.overlays = {};
          for (const o of next.overlays) st.overlays[o.id] = o.open ? 1 : 0;
          st.active = next.activeElement ?? st.active;
          st.scrollY = 0;
          st.typing = null;
        }
        st.screenTransition = easeInOutCubic(p);
        if (p >= 1) st.prevScreenId = null;
        break;
      }
      case "open_menu":
      case "open_dialog":
      case "toast":
        st.overlays[a.target] = easeOutCubic(p);
        break;
      case "close_menu":
      case "close_dialog":
        st.overlays[a.target] = 1 - easeOutCubic(p);
        break;
      case "toggle": {
        const screen = screens[st.screenId]!;
        const el = findElement(screen, a.target);
        const base = st.toggles[a.target] ?? (el?.kind === "toggle" ? el.on : el?.kind === "checkbox" ? el.checked : false);
        st.toggles[a.target] = a.value ?? !base;
        st.toggleAnim[a.target] = easeInOutCubic(p);
        break;
      }
      case "type_text": {
        const n = Math.round(a.text.length * p);
        st.values[a.target] = a.text.slice(0, n);
        st.typing = p < 1 ? a.target : st.typing === a.target ? null : st.typing;
        break;
      }
      case "select_option": {
        // First 65%: list open with hover moving to the option; then select + close.
        if (p < 0.65) {
          st.dropdownOpen[a.target] = easeOutCubic(clamp01(p / 0.25));
          if (p > 0.35) st.dropdownHover[a.target] = a.optionId;
        } else {
          st.selections[a.target] = a.optionId;
          st.dropdownOpen[a.target] = 1 - easeOutCubic(clamp01((p - 0.65) / 0.35));
          if (p >= 1) delete st.dropdownHover[a.target];
        }
        break;
      }
      case "scroll":
        st.scrollY += a.by * easeInOutCubic(p);
        break;
      case "set_active":
        st.active = a.target;
        break;
      case "cursor_click":
        st.pressed = p < 1 ? (a.target ?? null) : st.pressed === a.target ? null : st.pressed;
        break;
      default:
        break;
    }
  }
  return st;
}

/** A compact key describing the layout-affecting part of the runtime. */
export function layoutKey(rt: ScreenRuntime): string {
  const open = Object.entries(rt.overlays)
    .filter(([, v]) => v > 0.5)
    .map(([k]) => k)
    .sort();
  const dd = Object.entries(rt.dropdownOpen)
    .filter(([, v]) => v > 0.5)
    .map(([k]) => k)
    .sort();
  return JSON.stringify([rt.screenId, open, dd, Math.round(rt.scrollY), rt.values, rt.selections, rt.toggles]);
}
