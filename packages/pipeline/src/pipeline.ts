import { copyFile, readdir } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import {
  PROJECT_FILES,
  Project,
  STAGE_ORDER,
  ScreenSetSchema,
  Tutorial,
  isSupportedVideo,
  canTransition,
  projectIdFor,
  statusForStage,
  type ProjectStatus,
  type StageName,
  type StudioConfig,
} from "@studio/shared";
import { FileProjectStore, Logger, ensureDir, errorMessage, exists, fileSize, readJsonAs, sha256File, withRetry, writeJson, type ProjectStore } from "@studio/shared/node";
import { createLlm, type ClaudeClient } from "@studio/llm";
import { STAGES, outputsExist, stageInputHash, type StageContext, type StageDef } from "./stages";

export interface RunOptions {
  /** Start at this stage (earlier stages must be complete or cached). */
  from?: StageName;
  /** Stop after this stage. */
  until?: StageName;
  /** Ignore caches for these stages (or all when true). */
  force?: boolean | StageName[];
  /** Continue past NEEDS_REVIEW even if config.review.requireApproval. */
  autoApprove?: boolean;
}

export interface PipelineOptions {
  root: string;
  config: StudioConfig;
  store?: ProjectStore;
  logger?: Logger;
  llm?: ClaudeClient | null;
}

export class Pipeline {
  readonly store: ProjectStore;
  readonly log: Logger;
  readonly dataDir: string;
  readonly outputDir: string;
  readonly cacheDir: string;
  readonly llm: ClaudeClient | null;

  constructor(readonly opts: PipelineOptions) {
    this.dataDir = resolve(opts.root, opts.config.paths.data);
    this.outputDir = resolve(opts.root, opts.config.paths.output);
    this.cacheDir = resolve(opts.root, ".cache");
    this.store = opts.store ?? new FileProjectStore(join(this.dataDir, "projects"));
    this.log = opts.logger ?? new Logger();
    this.llm = opts.llm === undefined ? createLlm(opts.config) : opts.llm;
  }

  get config(): StudioConfig {
    return this.opts.config;
  }

  /** Register a source video (copied into the project). Same file → same project. */
  async importVideo(file: string, name?: string): Promise<Project> {
    const abs = resolve(file);
    if (!isSupportedVideo(abs)) throw new Error(`Unsupported video format: ${basename(abs)}`);
    const sha = await sha256File(abs);
    const id = projectIdFor(basename(abs), sha);
    const existing = await this.store.get(id);
    if (existing) {
      this.log.info(`project ${id} already exists (same source hash) — reusing`);
      return existing;
    }
    const dir = this.store.dirFor(id);
    const stored = `${PROJECT_FILES.sourceDir}/source${extname(abs).toLowerCase()}`;
    await ensureDir(join(dir, PROJECT_FILES.sourceDir));
    await copyFile(abs, join(dir, stored));
    const now = new Date().toISOString();
    const project = Project.parse({
      id,
      name: name ?? basename(abs, extname(abs)),
      createdAt: now,
      updatedAt: now,
      status: "UPLOADED",
      source: { originalPath: abs, storedFile: stored, filename: basename(abs), sha256: sha, sizeBytes: await fileSize(abs) },
      history: [{ from: null, to: "UPLOADED", at: now }],
    });
    this.log.info(`imported ${basename(abs)} as ${id}`);
    return this.store.save(project);
  }

  /** A project from a hand-authored tutorial + screens (no source video). */
  async createManualProject(templateDir: string, id: string, name?: string): Promise<Project> {
    const tutorial = await readJsonAs(join(templateDir, "tutorial.json"), Tutorial);
    const screens = await readJsonAs(join(templateDir, "screens.json"), ScreenSetSchema);
    const dir = this.store.dirFor(id);
    await ensureDir(dir);
    await writeJson(join(dir, PROJECT_FILES.tutorial), tutorial);
    await writeJson(join(dir, PROJECT_FILES.screens), screens);
    const existing = await this.store.get(id);
    if (existing) return existing;
    const now = new Date().toISOString();
    return this.store.save(Project.parse({ id, name: name ?? tutorial.title_he, createdAt: now, updatedAt: now, status: "UPLOADED", source: null, origin: "manual", history: [{ from: null, to: "UPLOADED", at: now }] }));
  }

  private context(project: Project): StageContext {
    return {
      project,
      dir: this.store.dirFor(project.id),
      root: this.opts.root,
      config: this.config,
      outputDir: this.outputDir,
      log: this.log.child({ projectId: project.id }, join(this.store.dirFor(project.id), PROJECT_FILES.log)),
      llm: this.llm,
      cacheDir: this.cacheDir,
    };
  }

  private async moveTo(id: string, to: ProjectStatus, reason?: string): Promise<Project> {
    const p = await this.store.require(id);
    if (p.status === to) return p;
    if (canTransition(p.status, to)) return this.store.setStatus(id, to, reason);
    // Explicit re-run of an earlier stage (e.g. --from voice on a READY_TO_RENDER project): record it as such.
    p.history.push({ from: p.status, to, at: new Date().toISOString(), reason: `re-run: ${reason ?? to}` });
    return this.store.save({ ...p, status: to, error: null });
  }

  /** Run the pipeline for one project. Failed stages mark the project ERROR and rethrow. */
  async run(projectId: string, opts: RunOptions = {}): Promise<Project> {
    let project = await this.store.require(projectId);
    const startIdx = opts.from ? STAGE_ORDER.indexOf(opts.from) : 0;
    const endIdx = opts.until ? STAGE_ORDER.indexOf(opts.until) : STAGE_ORDER.length - 1;
    const runLog = this.context(project).log;
    runLog.info(`run ${STAGE_ORDER[startIdx]} → ${STAGE_ORDER[endIdx]}${this.llm ? ` (LLM: ${this.config.llm.model})` : " (no LLM — heuristic mode)"}`);

    for (let i = startIdx; i <= endIdx; i++) {
      const stage = STAGES.find((s) => s.name === STAGE_ORDER[i])!;
      project = await this.store.require(projectId);
      const ctx = this.context(project);
      const log = ctx.log.child({ stage: stage.name });

      const skipReason = stage.skip?.(ctx);
      if (skipReason) {
        await this.store.updateStage(projectId, stage.name, { status: "skipped", notes: [skipReason], cached: false });
        continue;
      }

      const forced = opts.force === true || (Array.isArray(opts.force) && opts.force.includes(stage.name));
      const inputHash = await stageInputHash(stage, ctx);
      const prev = project.stages[stage.name];
      if (!forced && prev?.status === "complete" && prev.inputHash === inputHash && (await outputsExist(stage, ctx))) {
        log.log("info", "skip", "cached (inputs unchanged)");
        await this.store.updateStage(projectId, stage.name, { cached: true });
        await this.moveTo(projectId, statusForStage(stage.name));
        continue;
      }

      await this.moveTo(projectId, statusForStage(stage.name), `stage ${stage.name}`);
      const started = Date.now();
      const attempts = (prev?.attempts ?? 0) + 1;
      await this.store.updateStage(projectId, stage.name, { status: "running", startedAt: new Date(started).toISOString(), attempts, error: null, cached: false });
      log.log("info", "start", stage.name);
      try {
        const res = await stage.run(ctx);
        const durationMs = Date.now() - started;
        const finalHash = stage.rehashAfterRun ? await stageInputHash(stage, this.context(await this.store.require(projectId))) : inputHash;
        await this.store.updateStage(projectId, stage.name, {
          status: "complete",
          completedAt: new Date().toISOString(),
          durationMs,
          inputHash: finalHash,
          outputs: res.outputs,
          notes: res.notes ?? [],
          provider: res.provider ?? null,
          cost: res.cost ?? null,
        });
        log.log("info", "complete", `${stage.name}${res.provider ? ` [${res.provider}]` : ""}`, { durationMs });
        for (const n of res.notes ?? []) log.debug(n);
        if (res.cost) log.log("info", "cost", JSON.stringify(res.cost));
        if (stage.name === "ingest") await this.recordMedia(projectId, ctx.dir);
        if (res.halt && !opts.autoApprove) {
          await this.moveTo(projectId, res.halt.status, res.halt.reason);
          log.warn(`paused for review: ${res.halt.reason}`);
          return this.store.require(projectId);
        }
        if (stage.name === "extract_tutorial") await this.moveTo(projectId, "READY_FOR_SCRIPT");
      } catch (err) {
        const msg = errorMessage(err);
        await this.store.updateStage(projectId, stage.name, { status: "error", error: msg, durationMs: Date.now() - started });
        await this.store.setStatus(projectId, "ERROR", `${stage.name}: ${msg}`).catch(() => undefined);
        log.log("error", "error", msg);
        throw err;
      }
    }
    if (endIdx === STAGE_ORDER.length - 1) await this.moveTo(projectId, "COMPLETE");
    return this.store.require(projectId);
  }

  private async recordMedia(id: string, dir: string) {
    const { IngestResult } = await import("@studio/shared");
    const ingest = await readJsonAs(join(dir, PROJECT_FILES.media), IngestResult);
    const p = await this.store.require(id);
    await this.store.save({ ...p, media: ingest.media });
  }

  /** Module 23 — batch: bounded concurrency, retries, one failure never stops the queue. */
  async runBatch(inputDir: string, opts: RunOptions & { concurrency?: number; retries?: number } = {}): Promise<BatchReport> {
    const files = (await readdir(resolve(inputDir))).filter(isSupportedVideo).sort().map((f) => join(resolve(inputDir), f));
    const concurrency = opts.concurrency ?? this.config.batch.concurrency;
    const retries = opts.retries ?? this.config.batch.retries;
    const started = Date.now();
    const results: BatchItem[] = new Array(files.length);
    let next = 0;
    this.log.info(`batch: ${files.length} videos, concurrency ${concurrency}, retries ${retries}`);
    const worker = async () => {
      while (next < files.length) {
        const i = next++;
        const file = files[i]!;
        const t0 = Date.now();
        let projectId: string | null = null;
        try {
          const project = await this.importVideo(file);
          projectId = project.id;
          const done = await withRetry(() => this.run(project.id, { ...opts, from: undefined }), {
            retries,
            baseDelayMs: 2000,
            onRetry: (err, n) => this.log.log("warn", "retry", `${basename(file)} attempt ${n + 1}: ${errorMessage(err)}`),
          });
          results[i] = { file, projectId, status: done.status, durationMs: Date.now() - t0, error: null };
        } catch (err) {
          results[i] = { file, projectId, status: "ERROR", durationMs: Date.now() - t0, error: errorMessage(err) };
          this.log.error(`batch item failed: ${basename(file)}: ${errorMessage(err)}`);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, files.length)) }, worker));
    const report: BatchReport = {
      startedAt: new Date(started).toISOString(),
      durationMs: Date.now() - started,
      total: files.length,
      complete: results.filter((r) => r.status === "COMPLETE").length,
      needsReview: results.filter((r) => r.status === "NEEDS_REVIEW").length,
      failed: results.filter((r) => r.status === "ERROR").length,
      items: results,
    };
    await writeJson(join(this.outputDir, `batch-${new Date(started).toISOString().replace(/[:.]/g, "-")}.json`), report);
    return report;
  }

  async exists(id: string): Promise<boolean> {
    return exists(this.store.dirFor(id));
  }
}

export interface BatchItem {
  file: string;
  projectId: string | null;
  status: ProjectStatus;
  durationMs: number;
  error: string | null;
}

export interface BatchReport {
  startedAt: string;
  durationMs: number;
  total: number;
  complete: number;
  needsReview: number;
  failed: number;
  items: BatchItem[];
}
