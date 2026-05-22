/**
 * PHASE 4: BACKUP SCHEDULER JOBS
 * 
 * Automated backup scheduling
 * - Daily midnight: Create local backup
 * - Weekly Sunday 2 AM: Upload to cloud (when integrated)
 * - Automatic cleanup of old backups
 * 
 * Requires node-cron package (npm install node-cron)
 */

import {
  createBackupFile,
  listBackups,
  cleanupOldBackups,
  getBackupStatistics,
} from "../services/backupService";
import {
  isS3Configured,
  uploadBackupToS3,
  listS3Backups,
  cleanupOldS3Backups,
  getS3BackupStatistics,
} from "../services/awsBackupService";
import { logAuditActionSafe } from "../services/auditService";

// ============================================================================
// CRON PATTERNS
// ============================================================================

export const BACKUP_CRON_PATTERNS = {
  DAILY_MIDNIGHT: "0 0 * * *", // Every day at midnight
  WEEKLY_SUNDAY_2AM: "0 2 * * 0", // Every Sunday at 2 AM
  EVERY_6_HOURS: "0 */6 * * *", // Every 6 hours (for testing)
};

// Backup configuration
const BACKUPS_TO_KEEP = parseInt(process.env.BACKUPS_TO_KEEP || "7"); // Keep last 7 backups

// ============================================================================
// BACKUP JOB FUNCTIONS
// ============================================================================

/**
 * Daily backup job
 * Creates a new backup and cleans up old backups
 */
export async function dailyBackupJob(): Promise<{
  success: boolean;
  backupId?: string;
  fileSize?: number;
  backupsKept?: number;
  backupsDeleted?: number;
  errors: string[];
}> {
  console.log("[BACKUP JOB] Starting daily backup...");

  const errors: string[] = [];

  try {
    // Create backup
    const backup = await createBackupFile();

    console.log(
      `[BACKUP JOB] Backup created: ${backup.backupId} (${(backup.fileSize / 1024 / 1024).toFixed(2)} MB)`
    );

    // Clean up old backups
    const cleanup = cleanupOldBackups(BACKUPS_TO_KEEP);

    console.log(
      `[BACKUP JOB] Cleanup complete: Deleted ${cleanup.deletedCount}, Remaining ${cleanup.remainingCount}`
    );

    // Log to audit trail
    try {
      await logAuditActionSafe(
        null,
        "EXPORT_EMPLOYEES",
        null,
        null,
        {
          action: "Automatic daily backup created",
          backupId: backup.backupId,
          fileSize: backup.fileSize,
          backupsMaintained: cleanup.remainingCount,
          backupsDeleted: cleanup.deletedCount,
          metadata: backup.metadata,
        }
      );
    } catch (auditErr) {
      console.error("[BACKUP JOB] Failed to log backup to audit trail:", auditErr);
      errors.push(`Audit logging failed: ${auditErr}`);
    }

    return {
      success: errors.length === 0,
      backupId: backup.backupId,
      fileSize: backup.fileSize,
      backupsKept: cleanup.remainingCount,
      backupsDeleted: cleanup.deletedCount,
      errors,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[BACKUP JOB] Error creating backup:", err);

    // Log failure to audit trail
    try {
      await logAuditActionSafe(
        null,
        "EXPORT_EMPLOYEES",
        null,
        null,
        {
          action: "Automatic daily backup FAILED",
          error: errorMsg,
          timestamp: new Date().toISOString(),
        }
      );
    } catch (auditErr) {
      console.error("[BACKUP JOB] Failed to log backup failure:", auditErr);
    }

    return {
      success: false,
      errors: [errorMsg],
    };
  }
}

/**
 * Cloud backup job
 * Uploads latest backup to AWS S3
 */
export async function cloudBackupJob(): Promise<{
  success: boolean;
  backupId?: string;
  uploadedToCloud?: boolean;
  uploadedAt?: Date;
  errors: string[];
}> {
  console.log("[BACKUP JOB] Starting cloud backup job...");

  const errors: string[] = [];

  try {
    // Check if S3 is configured
    const isConfigured = await isS3Configured();

    if (!isConfigured) {
      console.log("[BACKUP JOB] Cloud backup not configured. Skipping upload.");
      console.log(
        "[BACKUP JOB] To enable cloud backups, set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_BACKUP_BUCKET environment variables."
      );

      // Log that cloud backup is not configured
      try {
        await logAuditActionSafe(
          null,
          "EXPORT_EMPLOYEES",
        null,
        null,
        {
            action: "Cloud backup job ran but AWS S3 not configured",
            note: "Configure AWS credentials to enable cloud uploads",
          }
        );
      } catch (auditErr) {
        console.error("[BACKUP JOB] Failed to log cloud backup status:", auditErr);
      }

      return {
        success: true,
        uploadedToCloud: false,
        errors: ["AWS S3 not configured"],
      };
    }

    // Get latest local backup
    const backups = listBackups();

    if (backups.length === 0) {
      const errorMsg = "No local backups found to upload";
      errors.push(errorMsg);

      try {
        await logAuditActionSafe(
          null,
          "EXPORT_EMPLOYEES",
        null,
        null,
        {
            action: "Cloud backup job FAILED",
            error: errorMsg,
          }
        );
      } catch (auditErr) {
        console.error("[BACKUP JOB] Failed to log error:", auditErr);
      }

      return { success: false, errors };
    }

    const latestBackup = backups[0];

    console.log(`[BACKUP JOB] Latest backup: ${latestBackup.backupId}`);

    // Read the backup file to get metadata
    const fs = await import("fs");
    const backupContent = fs.readFileSync(latestBackup.filePath, "utf-8");
    const backupData = JSON.parse(backupContent);

    // Upload to S3
    console.log("[BACKUP JOB] Uploading to AWS S3...");

    const uploadResult = await uploadBackupToS3(
      latestBackup.filePath,
      latestBackup.backupId,
      latestBackup.fileSize,
      backupData.metadata,
      "system"
    );

    if (!uploadResult.success) {
      errors.push(...uploadResult.errors);

      try {
        await logAuditActionSafe(
          null,
          "EXPORT_EMPLOYEES",
        null,
        null,
        {
            action: "Cloud backup job FAILED",
            backupId: latestBackup.backupId,
            errors: uploadResult.errors,
            timestamp: new Date().toISOString(),
          }
        );
      } catch (auditErr) {
        console.error("[BACKUP JOB] Failed to log error:", auditErr);
      }

      return {
        success: false,
        backupId: latestBackup.backupId,
        uploadedToCloud: false,
        errors,
      };
    }

    // Upload successful - clean up old S3 backups
    console.log("[BACKUP JOB] Cleaning up old S3 backups...");

    const cleanupResult = await cleanupOldS3Backups(BACKUPS_TO_KEEP);

    if (cleanupResult.errors.length > 0) {
      console.warn("[BACKUP JOB] Some cleanup errors occurred:", cleanupResult.errors);
      errors.push(...cleanupResult.errors);
    }

    console.log(
      `[BACKUP JOB] S3 cleanup complete: Deleted ${cleanupResult.deletedCount}, Remaining ${cleanupResult.remainingCount}`
    );

    // Log successful upload to audit trail
    try {
      await logAuditActionSafe(
        null,
        "EXPORT_EMPLOYEES",
        null,
        null,
        {
          action: "Cloud backup uploaded to AWS S3",
          backupId: latestBackup.backupId,
          s3Key: uploadResult.s3Key,
          fileSize: uploadResult.fileSize,
          uploadedAt: uploadResult.uploadedAt,
          s3BackupsDeleted: cleanupResult.deletedCount,
          s3BackupsMaintained: cleanupResult.remainingCount,
        }
      );
    } catch (auditErr) {
      console.error("[BACKUP JOB] Failed to log cloud backup status:", auditErr);
    }

    return {
      success: true,
      backupId: latestBackup.backupId,
      uploadedToCloud: true,
      uploadedAt: uploadResult.uploadedAt,
      errors,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[BACKUP JOB] Error in cloud backup job:", err);
    errors.push(errorMsg);

    try {
      await logAuditActionSafe(
        null,
        "EXPORT_EMPLOYEES",
        null,
        null,
        {
          action: "Cloud backup job FAILED",
          error: errorMsg,
          timestamp: new Date().toISOString(),
        }
      );
    } catch (auditErr) {
      console.error("[BACKUP JOB] Failed to log error:", auditErr);
    }

    return {
      success: false,
      errors,
    };
  }
}

/**
 * Backup statistics job
 * Logs backup statistics daily
 */
export async function backupStatisticsJob(): Promise<{
  totalBackups: number;
  totalStorageBytes: number;
  errors: string[];
}> {
  console.log("[BACKUP JOB] Running backup statistics job...");

  const errors: string[] = [];

  try {
    const stats = getBackupStatistics();

    const totalStorageMB = (stats.totalStorageBytes / 1024 / 1024).toFixed(2);
    const avgSizeMB = (stats.averageBackupSize / 1024 / 1024).toFixed(2);

    console.log(
      `[BACKUP JOB] Statistics: ${stats.totalBackups} backups, ${totalStorageMB} MB total, ${avgSizeMB} MB average`
    );

    if (stats.oldestBackup) {
      console.log(
        `[BACKUP JOB] Oldest: ${new Date(stats.oldestBackup).toISOString()}`
      );
    }
    if (stats.newestBackup) {
      console.log(
        `[BACKUP JOB] Newest: ${new Date(stats.newestBackup).toISOString()}`
      );
    }

    return {
      totalBackups: stats.totalBackups,
      totalStorageBytes: stats.totalStorageBytes,
      errors,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[BACKUP JOB] Error getting backup statistics:", err);
    return {
      totalBackups: 0,
      totalStorageBytes: 0,
      errors: [errorMsg],
    };
  }
}

// ============================================================================
// JOB SCHEDULER
// ============================================================================

let cronJobs: any[] = [];

/**
 * Initialize backup scheduler jobs
 * Call on server startup
 */
export async function initializeBackupJobs(): Promise<{
  initialized: boolean;
  jobsCount: number;
  errors: string[];
}> {
  const errors: string[] = [];

  try {
    // Try to import cron
    let cron: any;
    try {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore optional dependency
      cron = await import("node-cron");
    } catch (importErr) {
      console.warn(
        "[BACKUP JOB] node-cron not installed. Backup jobs disabled. Install with: npm install node-cron"
      );
      return {
        initialized: false,
        jobsCount: 0,
        errors: [
          "node-cron package not installed. Run: npm install node-cron",
        ],
      };
    }

    console.log("[BACKUP JOB] Initializing backup jobs...");

    // Daily backup at midnight
    const dailyJob = cron.schedule(BACKUP_CRON_PATTERNS.DAILY_MIDNIGHT, async () => {
      try {
        console.log("[BACKUP JOB] Running daily backup...");
        await dailyBackupJob();
      } catch (err) {
        console.error("[BACKUP JOB] Daily job error:", err);
      }
    });
    cronJobs.push(dailyJob);
    console.log("[BACKUP JOB] Scheduled: Daily backup at midnight");

    // Weekly cloud backup (Sunday 2 AM)
    const cloudJob = cron.schedule(BACKUP_CRON_PATTERNS.WEEKLY_SUNDAY_2AM, async () => {
      try {
        console.log("[BACKUP JOB] Running cloud backup...");
        await cloudBackupJob();
      } catch (err) {
        console.error("[BACKUP JOB] Cloud job error:", err);
      }
    });
    cronJobs.push(cloudJob);
    console.log("[BACKUP JOB] Scheduled: Cloud backup at Sunday 2 AM");

    // Backup statistics daily
    const statsJob = cron.schedule(BACKUP_CRON_PATTERNS.DAILY_MIDNIGHT, async () => {
      try {
        console.log("[BACKUP JOB] Running backup statistics...");
        await backupStatisticsJob();
      } catch (err) {
        console.error("[BACKUP JOB] Stats job error:", err);
      }
    });
    cronJobs.push(statsJob);
    console.log("[BACKUP JOB] Scheduled: Backup statistics daily");

    console.log(`[BACKUP JOB] Successfully initialized ${cronJobs.length} backup jobs`);

    return {
      initialized: true,
      jobsCount: cronJobs.length,
      errors,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[BACKUP JOB] Error initializing backup jobs:", err);
    return {
      initialized: false,
      jobsCount: 0,
      errors: [errorMsg],
    };
  }
}

/**
 * Stop all backup jobs
 * Call on server shutdown
 */
export function stopBackupJobs(): void {
  console.log("[BACKUP JOB] Stopping all backup jobs...");

  for (const job of cronJobs) {
    try {
      job.stop();
    } catch (err) {
      console.error("[BACKUP JOB] Error stopping job:", err);
    }
  }

  cronJobs = [];
  console.log("[BACKUP JOB] All backup jobs stopped");
}

export default {
  initializeBackupJobs,
  stopBackupJobs,
  dailyBackupJob,
  cloudBackupJob,
  backupStatisticsJob,
  BACKUP_CRON_PATTERNS,
};
