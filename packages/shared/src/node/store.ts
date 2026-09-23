import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Project, type ProjectStatus, type StageName, type StageRecord } from "../schemas/project";
import { PROJECT_FILES } from "../paths";
import { assertTransition } from "../state";
import { exists, readJsonAs, writeJson } from "./fs";

/**
 * Persistence boundary for project metadata. The file store is the default
 * (works offline, zero setup); a Postgres/Supabase store can implement the
 * same interface later (see config/db/schema.sql).
 */
export interface ProjectStore {
  dirFor(id: string): string;
  pathFor(id: string, rel: string): string;
  get(id: string): Promise<Project | null>;
  require(id: string): Promise<Project>;
  list(): Promise<Project[]>;
  save(project: Project): Promise<Project>;
  setStatus(id: string, to: ProjectStatus, reason?: string): Promise<Project>;
  updateStage(id: string, stage: StageName, patch: Partial<StageRecord>): Promise<Project>;
}

export class FileProjectStore implements ProjectStore {
  /** Serialize writes per project so concurrent stage updates don't clobber each other. */
  private locks = new Map<string, Promise<unknown>>();

  constructor(public readonly projectsDir: string) {}

  dirFor(id: string): string {
    return resolve(this.projectsDir, id);
  }

  pathFor(id: string, rel: string): string {
    return join(this.dirFor(id), rel);
  }

  async get(id: string): Promise<Project | null> {
    const file = this.pathFor(id, PROJECT_FILES.project);
    if (!(await exists(file))) return null;
    return readJsonAs(file, Project);
  }

  async require(id: string): Promise<Project> {
    const p = await this.get(id);
    if (!p) throw new Error(`Project not found: ${id}`);
    return p;
  }

  async list(): Promise<Project[]> {
    if (!(await exists(this.projectsDir))) return [];
    const entries = await readdir(this.projectsDir, { withFileTypes: true });
    const projects: Project[] = [];
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      try {
        const p = await this.get(e.name);
        if (p) projects.push(p);
      } catch {
        // Skip corrupt project directories rather than failing the listing.
      }
    }
    return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async save(project: Project): Promise<Project> {
    const validated = Project.parse({ ...project, updatedAt: new Date().toISOString() });
    await writeJson(this.pathFor(project.id, PROJECT_FILES.project), validated);
    return validated;
  }

  private withLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(id) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(id, next.catch(() => undefined));
    return next;
  }

  setStatus(id: string, to: ProjectStatus, reason?: string): Promise<Project> {
    return this.withLock(id, async () => {
      const p = await this.require(id);
      if (p.status === to) return p;
      assertTransition(p.status, to);
      p.history.push({ from: p.status, to, at: new Date().toISOString(), reason });
      p.status = to;
      if (to !== "ERROR") p.error = null;
      else if (reason) p.error = reason;
      return this.save(p);
    });
  }

  updateStage(id: string, stage: StageName, patch: Partial<StageRecord>): Promise<Project> {
    return this.withLock(id, async () => {
      const p = await this.require(id);
      const current: StageRecord = p.stages[stage] ?? {
        status: "pending",
        inputHash: null,
        startedAt: null,
        completedAt: null,
        durationMs: null,
        attempts: 0,
        error: null,
        cached: false,
        provider: null,
        cost: null,
        outputs: [],
        notes: [],
      };
      p.stages[stage] = { ...current, ...patch };
      return this.save(p);
    });
  }
}
