import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Adam, ADAM_COLORS } from "./Adam";

/** 9:16 character reveal: Adam introduces himself and the channel. */
export type AdamIntroProps = {
  lines: { text: string; from: number; to: number }[];
  handle: string;
};

export const AdamIntro: React.FC<AdamIntroProps> = ({ lines, handle }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const t = frame / fps;
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 24 });
  const line = lines.find((l) => t >= l.from && t < l.to) ?? null;
  const speaking = Boolean(line);
  const gx = Math.sin(t * 0.9) * 0.35;
  const lineIn = line ? interpolate(t, [line.from, line.from + 0.25], [0, 1], { extrapolateRight: "clamp" }) : 0;
  return (
    <AbsoluteFill style={{ background: "radial-gradient(120% 80% at 50% 30%, #1d2440 0%, #0b0e18 60%, #06070c 100%)", fontFamily: "Inter, Rubik, sans-serif" }}>
      {/* Soft tech grid */}
      <AbsoluteFill style={{ backgroundImage: "linear-gradient(rgba(45,226,230,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(45,226,230,.07) 1px, transparent 1px)", backgroundSize: "60px 60px", maskImage: "linear-gradient(to bottom, transparent, black 30%, black 70%, transparent)" }} />
      <div style={{ position: "absolute", top: 230, left: 0, width, display: "flex", justifyContent: "center", opacity: enter, transform: `translateY(${(1 - enter) * 60}px)` }}>
        <Adam size={760} speaking={speaking} gaze={{ x: gx, y: 0.1 }} mood="smile" />
      </div>
      {/* Name plate */}
      <div style={{ position: "absolute", top: 150, width, display: "flex", flexDirection: "column", alignItems: "center", gap: 10, opacity: enter }}>
        <div style={{ fontSize: 96, fontWeight: 800, color: "#fff", letterSpacing: 6 }}>ADAM</div>
        <div style={{ fontSize: 34, fontWeight: 600, color: ADAM_COLORS.accent, letterSpacing: 2 }}>{handle}</div>
      </div>
      {/* What Adam says */}
      {line ? (
        <div style={{ position: "absolute", bottom: 300, left: 70, right: 70, display: "flex", justifyContent: "center", opacity: lineIn, transform: `translateY(${(1 - lineIn) * 20}px)` }}>
          <div style={{ background: "rgba(10,14,26,.82)", border: `2px solid ${ADAM_COLORS.accent}55`, color: "#fff", fontSize: 52, fontWeight: 700, lineHeight: 1.25, padding: "26px 40px", borderRadius: 30, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,.45)" }}>{line.text}</div>
        </div>
      ) : null}
      {/* Honest label: an independent channel, not the product itself */}
      <div style={{ position: "absolute", bottom: 90, width, textAlign: "center", color: "rgba(255,255,255,.55)", fontSize: 26 }}>Independent creator · not affiliated with Anthropic</div>
    </AbsoluteFill>
  );
};
