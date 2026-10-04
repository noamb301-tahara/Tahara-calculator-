/**
 * Adam's English narration in a cloned ElevenLabs voice.
 *
 *   pnpm exec tsx scripts/adam-voice.ts --text "Hi, I'm Adam." [--voice-name noam] [--out output/character/adam-voice.mp3]
 *   pnpm exec tsx scripts/adam-voice.ts --file script.txt
 *
 * Voice: ELEVENLABS_VOICE_ID if set, else the voice in the account whose name matches
 * --voice-name (default "noam"). The key is read only from ELEVENLABS_API_KEY (.env) and never printed.
 * Writes the MP3 plus <out>.alignment.json (character timings, for captions).
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadConfig } from "@studio/shared/node";
import { ElevenLabsProvider } from "@studio/voice";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const { config, root } = await loadConfig();
const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey) throw new Error("ELEVENLABS_API_KEY is missing: add it to .env (never paste it in chat)");

const text = opt("text") ?? (opt("file") ? await readFile(resolve(opt("file")!), "utf8") : undefined);
if (!text?.trim()) throw new Error('nothing to say: pass --text "..." or --file script.txt');
const out = resolve(root, opt("out") ?? "output/character/adam-voice.mp3");

async function findVoiceId(name: string): Promise<string> {
  const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": apiKey! } });
  if (!res.ok) throw new Error(`ElevenLabs voices lookup failed (${res.status})`);
  const { voices } = (await res.json()) as { voices: { voice_id: string; name: string; category?: string }[] };
  const want = name.trim().toLowerCase();
  const hit = voices.find((v) => v.name.trim().toLowerCase() === want) ?? voices.find((v) => v.name.toLowerCase().includes(want));
  if (!hit) throw new Error(`no voice named "${name}" in this ElevenLabs account (found: ${voices.map((v) => v.name).join(", ")})`);
  console.log(`voice: ${hit.name} (${hit.category ?? "voice"})`);
  return hit.voice_id;
}

const voiceId = process.env.ELEVENLABS_VOICE_ID || (await findVoiceId(opt("voice-name") ?? "noam"));
// English delivery: same voice settings as the studio, language switched to English.
const voiceCfg = { ...config.voice, elevenlabs: { ...config.voice.elevenlabs, voiceId, languageCode: "en" } };
const tts = new ElevenLabsProvider(voiceCfg, apiKey, fetch, (m) => console.log(m));
const result = await tts.synthesize(text.trim());

await mkdir(dirname(out), { recursive: true });
await writeFile(out, result.audio);
await writeFile(out.replace(/\.mp3$/, "") + ".alignment.json", JSON.stringify(result.alignment, null, 2));
console.log(`saved ${out} (${result.characters} characters)`);
