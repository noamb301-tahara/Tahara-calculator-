import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { continueRender, delayRender } from "remotion";
import type { ScreenDefinition, VisualAction } from "@studio/shared";
import { computeRuntime, layoutKey, progressOf, sortActions, type Rect, type RectMap, type ScreenRuntime } from "./engine/runtime";
import { actionTarget, applyCamera, center, computeCamera, computeCursor, envelope, probeTimeFor } from "./engine/motion";
import { ScreenRenderer } from "./ui/ScreenRenderer";
import { Callout, ClickPulse, Cursor, HighlightBox, Spotlight, SuccessState, WarningCallout } from "./overlays/overlays";
import { useTheme } from "./theme/ThemeContext";

/**
 * DemoStage: renders the reconstructed product UI for one scene and plays its
 * VisualAction timeline on top (cursor, clicks, zoom, highlight, callouts).
 *
 * Element positions are measured from hidden "probe" renders of the exact UI
 * state at the moment each targeted action happens. This keeps every frame
 * deterministic no matter which frame a render worker starts from.
 */
export interface DemoStageProps {
  screens: Record<string, ScreenDefinition>;
  startScreenId: string;
  actions: readonly VisualAction[];
  /** Seconds since the scene started. */
  t: number;
  width: number;
  height: number;
}

interface Probe {
  key: string;
  runtime: ScreenRuntime;
}

function settle(rt: ScreenRuntime): ScreenRuntime {
  const round = (m: Record<string, number>) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v > 0.5 ? 1 : 0]));
  return { ...rt, prevScreenId: null, screenTransition: 1, overlays: round(rt.overlays), dropdownOpen: round(rt.dropdownOpen), pressed: null, typing: null, toggleAnim: {} };
}

export const DemoStage: React.FC<DemoStageProps> = ({ screens, startScreenId, actions, t, width, height }) => {
  const theme = useTheme();
  const sorted = useMemo(() => sortActions(actions), [actions]);
  const stage = useMemo(() => ({ w: width, h: height }), [width, height]);

  // --- probes: one hidden render per distinct UI state that a targeted action needs
  const { probes, keyByAction } = useMemo(() => {
    const byKey = new Map<string, Probe>();
    const keyByAction = new Map<VisualAction, string>();
    for (const a of sorted) {
      if (!actionTarget(a)) continue;
      const rt = settle(computeRuntime(screens, startScreenId, sorted, probeTimeFor(a)));
      const key = layoutKey(rt);
      if (!byKey.has(key)) byKey.set(key, { key, runtime: rt });
      keyByAction.set(a, key);
    }
    return { probes: [...byKey.values()], keyByAction };
  }, [sorted, screens, startScreenId]);

  const probeSignature = probes.map((p) => p.key).join("||");
  const [rects, setRects] = useState<Record<string, RectMap> | null>(null);
  const [handle] = useState(() => delayRender("DemoStage: measuring element positions"));
  const probeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useLayoutEffect(() => {
    const out: Record<string, RectMap> = {};
    for (const p of probes) {
      const root = probeRefs.current[p.key];
      if (root) out[p.key] = measure(root);
    }
    setRects(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [probeSignature, width, height]);

  useEffect(() => {
    if (rects) continueRender(handle);
  }, [rects, handle]);

  const resolve = (a: VisualAction): Rect | null => {
    const id = actionTarget(a);
    const key = keyByAction.get(a);
    if (!id || !key || !rects) return null;
    return rects[key]?.[id] ?? null;
  };

  const rt = computeRuntime(screens, startScreenId, sorted, t);
  const cam = computeCamera(sorted, t, resolve, stage);
  const cursor = computeCursor(sorted, t, resolve, stage);
  const current = screens[rt.screenId]!;
  const prev = rt.prevScreenId ? screens[rt.prevScreenId] : null;

  const inCamera: React.ReactNode[] = [];
  const outside: React.ReactNode[] = [];
  sorted.forEach((a, i) => {
    const r = resolve(a);
    switch (a.type) {
      case "highlight": {
        if (!r) break;
        const until = a.until ?? a.at + a.duration + 1.2;
        inCamera.push(<HighlightBox key={i} rect={r} opacity={envelope(t, a.at, until)} progress={progressOf(a, t)} label={a.label} />);
        break;
      }
      case "spotlight": {
        if (!r) break;
        const until = a.until ?? a.at + a.duration + 1.2;
        inCamera.push(<Spotlight key={i} rect={r} padding={a.padding} opacity={envelope(t, a.at, until, 0.3, 0.3)} />);
        break;
      }
      case "click_pulse": {
        const p = progressOf(a, t);
        if (t >= a.at && p < 1) {
          const c = r ? center(r) : { x: cursor.x, y: cursor.y };
          inCamera.push(<ClickPulse key={i} x={c.x} y={c.y} progress={p} />);
        }
        break;
      }
      case "callout": {
        if (!r) break;
        const until = Math.min(a.at + Math.max(a.duration, 0.3) + 2.2, a.at + 3.2);
        outside.push(<Callout key={i} target={applyCamera(cam, r)} stage={stage} text={a.text} subtext={a.subtext} placement={a.placement} opacity={envelope(t, a.at, until)} />);
        break;
      }
      case "warning_callout":
        outside.push(<WarningCallout key={i} text={a.text} opacity={envelope(t, a.at, a.at + Math.max(2.6, a.duration + 2))} />);
        break;
      case "success_state":
        outside.push(<SuccessState key={i} text={a.text} progress={progressOf(a, t)} opacity={envelope(t, a.at, a.at + a.duration + 1.4, 0.2, 0.3)} />);
        break;
      case "before_after": {
        const op = envelope(t, a.at, a.at + Math.max(a.duration, 1.5));
        const before = screens[a.beforeScreenId];
        const after = screens[a.afterScreenId];
        if (op > 0 && before && after) outside.push(<BeforeAfter key={i} before={before} after={after} opacity={op} width={width} height={height} />);
        break;
      }
      default:
        break;
    }
  });

  return (
    <div style={{ position: "relative", width, height, overflow: "hidden", borderRadius: theme.ui.radius + 6 }}>
      <div style={{ position: "absolute", left: 0, top: 0, width, height, transformOrigin: "0 0", transform: `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.scale})` }}>
        {prev ? (
          <div style={{ position: "absolute", inset: 0, opacity: 1 - rt.screenTransition }}>
            <ScreenRenderer screen={prev} runtime={{ ...rt, screenId: prev.id }} measurable={false} />
          </div>
        ) : null}
        <div style={{ position: "absolute", inset: 0, opacity: prev ? rt.screenTransition : 1 }}>
          <ScreenRenderer screen={current} runtime={rt} measurable={false} />
        </div>
        {inCamera}
        {cursor.visible ? <Cursor x={cursor.x} y={cursor.y} press={cursor.press} opacity={cursor.opacity} /> : null}
      </div>
      {outside}
      <ProbeLayer probes={probes} screens={screens} width={width} height={height} refs={probeRefs} />
    </div>
  );
};

/** Hidden renders used only for measuring element positions. */
const ProbeLayer = React.memo<{ probes: Probe[]; screens: Record<string, ScreenDefinition>; width: number; height: number; refs: React.MutableRefObject<Record<string, HTMLDivElement | null>> }>(
  ({ probes, screens, width, height, refs }) => (
    <>
      {probes.map((p) => (
        <div
          key={p.key}
          ref={(el) => {
            refs.current[p.key] = el;
          }}
          aria-hidden
          style={{ position: "absolute", left: 0, top: 0, width, height, visibility: "hidden", pointerEvents: "none" }}
        >
          <ScreenRenderer screen={screens[p.runtime.screenId]!} runtime={p.runtime} measurable />
        </div>
      ))}
    </>
  ),
);

function measure(root: HTMLElement): RectMap {
  const base = root.getBoundingClientRect();
  const ratio = root.offsetWidth ? base.width / root.offsetWidth : 1;
  const out: RectMap = {};
  root.querySelectorAll<HTMLElement>("[data-el]").forEach((el) => {
    const id = el.dataset.el!;
    if (out[id]) return;
    const r = el.getBoundingClientRect();
    out[id] = { x: (r.left - base.left) / ratio, y: (r.top - base.top) / ratio, w: r.width / ratio, h: r.height / ratio };
  });
  return out;
}

const BeforeAfter: React.FC<{ before: ScreenDefinition; after: ScreenDefinition; opacity: number; width: number; height: number }> = ({ before, after, opacity, width, height }) => {
  const theme = useTheme();
  const s = 0.49;
  const panel = (label: string, screen: ScreenDefinition) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
      <div style={{ fontFamily: theme.fonts.chrome, fontSize: 34, fontWeight: 800, color: theme.chrome.text }}>{label}</div>
      <div style={{ width: width * s, height: height * s, position: "relative", overflow: "hidden", borderRadius: 18 }}>
        <div style={{ width, height, transform: `scale(${s})`, transformOrigin: "0 0" }}>
          <ScreenRenderer screen={screen} measurable={false} />
        </div>
      </div>
    </div>
  );
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 280, opacity, background: theme.canvas.background, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 6px", direction: "rtl" }}>
      {panel("לפני", before)}
      {panel("אחרי", after)}
    </div>
  );
};
