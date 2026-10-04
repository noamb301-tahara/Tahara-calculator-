import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ADAM_COLORS } from "./Adam";

/**
 * Adam, photoreal: the chosen portrait (public/character/adam.jpg, 1125×2000) brought
 * to life without generating video: a slow push-in with breathing sway, a pulsing
 * teal glow and a turning focus ring on the mechanical eye, an occasional light sweep
 * over the metal, and a voice meter on the chest while he speaks.
 *
 * Eye/feature positions are in source-image pixels.
 */

export const ADAM_PHOTO = {
  src: "character/adam.jpg",
  width: 1125,
  height: 2000,
  mechEye: { x: 745, y: 818 },
  chest: { x: 562, y: 1840 },
};

export interface AdamPhotoProps {
  speaking?: boolean;
  /** Extra zoom on top of the cover fit (1 = full portrait). */
  zoom?: number;
  /** Point of the portrait to keep centred when zoomed (source px). */
  focus?: { x: number; y: number };
}

export const AdamPhoto: React.FC<AdamPhotoProps> = ({ speaking = false, zoom = 1, focus }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const P = ADAM_PHOTO;
  const accent = ADAM_COLORS.accent;

  // Cover-fit, then a slow push-in and a gentle breathing sway.
  const base = Math.max(width / P.width, height / P.height);
  const push = interpolate(frame, [0, durationInFrames], [1, 1.05]);
  const s = base * zoom * push;
  const f = focus ?? { x: P.width / 2, y: P.height * 0.45 };
  const sway = Math.sin(t * 1.5) * 4;
  const x = width / 2 - f.x * s;
  const y = Math.min(0, Math.max(height - P.height * s, height * 0.45 - f.y * s)) + sway;
  const at = (p: { x: number; y: number }) => ({ x: x + p.x * s, y: y + p.y * s });

  const eye = at(P.mechEye);
  const pulse = 0.55 + 0.45 * Math.sin(t * 3.2);
  // A light sweep crosses the portrait every 5 s.
  const sweep = ((t % 5) / 5) * 2.4 - 0.7;

  return (
    <AbsoluteFill style={{ background: "#f3f5f8", overflow: "hidden" }}>
      <Img src={staticFile(P.src)} style={{ position: "absolute", left: x, top: y, width: P.width * s, height: P.height * s }} />
      {/* Mechanical eye: glow + turning focus ring */}
      <div style={{ position: "absolute", left: eye.x - 70 * s, top: eye.y - 70 * s, width: 140 * s, height: 140 * s, borderRadius: "50%", background: `radial-gradient(circle, ${accent}cc 0%, ${accent}44 35%, transparent 70%)`, mixBlendMode: "screen", opacity: pulse }} />
      <svg style={{ position: "absolute", left: eye.x - 48 * s, top: eye.y - 48 * s, width: 96 * s, height: 96 * s, overflow: "visible" }} viewBox="-50 -50 100 100">
        <g transform={`rotate(${t * 40})`} opacity={0.75}>
          <circle r={40} fill="none" stroke={accent} strokeWidth={2.5} strokeDasharray="14 10" />
        </g>
        <g transform={`rotate(${-t * 25})`} opacity={0.5}>
          <circle r={46} fill="none" stroke={accent} strokeWidth={1.2} strokeDasharray="3 7" />
        </g>
      </svg>
      {/* Light sweep over the metal */}
      <div style={{ position: "absolute", inset: 0, background: `linear-gradient(105deg, transparent ${sweep * 100 - 8}%, rgba(255,255,255,.35) ${sweep * 100}%, transparent ${sweep * 100 + 8}%)`, mixBlendMode: "overlay" }} />
      {/* Voice meter on the chest plate while speaking */}
      <VoiceMeter cx={at(P.chest).x} cy={Math.min(height - 60, at(P.chest).y)} active={speaking} />
    </AbsoluteFill>
  );
};

export const VoiceMeter: React.FC<{ cx: number; cy: number; active: boolean; bars?: number }> = ({ cx, cy, active, bars = 9 }) => {
  const frame = useCurrentFrame();
  const accent = ADAM_COLORS.accent;
  return (
    <div style={{ position: "absolute", left: cx - bars * 9, top: cy - 30, width: bars * 18, height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      {Array.from({ length: bars }, (_, i) => {
        const h = active ? 10 + 46 * Math.abs(Math.sin(frame * (0.35 + i * 0.07) + i * 1.7)) * (1 - Math.abs(i - (bars - 1) / 2) / bars) : 6;
        return <div key={i} style={{ width: 8, height: h, borderRadius: 4, background: accent, boxShadow: `0 0 12px ${accent}`, opacity: active ? 0.95 : 0.4 }} />;
      })}
    </div>
  );
};
