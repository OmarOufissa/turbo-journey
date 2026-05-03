/**
 * PHASE 4: BACKUP SERVICE
 * 
 * Exports complete database to JSON format
 * Verifies backup integrity
 * Prepares for disaster recovery
 * 
 * Can be paired with:
 * - Local filesystem backups
 * - AWS S3
 * - Google Cloud Storage
 * - Any other cloud storage
 */

import { db } from "../db-pg";
import * as schema from "../schema";
import { format } from "date-fns";
import fs from "fs";
import path from "path";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface BackupMetadata {
  backupId: string;
  createdAt: Date;
  version: string;
  environment: string;
  totalEmployees: number;
  totalHabilitations: number;
  totalAuditLogs: number;
  databaseSizeBytes: number;
  checksum: string; // SHA256 hash for integrity verification
}

export interface BackupData {
  metadata: BackupMetadata;
  employees: any[];
  habilitations: any[];
  auditLogs: any[];
  employeeVersions: any[];
  habilitationArchive: any[];
  emailLog: any[];
  divisions: any[];
  services: any[];
  equipes: any[];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const BACKUP_DIR = path.join(process.cwd(), "backups", "local");
const VERSION = "1.0.0";

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate SHA256 checksum of data
 */
function calculateChecksum(data: string): string {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Generate unique backup ID
 */
function generateBackupId(): string {
  return `backup_${format(new Date(), "yyyy-MM-dd_HH-mm-ss")}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get total size of backup in bytes
 */
function calculateBackupSize(data: BackupData): number {
  return JSON.stringify(data).length;
}

// ============================================================================
// CORE BACKUP FUNCTIONS
// ============================================================================

/**
 * Export all data from database to JSON
 * Includes all tables and audit trails
 */
export async function exportAllData(): Promise<BackupData> {
  try {
    console.log("[BACKUP] Starting data export...");

    // Fetch all data in parallel
    const [
      employees,
      habilitations,
      auditLogs,
      employeeVersions,
      habilitationArchive,
      emailLog,
      divisions,
      services,
      equipes,
    ] = await Promise.all([
      db.select().from(schema.employees),
      db.select().from(schema.habilitations),
      db.select().from(schema.auditLogs),
      db.select().from(schema.employeeVersions),
      db.select().from(schema.habilitationArchive),
      db.select().from(schema.emailLog),
      db.select().from(schema.divisions),
      db.select().from(schema.services),
      db.select().from(schema.equipes),
    ]);

    const backupId = generateBackupId();
    const createdAt = new Date();

    // Create metadata
    const metadata: BackupMetadata = {
      backupId,
      createdAt,
      version: VERSION,
      environment: process.env.NODE_ENV || "development",
      totalEmployees: employees.length,
      totalHabilitations: habilitations.length,
      totalAuditLogs: auditLogs.length,
      databaseSizeBytes: 0, // Will calculate after adding to data
      checksum: "",
    };

    // Create backup data object
    const data: BackupData = {
      metadata,
      employees,
      habilitations,
      auditLogs,
      employeeVersions,
      habilitationArchive,
      emailLog,
      divisions,
      services,
      equipes,
    };

    // Calculate size and checksum
    const dataJson = JSON.stringify(data);
    metadata.databaseSizeBytes = dataJson.length;
    metadata.checksum = calculateChecksum(dataJson);

    console.log(`[BACKUP] Export complete: ${employees.length} employees, ${habilitations.length} habilitations, ${auditLogs.length} audit logs`);

    return data;
  } catch (err) {
    console.error("[BACKUP] Error exporting data:", err);
    throw new Error(`Failed to export data: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Create a backup file and save to disk
 */
export async function createBackupFile(
  backupDir: string = BACKUP_DIR
): Promise<{
  backupId: string;
  filePath: string;
  fileSize: number;
  metadata: BackupMetadata;
}> {
  try {
    console.log("[BACKUP] Creating backup file...");

    // Export data
    const data = await exportAllData();
    const backupId = data.metadata.backupId;

    // Create filename
    const filename = `${backupId}.json`;
    const filePath = path.join(backupDir, filename);

    // Write to disk
    const dataJson = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, dataJson);

    const stats = fs.statSync(filePath);

    console.log(`[BACKUP] Backup file created: ${filePath} (${stats.size} bytes)`);

    return {
      backupId,
      filePath,
      fileSize: stats.size,
      metadata: data.metadata,
    };
  } catch (err) {
    console.error("[BACKUP] Error creating backup file:", err);
    throw new Error(`Failed to create backup: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Verify backup file integrity
 */
export async function verifyBackup(filePath: string): Promise<{
  isValid: boolean;
  errors: string[];
  metadata?: BackupMetadata;
}> {
  try {
    if (!fs.existsSync(filePath)) {
      return {
        isValid: false,
        errors: ["Backup file not found"],
      };
    }

    // Read and parse backup
    const fileContent = fs.readFileSync(filePath, "utf-8");
    let data: BackupData;

    try {
      data = JSON.parse(fileContent);
    } catch (parseErr) {
      return {
        isValid: false,
        errors: ["Invalid JSON format"],
      };
    }

    const errors: string[] = [];

    // Verify checksum
    const calculatedChecksum = calculateChecksum(JSON.stringify(data));
    if (calculatedChecksum !== data.metadata.checksum) {
      errors.push("Checksum mismatch - file may be corrupted");
    }

    // Verify required data exists
    if (!data.employees || data.employees.length === 0) {
      errors.push("No employee data found");
    }

    if (!data.auditLogs || data.auditLogs.length === 0) {
      errors.push("No audit logs found");
    }

    // Verify metadata
    if (!data.metadata) {
      errors.push("Metadata missing");
    }

    return {
      isValid: errors.length === 0,
      errors,
      metadata: data.metadata,
    };
  } catch (err) {
    console.error("[BACKUP] Error verifying backup:", err);
    return {
      isValid: false,
      errors: [
        `Verification failed: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}

/**
 * List all local backups
 */
export function listBackups(backupDir: string = BACKUP_DIR): {
  backupId: string;
  filename: string;
  filePath: string;
  fileSize: number;
  createdAt: Date;
}[] {
  try {
    if (!fs.existsSync(backupDir)) {
      return [];
    }

    const files = fs.readdirSync(backupDir).filter((f) => f.endsWith(".json"));

    return files
      .map((filename) => {
        const filePath = path.join(backupDir, filename);
        const stats = fs.statSync(filePath);
        const backupId = filename.replace(".json", "");

        return {
          backupId,
          filename,
          filePath,
          fileSize: stats.size,
          createdAt: stats.mtime,
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch (err) {
    console.error("[BACKUP] Error listing backups:", err);
    return [];
  }
}

/**
 * Delete old backups (keep only last N)
 */
export function cleanupOldBackups(
  keepCount: number = 7,
  backupDir: string = BACKUP_DIR
): {
  deletedCount: number;
  remainingCount: number;
} {
  try {
    const backups = listBackups(backupDir);

    if (backups.length <= keepCount) {
      return { deletedCount: 0, remainingCount: backups.length };
    }

    const toDelete = backups.slice(keepCount);
    let deletedCount = 0;

    for (const backup of toDelete) {
      try {
        fs.unlinkSync(backup.filePath);
        deletedCount++;
        console.log(`[BACKUP] Deleted old backup: ${backup.filename}`);
      } catch (deleteErr) {
        console.error(`[BACKUP] Failed to delete backup ${backup.filename}:`, deleteErr);
      }
    }

    return {
      deletedCount,
      remainingCount: backups.length - deletedCount,
    };
  } catch (err) {
    console.error("[BACKUP] Error cleaning up backups:", err);
    return { deletedCount: 0, remainingCount: 0 };
  }
}

/**
 * Get backup statistics
 */
export function getBackupStatistics(): {
  totalBackups: number;
  totalStorageBytes: number;
  oldestBackup: Date | null;
  newestBackup: Date | null;
  averageBackupSize: number;
} {
  try {
    const backups = listBackups();

    if (backups.length === 0) {
      return {
        totalBackups: 0,
        totalStorageBytes: 0,
        oldestBackup: null,
        newestBackup: null,
        averageBackupSize: 0,
      };
    }

    const totalStorageBytes = backups.reduce((sum, b) => sum + b.fileSize, 0);
    const averageBackupSize = Math.round(totalStorageBytes / backups.length);

    return {
      totalBackups: backups.length,
      totalStorageBytes,
      oldestBackup: backups[backups.length - 1].createdAt,
      newestBackup: backups[0].createdAt,
      averageBackupSize,
    };
  } catch (err) {
    console.error("[BACKUP] Error getting backup statistics:", err);
    return {
      totalBackups: 0,
      totalStorageBytes: 0,
      oldestBackup: null,
      newestBackup: null,
      averageBackupSize: 0,
    };
  }
}

export default {
  exportAllData,
  createBackupFile,
  verifyBackup,
  listBackups,
  cleanupOldBackups,
  getBackupStatistics,
};
