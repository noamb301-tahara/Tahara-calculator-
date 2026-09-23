import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deepMerge, parseConfig, StudioConfigSchema, type StudioConfig } from "../config";
import { exists } from "./fs";

/** Repo root: walks up from cwd until pnpm-workspace.yaml is found. */
export function findRepoRoot(start = process.cwd()): string {
  let dir = resolve(start);
  for (let i = 0; i < 12; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(start);
}

export interface LoadConfigOptions {
  root?: string;
  file?: string;
  overrides?: unknown;
}

/**
 * Load config/studio.config.json (or $STUDIO_CONFIG), merged over defaults,
 * then overrides. Secrets never live here — only in environment variables.
 */
export async function loadConfig(opts: LoadConfigOptions = {}): Promise<{ config: StudioConfig; root: string }> {
  const root = opts.root ?? findRepoRoot();
  const file = resolve(root, opts.file ?? process.env.STUDIO_CONFIG ?? "config/studio.config.json");
  let fromFile: unknown = {};
  if (await exists(file)) fromFile = JSON.parse(await readFile(file, "utf8"));
  const defaults = parseConfig({});
  const merged = deepMerge(deepMerge(defaults, fromFile), opts.overrides ?? {});
  if (process.env.STUDIO_DATA_DIR) merged.paths.data = process.env.STUDIO_DATA_DIR;
  if (process.env.STUDIO_OUTPUT_DIR) merged.paths.output = process.env.STUDIO_OUTPUT_DIR;
  if (process.env.ELEVENLABS_VOICE_ID && !merged.voice.elevenlabs.voiceId) merged.voice.elevenlabs.voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (process.env.STUDIO_BROWSER_EXECUTABLE) merged.render.browserExecutable = process.env.STUDIO_BROWSER_EXECUTABLE;
  return { config: StudioConfigSchema.parse(merged), root };
}
