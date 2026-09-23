import React from "react";
import { useTheme } from "../theme/ThemeContext";
import { Icon } from "../icons";
import { BidiText } from "../bidi";
import type { Rect } from "../engine/runtime";

/** Tutorial overlays (Module 10/11): cursor, pulses, highlights, callouts. */

export const Cursor: React.FC<{ x: number; y: number; press: number; opacity: number; size?: number }> = ({ x, y, press, opacity, size = 54 }) => {
  const t = useTheme();
  const s = 1 - press * 0.16;
  return (
    <div style={{ position: "absolute", left: x, top: y, width: size, height: size, transform: `translate(-6px, -4px) scale(${s})`, transformOrigin: "6px 4px", opacity, zIndex: 200, pointerEvents: "none", filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.28))" }}>
      <svg viewBox="0 0 32 32" width={size} height={size}>
        <path d="M5 3 L5 25 L11 19.5 L15 28.5 L19 26.8 L15.2 18 L23 18 Z" fill={t.overlay.cursorFill} stroke={t.overlay.cursorStroke} strokeWidth={2.2} strokeLinejoin="round" />
      </svg>
    </div>
  );
};

export const ClickPulse: React.FC<{ x: number; y: number; progress: number }> = ({ x, y, progress }) => {
  const t = useTheme();
  if (progress <= 0 || progress >= 1) return null;
  const rings = [0, 0.22];
  return (
    <>
      {rings.map((delay) => {
        const p = Math.max(0, Math.min(1, (progress - delay) / (1 - delay)));
        if (p <= 0) return null;
        const r = 18 + p * 70;
        return (
          <div
            key={delay}
            style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: "50%", border: `5px solid ${t.overlay.pulse}`, opacity: 1 - p, zIndex: 190, pointerEvents: "none" }}
          />
        );
      })}
      <div style={{ position: "absolute", left: x - 14, top: y - 14, width: 28, height: 28, borderRadius: "50%", background: t.overlay.pulse, opacity: Math.max(0, 1 - progress * 2.2), zIndex: 191 }} />
    </>
  );
};

export const HighlightBox: React.FC<{ rect: Rect; opacity: number; progress: number; padding?: number; label?: string }> = ({ rect, opacity, progress, padding = 10, label }) => {
  const t = useTheme();
  if (opacity <= 0) return null;
  const grow = 1 + (1 - progress) * 0.12;
  const w = rect.w + padding * 2;
  const h = rect.h + padding * 2;
  return (
    <div
      style={{
        position: "absolute",
        left: rect.x - padding,
        top: rect.y - padding,
        width: w,
        height: h,
        borderRadius: 16,
        border: `5px solid ${t.overlay.highlight}`,
        boxShadow: `0 0 0 8px ${t.overlay.highlightGlow}, 0 0 34px ${t.overlay.highlightGlow}`,
        opacity,
        transform: `scale(${grow})`,
        zIndex: 150,
        pointerEvents: "none",
      }}
    >
      {label ? (
        <div style={{ position: "absolute", top: -48, left: 0, background: t.overlay.highlight, color: "#fff", fontSize: 22, fontWeight: 700, padding: "6px 14px", borderRadius: 10, whiteSpace: "nowrap" }}>{label}</div>
      ) : null}
    </div>
  );
};

/** Dims everything except the target. */
export const Spotlight: React.FC<{ rect: Rect; opacity: number; padding?: number }> = ({ rect, opacity, padding = 18 }) => {
  const t = useTheme();
  if (opacity <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: rect.x - padding,
        top: rect.y - padding,
        width: rect.w + padding * 2,
        height: rect.h + padding * 2,
        borderRadius: 18,
        boxShadow: `0 0 0 4000px ${t.overlay.spotlightDim}`,
        opacity,
        zIndex: 140,
        pointerEvents: "none",
      }}
    />
  );
};

/**
 * Label callout pointing at a target. Rendered outside the zoom camera so the
 * text stays crisp and consistently sized. Shows the real label the viewer
 * must look for, plus the Hebrew meaning when useful ("Settings / הגדרות").
 */
export const Callout: React.FC<{ target: Rect; stage: { w: number; h: number }; text: string; subtext?: string; opacity: number; placement?: "auto" | "top" | "bottom" }> = ({
  target,
  stage,
  text,
  subtext,
  opacity,
  placement = "auto",
}) => {
  const t = useTheme();
  if (opacity <= 0) return null;
  const below = placement === "bottom" || (placement === "auto" && target.y + target.h / 2 < stage.h * 0.45);
  const cx = Math.max(150, Math.min(stage.w - 150, target.x + target.w / 2));
  const top = below ? target.y + target.h + 34 : undefined;
  const bottom = below ? undefined : stage.h - target.y + 34;
  const arrowX = Math.max(-120, Math.min(120, target.x + target.w / 2 - cx));
  return (
    <div
      style={{
        position: "absolute",
        left: cx,
        top,
        bottom,
        transform: `translateX(-50%) translateY(${(1 - opacity) * (below ? -14 : 14)}px)`,
        opacity,
        zIndex: 250,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "relative",
          background: t.overlay.calloutBg,
          color: t.overlay.calloutText,
          borderRadius: 20,
          padding: "16px 26px",
          boxShadow: "0 18px 40px rgba(0,0,0,0.3)",
          fontFamily: t.fonts.chrome,
          textAlign: "center",
          whiteSpace: "nowrap",
          direction: "rtl",
        }}
      >
        <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.15 }}>
          <BidiText text={text} />
        </div>
        {subtext ? (
          <div style={{ fontSize: 26, fontWeight: 600, color: t.overlay.calloutSubText, marginTop: 4 }}>
            <BidiText text={subtext} />
          </div>
        ) : null}
        <div
          style={{
            position: "absolute",
            left: `calc(50% + ${arrowX}px)`,
            [below ? "top" : "bottom"]: -14,
            width: 30,
            height: 30,
            background: t.overlay.calloutBg,
            transform: "translateX(-50%) rotate(45deg)",
            borderRadius: 5,
          }}
        />
      </div>
    </div>
  );
};

/** Curved arrow from a point to a target (used for pointer-less hints). */
export const Arrow: React.FC<{ from: { x: number; y: number }; to: { x: number; y: number }; progress: number }> = ({ from, to, progress }) => {
  const t = useTheme();
  if (progress <= 0) return null;
  const mx = (from.x + to.x) / 2 + (to.y - from.y) * 0.25;
  const my = (from.y + to.y) / 2 - (to.x - from.x) * 0.25;
  const d = `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`;
  const len = Math.hypot(to.x - from.x, to.y - from.y) * 1.25;
  const angle = (Math.atan2(to.y - my, to.x - mx) * 180) / Math.PI;
  return (
    <svg style={{ position: "absolute", inset: 0, overflow: "visible", zIndex: 180, pointerEvents: "none" }} width="100%" height="100%">
      <path d={d} fill="none" stroke={t.overlay.highlight} strokeWidth={7} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - progress)} />
      {progress > 0.9 ? (
        <g transform={`translate(${to.x} ${to.y}) rotate(${angle})`}>
          <path d="M 0 0 L -26 -14 L -26 14 Z" fill={t.overlay.highlight} />
        </g>
      ) : null}
    </svg>
  );
};

export const WarningCallout: React.FC<{ text: string; opacity: number }> = ({ text, opacity }) => {
  const t = useTheme();
  if (opacity <= 0) return null;
  return (
    <div style={{ position: "absolute", left: 40, right: 40, bottom: 40, zIndex: 260, opacity, transform: `translateY(${(1 - opacity) * 20}px)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, background: t.overlay.warningBg, color: t.overlay.warningText, borderRadius: 22, padding: "22px 28px", fontFamily: t.fonts.chrome, fontSize: 32, fontWeight: 700, direction: "rtl", boxShadow: "0 16px 40px rgba(0,0,0,0.22)" }}>
        <Icon name="warning" size={40} />
        <span>
          <BidiText text={text} />
        </span>
      </div>
    </div>
  );
};

export const SuccessState: React.FC<{ text: string; progress: number; opacity: number }> = ({ text, progress, opacity }) => {
  const t = useTheme();
  if (opacity <= 0) return null;
  const s = 0.6 + 0.4 * Math.min(1, progress * 1.4);
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 270, display: "flex", alignItems: "center", justifyContent: "center", background: `rgba(255,255,255,${0.35 * opacity})`, opacity }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, transform: `scale(${s})` }}>
        <div style={{ width: 170, height: 170, borderRadius: 170, background: t.overlay.successBg, color: t.overlay.successText, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 20px 50px rgba(0,0,0,0.2)" }}>
          <Icon name="check" size={100} strokeWidth={3.2} />
        </div>
        <div style={{ fontFamily: t.fonts.chrome, fontSize: 54, fontWeight: 800, color: t.overlay.successText, background: t.overlay.successBg, padding: "10px 30px", borderRadius: 20, direction: "rtl" }}>{text}</div>
      </div>
    </div>
  );
};
