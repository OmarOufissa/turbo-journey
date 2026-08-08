import { Layout } from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, PieChart, TrendingUp, Users } from "lucide-react";
import { useState, useEffect } from "react";

interface AnalyticsData {
  totalEmployees: number;
  totalHabilitations: number;
  byDivision: { name: string; count: number }[];
  byType: { type: string; count: number }[];
  expirationStats: {
    expired: number;
    expiring30: number;
    expiring90: number;
    valid: number;
  };
}

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  async function fetchAnalytics() {
    try {
      const response = await fetch("/api/employees", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!response.ok) throw new Error("Failed to fetch");

      const employees = await response.json();

      const divisionMap = new Map<string, number>();
      const typeMap = new Map<string, number>();
      let totalHabs = 0;
      let expired = 0;
      let expiring30 = 0;
      let expiring90 = 0;
      let valid = 0;

      const today = new Date();

      employees.forEach((emp: any) => {
        const div = emp.division || "Non défini";
        divisionMap.set(div, (divisionMap.get(div) || 0) + 1);

        emp.habilitations?.forEach((hab: any) => {
          totalHabs++;
          typeMap.set(hab.type, (typeMap.get(hab.type) || 0) + 1);

          const expDate = new Date(hab.date_expiration);
          const diffDays = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

          if (diffDays <= 0) expired++;
          else if (diffDays <= 30) expiring30++;
          else if (diffDays <= 90) expiring90++;
          else valid++;
        });
      });

      setData({
        totalEmployees: employees.length,
        totalHabilitations: totalHabs,
        byDivision: Array.from(divisionMap.entries()).map(([name, count]) => ({ name, count })),
        byType: Array.from(typeMap.entries()).map(([type, count]) => ({ type, count })),
        expirationStats: { expired, expiring30, expiring90, valid },
      });
    } catch (err) {
      console.error("Error fetching analytics:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading || !data) {
    return (
      <Layout>
        <div className="text-center py-12">Chargement des statistiques...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold neon-text flex items-center gap-2">
            <BarChart3 className="w-8 h-8" />
            Statistiques et Analyses
          </h1>
          <p className="text-muted-foreground mt-1">
            Vue d'ensemble des habilitations et tendances
          </p>
        </div>

        {/* Overview Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="electric-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Employés</CardTitle>
              <Users className="h-4 w-4 text-cyan-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold neon-text">{data.totalEmployees}</div>
            </CardContent>
          </Card>

          <Card className="electric-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Habilitations</CardTitle>
              <TrendingUp className="h-4 w-4 text-cyan-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold neon-text">{data.totalHabilitations}</div>
            </CardContent>
          </Card>

          <Card className="electric-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expirées</CardTitle>
              <PieChart className="h-4 w-4 text-red-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-red-400">{data.expirationStats.expired}</div>
            </CardContent>
          </Card>

          <Card className="electric-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Expirant sous 30j</CardTitle>
              <PieChart className="h-4 w-4 text-orange-400" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-400">{data.expirationStats.expiring30}</div>
            </CardContent>
          </Card>
        </div>

        {/* Division Breakdown */}
        <Card className="electric-card">
          <CardHeader>
            <CardTitle>Répartition par Division</CardTitle>
            <CardDescription>Nombre d'employés par division</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.byDivision.map((div) => (
                <div key={div.name} className="flex items-center">
                  <div className="flex-1">
                    <p className="font-medium">{div.name}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-64 bg-secondary/20 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-cyan-500 to-blue-600 h-full"
                        style={{
                          width: `${(div.count / data.totalEmployees) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="font-bold neon-text w-12 text-right">{div.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Type Breakdown */}
        <Card className="electric-card">
          <CardHeader>
            <CardTitle>Répartition par Type</CardTitle>
            <CardDescription>Nombre d'habilitations HT vs ST</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.byType.map((t) => (
                <div key={t.type} className="flex items-center">
                  <div className="flex-1">
                    <p className="font-medium">Habilitation {t.type}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-64 bg-secondary/20 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-purple-500 to-pink-600 h-full"
                        style={{
                          width: `${(t.count / data.totalHabilitations) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="font-bold neon-text w-12 text-right">{t.count}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Expiration Status */}
        <Card className="electric-card">
          <CardHeader>
            <CardTitle>État des Expirations</CardTitle>
            <CardDescription>Répartition par statut d'expiration</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Expirées</p>
                <p className="text-2xl font-bold text-red-400">{data.expirationStats.expired}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Expirant sous 30 jours</p>
                <p className="text-2xl font-bold text-orange-400">{data.expirationStats.expiring30}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Expirant sous 90 jours</p>
                <p className="text-2xl font-bold text-yellow-400">{data.expirationStats.expiring90}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Valides</p>
                <p className="text-2xl font-bold text-green-400">{data.expirationStats.valid}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
