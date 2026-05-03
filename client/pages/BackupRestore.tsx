/**
 * PHASE 4: BACKUP & RESTORE PAGE
 * 
 * Manage database backups
 * - View available backups
 * - Create new backups
 * - Download backups
 * - Verify backup integrity
 * - Restore from backup
 */

import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { format, formatDistanceToNow } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Download, CheckCircle, AlertTriangle, HardDrive, RefreshCw, Plus } from "lucide-react";

interface Backup {
  backupId: string;
  filename: string;
  filePath: string;
  fileSize: number;
  createdAt: string;
}

interface CloudBackup {
  backupId: string;
  s3Key: string;
  fileSize: number;
  uploadedAt: string;
}

interface BackupStats {
  totalBackups: number;
  totalStorageBytes: number;
  oldestBackup: string | null;
  newestBackup: string | null;
  averageBackupSize: number;
}

export default function BackupRestore() {
  const { toast } = useToast();
  const [backups, setBackups] = useState<Backup[]>([]);
  const [cloudBackups, setCloudBackups] = useState<CloudBackup[]>([]);
  const [stats, setStats] = useState<BackupStats | null>(null);
  const [cloudStats, setCloudStats] = useState<BackupStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [cloudConfigured, setCloudConfigured] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [restoreDialog, setRestoreDialog] = useState<{ open: boolean; backupId: string | null }>({
    open: false,
    backupId: null,
  });

  useEffect(() => {
    fetchBackups();
    checkCloudBackupStatus();
  }, []);

  const fetchBackups = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/backups/list");

      if (!response.ok) {
        throw new Error("Failed to fetch backups");
      }

      const data = await response.json();
      setBackups(data.backups || []);
      setStats(data.statistics || null);
    } catch (error) {
      console.error("Error fetching backups:", error);
      toast({
        title: "Error",
        description: "Failed to load backups",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const checkCloudBackupStatus = async () => {
    try {
      const response = await fetch("/api/backups/cloud/status");

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      setCloudConfigured(data.configured);

      if (data.configured) {
        fetchCloudBackups();
      }
    } catch (error) {
      console.error("Error checking cloud backup status:", error);
    }
  };

  const fetchCloudBackups = async () => {
    try {
      const response = await fetch("/api/backups/cloud/list");

      if (!response.ok) {
        throw new Error("Failed to fetch cloud backups");
      }

      const data = await response.json();
      setCloudBackups(data.backups || []);
      setCloudStats(data.statistics || null);
    } catch (error) {
      console.error("Error fetching cloud backups:", error);
      toast({
        title: "Error",
        description: "Failed to load cloud backups",
        variant: "destructive",
      });
    }
  };

  const handleUploadToCloud = async (backupId: string) => {
    try {
      setUploading(backupId);
      const response = await fetch(`/api/backups/cloud/upload/${backupId}`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to upload backup to cloud");
      }

      const data = await response.json();

      toast({
        title: "Success",
        description: `Backup uploaded to S3: ${data.s3Key}`,
      });

      await fetchCloudBackups();
    } catch (error) {
      console.error("Error uploading backup to cloud:", error);
      toast({
        title: "Error",
        description: "Failed to upload backup to cloud",
        variant: "destructive",
      });
    } finally {
      setUploading(null);
    }
  };

  const handleCreateBackup = async () => {
    try {
      setCreating(true);
      const response = await fetch("/api/backups/create", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to create backup");
      }

      const data = await response.json();

      toast({
        title: "Success",
        description: `Backup created: ${data.backupId}`,
      });

      await fetchBackups();
    } catch (error) {
      console.error("Error creating backup:", error);
      toast({
        title: "Error",
        description: "Failed to create backup",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleDownloadBackup = async (backupId: string) => {
    try {
      const response = await fetch(`/api/backups/${backupId}`);

      if (!response.ok) {
        throw new Error("Failed to download backup");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${backupId}.json`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: "Success",
        description: "Backup downloaded",
      });
    } catch (error) {
      console.error("Error downloading backup:", error);
      toast({
        title: "Error",
        description: "Failed to download backup",
        variant: "destructive",
      });
    }
  };

  const handleVerifyBackup = async (backupId: string) => {
    try {
      setVerifying(backupId);
      const response = await fetch(`/api/backups/${backupId}/verify`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to verify backup");
      }

      const data = await response.json();

      if (data.isValid) {
        toast({
          title: "Success",
          description: "Backup is valid",
        });
      } else {
        toast({
          title: "Warning",
          description: `Backup has issues: ${data.errors.join(", ")}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error verifying backup:", error);
      toast({
        title: "Error",
        description: "Failed to verify backup",
        variant: "destructive",
      });
    } finally {
      setVerifying(null);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex justify-center items-center min-h-screen">
          <LoadingSpinner />
        </div>
      </Layout>
    );
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <Layout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Database Backups</h1>
            <p className="text-gray-600 mt-2">
              Manage and restore database backups for disaster recovery
            </p>
          </div>
          <Button onClick={handleCreateBackup} disabled={creating} className="gap-2">
            <Plus className="w-4 h-4" />
            {creating ? "Creating..." : "Create Backup"}
          </Button>
        </div>

        {/* Statistics */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-blue-600" />
                <div>
                  <div className="text-sm text-gray-600">Total Backups</div>
                  <div className="text-2xl font-bold">{stats.totalBackups}</div>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div>
                <div className="text-sm text-gray-600">Total Storage</div>
                <div className="text-2xl font-bold">{formatBytes(stats.totalStorageBytes)}</div>
              </div>
            </Card>

            <Card className="p-4">
              <div>
                <div className="text-sm text-gray-600">Average Size</div>
                <div className="text-2xl font-bold">{formatBytes(stats.averageBackupSize)}</div>
              </div>
            </Card>

            <Card className="p-4">
              <div>
                <div className="text-sm text-gray-600">Latest Backup</div>
                <div className="text-lg font-bold">
                  {stats.newestBackup
                    ? formatDistanceToNow(new Date(stats.newestBackup), { addSuffix: true })
                    : "Never"}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Backups List */}
        {backups.length === 0 ? (
          <EmptyState
            title="No backups"
            description="No backups have been created yet. Create your first backup to get started."
          />
        ) : (
          <div className="space-y-4">
            {backups.map((backup) => (
              <Card key={backup.backupId} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-lg">{backup.backupId}</h3>
                      <Badge variant="outline">
                        {formatBytes(backup.fileSize)}
                      </Badge>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>
                        Created:{" "}
                        <span className="font-mono">
                          {format(new Date(backup.createdAt), "PPp")}
                        </span>
                      </p>
                      <p>
                        {formatDistanceToNow(new Date(backup.createdAt), {
                          addSuffix: true,
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => handleVerifyBackup(backup.backupId)}
                      disabled={verifying === backup.backupId}
                      variant="outline"
                      size="sm"
                    >
                      {verifying === backup.backupId ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle className="w-4 h-4" />
                      )}
                      Verify
                    </Button>

                    <Button
                      onClick={() => handleDownloadBackup(backup.backupId)}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </Button>

                    <Button
                      onClick={() =>
                        setRestoreDialog({ open: true, backupId: backup.backupId })
                      }
                      variant="default"
                      size="sm"
                    >
                      Restore
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Cloud Backups Section */}
        {cloudConfigured && (
          <div className="space-y-4 mt-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
                  AWS S3 Cloud Backups
                </h2>
                <p className="text-gray-600 mt-2">
                  Backups stored in AWS S3 for off-site disaster recovery
                </p>
              </div>
            </div>

            {/* Cloud Statistics */}
            {cloudStats && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-4 bg-blue-50">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-5 h-5 text-blue-600" />
                    <div>
                      <div className="text-sm text-gray-600">Cloud Backups</div>
                      <div className="text-2xl font-bold">{cloudStats.totalBackups}</div>
                    </div>
                  </div>
                </Card>

                <Card className="p-4 bg-blue-50">
                  <div>
                    <div className="text-sm text-gray-600">Cloud Storage</div>
                    <div className="text-2xl font-bold">{formatBytes(cloudStats.totalStorageBytes)}</div>
                  </div>
                </Card>

                <Card className="p-4 bg-blue-50">
                  <div>
                    <div className="text-sm text-gray-600">Avg. Size</div>
                    <div className="text-2xl font-bold">{formatBytes(cloudStats.averageBackupSize)}</div>
                  </div>
                </Card>

                <Card className="p-4 bg-blue-50">
                  <div>
                    <div className="text-sm text-gray-600">Latest Upload</div>
                    <div className="text-lg font-bold">
                      {cloudStats.newestBackup
                        ? formatDistanceToNow(new Date(cloudStats.newestBackup), { addSuffix: true })
                        : "Never"}
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* Cloud Backups List */}
            {cloudBackups.length === 0 ? (
              <Card className="p-6 text-center text-gray-600">
                <p>No backups in S3 yet. Upload a backup to get started.</p>
              </Card>
            ) : (
              <div className="space-y-4">
                {cloudBackups.map((backup) => (
                  <Card key={backup.backupId} className="p-4 border-blue-200">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-lg text-blue-900">{backup.backupId}</h3>
                          <Badge variant="outline" className="bg-blue-100">
                            {formatBytes(backup.fileSize)}
                          </Badge>
                          <Badge variant="secondary" className="bg-green-100 text-green-900">
                            ☁️ S3
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <p>
                            Uploaded:{" "}
                            <span className="font-mono">
                              {format(new Date(backup.uploadedAt), "PPp")}
                            </span>
                          </p>
                          <p>
                            {formatDistanceToNow(new Date(backup.uploadedAt), {
                              addSuffix: true,
                            })}
                          </p>
                          <p className="text-xs text-gray-500 mt-2 break-all">
                            S3 Key: {backup.s3Key}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          onClick={() => {
                            window.location.href = `/api/backups/cloud/download/${backup.backupId}`;
                          }}
                          variant="outline"
                          size="sm"
                          className="gap-2"
                        >
                          <Download className="w-4 h-4" />
                          Download
                        </Button>

                        <Button
                          onClick={() =>
                            setRestoreDialog({ open: true, backupId: backup.backupId })
                          }
                          variant="default"
                          size="sm"
                        >
                          Restore
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Upload to Cloud Info */}
            {backups.length > 0 && (
              <Card className="p-4 bg-blue-50 border-blue-200">
                <h3 className="font-semibold text-blue-900 mb-3">Upload to Cloud</h3>
                <p className="text-sm text-blue-800 mb-3">
                  Click "Upload to S3" on any local backup to store it in AWS S3 for off-site protection.
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {backups.map((backup) => (
                    <div key={backup.backupId} className="flex items-center justify-between p-2 bg-white rounded border border-blue-100">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{backup.backupId}</p>
                        <p className="text-xs text-gray-600">{formatBytes(backup.fileSize)}</p>
                      </div>
                      <Button
                        onClick={() => handleUploadToCloud(backup.backupId)}
                        disabled={uploading === backup.backupId}
                        variant="outline"
                        size="sm"
                        className="ml-2 whitespace-nowrap"
                      >
                        {uploading === backup.backupId ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                            Uploading...
                          </>
                        ) : (
                          "Upload to S3"
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Cloud Backup Not Configured */}
        {!cloudConfigured && (
          <Card className="p-6 bg-amber-50 border border-amber-200">
            <div className="flex gap-4">
              <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-900">AWS S3 Not Configured</h3>
                <p className="text-sm text-amber-800 mt-2">
                  To enable cloud backups, configure your AWS credentials:
                </p>
                <ul className="text-xs text-amber-800 mt-2 ml-4 list-disc space-y-1">
                  <li>Set AWS_REGION environment variable</li>
                  <li>Set AWS_ACCESS_KEY_ID environment variable</li>
                  <li>Set AWS_SECRET_ACCESS_KEY environment variable</li>
                  <li>Set AWS_BACKUP_BUCKET environment variable</li>
                </ul>
                <p className="text-xs text-amber-700 mt-3">
                  After configuring credentials, restart the application.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Warning */}
        <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-900">Important</h3>
              <p className="text-sm text-yellow-800 mt-1">
                Restoring a backup will overwrite all current data. Make sure you have a recent
                backup before performing a restore operation.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={restoreDialog.open} onOpenChange={(open) =>
        setRestoreDialog({ ...restoreDialog, open })
      }>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore from Backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will overwrite all current data with the data from the backup. This
              cannot be undone. Make sure you have a current backup before proceeding.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="bg-red-50 p-3 rounded border border-red-200 my-4">
            <p className="text-sm text-red-900 font-semibold">
              ⚠️ This is a destructive operation. Proceed with caution.
            </p>
          </div>
          <div className="flex gap-2">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700">
              Restore
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
