import { readFile, readdir, rm } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { Transcript, splitSentences, type StudioConfig, type TranscriptSegment, type TranscriptWord } from "@studio/shared";
import { exists, hasCommand, mkdtempDir, run, withRetry, errorMessage } from "./util";

/**
 * Module 2 — transcription. Providers, in "auto" order:
 *   sidecar     transcript file next to the source (.transcript.json / .srt / .vtt)
 *   elevenlabs  ElevenLabs Speech-to-Text (Scribe), needs ELEVENLABS_API_KEY
 *   whisper-cli local `whisper` CLI (openai-whisper) if installed
 *   none        no speech available — analysis continues on visuals only
 */

export interface TranscribeInput {
  audioFile: string | null;
  /** Original source video path (used to find sidecar files). */
  sourcePath: string;
  config: StudioConfig;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  log?: (m: string) => void;
}

export async function transcribe(input: TranscribeInput): Promise<Transcript> {
  const env = input.env ?? process.env;
  const want = input.config.transcription.provider;
  const notes: string[] = [];
  const order = want === "auto" ? (["sidecar", "elevenlabs", "whisper-cli", "none"] as const) : ([want] as const);
  for (const p of order) {
    try {
      if (p === "sidecar") {
        const t = await fromSidecar(input.sourcePath);
        if (t) return finalize(t, notes);
        if (want === "sidecar") throw new Error("no sidecar transcript found next to the source file");
      } else if (p === "elevenlabs") {
        if (!env.ELEVENLABS_API_KEY) {
          if (want === "elevenlabs") throw new Error("ELEVENLABS_API_KEY not set");
          notes.push("elevenlabs STT skipped: no ELEVENLABS_API_KEY");
          continue;
        }
        if (!input.audioFile) break;
        return finalize(await elevenLabsStt(input.audioFile, env.ELEVENLABS_API_KEY, input.config, input.fetchImpl ?? fetch, input.log), notes);
      } else if (p === "whisper-cli") {
        const cmd = input.config.transcription.whisperCommand;
        if (!(await hasCommand(cmd))) {
          if (want === "whisper-cli") throw new Error(`whisper command "${cmd}" not found`);
          notes.push(`whisper CLI skipped: "${cmd}" not installed`);
          continue;
        }
        if (!input.audioFile) break;
        return finalize(await whisperCli(input.audioFile, cmd, input.config.transcription.whisperModel), notes);
      } else if (p === "none") {
        break;
      }
    } catch (err) {
      if (want !== "auto") throw err;
      notes.push(`${p} failed: ${errorMessage(err)}`);
    }
  }
  notes.push(input.audioFile ? "no transcription provider available — continuing with visual analysis only" : "source has no audio track");
  return Transcript.parse({ language: null, provider: "none", text: "", segments: [], notes });
}

function finalize(t: Transcript, notes: string[]): Transcript {
  const segments = resegment(t.segments);
  const text = segments.map((s) => s.text).join(" ").trim();
  return Transcript.parse({ ...t, segments, text, language: t.language ?? detectLanguage(text), notes: [...notes, ...t.notes] });
}

/** Sentence segmentation: split long segments at sentence ends (word timings when available). */
export function resegment(segments: TranscriptSegment[]): TranscriptSegment[] {
  const out: TranscriptSegment[] = [];
  for (const seg of segments) {
    const sentences = splitSentences(seg.text);
    if (sentences.length <= 1) {
      out.push({ ...seg, text: seg.text.trim() });
      continue;
    }
    const words = seg.words ?? [];
    const totalChars = seg.text.length || 1;
    let charPos = 0;
    let wordIdx = 0;
    for (const s of sentences) {
      let start: number;
      let end: number;
      let sWords: TranscriptWord[] | undefined;
      if (words.length) {
        const n = s.split(/\s+/).length;
        sWords = words.slice(wordIdx, wordIdx + n);
        wordIdx += n;
        start = sWords[0]?.start ?? seg.start;
        end = sWords[sWords.length - 1]?.end ?? seg.end;
      } else {
        start = seg.start + ((seg.end - seg.start) * charPos) / totalChars;
        charPos += s.length + 1;
        end = seg.start + ((seg.end - seg.start) * Math.min(totalChars, charPos)) / totalChars;
      }
      out.push({ id: "", start: round(start), end: round(end), text: s, words: sWords });
    }
  }
  return out.map((s, i) => ({ ...s, id: `seg-${String(i + 1).padStart(3, "0")}` }));
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Script-based language detection fallback (he / ar / ru / en / null). */
export function detectLanguage(text: string): string | null {
  if (!text.trim()) return null;
  const count = (re: RegExp) => (text.match(re) ?? []).length;
  const he = count(/[֐-׿]/g);
  const ar = count(/[؀-ۿ]/g);
  const ru = count(/[Ѐ-ӿ]/g);
  const lat = count(/[A-Za-z]/g);
  const max = Math.max(he, ar, ru, lat);
  if (max === 0) return null;
  if (max === he) return "he";
  if (max === ar) return "ar";
  if (max === ru) return "ru";
  return "en";
}

// ---------------------------------------------------------------------------
// Sidecar files
// ---------------------------------------------------------------------------

export async function findSidecar(sourcePath: string): Promise<string | null> {
  const dir = dirname(sourcePath);
  const base = basename(sourcePath, extname(sourcePath));
  for (const suffix of [".transcript.json", ".json", ".srt", ".vtt"]) {
    const p = join(dir, base + suffix);
    if (await exists(p)) return p;
  }
  // Case-insensitive fallback.
  try {
    const files = await readdir(dir);
    const hit = files.find((f) => f.toLowerCase().startsWith(base.toLowerCase() + ".") && /\.(transcript\.json|srt|vtt)$/i.test(f));
    return hit ? join(dir, hit) : null;
  } catch {
    return null;
  }
}

export async function fromSidecar(sourcePath: string): Promise<Transcript | null> {
  const file = await findSidecar(sourcePath);
  if (!file) return null;
  const raw = await readFile(file, "utf8");
  let segments: TranscriptSegment[];
  let language: string | null = null;
  if (file.endsWith(".json")) {
    const j = JSON.parse(raw) as { language?: string; segments?: { start: number; end: number; text: string; words?: TranscriptWord[] }[] };
    if (!Array.isArray(j.segments)) return null;
    language = j.language ?? null;
    segments = j.segments.map((s, i) => ({ id: `seg-${i + 1}`, start: s.start, end: s.end, text: s.text, words: s.words }));
  } else {
    segments = parseSubtitleFile(raw);
  }
  return Transcript.parse({ language, provider: "sidecar", text: segments.map((s) => s.text).join(" "), segments, hasWordTimestamps: segments.some((s) => s.words?.length), notes: [`sidecar: ${basename(file)}`] });
}

/** Parse SRT or WebVTT cues. */
export function parseSubtitleFile(raw: string): TranscriptSegment[] {
  const blocks = raw.replace(/\r/g, "").split(/\n\s*\n/);
  const out: TranscriptSegment[] = [];
  const time = (s: string) => {
    const m = /(?:(\d+):)?(\d+):(\d+)[.,](\d+)/.exec(s);
    if (!m) return NaN;
    return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(`0.${m[4]}`);
  };
  for (const b of blocks) {
    const lines = b.split("\n").filter((l) => l.trim() && l.trim() !== "WEBVTT");
    const tl = lines.findIndex((l) => l.includes("-->"));
    if (tl < 0) continue;
    const [a, z] = lines[tl]!.split("-->");
    const text = lines
      .slice(tl + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .replace(/[‪-‮]/g, "")
      .trim();
    if (!text) continue;
    out.push({ id: `seg-${out.length + 1}`, start: time(a!), end: time(z!), text });
  }
  return out;
}

// ---------------------------------------------------------------------------
// ElevenLabs Scribe
// ---------------------------------------------------------------------------

export async function elevenLabsStt(audioFile: string, apiKey: string, config: StudioConfig, fetchImpl: typeof fetch, log?: (m: string) => void): Promise<Transcript> {
  const bytes = await readFile(audioFile);
  const json = await withRetry(
    async () => {
      const form = new FormData();
      form.append("model_id", config.transcription.elevenlabsModel);
      form.append("timestamps_granularity", "word");
      form.append("file", new Blob([bytes], { type: "audio/wav" }), basename(audioFile));
      const res = await fetchImpl("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": apiKey }, body: form });
      if (!res.ok) {
        const err = new Error(`ElevenLabs STT failed (${res.status}): ${(await res.text()).slice(0, 300)}`) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }
      return (await res.json()) as { language_code?: string; language_probability?: number; text: string; words?: { text: string; start: number; end: number; type?: string }[] };
    },
    { retries: config.voice.retries, shouldRetry: (e) => !((e as { status?: number }).status && (e as { status: number }).status < 500 && (e as { status: number }).status !== 429), onRetry: (e, n) => log?.(`STT retry ${n}: ${errorMessage(e)}`) },
  );
  const words = (json.words ?? []).filter((w) => w.type !== "spacing" && w.type !== "audio_event").map((w) => ({ text: w.text, start: w.start, end: w.end }));
  const segments = wordsToSegments(words, json.text);
  return Transcript.parse({
    language: normalizeLang(json.language_code),
    languageConfidence: json.language_probability ?? null,
    provider: "elevenlabs",
    text: json.text,
    segments,
    hasWordTimestamps: words.length > 0,
    notes: [],
  });
}

/** Group words into sentence segments. */
export function wordsToSegments(words: TranscriptWord[], fallbackText: string): TranscriptSegment[] {
  if (!words.length) return fallbackText ? [{ id: "seg-1", start: 0, end: 0, text: fallbackText }] : [];
  const out: TranscriptSegment[] = [];
  let cur: TranscriptWord[] = [];
  const flush = () => {
    if (!cur.length) return;
    out.push({ id: `seg-${out.length + 1}`, start: cur[0]!.start, end: cur[cur.length - 1]!.end, text: cur.map((w) => w.text).join(" ").replace(/\s+([.,!?])/g, "$1"), words: cur });
    cur = [];
  };
  for (const [i, w] of words.entries()) {
    cur.push(w);
    const next = words[i + 1];
    const gap = next ? next.start - w.end : 0;
    if (/[.!?]$/.test(w.text) || gap > 0.9 || cur.length > 28) flush();
  }
  flush();
  return out;
}

function normalizeLang(code: string | undefined): string | null {
  if (!code) return null;
  const c = code.toLowerCase();
  const map: Record<string, string> = { eng: "en", heb: "he", iw: "he", spa: "es", fra: "fr", deu: "de", rus: "ru", ara: "ar", por: "pt" };
  return map[c] ?? c.slice(0, 2);
}

// ---------------------------------------------------------------------------
// Local whisper CLI
// ---------------------------------------------------------------------------

export async function whisperCli(audioFile: string, cmd: string, model: string): Promise<Transcript> {
  const out = await mkdtempDir("whisper-");
  try {
    await run(cmd, [audioFile, "--model", model, "--output_format", "json", "--output_dir", out, "--word_timestamps", "True"]);
    const file = join(out, basename(audioFile, extname(audioFile)) + ".json");
    const j = JSON.parse(await readFile(file, "utf8")) as { language?: string; text: string; segments: { start: number; end: number; text: string; words?: { word: string; start: number; end: number }[] }[] };
    const segments = j.segments.map((s, i) => ({ id: `seg-${i + 1}`, start: s.start, end: s.end, text: s.text.trim(), words: s.words?.map((w) => ({ text: w.word.trim(), start: w.start, end: w.end })) }));
    return Transcript.parse({ language: j.language ?? null, provider: "whisper-cli", text: j.text.trim(), segments, hasWordTimestamps: segments.some((s) => s.words?.length), notes: [] });
  } finally {
    await rm(out, { recursive: true, force: true });
  }
}

export function transcriptToText(t: Transcript): string {
  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
  return t.segments.map((s) => `[${fmt(s.start)} - ${fmt(s.end)}] ${s.text}`).join("\n") + "\n";
}
