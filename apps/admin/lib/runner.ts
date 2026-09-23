import "server-only";
import { spawn } from "node:child_process";
import { openSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./data";

/**
 * Pipeline runs happen in a separate CLI process (scripts/studio.ts), so the
 * web server never bundles FFmpeg/Remotion/renderer code and a crash in a
 * render never takes the dashboard down. Progress is read back from
 * project.json and logs/pipeline.jsonl.
 */
export function spawnStudio(args: string[], logDir: string): number | undefined {
  mkdirSync(logDir, { recursive: true });
  const out = openSync(join(logDir, "run.log"), "a");
  const child = spawn(join(ROOT, "node_modules/.bin/tsx"), [join(ROOT, "scripts/studio.ts"), ...args], {
    cwd: ROOT,
    detached: true,
    stdio: ["ignore", out, out],
    env: { ...process.env, STUDIO_LOG_LEVEL: "info" },
  });
  child.unref();
  return child.pid;
}
