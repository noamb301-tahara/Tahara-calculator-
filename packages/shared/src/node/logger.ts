import { appendFile } from "node:fs/promises";
import { dirname } from "node:path";
import { ensureDir } from "./fs";

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogEvent = "start" | "complete" | "skip" | "retry" | "error" | "info" | "cost";

export interface LogRecord {
  ts: string;
  level: LogLevel;
  event: LogEvent;
  msg: string;
  projectId?: string;
  stage?: string;
  durationMs?: number;
  attempt?: number;
  [key: string]: unknown;
}

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const COLORS: Record<LogLevel, string> = { debug: "\x1b[90m", info: "\x1b[36m", warn: "\x1b[33m", error: "\x1b[31m" };

/**
 * Structured logger (Module 24). Human-readable lines to stderr, JSONL to a
 * per-project file so the admin UI can show the processing timeline.
 */
export class Logger {
  constructor(
    private readonly context: { projectId?: string; stage?: string } = {},
    private readonly filePath: string | null = null,
    private readonly minLevel: LogLevel = (process.env.STUDIO_LOG_LEVEL as LogLevel) || "info",
    private readonly quiet = process.env.STUDIO_QUIET === "1",
  ) {}

  child(context: { projectId?: string; stage?: string }, filePath?: string | null): Logger {
    return new Logger({ ...this.context, ...context }, filePath === undefined ? this.filePath : filePath, this.minLevel, this.quiet);
  }

  log(level: LogLevel, event: LogEvent, msg: string, extra: Record<string, unknown> = {}): void {
    const record: LogRecord = { ts: new Date().toISOString(), level, event, msg, ...this.context, ...extra };
    if (!this.quiet && LEVEL_ORDER[level] >= LEVEL_ORDER[this.minLevel]) {
      const where = [record.projectId, record.stage].filter(Boolean).join(" › ");
      const dur = typeof record.durationMs === "number" ? ` (${(record.durationMs / 1000).toFixed(2)}s)` : "";
      process.stderr.write(`${COLORS[level]}${level.toUpperCase().padEnd(5)}\x1b[0m ${where ? `[${where}] ` : ""}${event !== "info" ? `${event}: ` : ""}${msg}${dur}\n`);
    }
    if (this.filePath) {
      const file = this.filePath;
      // Fire-and-forget; logging must never break the pipeline.
      void ensureDir(dirname(file))
        .then(() => appendFile(file, JSON.stringify(record) + "\n"))
        .catch(() => undefined);
    }
  }

  debug(msg: string, extra?: Record<string, unknown>) { this.log("debug", "info", msg, extra); }
  info(msg: string, extra?: Record<string, unknown>) { this.log("info", "info", msg, extra); }
  warn(msg: string, extra?: Record<string, unknown>) { this.log("warn", "info", msg, extra); }
  error(msg: string, extra?: Record<string, unknown>) { this.log("error", "error", msg, extra); }
}

export const rootLogger = new Logger();
