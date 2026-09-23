import type { VisualAction } from "@studio/shared";
import { clamp01, easeInOutCubic, progressOf, sortActions, type Rect } from "./runtime";

export interface Size {
  w: number;
  h: number;
}
export interface Point {
  x: number;
  y: number;
}

/** Actions that point at an element and therefore need its on-screen rect. */
export function actionTarget(a: VisualAction): string | null {
  switch (a.type) {
    case "cursor_move":
    case "cursor_click":
    case "warning_callout":
    case "callout":
      return a.target ?? null;
    case "click_pulse":
    case "highlight":
    case "spotlight":
    case "zoom_in":
      return a.target;
    default:
      return null;
  }
}

/** The time at which a targeted action's element position should be measured. */
export function probeTimeFor(a: VisualAction): number {
  if (a.type === "cursor_move") return a.at + a.duration;
  return a.at + Math.min(a.duration, 0.4);
}

export const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** Resolves the rect of an action's target (index into the *sorted* action list). */
export type RectResolver = (action: VisualAction) => Rect | null;

// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------

export interface CursorState {
  visible: boolean;
  x: number;
  y: number;
  /** 0..1 press amount for the click animation. */
  press: number;
  opacity: number;
}

export function defaultCursorStart(stage: Size): Point {
  return { x: stage.w * 0.78, y: stage.h * 0.86 };
}

function bezier(p0: Point, p1: Point, c: Point, t: number): Point {
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y };
}

/** Natural-looking slightly curved path between two points. */
function arcControl(p0: Point, p1: Point): Point {
  const mx = (p0.x + p1.x) / 2;
  const my = (p0.y + p1.y) / 2;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(90, len * 0.18);
  return { x: mx + (-dy / len) * bend, y: my + (dx / len) * bend };
}

export function computeCursor(actions: readonly VisualAction[], t: number, resolve: RectResolver, stage: Size): CursorState {
  const sorted = sortActions(actions);
  const cursorActions = sorted.filter((a) => a.type === "cursor_move" || a.type === "cursor_click");
  if (cursorActions.length === 0) return { visible: false, x: 0, y: 0, press: 0, opacity: 0 };

  const firstMove = cursorActions.find((a) => a.type === "cursor_move");
  let pos: Point = firstMove && firstMove.type === "cursor_move" && firstMove.from ? firstMove.from : defaultCursorStart(stage);
  let press = 0;

  for (const a of cursorActions) {
    if (t < a.at) break;
    if (a.type === "cursor_move") {
      const rect = resolve(a);
      const dest: Point = rect ? center(rect) : a.point ?? pos;
      const p = progressOf(a, t);
      if (p >= 1) pos = dest;
      else {
        const from = a.from ?? pos;
        pos = bezier(from, dest, arcControl(from, dest), easeInOutCubic(p));
      }
    } else if (a.type === "cursor_click") {
      const p = progressOf(a, t);
      if (p < 1) press = Math.sin(Math.PI * p);
    }
  }
  const firstAt = cursorActions[0]!.at;
  const opacity = clamp01((t - Math.max(0, firstAt - 0.25)) / 0.25);
  return { visible: true, x: pos.x, y: pos.y, press, opacity };
}

// ---------------------------------------------------------------------------
// Camera (zoom_in / zoom_out)
// ---------------------------------------------------------------------------

export interface CameraState {
  scale: number;
  /** Focus point in stage coordinates. */
  fx: number;
  fy: number;
}

export interface CameraTransform extends CameraState {
  tx: number;
  ty: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function computeCamera(actions: readonly VisualAction[], t: number, resolve: RectResolver, stage: Size): CameraTransform {
  const neutral: CameraState = { scale: 1, fx: stage.w / 2, fy: stage.h / 2 };
  let settled: CameraState = neutral;
  let current: CameraState = neutral;
  for (const a of sortActions(actions)) {
    if (a.type !== "zoom_in" && a.type !== "zoom_out") continue;
    if (t < a.at) break;
    let target: CameraState = neutral;
    if (a.type === "zoom_in") {
      const r = resolve(a);
      if (r) {
        // Don't zoom so far that the target no longer fits.
        const maxFit = Math.min((stage.w * 0.86) / Math.max(r.w, 1), (stage.h * 0.7) / Math.max(r.h, 1));
        target = { scale: Math.max(1, Math.min(a.scale, maxFit)), fx: r.x + r.w / 2, fy: r.y + r.h / 2 };
      }
    }
    const p = easeInOutCubic(progressOf(a, t));
    current = { scale: lerp(settled.scale, target.scale, p), fx: lerp(settled.fx, target.fx, p), fy: lerp(settled.fy, target.fy, p) };
    settled = p >= 1 ? target : current;
  }
  return withTranslation(current, stage);
}

export function withTranslation(cam: CameraState, stage: Size): CameraTransform {
  const s = cam.scale;
  // Place focus at stage center, clamped so we never reveal outside the stage.
  const tx = Math.min(0, Math.max(stage.w - stage.w * s, stage.w / 2 - cam.fx * s));
  const ty = Math.min(0, Math.max(stage.h - stage.h * s, stage.h / 2 - cam.fy * s));
  return { ...cam, tx, ty };
}

/** Map a point/rect in stage coordinates through the camera. */
export function applyCamera(cam: CameraTransform, r: Rect): Rect {
  return { x: r.x * cam.scale + cam.tx, y: r.y * cam.scale + cam.ty, w: r.w * cam.scale, h: r.h * cam.scale };
}

/** Visibility envelope for timed overlays: fade in, hold, fade out. */
export function envelope(t: number, at: number, until: number, fadeIn = 0.25, fadeOut = 0.25): number {
  if (t < at || t > until) return 0;
  const i = clamp01((t - at) / fadeIn);
  const o = clamp01((until - t) / fadeOut);
  return Math.min(i, o);
}
