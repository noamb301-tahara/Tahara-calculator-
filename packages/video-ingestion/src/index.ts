import { join } from "node:path";
import { IngestResult, MediaInfo, PROJECT_FILES, frameFileName, type SceneChange, type StudioConfig } from "@studio/shared";
import { ensureDir, fileSize, ffmpeg, ffprobe, parseRate, run, FFMPEG } from "@studio/shared/node";

/**
 * Module 1 — video ingestion. Everything is derived with FFmpeg and written
 * inside the project directory; the pipeline caches this stage by the source
 * file hash, so nothing here re-runs unless the source changes.
 */

export async function probeMedia(file: string): Promise<MediaInfo> {
  const p = await ffprobe(file);
  const v = p.streams.find((s) => s.codec_type === "video");
  const a = p.streams.find((s) => s.codec_type === "audio");
  if (!v || !v.width || !v.height) throw new Error(`No video stream in ${file}`);
  const rotation = Math.abs(Number(v.tags?.rotate ?? v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0));
  const swap = rotation === 90 || rotation === 270;
  return MediaInfo.parse({
    durationSec: Number(p.format.duration ?? v.duration ?? 0),
    width: swap ? v.height : v.width,
    height: swap ? v.width : v.height,
    fps: parseRate(v.avg_frame_rate) ?? parseRate(v.r_frame_rate) ?? 30,
    hasAudio: Boolean(a),
    videoCodec: v.codec_name ?? null,
    audioCodec: a?.codec_name ?? null,
    sizeBytes: await fileSize(file),
    container: p.format.format_name ?? null,
  });
}

/** Scene changes via FFmpeg's scene score on a downscaled stream. */
export async function detectScenes(file: string, threshold: number): Promise<SceneChange[]> {
  const res = await run(FFMPEG, ["-hide_banner", "-i", file, "-an", "-vf", `scale=320:-2,select='gt(scene,${threshold})',metadata=print`, "-f", "null", "-"], { allowFailure: true });
  const out: SceneChange[] = [];
  let pending: number | null = null;
  for (const line of res.stderr.split("\n")) {
    const t = /pts_time:([\d.]+)/.exec(line);
    if (t) pending = Number(t[1]);
    const s = /lavfi\.scene_score=([\d.]+)/.exec(line);
    if (s && pending !== null) {
      out.push({ time: Math.round(pending * 1000) / 1000, score: Number(s[1]) });
      pending = null;
    }
  }
  return out;
}

/** Low-res grayscale frames (raw bytes) used for cursor and change detection. */
export async function extractMotionStream(file: string, out: string, fps: number, width: number): Promise<{ width: number; height: number; frameCount: number }> {
  const media = await probeMedia(file);
  // Even height keeps scalers happy.
  const height = Math.max(2, Math.round((media.height / media.width) * width / 2) * 2);
  await ffmpeg(["-i", file, "-an", "-vf", `fps=${fps},scale=${width}:${height}:flags=area,format=gray`, "-f", "rawvideo", out]);
  const size = await fileSize(out);
  return { width, height, frameCount: Math.floor(size / (width * height)) };
}

export async function extractAudio(file: string, out: string): Promise<void> {
  await ffmpeg(["-i", file, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", out]);
}

/** Extract a single full-resolution frame at `time`. */
export async function extractFrame(file: string, time: number, out: string, width?: number): Promise<void> {
  const vf = width ? ["-vf", `scale=${width}:-2`] : [];
  await ffmpeg(["-ss", Math.max(0, time).toFixed(3), "-i", file, "-frames:v", "1", ...vf, "-q:v", "2", out]);
}

export async function ingestVideo(sourceFile: string, projectDir: string, config: StudioConfig): Promise<IngestResult> {
  const media = await probeMedia(sourceFile);
  await ensureDir(join(projectDir, "work"));
  await ensureDir(join(projectDir, PROJECT_FILES.thumbsDir));

  let audioFile: string | null = null;
  if (media.hasAudio) {
    await extractAudio(sourceFile, join(projectDir, PROJECT_FILES.audio));
    audioFile = PROJECT_FILES.audio;
  }
  const scenes = await detectScenes(sourceFile, config.analysis.sceneThreshold);
  const motion = await extractMotionStream(sourceFile, join(projectDir, PROJECT_FILES.motion), config.analysis.motionFps, config.analysis.motionWidth);

  const thumbs: string[] = [];
  const n = Math.max(1, config.analysis.thumbnails);
  for (let i = 0; i < n; i++) {
    const t = (media.durationSec * (i + 0.5)) / n;
    const rel = `${PROJECT_FILES.thumbsDir}/${frameFileName(t)}`;
    await extractFrame(sourceFile, t, join(projectDir, rel), 360);
    thumbs.push(rel);
  }
  await extractFrame(sourceFile, Math.min(1, media.durationSec / 3), join(projectDir, PROJECT_FILES.poster), 540);

  return IngestResult.parse({
    media,
    audioFile,
    scenes,
    thumbnails: thumbs,
    posterFile: PROJECT_FILES.poster,
    motion: { fps: config.analysis.motionFps, width: motion.width, height: motion.height, file: PROJECT_FILES.motion, frameCount: motion.frameCount },
  });
}
