import { Layout } from "@/components/Layout";
import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  AreaChart, Area, CartesianGrid,
} from "recharts";
import {
  RefreshCw, Users, FileText, Shield, TrendingUp,
  AlertTriangle, CheckCircle2, Clock, Activity, BarChart3, PenTool,
  Layers, Building2, Zap, Info, ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";
import { apiClient } from "@/api/client";
import { EmptyState } from "@/components/shared/EmptyState";

const PIE_COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f97316", "#ef4444", "#ec4899", "#14b8a6", "#f59e0b", "#6366f1", "#84cc16", "#06b6d4", "#e11d48"];

interface ReportsData {
  period: { months: number; from: string; to: string };
  employeeActivity: { atStart: number; atEnd: number; added: number; deleted: number; restored: number; netGrowth: number };
  habilitationActivity: { totalActive: number; renewed: number; expired: number; expiringSoon: number; stOnly: number; htOnly: number; both: number };
  renewalActivity: { enteringWarning: number; completed: number; currentlyNeeded: number; byDivision: Array<{ name: string; count: number }>; byService: Array<{ name: string; count: number }> };
  versioningActivity: { versionsCreated: number; employeesModified: number; reverts: number; avgVersionsPerEmployee: number; mostModified: Array<{ matricule: string; nom: string; prenom: string; versions: number }> };
  pdfActivity: { generated: number; signed: number; awaitingSigning: number; missingPdf: number; signatureRate: number };
  expirationAnalytics: { expired: number; within3m: number; within6m: number; within9m: number; valid: number; distribution: Array<{ label: string; value: number }> };
  byDivision: Array<{ name: string; total: number; expired: number; expiringSoon: number; renewalsCompleted: number; pdfsGenerated: number; pdfsSigned: number }>;
  byService: Array<{ name: string; divisionName: string; total: number; expired: number; expiringSoon: number; renewalsCompleted: number }>;
  codeAnalytics: { stCodes: Array<{ code: string; count: number }>; htCodes: Array<{ code: string; count: number }> };
  auditActivity: { creations: number; edits: number; deletions: number; restorations: number; renewals: number; pdfGenerations: number; pdfSignatures: number; reverts: number };
  trends: { months: string[]; added: number[]; deleted: number[]; renewals: number[]; expirations: number[]; pdfsGenerated: number[]; pdfsSigned: number[]; versionsCreated: number[] };
  insights: Array<{ type: "warning" | "info" | "success"; text: string }>;
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  const months = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"];
  return `${months[parseInt(m) - 1]} ${y.slice(2)}`;
}

function KpiCard({ title, value, icon: Icon, delta, sub }: { title: string; value: number | string; icon: any; delta?: number; sub?: string }) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold tracking-tight">{value}</p>
            {delta !== undefined && delta !== 0 && (
              <div className={`flex items-center text-xs font-medium ${delta > 0 ? "text-emerald-600" : "text-red-600"}`}>
                {delta > 0 ? <ArrowUpRight className="w-3 h-3 mr-0.5" /> : <ArrowDownRight className="w-3 h-3 mr-0.5" />}
                {delta > 0 ? "+" : ""}{delta}
              </div>
            )}
            {delta === 0 && (
              <div className="flex items-center text-xs font-medium text-muted-foreground">
                <Minus className="w-3 h-3 mr-0.5" />Stable
              </div>
            )}
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className="p-3 rounded-xl bg-primary/10">
            <Icon className="w-5 h-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionHeader({ title, icon: Icon, description }: { title: string; icon: any; description?: string }) {
  return (
    <div className="flex items-center gap-3 pt-4">
      <div className="p-2 rounded-lg bg-primary/10">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

function InsightCard({ insight }: { insight: { type: string; text: string } }) {
  const icons = { warning: AlertTriangle, info: Info, success: CheckCircle2 };
  const colors = { warning: "text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800", info: "text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800", success: "text-emerald-600 bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800" };
  const Icon = icons[insight.type as keyof typeof icons] || Info;
  const color = colors[insight.type as keyof typeof colors] || colors.info;
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${color}`}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" />
      <p className="text-sm">{insight.text}</p>
    </div>
  );
}

function ProgressBar({ label, value, max, color = "bg-primary" }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

export default function Reports() {
  const { toast } = useToast();
  const [data, setData] = useState<ReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [period, setPeriod] = useState("6");

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    apiClient(`/api/reports?period=${period}`)
      .then((res: any) => { if (res.success) setData(res.data); else setError(true); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(load, [load]);

  if (loading) return (
    <Layout>
      <div className="p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-4 gap-4">{Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
        <Skeleton className="h-80" />
        <div className="grid grid-cols-2 gap-4"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>
      </div>
    </Layout>
  );

  if (!data) return (
    <Layout>
      <div className="p-6 space-y-4">
        <h1 className="text-2xl font-bold">Rapports</h1>
        <EmptyState
          title={error ? "Impossible de charger les rapports" : "Aucune donnée"}
          description={error ? "Vérifiez la connexion et réessayez." : "Aucune donnée disponible."}
          action={{ label: "Réessayer", onClick: load }}
        />
      </div>
    </Layout>
  );

  const { employeeActivity: ea, habilitationActivity: ha, renewalActivity: ra, versioningActivity: va, pdfActivity: pa, expirationAnalytics: ex, auditActivity: aa, trends: tr } = data;

  const trendData = (tr.months ?? []).map((m, i) => ({
    month: monthLabel(m),
    ajoutés: tr.added[i] ?? 0,
    supprimés: tr.deleted[i] ?? 0,
    renouvellements: tr.renewals[i] ?? 0,
    expirations: tr.expirations[i] ?? 0,
    pdfsGénérés: tr.pdfsGenerated[i] ?? 0,
    pdfsSignés: tr.pdfsSigned[i] ?? 0,
    versions: tr.versionsCreated[i] ?? 0,
  }));

  const expirationPie = (ex.distribution ?? []).map((d, i) => ({ ...d, color: PIE_COLORS[i % PIE_COLORS.length] }));
  const stPie = (data.codeAnalytics?.stCodes ?? []).slice(0, 8).map((c, i) => ({ name: c.code, value: c.count, color: PIE_COLORS[i % PIE_COLORS.length] }));
  const htPie = (data.codeAnalytics?.htCodes ?? []).slice(0, 8).map((c, i) => ({ name: c.code, value: c.count, color: PIE_COLORS[i % PIE_COLORS.length] }));

  const periodLabel = `${data.period.months} derniers mois`;
  const fromDate = new Date(data.period.from).toLocaleDateString("fr-FR");
  const toDate = new Date(data.period.to).toLocaleDateString("fr-FR");

  return (
    <Layout>
      <div className="p-6 space-y-8 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Rapports</h1>
            <p className="text-muted-foreground mt-1">Tableau de bord de gestion — {fromDate} au {toDate}</p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">3 derniers mois</SelectItem>
                <SelectItem value="6">6 derniers mois</SelectItem>
                <SelectItem value="9">9 derniers mois</SelectItem>
                <SelectItem value="12">12 derniers mois</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="w-4 h-4 mr-1" />Actualiser
            </Button>
          </div>
        </div>

        {/* KPI Row 1 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard title="Total Employés" value={ea.atEnd} icon={Users} delta={ea.netGrowth} sub={`${ea.added} ajoutés, ${ea.deleted} supprimés`} />
          <KpiCard title="Expirés" value={ex.expired} icon={AlertTriangle} sub="habilitations expirées" />
          <KpiCard title="Renouvellements" value={ra.completed} icon={RefreshCw} sub={`sur la période`} />
          <KpiCard title="Taux de signature" value={`${pa.signatureRate}%`} icon={PenTool} sub={`${pa.signed} signés / ${pa.signed + pa.awaitingSigning} total`} />
        </div>

        {/* KPI Row 2 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard title="PDFs Générés" value={pa.generated} icon={FileText} sub="sur la période" />
          <KpiCard title="PDFs Signés" value={pa.signed} icon={CheckCircle2} sub={`${pa.awaitingSigning} en attente`} />
          <KpiCard title="Sans PDF" value={pa.missingPdf} icon={FileText} sub="employés sans document" />
          <KpiCard title="Expirent < 3 mois" value={ex.within3m} icon={Clock} sub="renouvellements urgents" />
        </div>

        {/* Insights */}
        {data.insights && data.insights.length > 0 && (
          <>
            <SectionHeader title="Points d'attention" icon={AlertTriangle} description="Alertes et recommandations automatiques" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.insights.map((insight, i) => <InsightCard key={i} insight={insight} />)}
            </div>
          </>
        )}

        {/* Trends */}
        <SectionHeader title="Tendances" icon={TrendingUp} description={`Évolution mensuelle — ${periodLabel}`} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Activité Employés</CardTitle>
              <CardDescription>Ajouts, renouvellements et expirations</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="ajoutés" stroke="#10b981" fill="#10b981" fillOpacity={0.3} />
                  <Area type="monotone" dataKey="renouvellements" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                  <Area type="monotone" dataKey="expirations" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} />
                  <Legend />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Activité PDF</CardTitle>
              <CardDescription>Génération et signature</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="pdfsGénérés" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pdfsSignés" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Legend />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Expiration & Code Analytics */}
        <SectionHeader title="Analyses" icon={BarChart3} description="Répartition des expirations et codes d'habilitation" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-sm">Expirations</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={expirationPie} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={80} innerRadius={40} label={({ value }) => `${value}`}>
                    {expirationPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Tooltip formatter={(val: number, name: string) => [`${val}`, name]} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Codes ST</CardTitle></CardHeader>
            <CardContent>
              {stPie.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={stPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} label={({ name }) => name}>
                      {stPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Tooltip formatter={(val: number, name: string) => [`${val}`, name]} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-muted-foreground text-center py-8">Aucune donnée</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Codes HT</CardTitle></CardHeader>
            <CardContent>
              {htPie.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={htPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40} label={({ name }) => name}>
                      {htPie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Tooltip formatter={(val: number, name: string) => [`${val}`, name]} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-muted-foreground text-center py-8">Aucune donnée</p>}
            </CardContent>
          </Card>
        </div>

        {/* Habilitation Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6 text-center">
              <Zap className="w-8 h-8 mx-auto text-blue-500 mb-2" />
              <p className="text-3xl font-bold">{ha.stOnly}</p>
              <p className="text-sm text-muted-foreground mt-1">ST uniquement</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <Shield className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
              <p className="text-3xl font-bold">{ha.htOnly}</p>
              <p className="text-sm text-muted-foreground mt-1">HT uniquement</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 text-center">
              <Activity className="w-8 h-8 mx-auto text-purple-500 mb-2" />
              <p className="text-3xl font-bold">{ha.both}</p>
              <p className="text-sm text-muted-foreground mt-1">ST + HT</p>
            </CardContent>
          </Card>
        </div>

        {/* Organizational Analytics */}
        <SectionHeader title="Analyse Organisationnelle" icon={Building2} description="Performance par division et service" />
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-4 font-medium">Division</th>
                    <th className="text-right p-4 font-medium">Effectif</th>
                    <th className="text-right p-4 font-medium">Expirés</th>
                    <th className="text-right p-4 font-medium">&lt; 3 mois</th>
                    <th className="text-right p-4 font-medium">Renouvellements</th>
                    <th className="text-right p-4 font-medium">PDFs Générés</th>
                    <th className="text-right p-4 font-medium">PDFs Signés</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byDivision.sort((a, b) => b.total - a.total).map(d => (
                    <tr key={d.name} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-4 font-medium">{d.name}</td>
                      <td className="text-right p-4 font-mono">{d.total}</td>
                      <td className="text-right p-4 font-mono">{d.expired > 0 ? <span className="text-red-600 font-semibold">{d.expired}</span> : "0"}</td>
                      <td className="text-right p-4 font-mono">{d.expiringSoon > 0 ? <span className="text-amber-600 font-semibold">{d.expiringSoon}</span> : "0"}</td>
                      <td className="text-right p-4 font-mono">{d.renewalsCompleted}</td>
                      <td className="text-right p-4 font-mono">{d.pdfsGenerated}</td>
                      <td className="text-right p-4 font-mono">{d.pdfsSigned}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {data.byService && data.byService.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm">Par Service (top 15)</CardTitle></CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-4 font-medium">Service</th>
                      <th className="text-left p-4 font-medium">Division</th>
                      <th className="text-right p-4 font-medium">Effectif</th>
                      <th className="text-right p-4 font-medium">Expirés</th>
                      <th className="text-right p-4 font-medium">&lt; 3 mois</th>
                      <th className="text-right p-4 font-medium">Renouvellements</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byService.sort((a, b) => b.total - a.total).slice(0, 15).map(s => (
                      <tr key={`${s.divisionName}-${s.name}`} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="p-4 font-medium">{s.name}</td>
                        <td className="p-4 text-muted-foreground">{s.divisionName}</td>
                        <td className="text-right p-4 font-mono">{s.total}</td>
                        <td className="text-right p-4 font-mono">{s.expired > 0 ? <span className="text-red-600">{s.expired}</span> : "0"}</td>
                        <td className="text-right p-4 font-mono">{s.expiringSoon > 0 ? <span className="text-amber-600">{s.expiringSoon}</span> : "0"}</td>
                        <td className="text-right p-4 font-mono">{s.renewalsCompleted}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Versioning & Audit */}
        <SectionHeader title="Activité Système" icon={Layers} description={`Versions, audits et opérations — ${periodLabel}`} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="text-sm">Activité de Versioning</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold">{va.versionsCreated}</p>
                  <p className="text-xs text-muted-foreground mt-1">Versions créées</p>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold">{va.employeesModified}</p>
                  <p className="text-xs text-muted-foreground mt-1">Employés modifiés</p>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold">{va.reverts}</p>
                  <p className="text-xs text-muted-foreground mt-1">Retours version</p>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <p className="text-2xl font-bold">{va.avgVersionsPerEmployee.toFixed(1)}</p>
                  <p className="text-xs text-muted-foreground mt-1">Moy. versions/employé</p>
                </div>
              </div>
              {va.mostModified && va.mostModified.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Employés les plus modifiés</p>
                  {va.mostModified.map(e => (
                    <div key={e.matricule} className="flex justify-between text-sm py-1.5 border-b last:border-0">
                      <span>{e.prenom} {e.nom} <span className="text-muted-foreground">({e.matricule})</span></span>
                      <Badge variant="secondary">{e.versions} v.</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Journal d'Activité</CardTitle>
              <CardDescription>Résumé des opérations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                const maxAudit = Math.max(aa.creations, aa.edits, aa.renewals, aa.pdfGenerations, 1);
                return (
                  <>
                    <ProgressBar label="Créations" value={aa.creations} max={maxAudit} color="bg-emerald-500" />
                    <ProgressBar label="Modifications" value={aa.edits} max={maxAudit} color="bg-blue-500" />
                    <ProgressBar label="Suppressions" value={aa.deletions} max={maxAudit} color="bg-red-500" />
                    <ProgressBar label="Restaurations" value={aa.restorations} max={maxAudit} color="bg-amber-500" />
                    <ProgressBar label="Renouvellements" value={aa.renewals} max={maxAudit} color="bg-purple-500" />
                    <ProgressBar label="PDFs générés" value={aa.pdfGenerations} max={maxAudit} color="bg-cyan-500" />
                    <ProgressBar label="PDFs signés" value={aa.pdfSignatures} max={maxAudit} color="bg-emerald-500" />
                    <ProgressBar label="Retours version" value={aa.reverts} max={maxAudit} color="bg-slate-500" />
                  </>
                );
              })()}
            </CardContent>
          </Card>
        </div>

        {/* Signature Status */}
        <SectionHeader title="Statut des Signatures" icon={PenTool} description="Suivi de la signature des documents" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="border-blue-200 dark:border-blue-800">
            <CardContent className="p-6 text-center">
              <FileText className="w-8 h-8 mx-auto text-blue-500 mb-2" />
              <p className="text-3xl font-bold">{pa.generated}</p>
              <p className="text-sm text-muted-foreground mt-1">Générés</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 dark:border-emerald-800">
            <CardContent className="p-6 text-center">
              <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
              <p className="text-3xl font-bold">{pa.signed}</p>
              <p className="text-sm text-muted-foreground mt-1">Signés</p>
            </CardContent>
          </Card>
          <Card className="border-amber-200 dark:border-amber-800">
            <CardContent className="p-6 text-center">
              <Clock className="w-8 h-8 mx-auto text-amber-500 mb-2" />
              <p className="text-3xl font-bold">{pa.awaitingSigning}</p>
              <p className="text-sm text-muted-foreground mt-1">En attente</p>
            </CardContent>
          </Card>
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="p-6 text-center">
              <AlertTriangle className="w-8 h-8 mx-auto text-red-500 mb-2" />
              <p className="text-3xl font-bold">{pa.missingPdf}</p>
              <p className="text-sm text-muted-foreground mt-1">Sans PDF</p>
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <Separator />
        <div className="flex items-center justify-between text-sm text-muted-foreground pb-4">
          <p>Rapport généré le {new Date().toLocaleDateString("fr-FR")} à {new Date().toLocaleTimeString("fr-FR")}</p>
          <p>Période : {fromDate} — {toDate}</p>
        </div>
      </div>
    </Layout>
  );
}
