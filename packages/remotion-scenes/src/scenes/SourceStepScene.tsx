import React from "react";
import { Easing, Freeze, interpolate, OffthreadVideo, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { BBox, RenderPlan, RenderScene } from "@studio/shared";
import { useTheme } from "../theme/ThemeContext";
import { BidiText } from "../bidi";
import { shortLayout, StepHeader, StepProgress } from "./chrome";

/**
 * "source" fidelity step: the REAL screen recording, lined up so the real click
 * happens when the narration says it, with a camera that zooms onto the target,
 * a frame + pulse on the exact spot, a Hebrew hint, and personal data blurred.
 */

type Source = NonNullable<RenderPlan["source"]>;
type Clip = NonNullable<RenderScene["sourceClip"]>;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Camera (scale + top-left offset in stage px) that shows `focus` at zoom level z ∈ [0,1]. */
export function cameraFor(src: { width: number; height: number }, stage: { w: number; h: number }, focus: { x: number; y: number } | null, z: number, target: BBox | null = null) {
  const s0 = Math.min(stage.w / src.width, stage.h / src.height);
  // Zoomed in: ~2× (landscape recordings fill most of the tall stage), never beyond 3×,
  // and never so far that the target itself (a wide button, a settings row) is cut off.
  let s1 = Math.min(s0 * 3, Math.max(s0 * 1.9, (stage.h * 0.7) / src.height));
  if (target) s1 = Math.max(s0, Math.min(s1, (stage.w * 0.9) / target.w, (stage.h * 0.6) / target.h));
  const s = s0 + (s1 - s0) * z;
  const f = focus ?? { x: src.width / 2, y: src.height / 2 };
  const cx = src.width / 2 + (f.x - src.width / 2) * z;
  const cy = src.height / 2 + (f.y - src.height / 2) * z;
  const fit = (size: number, box: number, c: number) => (size * s <= box ? (box - size * s) / 2 : clamp(box / 2 - c * s, box - size * s, 0));
  return { s, x: fit(src.width, stage.w, cx), y: fit(src.height, stage.h, cy) };
}

export const SourceStepScene: React.FC<{ scene: RenderScene; source: Source }> = ({ scene, source }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const theme = useTheme();
  const L = shortLayout(width, height);
  const clip = scene.sourceClip as Clip;
  const t = frame / fps;
  const at = clip.atSec;

  // Real time in the recording: the action lands exactly at `at`; hold the first/last frame outside the video.
  const srcSec = clamp(clip.actionSec + (t - at), 0, Math.max(0, source.durationSec - 1 / fps));
  const ease = { easing: Easing.inOut(Easing.cubic), extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
  const z = interpolate(t, [at - 1.4, at - 0.4, at + 0.8, at + 1.7], [0, 1, 1, 0.35], ease);
  const focus = clip.point ?? (clip.target ? { x: clip.target.x + clip.target.w / 2, y: clip.target.y + clip.target.h / 2 } : null);
  const cam = cameraFor(source, { w: L.stageW, h: L.stageH }, focus, focus ? z : 0, clip.target);
  const toStage = (b: BBox) => ({ x: cam.x + b.x * cam.s, y: cam.y + b.y * cam.s, w: b.w * cam.s, h: b.h * cam.s });

  // Target marker: the OCR box of the real label, or a box around the click point.
  const tb = clip.target ?? (clip.point ? { x: clip.point.x - 70, y: clip.point.y - 34, w: 140, h: 68 } : null);
  const mark = tb ? toStage({ x: tb.x - 10, y: tb.y - 8, w: tb.w + 20, h: tb.h + 16 }) : null;
  const show = interpolate(t, [at - 1.0, at - 0.6, at + 1.4, at + 1.9], [0, 1, 1, 0], ease);
  const pulse = interpolate(t, [at - 0.05, at + 0.7], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const src = /^(https?:|data:|blob:|\/)/.test(source.src) ? source.src : staticFile(source.src);
  const blurBoxes = clip.blur.filter((b) => srcSec >= b.from && srcSec <= b.to);
  const blurPath = blurBoxes.map((b) => `M${b.x - 10} ${b.y - 8}h${b.w + 20}v${b.h + 16}h${-(b.w + 20)}Z`).join(" ");
  const enter = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  const exit = interpolate(frame, [scene.durationInFrames - 6, scene.durationInFrames], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const hintAbove = mark ? mark.y > 120 : true;

  return (
    <div style={{ position: "absolute", inset: 0, opacity: exit }}>
      {scene.step ? <StepProgress current={scene.step.index} total={scene.step.total} /> : null}
      {scene.step ? <StepHeader index={scene.step.index} total={scene.step.total} title={scene.title} /> : null}
      <div style={{ position: "absolute", top: L.stageTop, left: L.margin, width: L.stageW, height: L.stageH, borderRadius: 28, overflow: "hidden", background: "#0b0f19", boxShadow: theme.ui.shadow, opacity: enter }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: source.width, height: source.height, transformOrigin: "0 0", transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.s})` }}>
          <Freeze frame={Math.round(srcSec * fps)}>
            <OffthreadVideo src={src} muted style={{ width: source.width, height: source.height, display: "block" }} />
          </Freeze>
          {/* Personal data never reaches the viewer: a heavily blurred, tinted copy of the frame shows only inside those boxes. */}
          {blurPath ? (
            <div style={{ position: "absolute", inset: 0, clipPath: `path("${blurPath}")` }}>
              <Freeze frame={Math.round(srcSec * fps)}>
                <OffthreadVideo src={src} muted style={{ width: source.width, height: source.height, display: "block", filter: "blur(16px) saturate(0.6)" }} />
              </Freeze>
              <div style={{ position: "absolute", inset: 0, background: "rgba(140,146,158,0.45)" }} />
            </div>
          ) : null}
        </div>
        {mark ? (
          <>
            {/* Spotlight: dim everything except the real target. */}
            <div style={{ position: "absolute", left: mark.x, top: mark.y, width: mark.w, height: mark.h, borderRadius: 16, border: `6px solid ${theme.chrome.accent}`, boxShadow: `0 0 0 4000px rgba(8,10,20,${0.38 * show})`, opacity: show }} />
            {clip.point ? (
              <div
                style={{
                  position: "absolute",
                  left: cam.x + clip.point.x * cam.s - 40,
                  top: cam.y + clip.point.y * cam.s - 40,
                  width: 80,
                  height: 80,
                  borderRadius: 80,
                  border: `6px solid ${theme.chrome.accent}`,
                  opacity: pulse > 0 && pulse < 1 ? 1 - pulse : 0,
                  transform: `scale(${0.6 + pulse * 1.6})`,
                }}
              />
            ) : null}
            <div
              style={{
                position: "absolute",
                left: clamp(mark.x + mark.w / 2 - 170, 16, L.stageW - 356),
                top: hintAbove ? mark.y - 92 : mark.y + mark.h + 18,
                width: 340,
                display: "flex",
                justifyContent: "center",
                opacity: show,
                transform: `translateY(${(1 - show) * (hintAbove ? 14 : -14)}px)`,
              }}
            >
              <div style={{ direction: "rtl", background: theme.chrome.accent, color: theme.chrome.accentText, fontFamily: theme.fonts.chrome, fontSize: 38, fontWeight: 800, padding: "12px 26px", borderRadius: 999, boxShadow: "0 10px 30px rgba(0,0,0,.35)", whiteSpace: "nowrap" }}>
                <BidiText text={`${clip.hint} ${hintAbove ? "↓" : "↑"}`} />
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};
