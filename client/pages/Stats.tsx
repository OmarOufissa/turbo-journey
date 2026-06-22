import { Layout } from "@/components/Layout";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Legend, Cell } from "recharts";
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

function StatCard({ title, value, sub }: { title: string; value: number; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-bold">{value}</p>
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
          <StatCard title="Expirés" value={stats.expired} />
          <StatCard title="< 3 mois" value={stats.lessThan3Months} />
          <StatCard title="< 6 mois" value={stats.lessThan6Months} />
          <StatCard title="< 9 mois" value={stats.lessThan9Months} />
          <StatCard title="ST uniquement" value={stats.stOnly} />
          <StatCard title="HT uniquement" value={stats.htOnly} />
          <StatCard title="ST + HT" value={stats.both} />
          <StatCard title="Sans PDF" value={stats.missingPdf} sub="version actuelle" />
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
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#3b82f6" />
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
          {/* By division */}
          <Card>
            <CardHeader><CardTitle>Par division</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left pb-2">Division</th>
                    <th className="text-right pb-2">Effectif</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byDivision.sort((a, b) => b.total - a.total).map(d => (
                    <tr key={d.name} className="border-t">
                      <td className="py-1">{d.name}</td>
                      <td className="text-right py-1 font-mono">{d.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
