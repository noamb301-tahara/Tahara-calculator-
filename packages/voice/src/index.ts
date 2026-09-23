import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import { VoiceTrack, voiceSegmentFileName, type VoiceSegment } from "@studio/shared";
import { ensureDir, exists, ffmpeg, hashOf, mediaDuration, readJson, writeFileAtomic, writeJson } from "@studio/shared/node";
import type { TtsProvider } from "./providers";

export * from "./providers";

export interface SegmentInput {
  id: string;
  text: string;
}

export interface SynthesizeOptions {
  provider: TtsProvider;
  /** Shared cache dir (e.g. .cache/voice) — identical text is never synthesized twice. */
  cacheDir: string;
  /** Project voice dir; segment files are copied here. */
  outDir: string;
  onSegment?: (info: { id: string; cached: boolean; durationSec: number }) => void;
}

interface CacheMeta {
  durationSec: number;
  alignment: VoiceSegment["alignment"];
  characters: number;
  provider: string;
}

/** Cache key: provider settings + exact text. */
export function voiceCacheKey(provider: TtsProvider, text: string): string {
  return hashOf(provider.cacheKey, text.normalize("NFC").trim());
}

/**
 * Synthesize each script segment (cached by text hash). Offsets are assigned
 * later by the timeline, so startSec is 0 here.
 */
export async function synthesizeSegments(segments: SegmentInput[], opts: SynthesizeOptions): Promise<{ segments: VoiceSegment[]; billedCharacters: number }> {
  await ensureDir(opts.cacheDir);
  await ensureDir(opts.outDir);
  const out: VoiceSegment[] = [];
  let billed = 0;
  for (const [i, seg] of segments.entries()) {
    const key = voiceCacheKey(opts.provider, seg.text);
    const cachedAudio = join(opts.cacheDir, `${key}.mp3`);
    const cachedMeta = join(opts.cacheDir, `${key}.json`);
    let meta: CacheMeta;
    let cached = true;
    if ((await exists(cachedAudio)) && (await exists(cachedMeta))) {
      meta = await readJson<CacheMeta>(cachedMeta);
    } else {
      cached = false;
      const res = await opts.provider.synthesize(seg.text, join(opts.cacheDir, `${key}.tmp`));
      await writeFileAtomic(cachedAudio, res.audio);
      meta = { durationSec: await mediaDuration(cachedAudio), alignment: res.alignment, characters: res.characters, provider: opts.provider.name };
      await writeJson(cachedMeta, meta);
      billed += res.characters;
    }
    const file = voiceSegmentFileName(i + 1, seg.id);
    await copyFile(cachedAudio, join(opts.outDir, file));
    out.push({ segmentId: seg.id, file, textHash: key, durationSec: meta.durationSec, startSec: 0, provider: meta.provider, cached, alignment: meta.alignment ?? null });
    opts.onSegment?.({ id: seg.id, cached, durationSec: meta.durationSec });
  }
  return { segments: out, billedCharacters: billed };
}

/**
 * Build voice.mp3 with every segment placed at its timeline offset, padded to
 * the full video length, so audio and picture stay in sync.
 */
export async function assembleVoiceTrack(
  segments: VoiceSegment[],
  offsets: Record<string, number>,
  totalSec: number,
  voiceDir: string,
  outFile: string,
): Promise<VoiceSegment[]> {
  const placed = segments.map((s) => ({ ...s, startSec: Math.max(0, offsets[s.segmentId] ?? 0) }));
  const inputs: string[] = [];
  const filters: string[] = [];
  placed.forEach((s, i) => {
    inputs.push("-i", join(voiceDir, s.file));
    const ms = Math.round(s.startSec * 1000);
    filters.push(`[${i}:a]aresample=44100,aformat=channel_layouts=mono,adelay=${ms}:all=1[a${i}]`);
  });
  const mixInputs = placed.map((_, i) => `[a${i}]`).join("");
  filters.push(`${mixInputs}amix=inputs=${placed.length}:normalize=0:dropout_transition=0,apad=whole_dur=${totalSec.toFixed(3)},atrim=0:${totalSec.toFixed(3)}[out]`);
  await ensureDir(join(outFile, ".."));
  await ffmpeg([...inputs, "-filter_complex", filters.join(";"), "-map", "[out]", "-ac", "1", "-ar", "44100", "-b:a", "128k", outFile]);
  return placed;
}

export function buildVoiceTrack(params: { provider: string; voiceId: string | null; file: string; totalSec: number; gapSec: number; segments: VoiceSegment[]; characters: number }): VoiceTrack {
  return VoiceTrack.parse(params);
}
