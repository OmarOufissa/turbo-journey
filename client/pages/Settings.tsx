import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Settings as SettingsIcon,
  Bell,
  Database,
  User,
  FileText,
  Clock,
  Palette,
  Server,
  Shield,
  Download,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  UserPlus,
  RefreshCw,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";

const SETTINGS_KEY = "app_settings_v2";

interface AppSettings {
  thresholds: { expired: number; critical: number; warning: number; notice: number };
  notifications: { enabled: boolean; soundEnabled: boolean };
  pdf: { includeQrCode: boolean; defaultFonction: string; directionLabel: string };
  backup: { autoBackup: boolean; keepCount: number };
  import: { defaultMode: "A" | "B" };
}

const DEFAULT_SETTINGS: AppSettings = {
  thresholds: { expired: 0, critical: 90, warning: 180, notice: 270 },
  notifications: { enabled: true, soundEnabled: false },
  pdf: { includeQrCode: false, defaultFonction: "Électricien", directionLabel: "Direction Générale" },
  backup: { autoBackup: true, keepCount: 30 },
  import: { defaultMode: "A" },
};

function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: AppSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export default function Settings() {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [healthReport, setHealthReport] = useState<any>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [resyncLoading, setResyncLoading] = useState(false);
  const [resyncResult, setResyncResult] = useState<{ updated: number; skipped: number } | null>(null);
  const [syncNewLoading, setSyncNewLoading] = useState(false);
  const [syncNewResult, setSyncNewResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const [reseedConfirm, setReseedConfirm] = useState(false);
  const [reseedLoading, setReseedLoading] = useState(false);
  const [appVersion, setAppVersion] = useState<string>("—");

  // Load app version from package.json via server
  useEffect(() => {
    fetch("/api/ping")
      .then((r) => r.json())
      .then((d) => { if (d.version) setAppVersion(d.version); })
      .catch(() => {});
  }, []);

  function patch(partial: Partial<AppSettings>) {
    setSettings((prev) => ({ ...prev, ...partial }));
  }

  function handleSave() {
    saveSettings(settings);
    toast({ title: "Paramètres sauvegardés", description: "Vos préférences ont été mises à jour" });
  }

  async function handleHealthCheck() {
    setHealthLoading(true);
    try {
      const res = await fetch("/api/health", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` },
      });
      const json = await res.json();
      setHealthReport(json.data);
    } catch {
      toast({ title: "Erreur", description: "Impossible d'exécuter les vérifications", variant: "destructive" });
    } finally {
      setHealthLoading(false);
    }
  }

  async function handleResyncNames() {
    setResyncLoading(true);
    setResyncResult(null);
    try {
      const res = await fetch("/api/resync-names", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` },
      });
      const json = await res.json();
      if (json.success) {
        setResyncResult(json.data);
        toast({ title: "Noms synchronisés", description: `${json.data.updated} employés mis à jour` });
      } else {
        throw new Error(json.error ?? "Erreur");
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setResyncLoading(false);
    }
  }

  async function handleSyncNewEmployees() {
    setSyncNewLoading(true);
    setSyncNewResult(null);
    try {
      const res = await fetch("/api/sync-new-employees", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` },
      });
      const json = await res.json();
      if (json.success) {
        setSyncNewResult(json.data);
        toast({ title: "Synchronisation terminée", description: `${json.data.created} nouveau(x) employé(s) ajouté(s)` });
      } else {
        throw new Error(json.error ?? "Erreur");
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setSyncNewLoading(false);
    }
  }

  async function handleReseed() {
    setReseedLoading(true);
    try {
      const res = await fetch("/api/admin/reseed", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` },
      });
      const json = await res.json();
      if (json.success) {
        toast({ title: "Base réinitialisée", description: "Toutes les données ont été rechargées depuis le fichier Excel." });
      } else {
        throw new Error(json.error ?? "Erreur");
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setReseedLoading(false);
    }
  }

  async function handleCreateBackup() {
    setBackupLoading(true);
    try {
      const res = await fetch("/api/backups/create", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token") ?? ""}` },
      });
      const json = await res.json();
      if (json.success) {
        toast({ title: "Sauvegarde créée", description: `Fichier: ${json.data?.filename ?? "backup.zip"}` });
      } else {
        throw new Error(json.error ?? "Erreur");
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setBackupLoading(false);
    }
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in max-w-4xl">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <SettingsIcon className="w-8 h-8" />
            Paramètres
          </h1>
          <p className="text-muted-foreground mt-1">Configuration de l'application</p>
        </div>

        {/* ── Expiration Thresholds ─────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Seuils d'expiration (jours)
            </CardTitle>
            <CardDescription>
              Définit à combien de jours avant expiration chaque niveau d'alerte s'active.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {(
                [
                  { key: "critical", label: "Critique (rouge)", desc: "≤ N jours" },
                  { key: "warning", label: "Avertissement (orange)", desc: "≤ N jours" },
                  { key: "notice", label: "Notice (jaune)", desc: "≤ N jours" },
                ] as const
              ).map(({ key, label, desc }) => (
                <div key={key} className="space-y-1">
                  <Label>{label}</Label>
                  <Input
                    type="number"
                    min={1}
                    max={999}
                    value={settings.thresholds[key]}
                    onChange={(e) =>
                      patch({ thresholds: { ...settings.thresholds, [key]: parseInt(e.target.value, 10) || 0 } })
                    }
                  />
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Theme ─────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="w-5 h-5" />
              Apparence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              {(["light", "dark", "system"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    theme === t
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-muted"
                  }`}
                >
                  {t === "light" ? "Clair" : t === "dark" ? "Sombre" : "Système"}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* ── Notifications ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Activer les notifications</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Alertes d'expiration dans le panneau</p>
              </div>
              <Switch
                checked={settings.notifications.enabled}
                onCheckedChange={(v) => patch({ notifications: { ...settings.notifications, enabled: v } })}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── PDF Settings ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Paramètres PDF
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Fonction par défaut</Label>
              <Input
                value={settings.pdf.defaultFonction}
                onChange={(e) => patch({ pdf: { ...settings.pdf, defaultFonction: e.target.value } })}
                placeholder="Électricien"
              />
            </div>
            <div className="space-y-1">
              <Label>Direction (en-tête PDF)</Label>
              <Input
                value={settings.pdf.directionLabel}
                onChange={(e) => patch({ pdf: { ...settings.pdf, directionLabel: e.target.value } })}
                placeholder="Direction Générale"
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Backup Settings ───────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Sauvegardes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Sauvegarde automatique</Label>
                <p className="text-xs text-muted-foreground mt-0.5">Créer une sauvegarde quotidiennement</p>
              </div>
              <Switch
                checked={settings.backup.autoBackup}
                onCheckedChange={(v) => patch({ backup: { ...settings.backup, autoBackup: v } })}
              />
            </div>
            <div className="space-y-1">
              <Label>Nombre de sauvegardes à conserver</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={settings.backup.keepCount}
                onChange={(e) => patch({ backup: { ...settings.backup, keepCount: parseInt(e.target.value, 10) || 30 } })}
                className="w-32"
              />
            </div>
            <Button
              variant="outline"
              onClick={handleCreateBackup}
              disabled={backupLoading}
              className="gap-2"
            >
              {backupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Créer une sauvegarde maintenant
            </Button>
          </CardContent>
        </Card>

        {/* ── Import Defaults ───────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Import par défaut
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Mode d'import par défaut</Label>
              <div className="flex gap-3">
                {(["A", "B"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => patch({ import: { defaultMode: m } })}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                      settings.import.defaultMode === m
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    Mode {m}
                    {m === "A" ? " — Tout ou rien" : " — Ignorer les erreurs"}
                  </button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Resync Names ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Corriger les noms des employés
            </CardTitle>
            <CardDescription>
              Resynchronise les noms et prénoms depuis le fichier Excel source. À utiliser si des noms sont tronqués ou incorrects.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              onClick={handleResyncNames}
              disabled={resyncLoading}
              className="gap-2"
            >
              {resyncLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {resyncLoading ? "Synchronisation en cours..." : "Corriger les noms maintenant"}
            </Button>
            {resyncResult && (
              <p className="text-sm text-green-600 dark:text-green-400">
                ✓ {resyncResult.updated} employés mis à jour, {resyncResult.skipped} ignorés
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Sync New Employees ───────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Ajouter les nouveaux employés
            </CardTitle>
            <CardDescription>
              Recherche dans le fichier Excel source les employés absents de la base et les ajoute. N'affecte pas les employés existants.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              onClick={handleSyncNewEmployees}
              disabled={syncNewLoading}
              className="gap-2"
            >
              {syncNewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              {syncNewLoading ? "Synchronisation en cours..." : "Synchroniser maintenant"}
            </Button>
            {syncNewResult && (
              <div className="text-sm space-y-1">
                <p className="text-green-600 dark:text-green-400">
                  ✓ {syncNewResult.created} nouveau(x) employé(s) ajouté(s), {syncNewResult.skipped} ignoré(s)
                </p>
                {syncNewResult.errors.length > 0 && (
                  <ul className="text-yellow-600 dark:text-yellow-400 list-disc list-inside">
                    {syncNewResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Reset & Reseed ───────────────────────────────────────── */}
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <RefreshCw className="w-5 h-5" />
              Réinitialiser la base de données
            </CardTitle>
            <CardDescription>
              Supprime <strong>toutes</strong> les données (employés, habilitations, historique) et recharge depuis le fichier Excel intégré. Action irréversible.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="destructive"
              onClick={() => setReseedConfirm(true)}
              disabled={reseedLoading}
              className="gap-2"
            >
              {reseedLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {reseedLoading ? "Réinitialisation en cours..." : "Réinitialiser et recharger"}
            </Button>
          </CardContent>
        </Card>

        <Button onClick={handleSave} size="lg" className="w-full">
          Sauvegarder tous les paramètres
        </Button>

        {/* ── System Health ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="w-5 h-5" />
              Santé du système
            </CardTitle>
            <CardDescription>Vérification de l'intégrité des données et des services</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              variant="outline"
              onClick={handleHealthCheck}
              disabled={healthLoading}
              className="gap-2"
            >
              {healthLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
              Lancer les vérifications
            </Button>

            {healthReport && (
              <div className="space-y-2 mt-4">
                {healthReport.checks?.map((check: any) => (
                  <div
                    key={check.name}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      check.status === "error"
                        ? "bg-red-50 border-red-200 dark:bg-red-900/10 dark:border-red-800"
                        : check.status === "warning" || check.status === "repaired"
                        ? "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-800"
                        : "bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800"
                    }`}
                  >
                    {check.status === "error" ? (
                      <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                    ) : check.status === "warning" || check.status === "repaired" ? (
                      <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <div className="text-sm font-medium">{check.name}</div>
                      <div className="text-xs text-muted-foreground">{check.message}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── App Info ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              À propos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground text-xs">Application</div>
                <div className="font-medium">Gestion des Habilitations</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Version</div>
                <div className="font-mono font-medium">{appVersion}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Schéma</div>
                <div className="font-medium">V4 (employee_versions)</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Date</div>
                <div className="font-medium">{new Date().toLocaleDateString("fr-FR")}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={reseedConfirm}
        onOpenChange={setReseedConfirm}
        title="Réinitialiser la base de données ?"
        description="Cette action supprimera définitivement tous les employés, habilitations et l'historique complet, puis rechargera les données depuis le fichier Excel intégré. Cette opération est irréversible."
        confirmText="Oui, tout réinitialiser"
        cancelText="Annuler"
        variant="danger"
        onConfirm={handleReseed}
      />
    </Layout>
  );
}
