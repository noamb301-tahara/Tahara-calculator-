import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ElevenLabsProvider, HttpError, SilentProvider, isRetryable, synthesizeSegments, voiceCacheKey, type TtsProvider } from "../src/index";
import { parseConfig } from "@studio/shared";

function counting(p: TtsProvider): TtsProvider & { calls: number } {
  const w = { calls: 0, name: p.name, voiceId: p.voiceId, cacheKey: p.cacheKey, synthesize: async (t: string, b: string) => { w.calls++; return p.synthesize(t, b); } };
  return w;
}

describe("voice cache", () => {
  it("synthesizes identical text once, across projects", async () => {
    const cache = await mkdtemp(join(tmpdir(), "vc-"));
    const provider = counting(new SilentProvider(2.5));
    const segs = [{ id: "intro", text: "שלום לכולם" }, { id: "step-01", text: "לחצו על Settings" }];
    const a = await synthesizeSegments(segs, { provider, cacheDir: cache, outDir: await mkdtemp(join(tmpdir(), "p1-")) });
    expect(provider.calls).toBe(2);
    expect(a.segments.every((s) => !s.cached && s.durationSec > 0.5)).toBe(true);
    const b = await synthesizeSegments(segs, { provider, cacheDir: cache, outDir: await mkdtemp(join(tmpdir(), "p2-")) });
    expect(provider.calls).toBe(2);
    expect(b.segments.every((s) => s.cached)).toBe(true);
    expect((await readdir(cache)).filter((f) => f.endsWith(".mp3"))).toHaveLength(2);
  });
  it("keys the cache on text and voice settings", () => {
    const cfg = parseConfig({ voice: { elevenlabs: { voiceId: "v1" } } }).voice;
    const a = new ElevenLabsProvider(cfg, "k");
    const b = new ElevenLabsProvider({ ...cfg, elevenlabs: { ...cfg.elevenlabs, speed: 1.1 } }, "k");
    expect(voiceCacheKey(a, "שלום")).toBe(voiceCacheKey(a, " שלום "));
    expect(voiceCacheKey(a, "שלום")).not.toBe(voiceCacheKey(a, "שלום!"));
    expect(voiceCacheKey(a, "שלום")).not.toBe(voiceCacheKey(b, "שלום"));
  });
});

describe("ElevenLabs provider", () => {
  const cfg = { ...parseConfig({ voice: { elevenlabs: { voiceId: "voice-123" }, retries: 2 } }).voice };
  it("calls with-timestamps with Hebrew settings and returns alignment", async () => {
    let body: Record<string, unknown> = {};
    let url = "";
    const fake = (async (u: string, init: RequestInit) => {
      url = u;
      body = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ audio_base64: Buffer.from("mp3").toString("base64"), alignment: { characters: ["א"], character_start_times_seconds: [0], character_end_times_seconds: [0.2] } }), { status: 200 });
    }) as unknown as typeof fetch;
    const p = new ElevenLabsProvider(cfg, "secret", fake);
    const res = await p.synthesize("שלום");
    expect(url).toContain("/v1/text-to-speech/voice-123/with-timestamps");
    expect(body.language_code).toBe("he");
    expect(body.model_id).toBe(cfg.elevenlabs.modelId);
    expect(res.alignment?.ends[0]).toBe(0.2);
    expect(res.audio.toString()).toBe("mp3");
  });
  it("retries 429/5xx but not 4xx", async () => {
    expect(isRetryable(new HttpError(429, ""))).toBe(true);
    expect(isRetryable(new HttpError(503, ""))).toBe(true);
    expect(isRetryable(new HttpError(401, ""))).toBe(false);
    let n = 0;
    const flaky = (async () => {
      n++;
      if (n < 2) return new Response("busy", { status: 503 });
      return new Response(JSON.stringify({ audio_base64: "", alignment: null }), { status: 200 });
    }) as unknown as typeof fetch;
    const p = new ElevenLabsProvider({ ...cfg, retries: 3 }, "k", flaky);
    await expect(p.synthesize("x")).rejects.toThrow(/no audio/);
    expect(n).toBeGreaterThanOrEqual(2);
    let m = 0;
    const denied = (async () => {
      m++;
      return new Response("nope", { status: 401 });
    }) as unknown as typeof fetch;
    await expect(new ElevenLabsProvider(cfg, "k", denied).synthesize("x")).rejects.toThrow(/401/);
    expect(m).toBe(1);
  }, 30000);
  it("requires a voice id", () => {
    expect(() => new ElevenLabsProvider({ ...cfg, elevenlabs: { ...cfg.elevenlabs, voiceId: null } }, "k")).toThrow(/voice id/);
  });
});
