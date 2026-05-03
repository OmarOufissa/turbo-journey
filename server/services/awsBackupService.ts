/**
 * AWS S3 BACKUP SERVICE
 * 
 * Integrates database backups with AWS S3
 * - Upload backups to S3
 * - Download backups from S3
 * - List S3 backups
 * - Delete old S3 backups
 * - Verify S3 backup integrity
 * 
 * Requires AWS credentials:
 * - AWS_REGION
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 * - AWS_BACKUP_BUCKET
 */

import { readFileSync, writeFileSync, unlinkSync } from "fs";
import path from "path";
import { BackupData, BackupMetadata } from "./backupService";

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface S3BackupMetadata {
  backupId: string;
  s3Key: string;
  uploadedAt: Date;
  uploadedBy: string;
  fileSize: number;
  checksum: string;
  metadata: BackupMetadata;
}

export interface S3UploadResult {
  success: boolean;
  backupId: string;
  s3Key: string;
  uploadedAt: Date;
  fileSize: number;
  errors: string[];
}

// ============================================================================
// AWS CLIENT INITIALIZATION
// ============================================================================

let s3Client: any = null;
let isInitialized = false;
const BUCKET_NAME = process.env.AWS_BACKUP_BUCKET;
const AWS_REGION = process.env.AWS_REGION || "us-east-1";
const PREFIX = "database-backups/";

/**
 * Initialize AWS S3 client
 */
async function initializeS3Client(): Promise<boolean> {
  if (isInitialized) {
    return s3Client !== null;
  }

  try {
    // Check for required credentials
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.warn("[AWS BACKUP] AWS credentials not configured. Cloud backups disabled.");
      isInitialized = true;
      return false;
    }

    if (!BUCKET_NAME) {
      console.warn(
        "[AWS BACKUP] AWS_BACKUP_BUCKET not configured. Cloud backups disabled."
      );
      isInitialized = true;
      return false;
    }

    // Dynamically import AWS SDK
    const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = await import("@aws-sdk/client-s3");

    s3Client = new S3Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });

    isInitialized = true;

    console.log(
      `[AWS BACKUP] S3 client initialized. Region: ${AWS_REGION}, Bucket: ${BUCKET_NAME}`
    );

    return true;
  } catch (err) {
    console.error("[AWS BACKUP] Failed to initialize S3 client:", err);
    isInitialized = true;
    return false;
  }
}

// ============================================================================
// S3 OPERATIONS
// ============================================================================

/**
 * Check if S3 is configured and available
 */
export async function isS3Configured(): Promise<boolean> {
  return await initializeS3Client();
} 

/**
 * Upload backup file to S3
 */
export async function uploadBackupToS3(
  localFilePath: string,
  backupId: string,
  fileSize: number,
  metadata: BackupMetadata,
  uploadedBy: string = "system"
): Promise<S3UploadResult> {
  const errors: string[] = [];

  try {
    const isConfigured = await initializeS3Client();

    if (!isConfigured || !s3Client) {
      return {
        success: false,
        backupId,
        s3Key: "",
        uploadedAt: new Date(),
        fileSize,
        errors: ["AWS S3 not configured. Set AWS credentials and AWS_BACKUP_BUCKET."],
      };
    }

    const { PutObjectCommand } = await import("@aws-sdk/client-s3");

    // Read file content
    const fileContent = readFileSync(localFilePath);

    // Generate S3 key
    const s3Key = `${PREFIX}${backupId}.json`;

    console.log(`[AWS BACKUP] Uploading ${backupId} to S3 (${(fileSize / 1024 / 1024).toFixed(2)} MB)...`);

    // Upload to S3
    const uploadCommand = new PutObjectCommand({
      Bucket: BUCKET_NAME!,
      Key: s3Key,
      Body: fileContent,
      ContentType: "application/json",
      Metadata: {
        "backup-id": backupId,
        "uploaded-by": uploadedBy,
        "uploaded-at": new Date().toISOString(),
        "backup-version": metadata.version,
        "employee-count": String(metadata.totalEmployees),
      },
    });

    await s3Client.send(uploadCommand);

    console.log(`[AWS BACKUP] Successfully uploaded ${backupId} to S3`);

    return {
      success: true,
      backupId,
      s3Key,
      uploadedAt: new Date(),
      fileSize,
      errors,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[AWS BACKUP] Failed to upload backup to S3:`, err);
    errors.push(errorMsg);

    return {
      success: false,
      backupId,
      s3Key: "",
      uploadedAt: new Date(),
      fileSize,
      errors,
    };
  }
}

/**
 * Download backup from S3
 */
export async function downloadBackupFromS3(
  backupId: string,
  downloadPath: string
): Promise<{
  success: boolean;
  filePath?: string;
  fileSize?: number;
  errors: string[];
}> {
  const errors: string[] = [];

  try {
    const isConfigured = await initializeS3Client();

    if (!isConfigured || !s3Client) {
      return {
        success: false,
        errors: ["AWS S3 not configured"],
      };
    }

    const { GetObjectCommand } = await import("@aws-sdk/client-s3");

    const s3Key = `${PREFIX}${backupId}.json`;

    console.log(`[AWS BACKUP] Downloading ${backupId} from S3...`);

    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME!,
      Key: s3Key,
    });

    const response = await s3Client.send(getCommand);

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // Write to disk
    writeFileSync(downloadPath, buffer);

    const fileSize = buffer.length;

    console.log(
      `[AWS BACKUP] Successfully downloaded ${backupId} from S3 (${(fileSize / 1024 / 1024).toFixed(2)} MB)`
    );

    return {
      success: true,
      filePath: downloadPath,
      fileSize,
      errors,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[AWS BACKUP] Failed to download backup from S3:`, err);
    errors.push(errorMsg);

    return {
      success: false,
      errors,
    };
  }
}

/**
 * List all backups in S3
 */
export async function listS3Backups(): Promise<{
  backups: Array<{
    backupId: string;
    s3Key: string;
    fileSize: number;
    uploadedAt: Date;
  }>;
  errors: string[];
}> {
  const errors: string[] = [];

  try {
    const isConfigured = await initializeS3Client();

    if (!isConfigured || !s3Client) {
      return {
        backups: [],
        errors: ["AWS S3 not configured"],
      };
    }

    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");

    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME!,
      Prefix: PREFIX,
    });

    const response = await s3Client.send(listCommand);

    const backups = (response.Contents || [])
      .filter((obj) => obj.Key?.endsWith(".json"))
      .map((obj) => {
        const filename = path.basename(obj.Key || "");
        const backupId = filename.replace(".json", "");

        return {
          backupId,
          s3Key: obj.Key || "",
          fileSize: obj.Size || 0,
          uploadedAt: obj.LastModified || new Date(),
        };
      })
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());

    console.log(`[AWS BACKUP] Found ${backups.length} backups in S3`);

    return {
      backups,
      errors,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[AWS BACKUP] Failed to list S3 backups:", err);
    errors.push(errorMsg);

    return {
      backups: [],
      errors,
    };
  }
}

/**
 * Delete backup from S3
 */
export async function deleteS3Backup(backupId: string): Promise<{
  success: boolean;
  deleted: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  try {
    const isConfigured = await initializeS3Client();

    if (!isConfigured || !s3Client) {
      return {
        success: false,
        deleted: false,
        errors: ["AWS S3 not configured"],
      };
    }

    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");

    const s3Key = `${PREFIX}${backupId}.json`;

    console.log(`[AWS BACKUP] Deleting ${backupId} from S3...`);

    const deleteCommand = new DeleteObjectCommand({
      Bucket: BUCKET_NAME!,
      Key: s3Key,
    });

    await s3Client.send(deleteCommand);

    console.log(`[AWS BACKUP] Successfully deleted ${backupId} from S3`);

    return {
      success: true,
      deleted: true,
      errors,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[AWS BACKUP] Failed to delete backup from S3:`, err);
    errors.push(errorMsg);

    return {
      success: false,
      deleted: false,
      errors,
    };
  }
}

/**
 * Clean up old backups from S3 (keep only last N)
 */
export async function cleanupOldS3Backups(keepCount: number = 7): Promise<{
  deletedCount: number;
  remainingCount: number;
  errors: string[];
}> {
  const errors: string[] = [];

  try {
    const listResult = await listS3Backups();

    if (listResult.backups.length <= keepCount) {
      return {
        deletedCount: 0,
        remainingCount: listResult.backups.length,
        errors,
      };
    }

    const toDelete = listResult.backups.slice(keepCount);
    let deletedCount = 0;

    for (const backup of toDelete) {
      const deleteResult = await deleteS3Backup(backup.backupId);
      if (deleteResult.success) {
        deletedCount++;
      } else {
        errors.push(`Failed to delete ${backup.backupId}: ${deleteResult.errors.join(", ")}`);
      }
    }

    console.log(
      `[AWS BACKUP] Cleanup complete: Deleted ${deletedCount}, Remaining ${listResult.backups.length - deletedCount}`
    );

    return {
      deletedCount,
      remainingCount: listResult.backups.length - deletedCount,
      errors,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[AWS BACKUP] Failed to cleanup old S3 backups:", err);
    errors.push(errorMsg);

    return {
      deletedCount: 0,
      remainingCount: 0,
      errors,
    };
  }
}

/**
 * Get S3 backup statistics
 */
export async function getS3BackupStatistics(): Promise<{
  totalBackups: number;
  totalStorageBytes: number;
  oldestBackup: Date | null;
  newestBackup: Date | null;
  averageBackupSize: number;
  errors: string[];
}> {
  try {
    const listResult = await listS3Backups();

    if (listResult.backups.length === 0) {
      return {
        totalBackups: 0,
        totalStorageBytes: 0,
        oldestBackup: null,
        newestBackup: null,
        averageBackupSize: 0,
        errors: listResult.errors,
      };
    }

    const totalStorageBytes = listResult.backups.reduce((sum, b) => sum + b.fileSize, 0);
    const averageBackupSize = Math.round(totalStorageBytes / listResult.backups.length);

    return {
      totalBackups: listResult.backups.length,
      totalStorageBytes,
      oldestBackup: listResult.backups[listResult.backups.length - 1].uploadedAt,
      newestBackup: listResult.backups[0].uploadedAt,
      averageBackupSize,
      errors: listResult.errors,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[AWS BACKUP] Error getting S3 backup statistics:", err);
    return {
      totalBackups: 0,
      totalStorageBytes: 0,
      oldestBackup: null,
      newestBackup: null,
      averageBackupSize: 0,
      errors: [errorMsg],
    };
  }
}

export default {
  isS3Configured,
  uploadBackupToS3,
  downloadBackupFromS3,
  listS3Backups,
  deleteS3Backup,
  cleanupOldS3Backups,
  getS3BackupStatistics,
};
