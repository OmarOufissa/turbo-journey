import { Layout } from "@/components/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Users, AlertCircle, Clock, Plus, FileText, RefreshCw,
  CalendarDays, TrendingUp, ShieldCheck, BarChart3, Trash2
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
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
  missingPdf: number;
  pendingRenewals: number;
  mostCommonCodes: Array<{ code: string; count: number }>;
  monthlyForecast: Array<{ month: string; count: number }>;
  byDivision: Array<{ name: string; total: number; expired: number; critical: number }>;
}

const MONTHS_FR = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"];
function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `${MONTHS_FR[parseInt(m) - 1]} ${y.slice(2)}`;
}
function barColor(count: number, max: number) {
  const ratio = count / (max || 1);
  if (ratio > 0.7) return "#ef4444";
  if (ratio > 0.4) return "#f97316";
  return "#3b82f6";
}

export default function Home() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    getStats()
      .then(res => { if (res.success) setStats(res.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const criticalCount = (stats?.expired ?? 0) + (stats?.lessThan3Months ?? 0);
  const maxForecast = Math.max(...(stats?.monthlyForecast?.map(m => m.count) ?? []), 1);

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight">Tableau de Bord</h1>
            <p className="text-muted-foreground mt-1 font-medium">
              Vue d'ensemble des habilitations et employés
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
            <Link to="/employees/add">
              <Button size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Ajouter un employé
              </Button>
            </Link>
          </div>
        </div>

        {/* Alert banner */}
        {criticalCount > 0 && !loading && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-900">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-400 font-medium">
              {criticalCount} habilitation(s) expirée(s) ou expirant dans moins de 3 mois — action requise.
            </p>
            <Link to="/employees?sort=expiration&sortDir=asc" className="ml-auto">
              <Button size="sm" variant="destructive">Voir</Button>
            </Link>
          </div>
        )}

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: "Total employés", value: stats?.total, icon: Users, color: "text-blue-600" },
            { label: "Expirés", value: stats?.expired, icon: AlertCircle, color: "text-red-600" },
            { label: "< 3 mois", value: stats?.lessThan3Months, icon: Clock, color: "text-orange-600" },
            { label: "< 6 mois", value: stats?.lessThan6Months, icon: Clock, color: "text-yellow-600" },
            { label: "Sans PDF", value: stats?.missingPdf, icon: FileText, color: stats?.missingPdf ? "text-amber-600" : "" },
            { label: "Renouvellements", value: stats?.pendingRenewals, icon: RefreshCw, color: stats?.pendingRenewals ? "text-purple-600" : "" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground font-medium">{label}</p>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className={`text-3xl font-black ${color}`}>
                {loading ? "—" : (value ?? 0)}
              </p>
            </Card>
          ))}
        </div>

        {/* Main content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Monthly forecast chart */}
          {stats?.monthlyForecast && stats.monthlyForecast.length > 0 && (
            <Card className="p-5 lg:col-span-2">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Expirations — 12 prochains mois
              </h2>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={stats.monthlyForecast.map(m => ({ ...m, label: monthLabel(m.month) }))}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={24} />
                  <Tooltip formatter={(v: number) => [`${v} employé(s)`, "Expirations"]} labelFormatter={l => `Mois : ${l}`} />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {stats.monthlyForecast.map((entry, i) => (
                      <Cell key={i} fill={barColor(entry.count, maxForecast)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Quick actions */}
          <Card className="p-5">
            <h2 className="text-lg font-bold mb-4">Actions rapides</h2>
            <div className="space-y-2">
              {[
                { to: "/employees", icon: Users, label: "Liste des employés" },
                { to: "/renewals", icon: RefreshCw, label: "Renouvellements en attente" },
                { to: "/calendar", icon: CalendarDays, label: "Calendrier des expirations" },
                { to: "/stats", icon: BarChart3, label: "Statistiques avancées" },
                { to: "/audit-log", icon: ShieldCheck, label: "Journal d'audit" },
                { to: "/trash", icon: Trash2, label: "Corbeille" },
              ].map(({ to, icon: Icon, label }) => (
                <Link key={to} to={to}>
                  <Button variant="outline" className="w-full justify-start h-10 text-sm font-medium">
                    <Icon className="w-4 h-4 mr-2 shrink-0" />
                    {label}
                  </Button>
                </Link>
              ))}
            </div>
          </Card>
        </div>

        {/* Division heatmap */}
        {stats?.byDivision && stats.byDivision.length > 0 && (
          <Card className="p-5">
            <h2 className="text-lg font-bold mb-4">Risques par division</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {stats.byDivision.sort((a, b) => b.total - a.total).map(d => {
                const maxDiv = Math.max(...stats.byDivision.map(x => x.total), 1);
                return (
                  <div key={d.name} className="space-y-1">
                    <div className="flex justify-between text-sm items-center">
                      <span className="font-medium truncate max-w-[200px]">{d.name}</span>
                      <div className="flex gap-1 items-center text-xs">
                        {d.expired > 0 && <Badge variant="destructive" className="px-1">{d.expired} exp.</Badge>}
                        {d.critical > 0 && <Badge className="px-1 bg-orange-500">{d.critical} &lt;3m</Badge>}
                        <span className="text-muted-foreground ml-1">{d.total}</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full flex overflow-hidden">
                        <div className="h-full bg-red-500" style={{ width: `${(d.expired / maxDiv) * 100}%` }} />
                        <div className="h-full bg-orange-400" style={{ width: `${(d.critical / maxDiv) * 100}%` }} />
                        <div className="h-full bg-primary" style={{ width: `${((d.total - d.expired - d.critical) / maxDiv) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {/* Habilitation breakdown */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: "ST uniquement", value: stats.stOnly, color: "bg-blue-100 dark:bg-blue-950/30", text: "text-blue-700 dark:text-blue-300" },
              { label: "HT uniquement", value: stats.htOnly, color: "bg-purple-100 dark:bg-purple-950/30", text: "text-purple-700 dark:text-purple-300" },
              { label: "ST + HT", value: stats.both, color: "bg-green-100 dark:bg-green-950/30", text: "text-green-700 dark:text-green-300" },
            ].map(({ label, value, color, text }) => (
              <Card key={label} className={`p-5 ${color} border-0`}>
                <p className={`text-sm font-semibold ${text}`}>{label}</p>
                <p className={`text-4xl font-black mt-1 ${text}`}>{loading ? "—" : value}</p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
