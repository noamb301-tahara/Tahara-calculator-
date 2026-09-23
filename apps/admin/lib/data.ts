import "server-only";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PROJECT_FILES, type Project } from "@studio/shared";
import { FileProjectStore, findRepoRoot, loadConfig } from "@studio/shared/node";

/** Server-side data access: the admin reads the same files the pipeline writes. */
export const ROOT = findRepoRoot(process.env.STUDIO_ROOT ?? process.cwd());

export async function getConfig() {
  return (await loadConfig({ root: ROOT })).config;
}

export async function getStore() {
  const config = await getConfig();
  return new FileProjectStore(resolve(ROOT, config.paths.data, "projects"));
}

export async function outputDir() {
  return resolve(ROOT, (await getConfig()).paths.output);
}

export async function readProjectJson<T>(project: Project, key: keyof typeof PROJECT_FILES): Promise<T | null> {
  const store = await getStore();
  const file = store.pathFor(project.id, PROJECT_FILES[key]);
  if (!existsSync(file)) return null;
  return JSON.parse(await readFile(file, "utf8")) as T;
}

export async function readProjectText(project: Project, key: keyof typeof PROJECT_FILES): Promise<string | null> {
  const store = await getStore();
  const file = store.pathFor(project.id, PROJECT_FILES[key]);
  return existsSync(file) ? readFile(file, "utf8") : null;
}

export function fileUrl(projectId: string, rel: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/file?path=${encodeURIComponent(rel)}`;
}

export function finalVideoRel(): string {
  return "@output/final-short.mp4";
}

export { join };
