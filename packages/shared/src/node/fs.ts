import { mkdir, readFile, rename, writeFile, stat, copyFile, access } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import type { z } from "zod";

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Atomic write: write to temp file then rename. */
export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  await ensureDir(dirname(path));
  const tmp = `${path}.${randomBytes(4).toString("hex")}.tmp`;
  await writeFile(tmp, data);
  await rename(tmp, path);
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFileAtomic(path, JSON.stringify(value, null, 2) + "\n");
}

export async function readJson<T = unknown>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

/** Read + validate JSON against a zod schema; throws a readable error. */
export async function readJsonAs<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
  const raw = await readJson(path);
  const result = schema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 8)
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid ${path}:\n${issues}`);
  }
  return result.data;
}

export async function fileSize(path: string): Promise<number> {
  return (await stat(path)).size;
}

export async function copyInto(src: string, dest: string): Promise<void> {
  await ensureDir(dirname(dest));
  await copyFile(src, dest);
}
