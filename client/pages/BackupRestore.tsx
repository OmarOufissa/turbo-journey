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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Download, CheckCircle, AlertTriangle, HardDrive, RefreshCw, Plus, Github, Database, Package } from "lucide-react";

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
  const [restoring, setRestoring] = useState(false);
  const [restoreDialog, setRestoreDialog] = useState<{ open: boolean; backupId: string | null }>({
    open: false,
    backupId: null,
  });

  // GitHub backups (durable)
  const [githubConfigured, setGithubConfigured] = useState(false);
  const [githubRepo, setGithubRepo] = useState<string | null>(null);
  const [githubBusy, setGithubBusy] = useState<"db" | "full" | null>(null);
  const [githubDbBackups, setGithubDbBackups] = useState<Array<{ backupId: string; url: string }>>([]);
  const [githubFullBackups, setGithubFullBackups] = useState<Array<{ backupId: string; url: string; fileSize: number; createdAt: string }>>([]);
  const [githubRestoreDialog, setGithubRestoreDialog] = useState<{ open: boolean; kind: "db" | "full"; backupId: string | null }>({ open: false, kind: "db", backupId: null });
  const [githubRestoring, setGithubRestoring] = useState(false);
  const [githubConfigOpen, setGithubConfigOpen] = useState(false);
  const [githubRepoInput, setGithubRepoInput] = useState("");
  const [githubTokenInput, setGithubTokenInput] = useState("");
  const [githubSaving, setGithubSaving] = useState(false);

  useEffect(() => {
    fetchBackups();
    checkCloudBackupStatus();
    checkGithubBackupStatus();
  }, []);

  const githubAuthHeader = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  const checkGithubBackupStatus = async () => {
    try {
      const res = await fetch("/api/backups/github/status", { headers: githubAuthHeader() });
      if (!res.ok) return;
      const data = await res.json();
      setGithubConfigured(data.configured);
      setGithubRepo(data.repo);
      if (data.repo) setGithubRepoInput(data.repo);
      if (data.configured) fetchGithubBackups();
    } catch (e) {
      console.error("Error checking GitHub backup status:", e);
    }
  };

  const handleSaveGithubConfig = async () => {
    setGithubSaving(true);
    try {
      const res = await fetch("/api/backups/github/config", {
        method: "POST",
        headers: { ...githubAuthHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ repo: githubRepoInput.trim(), token: githubTokenInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGithubConfigured(data.configured);
        setGithubRepo(data.repo);
        setGithubTokenInput("");
        setGithubConfigOpen(false);
        toast({
          title: "Configuration enregistrée",
          description: data.configured ? "Sauvegarde GitHub prête" : "Repo enregistré — token requis",
        });
        if (data.configured) fetchGithubBackups();
      } else {
        toast({ title: "Erreur", description: data.message || "Échec de l'enregistrement", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Erreur", description: "Impossible de contacter le serveur", variant: "destructive" });
    } finally {
      setGithubSaving(false);
    }
  };

  const fetchGithubBackups = async () => {
    try {
      const res = await fetch("/api/backups/github/list", { headers: githubAuthHeader() });
      if (!res.ok) return;
      const data = await res.json();
      setGithubDbBackups(data.dbBackups || []);
      setGithubFullBackups(data.fullBackups || []);
    } catch (e) {
      console.error("Error fetching GitHub backups:", e);
    }
  };

  const handleGithubBackup = async (kind: "db" | "full") => {
    setGithubBusy(kind);
    try {
      const res = await fetch(`/api/backups/github/${kind}`, { method: "POST", headers: githubAuthHeader() });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: "Sauvegarde GitHub réussie",
          description: kind === "full" ? "Application complète (BD + PDFs) sauvegardée" : "Base de données sauvegardée",
        });
        fetchGithubBackups();
      } else {
        toast({ title: "Échec de la sauvegarde GitHub", description: data.message || "Erreur inconnue", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Erreur", description: "Impossible de contacter le serveur", variant: "destructive" });
    } finally {
      setGithubBusy(null);
    }
  };

  const handleGithubRestore = async () => {
    const { kind, backupId } = githubRestoreDialog;
    if (!backupId) return;
    setGithubRestoring(true);
    try {
      const res = await fetch(`/api/backups/github/restore/${kind}/${encodeURIComponent(backupId)}`, {
        method: "POST",
        headers: githubAuthHeader(),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const r = data.restored || {};
        toast({
          title: "Restauration réussie",
          description: `${r.employees ?? 0} employés${r.pdfs != null ? `, ${r.pdfs} PDFs` : ""} restaurés depuis GitHub`,
        });
        fetchBackups();
      } else {
        toast({ title: "Échec de la restauration", description: data.message || "Erreur inconnue", variant: "destructive" });
      }
    } catch (e) {
      toast({ title: "Erreur", description: "Impossible de contacter le serveur", variant: "destructive" });
    } finally {
      setGithubRestoring(false);
      setGithubRestoreDialog({ open: false, kind: "db", backupId: null });
    }
  };

  const fetchBackups = async () => {
    try {
      setLoading(true);
      const response = await fetch("/api/backups/list", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

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
      const response = await fetch("/api/backups/cloud/status", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

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
      const response = await fetch("/api/backups/cloud/list", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

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
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
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
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
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
      const response = await fetch(`/api/backups/download/${backupId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

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

  const handleRestore = async () => {
    if (!restoreDialog.backupId) return;

    try {
      setRestoring(true);
      const response = await fetch(`/api/backups/${restoreDialog.backupId}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to restore backup");
      }

      toast({
        title: "Success",
        description: "Database restored successfully from backup",
      });

      setRestoreDialog({ open: false, backupId: null });
      await fetchBackups();
    } catch (error) {
      console.error("Error restoring backup:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to restore backup",
        variant: "destructive",
      });
    } finally {
      setRestoring(false);
    }
  };

  const handleVerifyBackup = async (backupId: string) => {
    try {
      setVerifying(backupId);
      const response = await fetch(`/api/backups/${backupId}/verify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
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

        {/* GitHub backups (durable — survives container restarts) */}
        <Card className="p-6 border-2">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-start gap-3">
              <Github className="w-6 h-6 mt-1" />
              <div>
                <h2 className="text-lg font-semibold">Sauvegarde GitHub (durable)</h2>
                <p className="text-sm text-gray-600 mt-1 max-w-xl">
                  Pousse les sauvegardes vers un dépôt GitHub dédié pour préserver
                  l'application même si l'environnement est réinitialisé.
                </p>
                {githubConfigured ? (
                  <p className="text-xs text-green-700 mt-2">
                    Connecté à <span className="font-mono font-semibold">{githubRepo}</span>
                    <button
                      className="ml-2 underline text-gray-500 hover:text-gray-700"
                      onClick={() => setGithubConfigOpen((v) => !v)}
                    >
                      Modifier
                    </button>
                  </p>
                ) : (
                  <div className="text-xs text-amber-700 mt-2 flex items-center gap-1 flex-wrap">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Non configuré.
                    <button
                      className="underline font-medium hover:text-amber-900"
                      onClick={() => setGithubConfigOpen((v) => !v)}
                    >
                      Configurer maintenant
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={() => handleGithubBackup("full")}
                disabled={!githubConfigured || githubBusy !== null}
                className="gap-2"
              >
                <Package className="w-4 h-4" />
                {githubBusy === "full" ? "Sauvegarde..." : "App complète (BD + PDFs)"}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleGithubBackup("db")}
                disabled={!githubConfigured || githubBusy !== null}
                className="gap-2"
              >
                <Database className="w-4 h-4" />
                {githubBusy === "db" ? "Sauvegarde..." : "Base de données"}
              </Button>
            </div>
          </div>

          {/* Config form */}
          {githubConfigOpen && (
            <div className="mt-5 p-4 rounded-lg border bg-muted/40 space-y-3 max-w-xl">
              <div>
                <Label className="text-xs">Dépôt de sauvegarde (owner/repo)</Label>
                <Input
                  value={githubRepoInput}
                  onChange={(e) => setGithubRepoInput(e.target.value)}
                  placeholder="OmarOufissa/turbo-journey-backups"
                  className="mt-1 font-mono text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Token d'accès personnel (PAT)</Label>
                <Input
                  type="password"
                  value={githubTokenInput}
                  onChange={(e) => setGithubTokenInput(e.target.value)}
                  placeholder={githubConfigured ? "•••••••• (laisser vide pour conserver)" : "github_pat_..."}
                  className="mt-1 font-mono text-sm"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  Créez un token « fine-grained » avec la permission <span className="font-medium">Contents: Read and write</span> sur ce dépôt.
                  Le token est stocké localement et n'est jamais réaffiché.
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveGithubConfig} disabled={githubSaving || !githubRepoInput.trim()}>
                  {githubSaving ? "Enregistrement..." : "Enregistrer"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setGithubConfigOpen(false)} disabled={githubSaving}>
                  Annuler
                </Button>
              </div>
            </div>
          )}

          {githubConfigured && (githubFullBackups.length > 0 || githubDbBackups.length > 0) && (
            <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <Package className="w-4 h-4" /> App complète ({githubFullBackups.length})
                </div>
                <div className="space-y-1.5 max-h-48 overflow-auto">
                  {githubFullBackups.map((b) => (
                    <div
                      key={b.backupId}
                      className="flex items-center justify-between gap-2 text-xs p-2 rounded bg-muted"
                    >
                      <a href={b.url} target="_blank" rel="noreferrer" className="font-mono truncate hover:underline flex-1">
                        {b.backupId}
                      </a>
                      <span className="text-gray-500 whitespace-nowrap">{formatBytes(b.fileSize)}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        onClick={() => setGithubRestoreDialog({ open: true, kind: "full", backupId: b.backupId })}
                      >
                        Restaurer
                      </Button>
                    </div>
                  ))}
                  {githubFullBackups.length === 0 && <p className="text-xs text-gray-400">Aucune</p>}
                </div>
              </div>
              <div>
                <div className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <Database className="w-4 h-4" /> Base de données ({githubDbBackups.length})
                </div>
                <div className="space-y-1.5 max-h-48 overflow-auto">
                  {githubDbBackups.map((b) => (
                    <div
                      key={b.backupId}
                      className="flex items-center justify-between gap-2 text-xs p-2 rounded bg-muted"
                    >
                      <a href={b.url} target="_blank" rel="noreferrer" className="font-mono truncate hover:underline flex-1">
                        {b.backupId}
                      </a>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-xs"
                        onClick={() => setGithubRestoreDialog({ open: true, kind: "db", backupId: b.backupId })}
                      >
                        Restaurer
                      </Button>
                    </div>
                  ))}
                  {githubDbBackups.length === 0 && <p className="text-xs text-gray-400">Aucune</p>}
                </div>
              </div>
            </div>
          )}
        </Card>

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
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={restoring}
              onClick={(e) => {
                e.preventDefault();
                handleRestore();
              }}
            >
              {restoring ? "Restoring..." : "Restore"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* GitHub restore confirmation */}
      <AlertDialog
        open={githubRestoreDialog.open}
        onOpenChange={(open) => setGithubRestoreDialog({ ...githubRestoreDialog, open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurer depuis GitHub ?</AlertDialogTitle>
            <AlertDialogDescription>
              {githubRestoreDialog.kind === "full"
                ? "Cela écrasera TOUTES les données actuelles (base de données ET PDFs) avec le contenu de cette sauvegarde GitHub."
                : "Cela écrasera TOUTE la base de données actuelle avec le contenu de cette sauvegarde GitHub."}{" "}
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <AlertDialogCancel disabled={githubRestoring}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleGithubRestore}
              disabled={githubRestoring}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {githubRestoring ? "Restauration..." : "Restaurer"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
