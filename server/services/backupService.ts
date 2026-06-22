import { db } from "../db-pg";
import * as schema from "../schema";
import { eq } from "drizzle-orm";
import { format } from "date-fns";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { BACKUPS_DIR } from "../utils/pathUtils";

// ============================================================================
// TYPES
// ============================================================================

export interface BackupMetadata {
  backupId: string;
  createdAt: string;
  version: string;
  environment: string;
  totalEmployees: number;
  totalVersions: number;
  totalAuditLogs: number;
  payloadSizeBytes: number;
  checksum: string;
}

export interface BackupPayload {
  employees: any[];
  employeeVersions: any[];
  pendingRenewals: any[];
  auditLogs: any[];
  divisions: any[];
  services: any[];
  equipes: any[];
}

export interface BackupData {
  metadata: BackupMetadata;
  payload: BackupPayload;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const VERSION = "2.0.0";

// Ensure backup directory exists
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// ============================================================================
// HELPERS
// ============================================================================

function sha256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function generateBackupId(): string {
  return `backup_${format(new Date(), "yyyy-MM-dd_HH-mm-ss")}_${Math.random().toString(36).slice(2, 9)}`;
}

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

export async function exportAllData(): Promise<BackupData> {
  const [
    employees,
    employeeVersions,
    pendingRenewals,
    auditLogs,
    divisions,
    services,
    equipes,
  ] = await Promise.all([
    db.select().from(schema.employees),
    db.select().from(schema.employeeVersions),
    db.select().from(schema.pendingRenewals),
    db.select().from(schema.auditLogs),
    db.select().from(schema.divisions),
    db.select().from(schema.services),
    db.select().from(schema.equipes),
  ]);

  const payload: BackupPayload = {
    employees,
    employeeVersions,
    pendingRenewals,
    auditLogs,
    divisions,
    services,
    equipes,
  };

  // Checksum is computed over the payload only (not the metadata)
  const payloadJson = JSON.stringify(payload);
  const checksum = sha256(payloadJson);

  const metadata: BackupMetadata = {
    backupId: generateBackupId(),
    createdAt: new Date().toISOString(),
    version: VERSION,
    environment: process.env.NODE_ENV || "development",
    totalEmployees: employees.length,
    totalVersions: employeeVersions.length,
    totalAuditLogs: auditLogs.length,
    payloadSizeBytes: payloadJson.length,
    checksum,
  };

  return { metadata, payload };
}

export async function createBackupFile(backupDir: string = BACKUPS_DIR): Promise<{
  backupId: string;
  filePath: string;
  fileSize: number;
  metadata: BackupMetadata;
}> {
  const data = await exportAllData();
  const filename = `${data.metadata.backupId}.json`;
  const filePath = path.join(backupDir, filename);

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  const stats = fs.statSync(filePath);
  console.log(`[BACKUP] Created: ${filePath} (${stats.size} bytes)`);

  return { backupId: data.metadata.backupId, filePath, fileSize: stats.size, metadata: data.metadata };
}

export async function verifyBackup(filePath: string): Promise<{
  isValid: boolean;
  errors: string[];
  metadata?: BackupMetadata;
}> {
  const errors: string[] = [];

  if (!fs.existsSync(filePath)) {
    return { isValid: false, errors: ["Backup file not found"] };
  }

  let data: BackupData;
  try {
    data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return { isValid: false, errors: ["Invalid JSON format"] };
  }

  if (!data.metadata) errors.push("Metadata missing");
  if (!data.payload) errors.push("Payload missing");
  if (errors.length > 0) return { isValid: false, errors };

  // Verify checksum over payload only
  const actualChecksum = sha256(JSON.stringify(data.payload));
  if (actualChecksum !== data.metadata.checksum) {
    errors.push(`Checksum mismatch — file may be corrupted (expected ${data.metadata.checksum.slice(0, 8)}…, got ${actualChecksum.slice(0, 8)}…)`);
  }

  // Schema compatibility check
  if (data.metadata.version && data.metadata.version.split(".")[0] !== VERSION.split(".")[0]) {
    errors.push(`Schema version mismatch: backup is v${data.metadata.version}, current is v${VERSION}`);
  }

  if (!data.payload.employees) errors.push("No employee data found");
  if (!data.payload.divisions) errors.push("No divisions data found");

  return { isValid: errors.length === 0, errors, metadata: data.metadata };
}

export interface RestoreResult {
  restored: Record<string, number>;
}

export async function restoreFromBackup(filePath: string): Promise<RestoreResult> {
  if (!fs.existsSync(filePath)) {
    throw new Error("Backup file not found");
  }

  const data: BackupData = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (!data.payload) {
    throw new Error("Invalid backup: missing payload");
  }

  const payload = data.payload;

  return db.transaction(async (tx) => {
    // Clear existing data (reverse dependency order)
    await tx.delete(schema.notificationLogs);
    await tx.delete(schema.auditLogs);
    await tx.delete(schema.pendingRenewals);
    await tx.delete(schema.employeeVersions);
    await tx.delete(schema.employees);
    await tx.delete(schema.equipes);
    await tx.delete(schema.services);
    await tx.delete(schema.divisions);

    // Re-insert in dependency order
    if (payload.divisions?.length) await tx.insert(schema.divisions).values(payload.divisions);
    if (payload.services?.length) await tx.insert(schema.services).values(payload.services);
    if (payload.equipes?.length) await tx.insert(schema.equipes).values(payload.equipes);

    if (payload.employees?.length) {
      // currentVersionId is restored below, once employee_versions exist
      await tx.insert(schema.employees).values(
        payload.employees.map((e: any) => ({ ...e, currentVersionId: null }))
      );
    }

    if (payload.employeeVersions?.length) await tx.insert(schema.employeeVersions).values(payload.employeeVersions);
    if (payload.pendingRenewals?.length) await tx.insert(schema.pendingRenewals).values(payload.pendingRenewals);
    if (payload.auditLogs?.length) await tx.insert(schema.auditLogs).values(payload.auditLogs);

    for (const emp of payload.employees ?? []) {
      if (emp.currentVersionId != null) {
        await tx.update(schema.employees).set({ currentVersionId: emp.currentVersionId }).where(eq(schema.employees.id, emp.id));
      }
    }

    return {
      restored: {
        divisions: payload.divisions?.length ?? 0,
        services: payload.services?.length ?? 0,
        equipes: payload.equipes?.length ?? 0,
        employees: payload.employees?.length ?? 0,
        employeeVersions: payload.employeeVersions?.length ?? 0,
        pendingRenewals: payload.pendingRenewals?.length ?? 0,
        auditLogs: payload.auditLogs?.length ?? 0,
      },
    };
  });
}

export function listBackups(backupDir: string = BACKUPS_DIR): {
  backupId: string;
  filename: string;
  filePath: string;
  fileSize: number;
  createdAt: Date;
}[] {
  if (!fs.existsSync(backupDir)) return [];

  return fs
    .readdirSync(backupDir)
    .filter((f) => f.endsWith(".json"))
    .map((filename) => {
      const filePath = path.join(backupDir, filename);
      const stats = fs.statSync(filePath);
      return { backupId: filename.replace(".json", ""), filename, filePath, fileSize: stats.size, createdAt: stats.mtime };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function deleteBackup(backupId: string, backupDir: string = BACKUPS_DIR): {
  deleted: boolean;
  error?: string;
} {
  // Resolve through the backups dir and verify the path stays inside it
  // (defends against "../" traversal in backupId).
  const filename = path.basename(`${backupId}.json`);
  const filePath = path.join(backupDir, filename);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(backupDir) + path.sep)) {
    return { deleted: false, error: "Identifiant de sauvegarde invalide" };
  }
  if (!fs.existsSync(resolved)) {
    return { deleted: false, error: "Sauvegarde introuvable" };
  }
  try {
    fs.unlinkSync(resolved);
    return { deleted: true };
  } catch (err) {
    return { deleted: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function cleanupOldBackups(keepCount: number = 30, backupDir: string = BACKUPS_DIR): {
  deletedCount: number;
  remainingCount: number;
} {
  const backups = listBackups(backupDir);
  if (backups.length <= keepCount) return { deletedCount: 0, remainingCount: backups.length };

  let deletedCount = 0;
  for (const backup of backups.slice(keepCount)) {
    try {
      fs.unlinkSync(backup.filePath);
      deletedCount++;
    } catch (err) {
      console.error(`[BACKUP] Failed to delete ${backup.filename}:`, err);
    }
  }
  return { deletedCount, remainingCount: backups.length - deletedCount };
}

export function getBackupStatistics(): {
  totalBackups: number;
  totalStorageBytes: number;
  oldestBackup: Date | null;
  newestBackup: Date | null;
  averageBackupSize: number;
} {
  const backups = listBackups();
  if (backups.length === 0) {
    return { totalBackups: 0, totalStorageBytes: 0, oldestBackup: null, newestBackup: null, averageBackupSize: 0 };
  }
  const totalStorageBytes = backups.reduce((s, b) => s + b.fileSize, 0);
  return {
    totalBackups: backups.length,
    totalStorageBytes,
    oldestBackup: backups[backups.length - 1].createdAt,
    newestBackup: backups[0].createdAt,
    averageBackupSize: Math.round(totalStorageBytes / backups.length),
  };
}

export default { exportAllData, createBackupFile, verifyBackup, restoreFromBackup, listBackups, cleanupOldBackups, getBackupStatistics };
