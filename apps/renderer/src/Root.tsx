import "@studio/remotion-scenes/fonts";
import React from "react";
import { Composition, type CalculateMetadataFunction } from "remotion";
import { AdamIntro, ScreenPreview, TutorialShort } from "@studio/remotion-scenes";
import type { RenderPlan } from "@studio/shared";
import samplePlan from "./sample-plan.json";

const calculateMetadata: CalculateMetadataFunction<RenderPlan> = ({ props }) => ({
  durationInFrames: props.durationInFrames,
  width: props.width,
  height: props.height,
  fps: props.fps,
});

const sample = samplePlan as unknown as RenderPlan;

export const Root: React.FC = () => (
  <>
    <Composition
      id="TutorialShort"
      component={TutorialShort}
      defaultProps={sample}
      calculateMetadata={calculateMetadata}
      durationInFrames={sample.durationInFrames}
      width={sample.width}
      height={sample.height}
      fps={sample.fps}
    />
    <Composition
      id="ScreenPreview"
      component={ScreenPreview}
      defaultProps={{ plan: sample, sceneId: undefined as string | undefined }}
      calculateMetadata={({ props }) => {
        const scene = props.plan.scenes.find((s) => s.id === props.sceneId) ?? props.plan.scenes.find((s) => s.kind === "step") ?? props.plan.scenes[0]!;
        return { durationInFrames: scene.durationInFrames, width: props.plan.width, height: props.plan.height, fps: props.plan.fps };
      }}
      durationInFrames={90}
      width={sample.width}
      height={sample.height}
      fps={sample.fps}
    />
    <Composition
      id="AdamIntro"
      component={AdamIntro}
      defaultProps={{
        handle: "@adam.codes",
        variant: "photo" as "photo" | "drawn",
        lines: [
          { text: "Hi, I'm Adam.", from: 0.8, to: 2.4 },
          { text: "I watch the viral Claude Code tips…", from: 2.5, to: 4.6 },
          { text: "…and show you the faster way.", from: 4.7, to: 6.8 },
        ],
      }}
      durationInFrames={225}
      width={1080}
      height={1920}
      fps={30}
    />
  </>
);
