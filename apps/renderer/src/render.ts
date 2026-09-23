import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import type { RenderPlan } from "@studio/shared";

const here = dirname(fileURLToPath(import.meta.url));
const ENTRY = resolve(here, "index.ts");

let bundlePromise: Promise<string> | null = null;

/** Bundle the Remotion project once per process (webpack cache makes re-bundles fast). */
export function getBundle(onProgress?: (p: number) => void): Promise<string> {
  bundlePromise ??= bundle({
    entryPoint: ENTRY,
    onProgress: (p) => onProgress?.(p / 100),
    publicDir: resolve(here, "../public"),
  }).catch((err) => {
    bundlePromise = null;
    throw err;
  });
  return bundlePromise;
}

/**
 * Find a Chromium the renderer can drive. Order: explicit option, env var,
 * Playwright's pre-installed headless shell, then Remotion's own download.
 */
export async function findBrowserExecutable(explicit?: string | null): Promise<string | null> {
  const candidates = [explicit, process.env.STUDIO_BROWSER_EXECUTABLE, process.env.REMOTION_BROWSER_EXECUTABLE].filter(Boolean) as string[];
  for (const c of candidates) if (existsSync(c)) return c;
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  if (existsSync(pw)) {
    const dirs = (await readdir(pw)).sort().reverse();
    for (const d of dirs) {
      const shell = join(pw, d, "chrome-linux", "headless_shell");
      if (d.startsWith("chromium_headless_shell") && existsSync(shell)) return shell;
    }
  }
  return null; // let Remotion download/choose its own
}

export interface RenderOptions {
  outputFile: string;
  /** Local audio file to serve to the composition as plan.audio.src. */
  audioFile?: string | null;
  codec?: "h264" | "h265" | "vp9";
  crf?: number;
  browserExecutable?: string | null;
  concurrency?: number | null;
  onProgress?: (p: { stage: "bundling" | "rendering" | "encoding"; progress: number }) => void;
}

/** Render a RenderPlan to an MP4. Returns the output path. */
export async function renderPlan(plan: RenderPlan, opts: RenderOptions): Promise<string> {
  const serveUrl = await getBundle((p) => opts.onProgress?.({ stage: "bundling", progress: p }));
  let inputPlan = plan;
  if (opts.audioFile && plan.audio) {
    // Serve the narration from the bundle's public dir (bundle is shared across projects).
    const rel = `projects/${plan.projectId}/${Date.now()}-voice${opts.audioFile.slice(opts.audioFile.lastIndexOf("."))}`;
    const dest = join(serveUrl, "public", rel);
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(opts.audioFile, dest);
    inputPlan = { ...plan, audio: { ...plan.audio, src: rel } };
  }
  const browserExecutable = await findBrowserExecutable(opts.browserExecutable);
  const inputProps = inputPlan as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl, id: "TutorialShort", inputProps, browserExecutable, logLevel: "error" });
  await mkdir(dirname(opts.outputFile), { recursive: true });
  await renderMedia({
    composition,
    serveUrl,
    codec: opts.codec ?? "h264",
    crf: opts.crf ?? 20,
    outputLocation: opts.outputFile,
    inputProps,
    browserExecutable,
    concurrency: opts.concurrency ?? undefined,
    pixelFormat: "yuv420p",
    audioCodec: "aac",
    logLevel: "error",
    chromiumOptions: { gl: "swangle" },
    onProgress: ({ progress, stitchStage }) => opts.onProgress?.({ stage: stitchStage === "muxing" ? "encoding" : "rendering", progress }),
  });
  return opts.outputFile;
}

/** Render one frame of the plan as PNG (previews, visual checks). */
export async function renderPlanStill(plan: RenderPlan, frame: number, outputFile: string, browserExecutable?: string | null): Promise<string> {
  const serveUrl = await getBundle();
  const exe = await findBrowserExecutable(browserExecutable);
  const inputProps = { ...plan, audio: null } as unknown as Record<string, unknown>;
  const composition = await selectComposition({ serveUrl, id: "TutorialShort", inputProps, browserExecutable: exe, logLevel: "error" });
  await mkdir(dirname(outputFile), { recursive: true });
  await renderStill({ composition, serveUrl, output: outputFile, frame, inputProps, browserExecutable: exe, logLevel: "error", chromiumOptions: { gl: "swangle" } });
  return outputFile;
}
