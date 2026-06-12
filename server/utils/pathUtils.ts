/**
 * Safe path resolver — path traversal prevention and filename sanitization.
 * All PDF/backup/import filenames stored in DB must go through sanitizeFilename().
 * All file reads/writes must resolve through safeResolvePath().
 */

import path from "path";
import fs from "fs";

// Base directories — resolved once at module load
export const UPLOADS_DIR = process.env.UPLOADS_BASE_DIR
  ? path.resolve(process.env.UPLOADS_BASE_DIR)
  : path.resolve(process.cwd(), "uploads");
export const PDFS_DIR = path.join(UPLOADS_DIR, "pdfs");
export const BACKUPS_DIR = path.join(UPLOADS_DIR, "backups");
export const TEMP_DIR = path.join(UPLOADS_DIR, "temp");
export const LOGS_DIR = path.resolve(process.cwd(), "logs");
export const DATABASE_DIR = path.resolve(process.cwd(), "database");

const REQUIRED_DIRS = [UPLOADS_DIR, PDFS_DIR, BACKUPS_DIR, TEMP_DIR, LOGS_DIR, DATABASE_DIR];

/** Create all required application directories synchronously. Safe to call multiple times. */
export function ensureRequiredDirectories(): void {
  for (const dir of REQUIRED_DIRS) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/** Check which required directories are missing (for health checks). */
export function getMissingDirectories(): string[] {
  return REQUIRED_DIRS.filter((d) => !fs.existsSync(d));
}

/** Check which required directories are not writable. */
export function getUnwritableDirectories(): string[] {
  return REQUIRED_DIRS.filter((d) => {
    if (!fs.existsSync(d)) return true;
    try {
      fs.accessSync(d, fs.constants.W_OK);
      return false;
    } catch {
      return true;
    }
  });
}

/**
 * Resolve a filename relative to a base directory.
 * Throws if the resolved path escapes the base directory (path traversal prevention).
 */
export function safeResolvePath(baseDir: string, filename: string): string {
  if (!filename || typeof filename !== "string") {
    throw new Error("Invalid filename: must be a non-empty string");
  }

  // Strip any directory components from the filename — only the basename is used
  const safeName = path.basename(filename);
  if (!safeName || safeName === "." || safeName === "..") {
    throw new Error(`Invalid filename after sanitization: "${filename}"`);
  }

  const resolved = path.resolve(baseDir, safeName);

  // Verify the resolved path stays within the base directory
  const normalizedBase = path.resolve(baseDir);
  if (!resolved.startsWith(normalizedBase + path.sep) && resolved !== normalizedBase) {
    throw new Error(`Path traversal detected: "${filename}" resolves outside of base directory`);
  }

  return resolved;
}

/**
 * Resolve a PDF filename to its full path in the PDFs directory.
 * Accepts only the filename (e.g. "hab12345_v3.pdf"), never a relative or absolute path.
 */
export function resolvePdfPath(filename: string): string {
  return safeResolvePath(PDFS_DIR, filename);
}

/**
 * Resolve a backup filename to its full path in the backups directory.
 */
export function resolveBackupPath(filename: string): string {
  return safeResolvePath(BACKUPS_DIR, filename);
}

/**
 * Sanitize a filename for safe storage.
 * Removes path separators, null bytes, and dangerous characters.
 * Returns only the basename with allowed characters.
 */
export function sanitizeFilename(raw: string): string {
  if (!raw || typeof raw !== "string") return "file";

  // Take only the basename
  let name = path.basename(raw);

  // Remove null bytes
  name = name.replace(/\0/g, "");

  // Allow: alphanumeric, dash, underscore, dot, parentheses
  name = name.replace(/[^a-zA-Z0-9\-_.()À-ſ]/g, "_");

  // Prevent hidden files (starting with dot)
  if (name.startsWith(".")) name = "_" + name.slice(1);

  // Limit length
  if (name.length > 200) name = name.slice(0, 200);

  return name || "file";
}

/**
 * Generate the standard PDF filename for a given employee/version.
 * Pattern: hab{matricule}_v{versionNumber}.pdf
 */
export function buildPdfFilename(matricule: string, versionNumber: number): string {
  const safeMat = sanitizeFilename(matricule);
  return `hab${safeMat}_v${versionNumber}.pdf`;
}

/**
 * Check if a file exists and is readable.
 */
export function fileExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file size in bytes. Returns -1 if not accessible.
 */
export function getFileSize(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch {
    return -1;
  }
}

/**
 * Validate that a PDF file exists and is plausibly non-corrupted (> 100 bytes, starts with %PDF).
 */
export function validatePdfFile(filePath: string): { valid: boolean; reason?: string } {
  if (!fileExists(filePath)) {
    return { valid: false, reason: "Fichier introuvable" };
  }

  const size = getFileSize(filePath);
  if (size < 100) {
    return { valid: false, reason: `Fichier trop petit (${size} octets)` };
  }

  try {
    const fd = fs.openSync(filePath, "r");
    const header = Buffer.alloc(4);
    fs.readSync(fd, header, 0, 4, 0);
    fs.closeSync(fd);
    if (header.toString("ascii") !== "%PDF") {
      return { valid: false, reason: "En-tête PDF invalide" };
    }
  } catch {
    return { valid: false, reason: "Impossible de lire le fichier" };
  }

  return { valid: true };
}
