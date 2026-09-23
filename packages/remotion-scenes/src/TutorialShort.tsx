import React, { useMemo } from "react";
import { AbsoluteFill, Html5Audio, Sequence, staticFile } from "remotion";
import type { RenderPlan, ScreenDefinition } from "@studio/shared";
import { getPreset } from "./theme/presets";
import { ThemeProvider } from "./theme/ThemeContext";
import { Background, FontGate, SubtitleLayer } from "./scenes/chrome";
import { CtaScene, HookScene, IntroScene, StepScene, SummaryScene } from "./scenes/scenes";
import { FONT_FACES_TO_WAIT_FOR } from "./font-faces";

/**
 * TutorialShort: the 9:16 composition. Entirely driven by a RenderPlan JSON:
 * INTRO → HOOK → STEP 1..N → SUMMARY → CTA, with narration and subtitles.
 */
export const TutorialShort: React.FC<RenderPlan> = (plan) => {
  const tokens = getPreset(plan.stylePreset);
  const screens = useMemo(() => Object.fromEntries(plan.screens.map((s) => [s.id, s])) as Record<string, ScreenDefinition>, [plan.screens]);
  const audioSrc = plan.audio ? (/^(https?:|data:|blob:|\/)/.test(plan.audio.src) ? plan.audio.src : staticFile(plan.audio.src)) : null;
  return (
    <ThemeProvider tokens={tokens}>
      <AbsoluteFill style={{ fontFamily: tokens.fonts.chrome }}>
        <Background />
        <FontGate faces={FONT_FACES_TO_WAIT_FOR}>
          {plan.scenes.map((scene) => (
            <Sequence key={scene.id} from={scene.from} durationInFrames={scene.durationInFrames} name={`${scene.kind}:${scene.id}`} layout="none">
              <AbsoluteFill>
                {scene.kind === "intro" ? (
                  <IntroScene scene={scene} appName={plan.appName} channelName={plan.branding.channelName} />
                ) : scene.kind === "hook" ? (
                  <HookScene scene={scene} />
                ) : scene.kind === "step" ? (
                  <StepScene scene={scene} screens={screens} />
                ) : scene.kind === "summary" ? (
                  <SummaryScene scene={scene} />
                ) : (
                  <CtaScene scene={scene} handle={plan.branding.handle} />
                )}
              </AbsoluteFill>
            </Sequence>
          ))}
          {plan.subtitleStyle.burnIn ? <SubtitleLayer cues={plan.subtitles} fontSize={plan.subtitleStyle.fontSize} /> : null}
        </FontGate>
        {audioSrc ? <Html5Audio src={audioSrc} /> : null}
      </AbsoluteFill>
    </ThemeProvider>
  );
};

/** Single-screen preview composition (admin "Demo UI" tab, visual tests). */
export const ScreenPreview: React.FC<{ plan: RenderPlan; sceneId?: string }> = ({ plan, sceneId }) => {
  const scene = plan.scenes.find((s) => s.id === sceneId) ?? plan.scenes.find((s) => s.kind === "step") ?? plan.scenes[0]!;
  return <TutorialShort {...plan} scenes={[{ ...scene, from: 0 }]} subtitles={[]} audio={null} />;
};
