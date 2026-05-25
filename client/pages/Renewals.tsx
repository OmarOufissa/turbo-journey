import { Layout } from "@/components/Layout";
import { setLastAction } from "@/components/UndoButton";
import { Button } from "@/components/ui/button";
import { RefreshCw, XCircle, CheckCircle2, Clock, Download } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { exportRenewalsToExcel } from "@/utils/exportToExcel";
import { formatDateFrench } from "@/lib/dateUtils";

interface RenewalSnapshot {
  stCodes: string[];
  htCodes: string[];
  nDeTitre: string;
  fonction: string;
  divisionId: number;
  serviceId: number;
  equipeId?: number | null;
  dateValidation: string;
  dateExpiration: string;
}

interface PendingRenewal {
  id: number;
  employeeId: number;
  snapshot: RenewalSnapshot;
  createdAt: string;
  matricule: string;
  nom: string;
  prenom: string;
  divisionName: string | null;
  serviceName: string | null;
}

function getDaysUntilExpiry(dateExpiration: string): number {
  return Math.ceil((new Date(dateExpiration).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function urgencyClass(days: number): string {
  if (days < 0) return "border-red-500 bg-red-50 dark:bg-red-950/30";
  if (days <= 30) return "border-red-400 bg-red-50/50 dark:bg-red-950/20";
  if (days <= 90) return "border-orange-400 bg-orange-50/50 dark:bg-orange-950/20";
  return "border-yellow-400 bg-yellow-50/50 dark:bg-yellow-950/20";
}

function urgencyLabel(days: number): string {
  if (days < 0) return "Expiré";
  if (days <= 30) return `Expire dans ${days} j`;
  if (days <= 90) return `${days} jours restants`;
  return `${days} jours restants`;
}

export default function Renewals() {
  const { toast } = useToast();
  const [renewals, setRenewals] = useState<PendingRenewal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activatingId, setActivatingId] = useState<number | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const fetchRenewals = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch("/api/renewals", {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!resp.ok) throw new Error("Erreur de chargement");
      const { data } = await resp.json();
      setRenewals(data ?? []);
    } catch (err) {
      toast({ title: "Erreur", description: String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchRenewals(); }, [fetchRenewals]);

  async function handleActivate(renewal: PendingRenewal) {
    setActivatingId(renewal.id);
    try {
      const resp = await fetch(`/api/renewals/${renewal.id}/activate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const body = await resp.json();
      if (!resp.ok) throw new Error(body.error ?? "Erreur lors de l'activation");
      toast({ title: "Renouvellement activé", description: `Version créée pour ${renewal.nom} ${renewal.prenom}` });
      if (body.data?.auditLogId) setLastAction({ auditLogId: body.data.auditLogId, description: `Renouvellement activé pour ${renewal.nom} ${renewal.prenom}`, timestamp: Date.now() });
      setRenewals((prev) => prev.filter((r) => r.id !== renewal.id));
    } catch (err) {
      toast({ title: "Erreur", description: String(err), variant: "destructive" });
    } finally {
      setActivatingId(null);
    }
  }

  async function handleCancel(renewal: PendingRenewal) {
    if (!confirm(`Annuler le renouvellement pour ${renewal.nom} ${renewal.prenom} ?`)) return;
    setCancellingId(renewal.id);
    try {
      const resp = await fetch(`/api/renewals/${renewal.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const body = await resp.json();
      if (!resp.ok) throw new Error(body.error ?? "Erreur lors de l'annulation");
      toast({ title: "Renouvellement annulé", description: `Annulé pour ${renewal.nom} ${renewal.prenom}` });
      setRenewals((prev) => prev.filter((r) => r.id !== renewal.id));
    } catch (err) {
      toast({ title: "Erreur", description: String(err), variant: "destructive" });
    } finally {
      setCancellingId(null);
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground">Chargement des renouvellements en attente...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Renouvellements en attente</h1>
            <p className="text-muted-foreground mt-1">
              {renewals.length} renouvellement{renewals.length !== 1 ? "s" : ""} en attente
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={fetchRenewals} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Actualiser
            </Button>
            {renewals.length > 0 && (
              <Button
                variant="outline"
                onClick={() => exportRenewalsToExcel(renewals, `renouvellements_${new Date().toISOString().split("T")[0]}.xlsx`)}
                className="gap-2"
              >
                <Download className="w-4 h-4" />
                Exporter
              </Button>
            )}
          </div>
        </div>

        {renewals.length === 0 ? (
          <div className="glass p-8 rounded-xl text-center space-y-4">
            <div className="text-green-500 text-4xl">✓</div>
            <h2 className="text-lg font-semibold">Aucun renouvellement en attente</h2>
            <p className="text-muted-foreground">
              Les renouvellements sont ajoutés depuis la fiche employé.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {renewals.map((renewal) => {
              const days = getDaysUntilExpiry(renewal.snapshot.dateExpiration);
              return (
                <div
                  key={renewal.id}
                  className={cn(
                    "glass p-6 rounded-xl space-y-4 border-l-4 transition-all",
                    urgencyClass(days)
                  )}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-foreground">
                        {renewal.nom} {renewal.prenom}
                      </h3>
                      <p className="text-sm text-muted-foreground">Matricule: {renewal.matricule}</p>
                      <p className="text-sm text-muted-foreground">Fonction: {renewal.snapshot.fonction}</p>
                      {(renewal.divisionName || renewal.serviceName) && (
                        <p className="text-sm text-muted-foreground">
                          {[renewal.divisionName, renewal.serviceName].filter(Boolean).join(" / ")}
                        </p>
                      )}
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-white/10 border border-white/20">
                          <Clock className="w-3 h-3" />
                          {urgencyLabel(days)}
                        </span>
                        <span className="px-2 py-1 rounded-md text-xs bg-white/10 border border-white/20">
                          Expire le {formatDateFrench(renewal.snapshot.dateExpiration)}
                        </span>
                      </div>
                    </div>

                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleCancel(renewal)}
                        disabled={cancellingId === renewal.id || activatingId === renewal.id}
                        className="gap-1 text-red-600 border-red-300 hover:bg-red-50"
                      >
                        <XCircle className="w-4 h-4" />
                        Annuler
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleActivate(renewal)}
                        disabled={activatingId === renewal.id || cancellingId === renewal.id}
                        className="gap-1 bg-green-600 hover:bg-green-700 text-white"
                      >
                        {activatingId === renewal.id ? (
                          <span className="flex items-center gap-1">
                            <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
                            Activation...
                          </span>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            Activer
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/10">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Codes ST</p>
                      <div className="flex flex-wrap gap-1">
                        {renewal.snapshot.stCodes.length > 0 ? (
                          renewal.snapshot.stCodes.map((c) => (
                            <span key={c} className="px-2 py-0.5 rounded text-xs font-mono bg-blue-500/20 text-blue-600 dark:text-blue-400">{c}</span>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Codes HT</p>
                      <div className="flex flex-wrap gap-1">
                        {renewal.snapshot.htCodes.length > 0 ? (
                          renewal.snapshot.htCodes.map((c) => (
                            <span key={c} className="px-2 py-0.5 rounded text-xs font-mono bg-purple-500/20 text-purple-600 dark:text-purple-400">{c}</span>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">N° Titre</p>
                      <p className="text-sm">{renewal.snapshot.nDeTitre || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Date validation</p>
                      <p className="text-sm">{formatDateFrench(renewal.snapshot.dateValidation)}</p>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Créé le {new Date(renewal.createdAt).toLocaleDateString("fr-FR")}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
