import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { Download, RefreshCw, Users, UserPlus, UserMinus, Clock, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "analytics" | "expiration";
type Period = "3m" | "6m" | "9m" | "annual";

interface AnalyticsData {
  totalActive: number;
  totalDeleted: number;
  pendingRenewals: number;
  addedByMonth: { month: string; count: number }[];
  deletedByMonth: { month: string; count: number }[];
  activatedByMonth: { month: string; count: number }[];
  renewalRate: { renewedInTime: number; lapsed: number; total: number };
}

interface DivisionBreakdown {
  name: string;
  total: number;
  expired: number;
  critical: number;
}

interface ReportEmployee {
  matricule: string;
  nom: string;
  prenom: string;
  fonction: string;
  division: string;
  service: string;
  stCodes: string[];
  htCodes: string[];
  dateValidation: string;
  dateExpiration: string;
  nDeTitre: string;
  daysUntilExpiration: number;
}

interface ReportData {
  period: Period;
  generatedAt: string;
  summary: { total: number; expired: number; expiring: number };
  employees: ReportEmployee[];
}

const PERIODS: { value: Period; label: string; color: string }[] = [
  { value: "3m",     label: "3 mois",   color: "text-red-600 border-red-300 bg-red-50 dark:bg-red-950/30" },
  { value: "6m",     label: "6 mois",   color: "text-orange-600 border-orange-300 bg-orange-50 dark:bg-orange-950/30" },
  { value: "9m",     label: "9 mois",   color: "text-yellow-600 border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30" },
  { value: "annual", label: "Annuel",   color: "text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/30" },
];

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const date = new Date(parseInt(y), parseInt(m) - 1, 1);
  return date.toLocaleDateString("fr-FR", { month: "short", year: "numeric" });
}

function rowColor(days: number) {
  if (days < 0) return "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400";
  if (days <= 90) return "bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-400";
  if (days <= 180) return "bg-yellow-50 dark:bg-yellow-950/20 text-yellow-800 dark:text-yellow-300";
  return "";
}

function daysBadge(days: number) {
  if (days < 0) return <Badge variant="destructive">{Math.abs(days)}j exp.</Badge>;
  if (days <= 90) return <Badge className="bg-orange-500 text-white">{days}j</Badge>;
  if (days <= 180) return <Badge className="bg-yellow-500 text-yellow-900">{days}j</Badge>;
  return <Badge variant="secondary">{days}j</Badge>;
}

// Build a last-12-months array of YYYY-MM strings
function last12Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

export default function Reports() {
  const [tab, setTab] = useState<Tab>("analytics");
  const [period, setPeriod] = useState<Period>("3m");
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [byDivision, setByDivision] = useState<DivisionBreakdown[]>([]);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const token = localStorage.getItem("token");

  async function loadAnalytics() {
    setAnalyticsLoading(true);
    try {
      const [analyticsRes, statsRes] = await Promise.all([
        fetch("/api/analytics", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/stats", { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const analyticsJson = await analyticsRes.json();
      if (analyticsJson.success) setAnalytics(analyticsJson.data);
      const statsJson = await statsRes.json();
      if (statsJson.success) setByDivision(statsJson.data.byDivision ?? []);
    } catch {
      /* silent */
    } finally {
      setAnalyticsLoading(false);
    }
  }

  async function loadReport(p: Period) {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/reports/expiration?period=${p}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) setData(json.data);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadAnalytics(); }, []);
  useEffect(() => { if (tab === "expiration") loadReport(period); }, [tab, period]);

  async function handleDownloadPdf() {
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/reports/expiration/pdf?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rapport_habilitation_${period}_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* silent */
    } finally {
      setPdfLoading(false);
    }
  }

  const months = last12Months();
  const addedMap = Object.fromEntries((analytics?.addedByMonth ?? []).map(r => [r.month, Number(r.count)]));
  const deletedMap = Object.fromEntries((analytics?.deletedByMonth ?? []).map(r => [r.month, Number(r.count)]));
  const activatedMap = Object.fromEntries((analytics?.activatedByMonth ?? []).map(r => [r.month, Number(r.count)]));

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Rapports</h1>
          <div className="flex gap-2">
            {tab === "analytics" && (
              <Button variant="outline" size="sm" onClick={loadAnalytics} disabled={analyticsLoading}>
                <RefreshCw className={cn("w-4 h-4 mr-1", analyticsLoading && "animate-spin")} />Actualiser
              </Button>
            )}
            {tab === "expiration" && (
              <>
                <Button variant="outline" size="sm" onClick={() => loadReport(period)} disabled={loading}>
                  <RefreshCw className={cn("w-4 h-4 mr-1", loading && "animate-spin")} />Actualiser
                </Button>
                <Button size="sm" onClick={handleDownloadPdf} disabled={pdfLoading || loading}>
                  <Download className={cn("w-4 h-4 mr-1", pdfLoading && "animate-spin")} />
                  {pdfLoading ? "Génération..." : "Télécharger PDF"}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Tab selector */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          <button
            onClick={() => setTab("analytics")}
            className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors", tab === "analytics" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            Tableau de bord analytique
          </button>
          <button
            onClick={() => setTab("expiration")}
            className={cn("px-4 py-2 rounded-md text-sm font-medium transition-colors", tab === "expiration" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            Rapport d'expiration
          </button>
        </div>

        {/* ─── Analytics tab ─── */}
        {tab === "analytics" && (
          <div className="space-y-6">
            {/* Summary KPIs */}
            {analyticsLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[0,1,2,3,4].map(i => <Skeleton key={i} className="h-28" />)}
              </div>
            ) : analytics && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm text-muted-foreground">Employés actifs</CardTitle>
                    <Users className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold">{analytics.totalActive}</p>
                    <p className="text-xs text-muted-foreground mt-1">en service</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm text-muted-foreground">Ajoutés (12 mois)</CardTitle>
                    <UserPlus className="w-4 h-4 text-green-500" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-green-600">
                      {Object.values(addedMap).reduce((a, b) => a + b, 0)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">nouveaux employés</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm text-muted-foreground">Supprimés (12 mois)</CardTitle>
                    <UserMinus className="w-4 h-4 text-red-500" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-red-600">
                      {Object.values(deletedMap).reduce((a, b) => a + b, 0)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">employés supprimés</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm text-muted-foreground">Renouvellements en attente</CardTitle>
                    <Clock className="w-4 h-4 text-orange-500" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-orange-600">{analytics.pendingRenewals}</p>
                    <p className="text-xs text-muted-foreground mt-1">à activer</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="text-sm text-muted-foreground">Renouvelés à temps</CardTitle>
                    <TrendingUp className="w-4 h-4 text-blue-500" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-blue-600">
                      {analytics.renewalRate.total > 0
                        ? `${Math.round((analytics.renewalRate.renewedInTime / analytics.renewalRate.total) * 100)}%`
                        : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {analytics.renewalRate.total > 0
                        ? `${analytics.renewalRate.renewedInTime}/${analytics.renewalRate.total} (${analytics.renewalRate.lapsed} en retard)`
                        : "aucun renouvellement"}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Monthly activity table */}
            {analytics && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Activité mensuelle — 12 derniers mois</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mois</TableHead>
                        <TableHead className="text-green-600">Ajoutés</TableHead>
                        <TableHead className="text-red-600">Supprimés</TableHead>
                        <TableHead className="text-blue-600">Renouvellements activés</TableHead>
                        <TableHead className="text-right">Solde</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {months.map(m => {
                        const added = addedMap[m] ?? 0;
                        const deleted = deletedMap[m] ?? 0;
                        const activated = activatedMap[m] ?? 0;
                        const solde = added - deleted;
                        return (
                          <TableRow key={m}>
                            <TableCell className="font-medium">{monthLabel(m)}</TableCell>
                            <TableCell>
                              {added > 0 ? <span className="text-green-600 font-semibold">+{added}</span> : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell>
                              {deleted > 0 ? <span className="text-red-600 font-semibold">-{deleted}</span> : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell>
                              {activated > 0 ? <span className="text-blue-600 font-semibold">{activated}</span> : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-right">
                              {solde === 0 ? (
                                <span className="text-muted-foreground">0</span>
                              ) : solde > 0 ? (
                                <span className="text-green-600 font-semibold">+{solde}</span>
                              ) : (
                                <span className="text-red-600 font-semibold">{solde}</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {/* By division */}
            {byDivision.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Répartition par division</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Division</TableHead>
                        <TableHead className="text-right">Employés actifs</TableHead>
                        <TableHead className="text-right">Expirés</TableHead>
                        <TableHead className="text-right">Critiques (&lt;3m)</TableHead>
                        <TableHead className="text-right">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {byDivision.map(row => (
                        <TableRow key={row.name ?? "unknown"}>
                          <TableCell className="font-medium">{row.name ?? "Non assigné"}</TableCell>
                          <TableCell className="text-right font-semibold">{row.total}</TableCell>
                          <TableCell className="text-right text-red-600">{row.expired}</TableCell>
                          <TableCell className="text-right text-orange-600">{row.critical}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {analytics && analytics.totalActive > 0 ? Math.round((row.total / analytics.totalActive) * 100) : 0}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ─── Expiration tab ─── */}
        {tab === "expiration" && (
          <div className="space-y-6">
            {/* Period selector */}
            <div className="flex gap-3 flex-wrap">
              {PERIODS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setPeriod(p.value)}
                  className={cn(
                    "px-4 py-2 rounded-lg border-2 font-medium text-sm transition-colors",
                    period === p.value ? p.color : "border-border text-muted-foreground hover:border-primary/40"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Summary cards */}
            {loading ? (
              <div className="grid grid-cols-3 gap-4">
                {[0,1,2].map(i => <Skeleton key={i} className="h-24" />)}
              </div>
            ) : data && (
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total concernés</CardTitle></CardHeader>
                  <CardContent><p className="text-3xl font-bold">{data.summary.total}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Expirés</CardTitle></CardHeader>
                  <CardContent><p className="text-3xl font-bold text-red-600">{data.summary.expired}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">À renouveler</CardTitle></CardHeader>
                  <CardContent><p className="text-3xl font-bold text-orange-600">{data.summary.expiring}</p></CardContent>
                </Card>
              </div>
            )}

            {/* Employee table */}
            {loading ? (
              <Card>
                <CardContent className="p-4 space-y-2">
                  {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-10" />)}
                </CardContent>
              </Card>
            ) : error ? (
              <EmptyState title="Erreur de chargement" description="Impossible de charger le rapport. Vérifiez la connexion." />
            ) : !data || data.employees.length === 0 ? (
              <EmptyState
                title="Aucun employé concerné"
                description={`Aucun employé n'expire dans les ${PERIODS.find(p => p.value === period)?.label}.`}
              />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    Employés — {PERIODS.find(p => p.value === period)?.label}
                    <Badge variant="outline">{data.employees.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[90px]">Matricule</TableHead>
                        <TableHead>Nom Prénom</TableHead>
                        <TableHead>Fonction</TableHead>
                        <TableHead>Division</TableHead>
                        <TableHead>ST / HT</TableHead>
                        <TableHead>Expiration</TableHead>
                        <TableHead className="text-right">Jours</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.employees.map(emp => (
                        <TableRow key={emp.matricule} className={rowColor(emp.daysUntilExpiration)}>
                          <TableCell className="font-mono text-xs">{emp.matricule}</TableCell>
                          <TableCell className="font-medium">{emp.prenom} {emp.nom}</TableCell>
                          <TableCell className="text-sm">{emp.fonction}</TableCell>
                          <TableCell className="text-sm truncate max-w-[150px]">{emp.division}</TableCell>
                          <TableCell className="text-xs font-mono">
                            {emp.stCodes.length > 0 ? emp.stCodes.join(",") : "—"} / {emp.htCodes.length > 0 ? emp.htCodes.join(",") : "—"}
                          </TableCell>
                          <TableCell className="text-sm">{new Date(emp.dateExpiration).toLocaleDateString("fr-FR")}</TableCell>
                          <TableCell className="text-right">{daysBadge(emp.daysUntilExpiration)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
