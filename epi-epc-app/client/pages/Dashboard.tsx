import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  AreaChart,
  Area,
  Cell,
  LabelList,
} from "recharts";
import { Package, Boxes, Truck, AlertTriangle, Ban, CalendarClock, Users, Network } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { DashboardKpis, DashboardCharts } from "@shared/api";
import { StatCard } from "@/components/shared/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/utils";
import { categoricalColor, coverageColor } from "@/lib/chartColors";

const GRID = "hsl(var(--border))";
const AXIS_TICK = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };

export default function Dashboard() {
  const { data: kpis, isLoading: loadingKpis } = useQuery<DashboardKpis>({ queryKey: ["dashboard", "kpis"], queryFn: () => apiGet("/dashboard/kpis") });
  const { data: charts, isLoading: loadingCharts } = useQuery<DashboardCharts>({ queryKey: ["dashboard", "charts"], queryFn: () => apiGet("/dashboard/charts") });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Tableau de bord</h1>
        <p className="text-sm text-muted-foreground">Vue d'ensemble de la dotation EPI/EPC — Direction Transport Casablanca</p>
      </div>

      {loadingKpis || !kpis ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Références articles" value={kpis.totalReferences} icon={Package} hint={`${kpis.totalArticles.toLocaleString("fr-FR")} unités au total`} />
          <StatCard label="Stock disponible" value={kpis.stockDisponible.toLocaleString("fr-FR")} icon={Boxes} hint={formatMoney(kpis.valeurStockDisponible)} />
          <StatCard label="Distribué (en service)" value={kpis.stockDistribue.toLocaleString("fr-FR")} icon={Truck} />
          <StatCard label="Bénéficiaires actifs" value={kpis.totalBeneficiaires} icon={Users} />
          <StatCard label="Équipes" value={kpis.totalEquipes} icon={Network} />
          <StatCard label="Ruptures de stock" value={kpis.articlesRupture} icon={Ban} tone={kpis.articlesRupture ? "critical" : "success"} />
          <StatCard label="Stock faible" value={kpis.articlesStockFaible} icon={AlertTriangle} tone={kpis.articlesStockFaible ? "warning" : "success"} />
          <StatCard label="Contrôles en retard" value={kpis.controlesEnRetard} icon={CalendarClock} tone={kpis.controlesEnRetard ? "critical" : "success"} />
        </div>
      )}

      {loadingCharts || !charts ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-80" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Répartition des dotations par famille</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.repartitionFamille} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid horizontal={false} stroke={GRID} />
                    <XAxis type="number" tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} />
                    <YAxis type="category" dataKey="label" width={160} tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: "hsl(var(--muted))" }}
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="value" name="Quantité distribuée" radius={[0, 4, 4, 0]} maxBarSize={18}>
                      {charts.repartitionFamille.map((_, i) => (
                        <Cell key={i} fill={categoricalColor(i)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Bénéficiaires par division</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.repartitionDivision} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid horizontal={false} stroke={GRID} />
                    <XAxis type="number" tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="label" width={170} tick={{ ...AXIS_TICK, fontSize: 10.5 }} axisLine={{ stroke: GRID }} tickLine={false} />
                    <Tooltip cursor={{ fill: "hsl(var(--muted))" }} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="value" name="Agents" radius={[0, 4, 4, 0]} maxBarSize={22}>
                      {charts.repartitionDivision.map((_, i) => (
                        <Cell key={i} fill={categoricalColor(i)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Évolution des dotations (EPI vs EPC)</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={charts.evolutionDotations}>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="mois" tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} />
                    <YAxis tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="epi" name="EPI (individuel)" stroke={categoricalColor(0)} strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="epc" name="EPC (collectif)" stroke={categoricalColor(1)} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Évolution des achats (marchés)</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={charts.evolutionAchats}>
                    <defs>
                      <linearGradient id="achatsFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={categoricalColor(0)} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={categoricalColor(0)} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke={GRID} />
                    <XAxis dataKey="mois" tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} />
                    <YAxis tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip
                      formatter={(v: number) => formatMoney(v)}
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    />
                    <Area type="monotone" dataKey="montant" name="Montant engagé" stroke={categoricalColor(0)} strokeWidth={2} fill="url(#achatsFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Coût de dotation par division</CardTitle>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.coutParDivision} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid horizontal={false} stroke={GRID} />
                    <XAxis type="number" tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <YAxis type="category" dataKey="label" width={170} tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} />
                    <Tooltip formatter={(v: number) => formatMoney(v)} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="value" name="Coût" radius={[0, 4, 4, 0]} maxBarSize={18}>
                      {charts.coutParDivision.map((_, i) => (
                        <Cell key={i} fill={categoricalColor(i)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Taux de couverture par équipe</CardTitle>
                <p className="text-xs text-muted-foreground">Effectif équipé / effectif théorique (7 agents) — équipes les plus critiques</p>
              </CardHeader>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.tauxCouverture.slice(0, 12)} layout="vertical" margin={{ left: 8, right: 28 }}>
                    <CartesianGrid horizontal={false} stroke={GRID} />
                    <XAxis type="number" domain={[0, (max: number) => Math.max(100, max)]} tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} unit="%" />
                    <YAxis type="category" dataKey="equipe" width={170} tick={{ ...AXIS_TICK, fontSize: 10 }} axisLine={{ stroke: GRID }} tickLine={false} />
                    <Tooltip formatter={(v: number) => `${v}%`} contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="taux" name="Taux de couverture" radius={[0, 4, 4, 0]} maxBarSize={14}>
                      {charts.tauxCouverture.slice(0, 12).map((row, i) => (
                        <Cell key={i} fill={coverageColor(row.taux)} />
                      ))}
                      <LabelList dataKey="taux" position="right" formatter={(v: number) => `${v}%`} style={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
