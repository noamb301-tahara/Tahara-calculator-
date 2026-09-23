import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
export { exists, hasCommand, run, withRetry, errorMessage } from "@studio/shared/node";

export function mkdtempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}
