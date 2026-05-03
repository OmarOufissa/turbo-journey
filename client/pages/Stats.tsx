import { Layout } from "@/components/Layout";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getStats } from "@/api/employees";

interface StatsData {
  total: number;
  expired: number;
  lessThan3Months: number;
  lessThan6Months: number;
  lessThan9Months: number;
  stOnly: number;
  htOnly: number;
  both: number;
  byDivision: Array<{ name: string; count: number }>;
  byService: Array<{ name: string; count: number }>;
}

function StatCard({ title, value, color }: { title: string; value: number; color?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-3xl font-bold ${color ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

export default function Stats() {
  const { toast } = useToast();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStats()
      .then(res => { if (res.success) setStats(res.data); })
      .catch(() => toast({ title: "Erreur", description: "Impossible de charger les statistiques", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Layout><div className="p-6">Chargement...</div></Layout>;
  if (!stats) return <Layout><div className="p-6">Aucune donnée</div></Layout>;

  const maxDiv = Math.max(...stats.byDivision.map(d => d.count), 1);
  const maxSvc = Math.max(...stats.byService.map(s => s.count), 1);

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">Statistiques</h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Total employés" value={stats.total} />
          <StatCard title="Expirés" value={stats.expired} color="text-red-600" />
          <StatCard title="< 3 mois" value={stats.lessThan3Months} color="text-orange-600" />
          <StatCard title="< 6 mois" value={stats.lessThan6Months} color="text-yellow-600" />
          <StatCard title="< 9 mois" value={stats.lessThan9Months} color="text-blue-600" />
          <StatCard title="ST uniquement" value={stats.stOnly} />
          <StatCard title="HT uniquement" value={stats.htOnly} />
          <StatCard title="ST + HT" value={stats.both} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle>Par division</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {stats.byDivision.sort((a, b) => b.count - a.count).map(d => (
                <div key={d.name} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{d.name}</span>
                    <span className="text-muted-foreground">{d.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${(d.count / maxDiv) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Par service</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {stats.byService.sort((a, b) => b.count - a.count).slice(0, 10).map(s => (
                <div key={s.name} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{s.name}</span>
                    <span className="text-muted-foreground">{s.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${(s.count / maxSvc) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
