import React, { useMemo } from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { RenderScene, ScreenDefinition, VisualAction } from "@studio/shared";
import { useTheme } from "../theme/ThemeContext";
import { BidiText } from "../bidi";
import { Icon } from "../icons";
import { DemoStage } from "../DemoStage";
import { shortLayout, StepHeader, StepProgress } from "./chrome";

const useEnter = (delay = 0, frames = 16) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping: 200 }, durationInFrames: frames });
};

/** Fade the whole scene out during its last frames, for soft cuts. */
const useExit = (durationInFrames: number, frames = 8) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [durationInFrames - frames, durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
};

export const IntroScene: React.FC<{ scene: RenderScene; appName: string; channelName: string }> = ({ scene, appName, channelName }) => {
  const t = useTheme();
  const a = useEnter(0);
  const b = useEnter(6);
  const exit = useExit(scene.durationInFrames);
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40, direction: "rtl", fontFamily: t.fonts.chrome, opacity: exit, padding: "0 70px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18, background: t.ui.surface, borderRadius: 999, padding: "14px 30px 14px 18px", boxShadow: t.ui.shadow, opacity: a, transform: `translateY(${(1 - a) * 30}px)` }}>
        <div style={{ width: 58, height: 58, borderRadius: 18, background: t.chrome.accent, color: t.chrome.accentText, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="play" size={30} />
        </div>
        <span style={{ fontSize: 36, fontWeight: 700, color: t.chrome.text }}>
          <BidiText text={appName} />
        </span>
      </div>
      <div style={{ fontSize: 96, fontWeight: 800, color: t.chrome.text, textAlign: "center", lineHeight: 1.08, letterSpacing: -1.5, opacity: b, transform: `scale(${0.92 + 0.08 * b})` }}>
        <BidiText text={scene.headline ?? ""} />
      </div>
      {scene.subheadline ? (
        <div style={{ fontSize: 44, color: t.chrome.muted, fontWeight: 500, textAlign: "center", opacity: b }}>
          <BidiText text={scene.subheadline} />
        </div>
      ) : null}
      <div style={{ position: "absolute", bottom: 150, fontSize: 30, color: t.chrome.muted, opacity: b }}>{channelName}</div>
    </div>
  );
};

export const HookScene: React.FC<{ scene: RenderScene }> = ({ scene }) => {
  const t = useTheme();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = (scene.headline ?? "").split(/\s+/);
  const exit = useExit(scene.durationInFrames);
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 80px", direction: "rtl", fontFamily: t.fonts.chrome, opacity: exit }}>
      <div style={{ fontSize: 92, fontWeight: 800, lineHeight: 1.15, color: t.chrome.text, textAlign: "center", letterSpacing: -1 }}>
        {words.map((w, i) => {
          const p = spring({ frame: frame - i * 3, fps, config: { damping: 200 }, durationInFrames: 12 });
          return (
            <span key={i} style={{ display: "inline-block", opacity: p, transform: `translateY(${(1 - p) * 26}px)`, marginInlineEnd: 22 }}>
              <BidiText text={w} ltrStyle={{ color: t.chrome.accent }} />
            </span>
          );
        })}
      </div>
    </div>
  );
};

export const StepScene: React.FC<{ scene: RenderScene; screens: Record<string, ScreenDefinition> }> = ({ scene, screens }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const L = shortLayout(width, height);
  const enter = useEnter(0, 12);
  const exit = useExit(scene.durationInFrames, 6);
  const actions = useMemo(() => scene.actions as VisualAction[], [scene.actions]);
  if (!scene.screenId || !screens[scene.screenId]) return null;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: exit }}>
      {scene.step ? <StepProgress current={scene.step.index} total={scene.step.total} /> : null}
      {scene.step ? <StepHeader index={scene.step.index} total={scene.step.total} title={scene.title} /> : null}
      <div style={{ position: "absolute", top: L.stageTop, left: L.margin, width: L.stageW, height: L.stageH, opacity: enter, transform: `translateY(${(1 - enter) * 40}px) scale(${0.97 + 0.03 * enter})` }}>
        <DemoStage screens={screens} startScreenId={scene.screenId} actions={actions} t={frame / fps} width={L.stageW} height={L.stageH} />
      </div>
    </div>
  );
};

export const SummaryScene: React.FC<{ scene: RenderScene }> = ({ scene }) => {
  const t = useTheme();
  const head = useEnter(0);
  const exit = useExit(scene.durationInFrames);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 80px", gap: 44, direction: "rtl", fontFamily: t.fonts.chrome, opacity: exit }}>
      <div style={{ fontSize: 78, fontWeight: 800, color: t.chrome.text, opacity: head, letterSpacing: -1 }}>
        <BidiText text={scene.headline ?? "סיכום"} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        {scene.bullets.map((b, i) => {
          const p = spring({ frame: frame - 8 - i * 7, fps, config: { damping: 200 }, durationInFrames: 14 });
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 26, background: t.ui.surface, borderRadius: 28, padding: "26px 32px", boxShadow: t.ui.shadow, opacity: p, transform: `translateX(${(1 - p) * -60}px)` }}>
              <div style={{ width: 66, height: 66, borderRadius: 66, flexShrink: 0, background: t.chrome.accent, color: t.chrome.accentText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, fontWeight: 800 }}>{i + 1}</div>
              <div style={{ fontSize: 44, fontWeight: 600, color: t.ui.text, lineHeight: 1.25 }}>
                <BidiText text={b} ltrStyle={{ fontWeight: 800 }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const CtaScene: React.FC<{ scene: RenderScene; handle: string | null }> = ({ scene, handle }) => {
  const t = useTheme();
  const a = useEnter(0);
  const frame = useCurrentFrame();
  const pulse = 1 + Math.sin(frame / 6) * 0.03;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 50, direction: "rtl", fontFamily: t.fonts.chrome, padding: "0 80px" }}>
      <div style={{ display: "flex", gap: 28, opacity: a }}>
        {["bookmark", "heart", "user-plus"].map((i, k) => (
          <div key={i} style={{ width: 130, height: 130, borderRadius: 40, background: k === 2 ? t.chrome.accent : t.ui.surface, color: k === 2 ? t.chrome.accentText : t.chrome.text, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: t.ui.shadow, transform: k === 2 ? `scale(${pulse})` : undefined }}>
            <Icon name={i} size={64} />
          </div>
        ))}
      </div>
      <div style={{ fontSize: 80, fontWeight: 800, color: t.chrome.text, textAlign: "center", lineHeight: 1.12, opacity: a, transform: `translateY(${(1 - a) * 30}px)` }}>
        <BidiText text={scene.headline ?? ""} />
      </div>
      {scene.subheadline ? <div style={{ fontSize: 42, color: t.chrome.muted, textAlign: "center", opacity: a }}><BidiText text={scene.subheadline} /></div> : null}
      {handle ? <div style={{ fontSize: 40, fontWeight: 700, color: t.chrome.accent, direction: "ltr" }}>{handle}</div> : null}
    </div>
  );
};
