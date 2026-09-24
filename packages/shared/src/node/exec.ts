import { spawn } from "node:child_process";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export class ExecError extends Error {
  constructor(
    message: string,
    public readonly result: ExecResult,
  ) {
    super(message);
    this.name = "ExecError";
  }
}

/** Run a command without a shell. Rejects on non-zero exit unless allowFailure. */
export function run(
  cmd: string,
  args: string[],
  opts: { cwd?: string; input?: string | Buffer; allowFailure?: boolean; maxBuffer?: number; binaryStdout?: boolean; env?: Record<string, string> } = {},
): Promise<ExecResult & { stdoutBuffer: Buffer }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, stdio: ["pipe", "pipe", "pipe"], env: opts.env ? { ...process.env, ...opts.env } : process.env });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let size = 0;
    const max = opts.maxBuffer ?? 512 * 1024 * 1024;
    child.stdout.on("data", (c: Buffer) => {
      size += c.length;
      if (size <= max) out.push(c);
    });
    child.stderr.on("data", (c: Buffer) => err.push(c));
    child.on("error", (e) => reject(new ExecError(`Failed to start ${cmd}: ${e.message}`, { code: -1, stdout: "", stderr: e.message })));
    child.on("close", (code) => {
      const stdoutBuffer = Buffer.concat(out);
      const result = { code: code ?? -1, stdout: opts.binaryStdout ? "" : stdoutBuffer.toString("utf8"), stderr: Buffer.concat(err).toString("utf8"), stdoutBuffer };
      if (result.code !== 0 && !opts.allowFailure) {
        const tail = result.stderr.split("\n").slice(-12).join("\n");
        reject(new ExecError(`${cmd} exited with code ${result.code}:\n${tail}`, result));
      } else resolve(result);
    });
    if (opts.input !== undefined) child.stdin.end(opts.input);
    else child.stdin.end();
  });
}

const whichCache = new Map<string, boolean>();

/** True if an executable is available on PATH. */
export async function hasCommand(cmd: string): Promise<boolean> {
  if (whichCache.has(cmd)) return whichCache.get(cmd)!;
  // Windows has no `sh`: `where` does the same lookup there (PATH + PATHEXT, e.g. ffmpeg.exe).
  const res = await (process.platform === "win32"
    ? run("where", [cmd], { allowFailure: true })
    : run("sh", ["-c", `command -v ${JSON.stringify(cmd)}`], { allowFailure: true })
  ).catch(() => ({ code: 1 }));
  const ok = res.code === 0;
  whichCache.set(cmd, ok);
  return ok;
}
