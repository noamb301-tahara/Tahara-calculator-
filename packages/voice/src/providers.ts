import { writeFile } from "node:fs/promises";
import type { StudioConfig } from "@studio/shared";
import { errorMessage, ffmpeg, hasCommand, run, withRetry } from "@studio/shared/node";

/** Result of synthesizing one text segment. */
export interface SynthesisResult {
  /** MP3 bytes. */
  audio: Buffer;
  alignment: { chars: string[]; starts: number[]; ends: number[] } | null;
  /** Characters billed (for cost metadata). */
  characters: number;
}

export interface TtsProvider {
  readonly name: "elevenlabs" | "espeak" | "silent";
  /** Everything that changes the audio for the same text (goes into the cache key). */
  readonly cacheKey: Record<string, unknown>;
  readonly voiceId: string | null;
  synthesize(text: string, tmpBase: string): Promise<SynthesisResult>;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Retry only transient failures: network errors, 408/409/429 and 5xx. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 408 || err.status === 409 || err.status === 429 || err.status >= 500;
  return true;
}

type VoiceConfig = StudioConfig["voice"];

/**
 * ElevenLabs TTS (Module 13) using the with-timestamps endpoint so subtitles
 * can follow the real character timing. Key comes only from ELEVENLABS_API_KEY.
 */
export class ElevenLabsProvider implements TtsProvider {
  readonly name = "elevenlabs" as const;
  readonly voiceId: string;
  constructor(
    private readonly cfg: VoiceConfig,
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly log?: (msg: string) => void,
  ) {
    const id = cfg.elevenlabs.voiceId;
    if (!id) throw new Error("ElevenLabs voice id missing: set voice.elevenlabs.voiceId in config or ELEVENLABS_VOICE_ID");
    this.voiceId = id;
  }

  get cacheKey() {
    const e = this.cfg.elevenlabs;
    return { p: "elevenlabs", voice: this.voiceId, model: e.modelId, lang: e.languageCode, st: e.stability, sim: e.similarityBoost, style: e.style, speed: e.speed, fmt: e.outputFormat };
  }

  async synthesize(text: string): Promise<SynthesisResult> {
    const e = this.cfg.elevenlabs;
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(this.voiceId)}/with-timestamps?output_format=${encodeURIComponent(e.outputFormat)}`;
    const body = {
      text,
      model_id: e.modelId,
      language_code: e.languageCode,
      voice_settings: { stability: e.stability, similarity_boost: e.similarityBoost, style: e.style, use_speaker_boost: true, speed: e.speed },
    };
    return withRetry(
      async () => {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
        try {
          const res = await this.fetchImpl(url, {
            method: "POST",
            headers: { "xi-api-key": this.apiKey, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(body),
            signal: ctrl.signal,
          });
          if (!res.ok) {
            const detail = (await res.text().catch(() => "")).slice(0, 300);
            throw new HttpError(res.status, `ElevenLabs TTS failed (${res.status}): ${detail}`);
          }
          const json = (await res.json()) as {
            audio_base64: string;
            alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } | null;
          };
          if (!json.audio_base64) throw new Error("ElevenLabs response had no audio");
          const a = json.alignment;
          return {
            audio: Buffer.from(json.audio_base64, "base64"),
            alignment: a ? { chars: a.characters, starts: a.character_start_times_seconds, ends: a.character_end_times_seconds } : null,
            characters: text.length,
          };
        } finally {
          clearTimeout(timer);
        }
      },
      { retries: this.cfg.retries, shouldRetry: isRetryable, onRetry: (err, n, d) => this.log?.(`ElevenLabs retry ${n} in ${d}ms: ${errorMessage(err)}`) },
    );
  }
}

/** Local offline Hebrew TTS via espeak-ng. Robotic, but real speech for dev/testing. */
export class EspeakProvider implements TtsProvider {
  readonly name = "espeak" as const;
  readonly voiceId: string;
  constructor(private readonly cfg: VoiceConfig) {
    this.voiceId = cfg.espeak.voice;
  }
  get cacheKey() {
    return { p: "espeak", voice: this.cfg.espeak.voice, wpm: this.cfg.espeak.wpm };
  }
  async synthesize(text: string, tmpBase: string): Promise<SynthesisResult> {
    const wav = `${tmpBase}.wav`;
    const mp3 = `${tmpBase}.mp3`;
    await run("espeak-ng", ["-v", this.cfg.espeak.voice, "-s", String(this.cfg.espeak.wpm), "-w", wav, text]);
    await ffmpeg(["-i", wav, "-ar", "44100", "-ac", "1", "-b:a", "128k", mp3]);
    const { readFile, rm } = await import("node:fs/promises");
    const audio = await readFile(mp3);
    await rm(wav, { force: true });
    await rm(mp3, { force: true });
    return { audio, alignment: null, characters: text.length };
  }
}

/** Silent track with the estimated speaking duration (no TTS available). */
export class SilentProvider implements TtsProvider {
  readonly name = "silent" as const;
  readonly voiceId = null;
  constructor(private readonly wordsPerSecond: number) {}
  get cacheKey() {
    return { p: "silent", wps: this.wordsPerSecond };
  }
  async synthesize(text: string, tmpBase: string): Promise<SynthesisResult> {
    const words = text.trim().split(/\s+/).length;
    const dur = Math.max(0.8, words / this.wordsPerSecond);
    const mp3 = `${tmpBase}.mp3`;
    await ffmpeg(["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", dur.toFixed(2), "-b:a", "64k", mp3]);
    const { readFile, rm } = await import("node:fs/promises");
    const audio = await readFile(mp3);
    await rm(mp3, { force: true });
    return { audio, alignment: null, characters: 0 };
  }
}

export interface ProviderChoice {
  provider: TtsProvider;
  reason: string;
}

/** Resolve voice.provider ("auto" picks the best available). */
export async function chooseProvider(cfg: StudioConfig, env = process.env, log?: (m: string) => void): Promise<ProviderChoice> {
  const want = cfg.voice.provider;
  const key = env.ELEVENLABS_API_KEY;
  const voiceCfg = { ...cfg.voice, elevenlabs: { ...cfg.voice.elevenlabs, voiceId: cfg.voice.elevenlabs.voiceId ?? env.ELEVENLABS_VOICE_ID ?? null } };
  if (want === "elevenlabs") {
    if (!key) throw new Error("voice.provider is 'elevenlabs' but ELEVENLABS_API_KEY is not set");
    return { provider: new ElevenLabsProvider(voiceCfg, key, fetch, log), reason: "configured" };
  }
  if (want === "espeak") return { provider: new EspeakProvider(voiceCfg), reason: "configured" };
  if (want === "silent") return { provider: new SilentProvider(cfg.timing.wordsPerSecond), reason: "configured" };
  if (key && voiceCfg.elevenlabs.voiceId) return { provider: new ElevenLabsProvider(voiceCfg, key, fetch, log), reason: "auto: ELEVENLABS_API_KEY set" };
  if (await hasCommand("espeak-ng")) return { provider: new EspeakProvider(voiceCfg), reason: key ? "auto: ElevenLabs voice id missing, using espeak-ng" : "auto: no ELEVENLABS_API_KEY, using local espeak-ng" };
  return { provider: new SilentProvider(cfg.timing.wordsPerSecond), reason: "auto: no TTS available, silent narration placeholder" };
}

export async function writeBuffer(path: string, data: Buffer): Promise<void> {
  await writeFile(path, data);
}
