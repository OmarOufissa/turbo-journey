/**
 * Structured rotating logger — per-category log files with size-based rotation.
 * Categories: app, auth, import, pdf, backup, crash
 */

import fs from "fs";
import path from "path";
import { LOGS_DIR } from "./pathUtils";

export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
export type LogCategory = "app" | "auth" | "import" | "pdf" | "backup" | "crash" | "audit";

const LOG_MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file
const LOG_MAX_BACKUPS = 5;

interface LogEntry {
  ts: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: Record<string, unknown>;
}

// Keep file descriptors open for performance
const fileHandles = new Map<LogCategory, number>();

function getLogPath(category: LogCategory): string {
  return path.join(LOGS_DIR, `${category}.log`);
}

function getRotatedPath(category: LogCategory, index: number): string {
  return path.join(LOGS_DIR, `${category}.log.${index}`);
}

function rotate(category: LogCategory): void {
  const current = getLogPath(category);
  if (!fs.existsSync(current)) return;
  if (fs.statSync(current).size < LOG_MAX_BYTES) return;

  // Close handle if open
  if (fileHandles.has(category)) {
    try { fs.closeSync(fileHandles.get(category)!); } catch { /* ignore */ }
    fileHandles.delete(category);
  }

  // Shift old backups
  for (let i = LOG_MAX_BACKUPS - 1; i >= 1; i--) {
    const old = getRotatedPath(category, i);
    const newer = getRotatedPath(category, i + 1);
    if (fs.existsSync(old)) {
      try { fs.renameSync(old, newer); } catch { /* ignore */ }
    }
  }

  // Rename current to .1
  try { fs.renameSync(current, getRotatedPath(category, 1)); } catch { /* ignore */ }
}

function openHandle(category: LogCategory): number {
  if (!fileHandles.has(category)) {
    rotate(category);
    const fd = fs.openSync(getLogPath(category), "a");
    fileHandles.set(category, fd);
  }
  return fileHandles.get(category)!;
}

function writeEntry(entry: LogEntry): void {
  try {
    // Ensure logs dir exists
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
    rotate(entry.category);
    const fd = openHandle(entry.category);
    const line = JSON.stringify(entry) + "\n";
    fs.writeSync(fd, line);
  } catch {
    // Never crash the application on logging failure
  }
}

function log(
  level: LogLevel,
  category: LogCategory,
  message: string,
  data?: Record<string, unknown>
): void {
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    category,
    message,
    ...(data && Object.keys(data).length > 0 ? { data } : {}),
  };

  writeEntry(entry);

  // Also write to console (structured)
  const prefix = `[${entry.ts}] [${level.toUpperCase()}] [${category}]`;
  if (level === "error" || level === "fatal") {
    console.error(prefix, message, data ?? "");
  } else if (level === "warn") {
    console.warn(prefix, message, data ?? "");
  } else {
    console.log(prefix, message, data ?? "");
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export const logger = {
  debug: (category: LogCategory, message: string, data?: Record<string, unknown>) =>
    log("debug", category, message, data),
  info: (category: LogCategory, message: string, data?: Record<string, unknown>) =>
    log("info", category, message, data),
  warn: (category: LogCategory, message: string, data?: Record<string, unknown>) =>
    log("warn", category, message, data),
  error: (category: LogCategory, message: string, data?: Record<string, unknown>) =>
    log("error", category, message, data),
  fatal: (category: LogCategory, message: string, data?: Record<string, unknown>) =>
    log("fatal", category, message, data),

  /** Log an unhandled crash with full stack. */
  crash: (err: unknown, context?: string) => {
    const errObj = err instanceof Error ? { message: err.message, stack: err.stack } : { raw: String(err) };
    log("fatal", "crash", context ?? "Unhandled error", errObj as Record<string, unknown>);
  },

  /** Log an auth event (login, failed attempt, token refresh). */
  authEvent: (event: string, data?: Record<string, unknown>) =>
    log("info", "auth", event, data),

  /** Log an import operation result. */
  importEvent: (event: string, data?: Record<string, unknown>) =>
    log("info", "import", event, data),

  /** Log a PDF generation event. */
  pdfEvent: (event: string, data?: Record<string, unknown>) =>
    log("info", "pdf", event, data),

  /** Log a backup/restore event. */
  backupEvent: (event: string, data?: Record<string, unknown>) =>
    log("info", "backup", event, data),

  /** Log an audit trail event. */
  auditEvent: (event: string, data?: Record<string, unknown>) =>
    log("info", "audit", event, data),
};

// Flush all open file handles on process exit
process.on("exit", () => {
  for (const [, fd] of fileHandles) {
    try { fs.closeSync(fd); } catch { /* ignore */ }
  }
});

export default logger;
