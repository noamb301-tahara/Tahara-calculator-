"use client";
import "@studio/remotion-scenes/fonts";
import { Player } from "@remotion/player";
import { ScreenPreview, TutorialShort } from "@studio/remotion-scenes";
import type { RenderPlan } from "@studio/shared";

/** Full Short, playable in the browser with the same engine used for rendering. */
export function ShortPlayer({ plan }: { plan: RenderPlan }) {
  return (
    // The Player positions its canvas absolutely; in an RTL page it must sit in an LTR box.
    <div dir="ltr">
    <Player
      component={TutorialShort as never}
      inputProps={plan as never}
      durationInFrames={plan.durationInFrames}
      compositionWidth={plan.width}
      compositionHeight={plan.height}
      fps={plan.fps}
      controls
      style={{ width: "100%", aspectRatio: "9 / 16", borderRadius: 16, overflow: "hidden" }}
    />
    </div>
  );
}

/** One step scene (reconstructed Demo UI), looping. */
export function StepPlayer({ plan, sceneId }: { plan: RenderPlan; sceneId: string }) {
  const scene = plan.scenes.find((s) => s.id === sceneId);
  if (!scene) return <div className="text-sm text-slate-400">אין סצנה</div>;
  // Start just before the key interaction so the preview is meaningful even before playing.
  const click = scene.actions.find((a) => a.type === "cursor_click")?.at ?? 1;
  const initialFrame = Math.max(0, Math.min(scene.durationInFrames - 1, Math.round((click - 0.3) * plan.fps)));
  return (
    <div dir="ltr">
    <Player
      initialFrame={initialFrame}
      initiallyMuted
      component={ScreenPreview as never}
      inputProps={{ plan, sceneId } as never}
      durationInFrames={scene.durationInFrames}
      compositionWidth={plan.width}
      compositionHeight={plan.height}
      fps={plan.fps}
      loop
      autoPlay
      controls
      style={{ width: "100%", aspectRatio: "9 / 16", borderRadius: 12, overflow: "hidden" }}
    />
    </div>
  );
}
