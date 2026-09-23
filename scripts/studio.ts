/**
 * Shorts Studio CLI.
 *
 *   studio import <video> [--name N]                 register a source video
 *   studio run <video|projectId> [--from S] [--until S] [--force[=stage,..]] [--auto-approve]
 *   studio batch <dir> [--concurrency N]             process every video in a folder
 *   studio demo                                      manual demo tutorial → final video
 *   studio list | status <id> | approve <id>
 *   studio academy                                   course/presentation outline from all tutorials
 *   studio doctor                                    which providers/keys/tools a run will use
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { PROJECT_FILES, STAGE_ORDER, Tutorial, type StageName } from "@studio/shared";
import { loadConfig, readJsonAs, writeJson } from "@studio/shared/node";
import { Pipeline, type RunOptions } from "@studio/pipeline";

const argv = process.argv.slice(2);
const cmd = argv[0];
const positional = argv.slice(1).filter((a) => !a.startsWith("--"));
const opt = (name: string): string | undefined => {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.split("=").slice(1).join("=");
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  return v && !v.startsWith("--") ? v : "";
};
const has = (name: string) => argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));

function runOptions(): RunOptions {
  const stage = (s: string | undefined) => {
    if (!s) return undefined;
    if (!STAGE_ORDER.includes(s as StageName)) throw new Error(`Unknown stage "${s}". Stages: ${STAGE_ORDER.join(", ")}`);
    return s as StageName;
  };
  const force = opt("force");
  return {
    from: stage(opt("from")),
    until: stage(opt("until")),
    force: force === undefined ? false : force === "" ? true : (force.split(",") as StageName[]),
    autoApprove: has("auto-approve"),
  };
}

const overrides: Record<string, unknown> = {};
if (opt("preset")) overrides.style = { preset: opt("preset") };
if (opt("fidelity")) overrides.fidelity = { mode: opt("fidelity") };
if (opt("voice")) overrides.voice = { provider: opt("voice") };
const { config, root } = await loadConfig({ overrides });
const pipeline = new Pipeline({ root, config });

async function resolveProject(arg: string): Promise<string> {
  if (existsSync(arg) && !arg.endsWith(".json")) return (await pipeline.importVideo(arg, opt("name"))).id;
  if (await pipeline.store.get(arg)) return arg;
  throw new Error(`Not a video file or known project id: ${arg}`);
}

function summary(p: { id: string; status: string; stages: Record<string, { status: string; durationMs: number | null; cached: boolean; provider: string | null } | undefined> }) {
  console.log(`\n${p.id}: ${p.status}`);
  for (const s of STAGE_ORDER) {
    const r = p.stages[s];
    if (!r) continue;
    const d = r.durationMs != null ? `${(r.durationMs / 1000).toFixed(1)}s` : "";
    console.log(`  ${s.padEnd(20)} ${r.status.padEnd(9)} ${r.cached ? "cached" : d.padEnd(6)} ${r.provider ?? ""}`);
  }
}

switch (cmd) {
  case "import": {
    const p = await pipeline.importVideo(positional[0]!, opt("name"));
    console.log(p.id);
    break;
  }
  case "run": {
    const id = await resolveProject(positional[0] ?? "");
    const p = await pipeline.run(id, runOptions());
    summary(p);
    if (p.status === "COMPLETE") console.log(`\noutput: ${resolve(pipeline.outputDir, p.id)}`);
    break;
  }
  case "batch": {
    const conc = opt("concurrency");
    const report = await pipeline.runBatch(positional[0] ?? "input", { ...runOptions(), concurrency: conc ? Number(conc) : undefined });
    console.log(`\nbatch: ${report.complete}/${report.total} complete, ${report.needsReview} need review, ${report.failed} failed (${(report.durationMs / 1000).toFixed(0)}s)`);
    for (const i of report.items) console.log(`  ${i.status.padEnd(13)} ${i.projectId ?? "-"} ${i.error ?? ""}`);
    if (report.failed) process.exitCode = 1;
    break;
  }
  case "demo": {
    const p = await pipeline.createManualProject(resolve(root, "data/templates/demo-2fa"), "demo-2fa-manual");
    summary(await pipeline.run(p.id, runOptions()));
    break;
  }
  case "list": {
    for (const p of await pipeline.store.list()) console.log(`${p.status.padEnd(17)} ${p.id.padEnd(40)} ${p.name}`);
    break;
  }
  case "status": {
    summary(await pipeline.store.require(positional[0]!));
    break;
  }
  case "approve": {
    // Approve all steps (CLI equivalent of the review screen's "Approve all").
    const id = positional[0]!;
    const file = pipeline.store.pathFor(id, PROJECT_FILES.tutorial);
    const t = await readJsonAs(file, Tutorial);
    const now = new Date().toISOString();
    t.steps = t.steps.map((s) => ({ ...s, review: { ...s.review, status: "approved", reviewed_at: now } }));
    await writeJson(file, t);
    console.log(`approved ${t.steps.length} steps in ${id}`);
    break;
  }
  case "academy": {
    const { buildAcademy } = await import("@studio/academy");
    const out = await buildAcademy(pipeline.store, resolve(pipeline.outputDir, "academy"));
    console.log(`academy: ${out.tutorials} tutorials → ${out.files.join(", ")}`);
    break;
  }
  case "doctor": {
    // Preflight: which providers a run will use. Prints key presence only, never values.
    const { hasCommand } = await import("@studio/shared/node");
    const { chooseProvider } = await import("@studio/voice");
    const ok = (b: boolean) => (b ? "✓" : "✗");
    const reach = async (url: string) => {
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
        // 401 = the API answered (key missing/invalid). 403 here usually means a proxy/network policy denied the host.
        return r.status === 403 ? "BLOCKED (HTTP 403 — network policy, or key without permission)" : `reachable (HTTP ${r.status})`;
      } catch (e) {
        return `NOT reachable (${((e as Error).cause as Error)?.message ?? (e as Error).message})`;
      }
    };
    console.log(`.env file:            ${ok(existsSync(resolve(root, ".env")))}`);
    for (const k of ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "ANTHROPIC_API_KEY"]) console.log(`${k.padEnd(21)} ${process.env[k] ? "set" : "missing"}`);
    for (const c of ["ffmpeg", "ffprobe", "tesseract", "espeak-ng"]) console.log(`${c.padEnd(21)} ${ok(await hasCommand(c))}`);
    console.log(`api.elevenlabs.io     ${await reach("https://api.elevenlabs.io/v1/models")}`);
    console.log(`api.anthropic.com     ${await reach("https://api.anthropic.com/v1/models")}`);
    const voice = await chooseProvider(config).then((c) => `${c.provider.name} — ${c.reason}`).catch((e: Error) => `error: ${e.message}`);
    console.log(`voice provider:       ${voice}`);
    console.log(`LLM:                  ${pipeline.llm ? `anthropic (${config.llm.model})` : "none — heuristic mode"}`);
    break;
  }
  default:
    console.log("usage: studio <import|run|batch|demo|list|status|approve|academy|doctor> ...  (see scripts/studio.ts)");
    process.exitCode = cmd ? 1 : 0;
}
