import { run } from "./exec";

/** Thin FFmpeg/FFprobe helpers shared by ingestion, voice and render. */

export const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
export const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

export async function ffmpeg(args: string[], opts: { binaryStdout?: boolean } = {}) {
  return run(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...args], { binaryStdout: opts.binaryStdout });
}

export interface ProbeResult {
  format: { duration?: string; size?: string; format_name?: string };
  streams: { codec_type: string; codec_name?: string; width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string; duration?: string; tags?: Record<string, string>; side_data_list?: { rotation?: number }[] }[];
}

export async function ffprobe(file: string): Promise<ProbeResult> {
  const res = await run(FFPROBE, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  return JSON.parse(res.stdout) as ProbeResult;
}

export async function mediaDuration(file: string): Promise<number> {
  const p = await ffprobe(file);
  const d = Number(p.format.duration ?? p.streams.find((s) => s.duration)?.duration ?? NaN);
  if (!Number.isFinite(d)) throw new Error(`Could not read duration of ${file}`);
  return d;
}

export function parseRate(rate: string | undefined): number | null {
  if (!rate) return null;
  const [n, d] = rate.split("/").map(Number);
  if (!n || !d) return null;
  return n / d;
}
