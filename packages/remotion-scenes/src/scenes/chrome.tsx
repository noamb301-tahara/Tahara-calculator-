import React, { useEffect, useState } from "react";
import { continueRender, delayRender, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { SubtitleCue } from "@studio/shared";
import { useTheme } from "../theme/ThemeContext";
import { BidiText } from "../bidi";

/** Short-format layout (9:16): header / demo stage / subtitles. */
export function shortLayout(width: number, height: number) {
  const margin = Math.round(width * 0.037);
  const headerH = Math.round(height * 0.135);
  const stageTop = headerH + Math.round(height * 0.012);
  const stageH = Math.round(height * 0.615);
  const stageW = width - margin * 2;
  const subtitleTop = stageTop + stageH + Math.round(height * 0.02);
  return { margin, headerH, stageTop, stageH, stageW, subtitleTop };
}

export const Background: React.FC = () => {
  const t = useTheme();
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 90) * 20;
  return (
    <div style={{ position: "absolute", inset: 0, background: t.canvas.background, overflow: "hidden" }}>
      {t.canvas.decoration === "grid" ? (
        <div style={{ position: "absolute", inset: -60, backgroundImage: `linear-gradient(${t.canvas.decorationColor} 2px, transparent 2px), linear-gradient(90deg, ${t.canvas.decorationColor} 2px, transparent 2px)`, backgroundSize: "72px 72px", transform: `translateY(${drift}px)` }} />
      ) : t.canvas.decoration === "dots" ? (
        <div style={{ position: "absolute", inset: -60, backgroundImage: `radial-gradient(${t.canvas.decorationColor} 3px, transparent 3px)`, backgroundSize: "44px 44px", transform: `translateY(${drift}px)` }} />
      ) : t.canvas.decoration === "blobs" ? (
        <>
          <div style={{ position: "absolute", width: 700, height: 700, borderRadius: "50%", background: t.canvas.decorationColor, top: -200 + drift, right: -260, filter: "blur(10px)" }} />
          <div style={{ position: "absolute", width: 560, height: 560, borderRadius: "50%", background: t.canvas.decorationColor, bottom: -160 - drift, left: -220, filter: "blur(10px)" }} />
        </>
      ) : null}
    </div>
  );
};

/** Top header for step scenes: "שלב 2 מתוך 4" + short title. */
export const StepHeader: React.FC<{ index: number; total: number; title: string | null }> = ({ index, total, title }) => {
  const t = useTheme();
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const L = shortLayout(width, height);
  const enter = spring({ frame, fps, config: { damping: 200 }, durationInFrames: 14 });
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: L.headerH, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, direction: "rtl", fontFamily: t.fonts.chrome, opacity: enter, transform: `translateY(${(1 - enter) * -20}px)` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ background: t.chrome.badgeBg, color: t.chrome.badgeText, fontSize: 34, fontWeight: 800, padding: "8px 24px", borderRadius: 999 }}>
          שלב {index} <span style={{ opacity: 0.7, fontWeight: 600 }}>מתוך {total}</span>
        </div>
      </div>
      {title ? (
        <div style={{ fontSize: 52, fontWeight: 800, color: t.chrome.text, letterSpacing: -0.5, textAlign: "center", padding: "0 40px", lineHeight: 1.1 }}>
          <BidiText text={title} />
        </div>
      ) : null}
    </div>
  );
};

/** Progress dots at the very top (one per step). */
export const StepProgress: React.FC<{ current: number; total: number }> = ({ current, total }) => {
  const t = useTheme();
  const { width } = useVideoConfig();
  return (
    <div style={{ position: "absolute", top: 26, left: width * 0.2, right: width * 0.2, display: "flex", gap: 10, direction: "rtl" }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{ flex: 1, height: 8, borderRadius: 8, background: i < current ? t.chrome.accent : t.chrome.progressTrack }} />
      ))}
    </div>
  );
};

/** Burned-in Hebrew subtitles, max two short lines, bottom area. */
export const SubtitleLayer: React.FC<{ cues: SubtitleCue[]; fontSize: number }> = ({ cues, fontSize }) => {
  const t = useTheme();
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const L = shortLayout(width, height);
  const time = frame / fps;
  const cue = cues.find((c) => time >= c.start && time < c.end);
  if (!cue) return null;
  const local = time - cue.start;
  const appear = interpolate(local, [0, 0.12], [0, 1], { extrapolateRight: "clamp" });
  return (
    <div style={{ position: "absolute", top: L.subtitleTop, left: L.margin, right: L.margin, bottom: height * 0.07, display: "flex", alignItems: "flex-start", justifyContent: "center", pointerEvents: "none" }}>
      <div
        style={{
          direction: "rtl",
          textAlign: "center",
          fontFamily: t.fonts.chrome,
          fontSize,
          fontWeight: 700,
          lineHeight: 1.28,
          color: t.chrome.subtitleText,
          background: t.chrome.subtitleBg,
          padding: "18px 34px",
          borderRadius: 26,
          maxWidth: "94%",
          opacity: appear,
          transform: `translateY(${(1 - appear) * 10}px)`,
          boxShadow: "0 14px 36px rgba(0,0,0,0.18)",
        }}
      >
        {cue.lines.map((line, i) => (
          <div key={i}>
            <BidiText text={line} ltrStyle={{ color: t.chrome.subtitleHighlight }} />
          </div>
        ))}
      </div>
    </div>
  );
};

/** Blocks rendering until bundled fonts are loaded, so layout and measurements are final. */
export const FontGate: React.FC<{ faces: string[]; children: React.ReactNode }> = ({ faces, children }) => {
  const [ready, setReady] = useState(false);
  const [handle] = useState(() => delayRender("Loading fonts"));
  useEffect(() => {
    let cancelled = false;
    const fonts = typeof document !== "undefined" ? document.fonts : null;
    const done = () => {
      if (cancelled) return;
      setReady(true);
      continueRender(handle);
    };
    if (!fonts) return done();
    Promise.all(faces.map((f) => fonts.load(f, "אבג Settings 123").catch(() => [])))
      .then(() => fonts.ready)
      .then(done, done);
    return () => {
      cancelled = true;
    };
  }, [faces, handle]);
  return ready ? <>{children}</> : null;
};
