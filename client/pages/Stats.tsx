import { Layout } from "@/components/Layout";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { getStats } from "@/api/employees";
import { RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";

interface StatsData {
  total: number;
  expired: number;
  lessThan3Months: number;
  lessThan6Months: number;
  lessThan9Months: number;
  stOnly: number;
  htOnly: number;
  both: number;
  missingPdf: number;
  pendingRenewals: number;
  mostCommonCodes: Array<{ code: string; count: number }>;
  monthlyForecast: Array<{ month: string; count: number }>;
  byDivision: Array<{ name: string; total: number; expired: number; critical: number }>;
  byService: Array<{ name: string; count: number }>;
}

function StatCard({ title, value, color, sub }: { title: string; value: number; color?: string; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-3xl font-bold ${color ?? ""}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  const months = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"];
  return `${months[parseInt(m) - 1]} ${y.slice(2)}`;
}

function barColor(count: number, max: number) {
  const ratio = count / max;
  if (ratio > 0.7) return "#ef4444";
  if (ratio > 0.4) return "#f97316";
  return "#3b82f6";
}

const PIE_COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f97316", "#ef4444", "#ec4899", "#14b8a6", "#f59e0b", "#6366f1", "#84cc16"];

export default function Stats() {
  const { toast } = useToast();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true);
    setError(false);
    getStats()
      .then(res => { if (res.success) setStats(res.data); else setError(true); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  if (loading) return (
    <Layout>
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-5 gap-4">{Array(10).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-64" /><Skeleton className="h-64" />
      </div>
    </Layout>
  );

  if (!stats) return (
    <Layout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Statistiques</h1>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4 mr-1" />Réessayer</Button>
        </div>
        <EmptyState
          title={error ? "Impossible de charger les statistiques" : "Aucune statistique disponible"}
          description={error ? "Une erreur s'est produite. Vérifiez la connexion et réessayez." : "Aucun employé actif trouvé."}
        />
      </div>
    </Layout>
  );

  const maxDiv = Math.max(...stats.byDivision.map(d => d.total), 1);
  const maxForecast = Math.max(...(stats.monthlyForecast?.map(m => m.count) ?? []), 1);

  const codePieData = (stats.mostCommonCodes ?? []).map((c, i) => ({
    name: c.code,
    value: c.count,
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Statistiques</h1>
          <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4 mr-1" />Actualiser</Button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <StatCard title="Total employés" value={stats.total} />
          <StatCard title="Expirés" value={stats.expired} color="text-red-600" />
          <StatCard title="< 3 mois" value={stats.lessThan3Months} color="text-orange-600" />
          <StatCard title="< 6 mois" value={stats.lessThan6Months} color="text-yellow-600" />
          <StatCard title="< 9 mois" value={stats.lessThan9Months} color="text-blue-600" />
          <StatCard title="ST uniquement" value={stats.stOnly} />
          <StatCard title="HT uniquement" value={stats.htOnly} />
          <StatCard title="ST + HT" value={stats.both} />
          <StatCard title="Sans PDF" value={stats.missingPdf} color={stats.missingPdf > 0 ? "text-amber-600" : ""} sub="version actuelle" />
        </div>

        {/* Monthly forecast */}
        {stats.monthlyForecast && stats.monthlyForecast.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Expirations par mois (12 prochains mois)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.monthlyForecast.map(m => ({ ...m, label: monthLabel(m.month) }))}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(val: number) => [`${val} employé(s)`, "Expirations"]}
                    labelFormatter={(label) => `Mois : ${label}`}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {stats.monthlyForecast.map((entry, i) => (
                      <Cell key={i} fill={barColor(entry.count, maxForecast)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Most common codes — pie chart */}
        {codePieData.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Codes les plus fréquents</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={codePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name} (${value})`}>
                    {codePieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Legend />
                  <Tooltip formatter={(val: number, name: string) => [`${val} employé(s)`, name]} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* By division with risk heatmap */}
          <Card>
            <CardHeader><CardTitle>Par division (risque)</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {stats.byDivision.sort((a, b) => b.total - a.total).map(d => (
                <div key={d.name} className="space-y-1">
                  <div className="flex justify-between text-sm items-center">
                    <span className="font-medium">{d.name}</span>
                    <div className="flex gap-1 items-center">
                      {d.expired > 0 && <Badge variant="destructive" className="text-xs px-1">{d.expired} exp.</Badge>}
                      {d.critical > 0 && <Badge className="text-xs px-1 bg-orange-500">{d.critical} &lt;3m</Badge>}
                      <span className="text-muted-foreground ml-1">{d.total}</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full flex overflow-hidden">
                      <div className="h-full bg-red-500" style={{ width: `${(d.expired / maxDiv) * 100}%` }} />
                      <div className="h-full bg-orange-400" style={{ width: `${(d.critical / maxDiv) * 100}%` }} />
                      <div className="h-full bg-primary" style={{ width: `${((d.total - d.expired - d.critical) / maxDiv) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* By service — table */}
          <Card>
            <CardHeader><CardTitle>Par service (top 10)</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left pb-2">Service</th>
                    <th className="text-right pb-2">Effectif</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byService.sort((a, b) => b.count - a.count).slice(0, 10).map(s => (
                    <tr key={s.name} className="border-t">
                      <td className="py-1">{s.name}</td>
                      <td className="text-right py-1 font-mono">{s.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
