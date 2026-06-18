/**
 * BACKUP API ROUTES
 *
 * Endpoints for managing database backups
 * - Local filesystem backups
 * - AWS S3 cloud backups
 */

import { RequestHandler } from "express";
import {
  exportAllData,
  createBackupFile,
  verifyBackup,
  restoreFromBackup,
  listBackups,
  cleanupOldBackups,
  getBackupStatistics,
} from "../services/backupService";
import {
  isS3Configured,
  uploadBackupToS3,
  downloadBackupFromS3,
  listS3Backups,
  deleteS3Backup,
  cleanupOldS3Backups,
  getS3BackupStatistics,
} from "../services/awsBackupService";
import { logAuditActionSafe } from "../services/auditService";
import fs from "fs";
import path from "path";

// ============================================================================
// BACKUP MANAGEMENT
// ============================================================================

/**
 * POST /api/backups/create
 * Create a new backup immediately
 */
export const createBackup_Handler: RequestHandler = async (_req, res) => {
  try {
    const result = await createBackupFile();

    // Log to audit trail
    await logAuditActionSafe(
      1,
      "EXPORT_EMPLOYEES",
        null,
        null,
        {
        action: "Manual backup created",
        backupId: result.backupId,
        fileSize: result.fileSize,
        metadata: result.metadata,
      }
    );

    res.json({
      message: "Backup created successfully",
      ...result,
    });
  } catch (err) {
    console.error("Error creating backup:", err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: `Error creating backup: ${errorMsg}` });
  }
};

/**
 * GET /api/backups/list
 * List all available backups
 */
export const listBackups_Handler: RequestHandler = async (_req, res) => {
  try {
    const backups = listBackups();
    const stats = getBackupStatistics();

    res.json({
      backups,
      statistics: stats,
    });
  } catch (err) {
    console.error("Error listing backups:", err);
    res.status(500).json({ message: "Error listing backups" });
  }
};

/**
 * GET /api/backups/:backupId
 * Download a specific backup file
 */
export const downloadBackup_Handler: RequestHandler = async (req, res) => {
  try {
    const { backupId } = req.params;
    const backups = listBackups();

    const backup = backups.find((b) => b.backupId === backupId);
    if (!backup) {
      return res.status(404).json({ message: "Backup not found" });
    }

    res.download(backup.filePath, `${backupId}.json`);
  } catch (err) {
    console.error("Error downloading backup:", err);
    res.status(500).json({ message: "Error downloading backup" });
  }
};

/**
 * POST /api/backups/:backupId/verify
 * Verify integrity of a backup
 */
export const verifyBackup_Handler: RequestHandler = async (req, res) => {
  try {
    const { backupId } = req.params;
    const backups = listBackups();

    const backup = backups.find((b) => b.backupId === backupId);
    if (!backup) {
      return res.status(404).json({ message: "Backup not found" });
    }

    const result = await verifyBackup(backup.filePath);

    res.json({
      backupId,
      ...result,
    });
  } catch (err) {
    console.error("Error verifying backup:", err);
    res.status(500).json({ message: "Error verifying backup" });
  }
};

/**
 * POST /api/backups/:backupId/restore
 * Restore the database from a backup, overwriting all current data
 */
export const restoreBackup_Handler: RequestHandler = async (req, res) => {
  try {
    const { backupId } = req.params;
    const backups = listBackups();

    const backup = backups.find((b) => b.backupId === backupId);
    if (!backup) {
      return res.status(404).json({ message: "Backup not found" });
    }

    const verification = await verifyBackup(backup.filePath);
    if (!verification.isValid) {
      return res.status(400).json({
        message: "Backup is invalid or corrupted, restore aborted",
        errors: verification.errors,
      });
    }

    const result = await restoreFromBackup(backup.filePath);

    // Log to audit trail
    await logAuditActionSafe(
      1,
      "RESTORE_DATABASE",
      null,
      null,
      {
        action: "Database restored from backup",
        backupId,
        ...result,
      }
    );

    res.json({
      message: "Database restored successfully",
      backupId,
      ...result,
    });
  } catch (err) {
    console.error("Error restoring backup:", err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: `Error restoring backup: ${errorMsg}` });
  }
};

/**
 * GET /api/backups/statistics
 * Get backup statistics
 */
export const getBackupStatistics_Handler: RequestHandler = async (_req, res) => {
  try {
    const stats = getBackupStatistics();
    res.json(stats);
  } catch (err) {
    console.error("Error getting backup statistics:", err);
    res.status(500).json({ message: "Error getting backup statistics" });
  }
};

/**
 * POST /api/backups/cleanup
 * Delete old backups (keep only last N)
 */
export const cleanupBackups_Handler: RequestHandler = async (req, res) => {
  try {
    const { keepCount = 7 } = req.body;

    if (keepCount < 1 || keepCount > 100) {
      return res.status(400).json({
        message: "keepCount must be between 1 and 100",
      });
    }

    const result = cleanupOldBackups(keepCount);

    // Log to audit trail
    await logAuditActionSafe(
      1,
      "EXPORT_EMPLOYEES",
        null,
        null,
        {
        action: "Backup cleanup performed",
        deletedCount: result.deletedCount,
        remainingCount: result.remainingCount,
      }
    );

    res.json({
      message: "Backup cleanup completed",
      ...result,
    });
  } catch (err) {
    console.error("Error cleaning up backups:", err);
    res.status(500).json({ message: "Error cleaning up backups" });
  }
};

// ============================================================================
// CLOUD BACKUP OPERATIONS (AWS S3)
// ============================================================================

/**
 * GET /api/backups/cloud/status
 * Check if AWS S3 is configured
 */
export const getCloudBackupStatus_Handler: RequestHandler = async (_req, res) => {
  try {
    const isConfigured = await isS3Configured();

    res.json({
      configured: isConfigured,
      message: isConfigured
        ? "AWS S3 is configured"
        : "AWS S3 is not configured. Set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_BACKUP_BUCKET environment variables.",
    });
  } catch (err) {
    console.error("Error checking cloud backup status:", err);
    res.status(500).json({ message: "Error checking cloud backup status" });
  }
};

/**
 * POST /api/backups/cloud/upload/:backupId
 * Upload a local backup to AWS S3
 */
export const uploadToCloud_Handler: RequestHandler = async (req, res) => {
  try {
    const { backupId } = req.params;

    // Check if S3 is configured
    const isConfigured = await isS3Configured();
    if (!isConfigured) {
      return res.status(400).json({
        message:
          "AWS S3 not configured. Set AWS credentials in environment variables.",
      });
    }

    // Find local backup
    const backups = listBackups();
    const backup = backups.find((b) => b.backupId === backupId);

    if (!backup) {
      return res.status(404).json({ message: "Local backup not found" });
    }

    // Read backup file to get metadata
    const backupContent = fs.readFileSync(backup.filePath, "utf-8");
    const backupData = JSON.parse(backupContent);

    // Upload to S3
    const uploadResult = await uploadBackupToS3(
      backup.filePath,
      backupId,
      backup.fileSize,
      backupData.metadata,
      "manual"
    );

    if (!uploadResult.success) {
      return res.status(500).json({
        message: "Failed to upload backup to S3",
        errors: uploadResult.errors,
      });
    }

    // Log to audit trail
    await logAuditActionSafe(
      1,
      "EXPORT_EMPLOYEES",
        null,
        null,
        {
        action: "Backup uploaded to AWS S3",
        backupId,
        s3Key: uploadResult.s3Key,
        fileSize: uploadResult.fileSize,
      }
    );

    res.json({
      message: "Backup uploaded to S3 successfully",
      ...uploadResult,
    });
  } catch (err) {
    console.error("Error uploading backup to cloud:", err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: `Error uploading backup: ${errorMsg}` });
  }
};

/**
 * GET /api/backups/cloud/list
 * List all backups in AWS S3
 */
export const listCloudBackups_Handler: RequestHandler = async (_req, res) => {
  try {
    const isConfigured = await isS3Configured();

    if (!isConfigured) {
      return res.json({
        configured: false,
        backups: [],
        statistics: null,
        message: "AWS S3 not configured",
      });
    }

    const listResult = await listS3Backups();
    const stats = await getS3BackupStatistics();

    res.json({
      configured: true,
      backups: listResult.backups,
      statistics: {
        totalBackups: stats.totalBackups,
        totalStorageBytes: stats.totalStorageBytes,
        oldestBackup: stats.oldestBackup,
        newestBackup: stats.newestBackup,
        averageBackupSize: stats.averageBackupSize,
      },
      errors: listResult.errors.length > 0 ? listResult.errors : undefined,
    });
  } catch (err) {
    console.error("Error listing cloud backups:", err);
    res.status(500).json({ message: "Error listing cloud backups" });
  }
};

/**
 * GET /api/backups/cloud/download/:backupId
 * Download a backup from AWS S3
 */
export const downloadFromCloud_Handler: RequestHandler = async (req, res) => {
  try {
    const { backupId } = req.params;

    // Create temporary download path
    const tempDir = path.join(process.cwd(), "backups", "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const downloadPath = path.join(tempDir, `${backupId}.json`);

    // Download from S3
    const downloadResult = await downloadBackupFromS3(backupId, downloadPath);

    if (!downloadResult.success) {
      return res.status(500).json({
        message: "Failed to download backup from S3",
        errors: downloadResult.errors,
      });
    }

    // Log to audit trail
    await logAuditActionSafe(
      1,
      "EXPORT_EMPLOYEES",
        null,
        null,
        {
        action: "Backup downloaded from AWS S3",
        backupId,
        fileSize: downloadResult.fileSize,
      }
    );

    // Send file for download
    res.download(downloadPath, `${backupId}.json`, () => {
      // Clean up temporary file after sending
      try {
        fs.unlinkSync(downloadPath);
      } catch (err) {
        console.error("Error cleaning up temp file:", err);
      }
    });
  } catch (err) {
    console.error("Error downloading backup from cloud:", err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: `Error downloading backup: ${errorMsg}` });
  }
};

/**
 * DELETE /api/backups/cloud/:backupId
 * Delete a backup from AWS S3
 */
export const deleteCloudBackup_Handler: RequestHandler = async (req, res) => {
  try {
    const { backupId } = req.params;

    const isConfigured = await isS3Configured();
    if (!isConfigured) {
      return res.status(400).json({
        message: "AWS S3 not configured",
      });
    }

    const deleteResult = await deleteS3Backup(backupId);

    if (!deleteResult.success) {
      return res.status(500).json({
        message: "Failed to delete backup from S3",
        errors: deleteResult.errors,
      });
    }

    // Log to audit trail
    await logAuditActionSafe(
      1,
      "EXPORT_EMPLOYEES",
        null,
        null,
        {
        action: "Backup deleted from AWS S3",
        backupId,
      }
    );

    res.json({
      message: "Backup deleted from S3 successfully",
      backupId,
      deleted: true,
    });
  } catch (err) {
    console.error("Error deleting cloud backup:", err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: `Error deleting backup: ${errorMsg}` });
  }
};

/**
 * POST /api/backups/cloud/cleanup
 * Delete old backups from AWS S3 (keep only last N)
 */
export const cleanupCloudBackups_Handler: RequestHandler = async (req, res) => {
  try {
    const { keepCount = 7 } = req.body;

    if (keepCount < 1 || keepCount > 100) {
      return res.status(400).json({
        message: "keepCount must be between 1 and 100",
      });
    }

    const isConfigured = await isS3Configured();
    if (!isConfigured) {
      return res.status(400).json({
        message: "AWS S3 not configured",
      });
    }

    const cleanupResult = await cleanupOldS3Backups(keepCount);

    // Log to audit trail
    await logAuditActionSafe(
      1,
      "EXPORT_EMPLOYEES",
        null,
        null,
        {
        action: "Cloud backup cleanup performed",
        deletedCount: cleanupResult.deletedCount,
        remainingCount: cleanupResult.remainingCount,
      }
    );

    res.json({
      message: "Cloud backup cleanup completed",
      ...cleanupResult,
    });
  } catch (err) {
    console.error("Error cleaning up cloud backups:", err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: `Error cleaning up backups: ${errorMsg}` });
  }
};

// ============================================================================
// GITHUB BACKUPS (durable — survives ephemeral environments)
// ============================================================================

export const getGitHubBackupStatus_Handler: RequestHandler = async (_req, res) => {
  const { isGitHubBackupConfigured } = await import("../services/githubBackupService");
  res.json({ configured: isGitHubBackupConfigured(), repo: process.env.GITHUB_BACKUP_REPO ?? null });
};

export const githubBackupDb_Handler: RequestHandler = async (_req, res) => {
  try {
    const { pushDbBackupToGitHub } = await import("../services/githubBackupService");
    const result = await pushDbBackupToGitHub("admin");
    if (!result.success) {
      return res.status(result.errors[0]?.includes("non configurée") ? 400 : 502).json({ message: result.errors.join("; "), ...result });
    }
    await logAuditActionSafe(1, "EXPORT_EMPLOYEES", null, null, { action: "GitHub DB backup", backupId: result.backupId });
    res.json({ message: "Sauvegarde BD poussée sur GitHub", ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: `Erreur sauvegarde GitHub: ${msg}` });
  }
};

export const githubBackupFull_Handler: RequestHandler = async (_req, res) => {
  try {
    const { pushFullBackupToGitHub } = await import("../services/githubBackupService");
    const result = await pushFullBackupToGitHub("admin");
    if (!result.success) {
      return res.status(result.errors[0]?.includes("non configurée") ? 400 : 502).json({ message: result.errors.join("; "), ...result });
    }
    await logAuditActionSafe(1, "EXPORT_EMPLOYEES", null, null, { action: "GitHub full backup", backupId: result.backupId, fileSize: result.fileSize });
    res.json({ message: "Sauvegarde complète poussée sur GitHub", ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: `Erreur sauvegarde GitHub: ${msg}` });
  }
};

export const listGitHubBackups_Handler: RequestHandler = async (_req, res) => {
  try {
    const { listGitHubBackups } = await import("../services/githubBackupService");
    const result = await listGitHubBackups();
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ message: `Erreur liste GitHub: ${msg}` });
  }
};

export default {
  createBackup_Handler,
  listBackups_Handler,
  downloadBackup_Handler,
  verifyBackup_Handler,
  restoreBackup_Handler,
  getBackupStatistics_Handler,
  cleanupBackups_Handler,
  getCloudBackupStatus_Handler,
  uploadToCloud_Handler,
  listCloudBackups_Handler,
  downloadFromCloud_Handler,
  deleteCloudBackup_Handler,
  cleanupCloudBackups_Handler,
  getGitHubBackupStatus_Handler,
  githubBackupDb_Handler,
  githubBackupFull_Handler,
  listGitHubBackups_Handler,
};
