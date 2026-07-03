import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
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
import { Package, Boxes, Truck, AlertTriangle, Ban, CalendarClock, Users, Network, ShieldCheck, ArrowRight } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { DashboardKpis, DashboardCharts, DashboardReglementaire } from "@shared/api";
import { StatCard } from "@/components/shared/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatMoney } from "@/lib/utils";
import { categoricalColor, coverageColor } from "@/lib/chartColors";

const GRID = "hsl(var(--border))";
const AXIS_TICK = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export default function Dashboard() {
  const { data: kpis, isLoading: loadingKpis } = useQuery<DashboardKpis>({ queryKey: ["dashboard", "kpis"], queryFn: () => apiGet("/dashboard/kpis") });
  const { data: charts, isLoading: loadingCharts } = useQuery<DashboardCharts>({ queryKey: ["dashboard", "charts"], queryFn: () => apiGet("/dashboard/charts") });
  const { data: reglementaire, isLoading: loadingReglementaire } = useQuery<DashboardReglementaire>({
    queryKey: ["dashboard", "reglementaire"],
    queryFn: () => apiGet("/dashboard/reglementaire"),
  });

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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Suivi réglementaire</CardTitle>
            <p className="text-xs text-muted-foreground">Appareils de levage, extincteurs/LCI, appareils sous pression, perches isolantes — contrôle et réépreuve périodiques obligatoires</p>
          </div>
          <Link to="/controles?reglementaireOnly=true" className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline">
            Voir tous les contrôles <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadingReglementaire || !reglementaire ? (
            <Skeleton className="h-32" />
          ) : reglementaire.parFamille.every((f) => f.nbUnites === 0) ? (
            <EmptyChartState message="Aucune unité physique enregistrée pour ces familles pour le moment — affectez un appareil (pont roulant, extincteur, perche, appareil sous pression…) pour activer son suivi." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {reglementaire.parFamille.map((f) => (
                  <Link
                    key={f.familleId}
                    to={`/controles?reglementaireOnly=true&familleId=${f.familleId}`}
                    className="rounded-lg border p-3 transition-colors hover:bg-muted/50"
                  >
                    <p className="truncate text-sm font-medium">{f.familleNom}</p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{f.nbUnites}</p>
                    <p className="text-xs text-muted-foreground">unité(s) suivie(s)</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {f.nbControlesEnRetard > 0 && <Badge variant="destructive">{f.nbControlesEnRetard} expiré(s)</Badge>}
                      {f.nbControlesAVenir30j > 0 && <Badge variant="warning">{f.nbControlesAVenir30j} à échéance</Badge>}
                      {f.nbSansControlePlanifie > 0 && <Badge variant="muted">{f.nbSansControlePlanifie} sans contrôle</Badge>}
                      {f.nbControlesEnRetard === 0 && f.nbControlesAVenir30j === 0 && f.nbSansControlePlanifie === 0 && <Badge variant="success">À jour</Badge>}
                    </div>
                  </Link>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Contrôles expirés</p>
                  {reglementaire.expires.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun contrôle expiré</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {reglementaire.expires.slice(0, 6).map((e) => (
                        <li key={e.controleId} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate">
                            {e.designation}
                            {e.lieuEmplacement ? ` — ${e.lieuEmplacement}` : ""}
                            {e.numeroSerie ? ` (${e.numeroSerie})` : ""}
                          </span>
                          <Badge variant="destructive" className="shrink-0">{formatDate(e.datePlanifiee)}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Échéances à venir (30 jours)</p>
                  {reglementaire.aVenir.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune échéance dans les 30 prochains jours</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {reglementaire.aVenir.slice(0, 6).map((e) => (
                        <li key={e.controleId} className="flex items-center justify-between gap-2 text-sm">
                          <span className="truncate">
                            {e.designation}
                            {e.lieuEmplacement ? ` — ${e.lieuEmplacement}` : ""}
                            {e.numeroSerie ? ` (${e.numeroSerie})` : ""}
                          </span>
                          <Badge variant="warning" className="shrink-0">{formatDate(e.datePlanifiee)}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

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
                {charts.evolutionDotations.length === 0 ? (
                  <EmptyChartState message="Aucune date de dotation renseignée dans les données reprises — à alimenter au fil des nouvelles affectations." />
                ) : (
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
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Évolution des achats (marchés)</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {charts.evolutionAchats.length === 0 ? (
                  <EmptyChartState message="Aucun marché enregistré pour le moment — ce graphique se remplira au fur et à mesure de la saisie des marchés." />
                ) : (
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
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Coût de dotation par division</CardTitle>
                <p className="text-xs text-muted-foreground">Nécessite les prix unitaires des articles (non fournis dans les données reprises)</p>
              </CardHeader>
              <CardContent className="h-80">
                {charts.coutParDivision.every((c) => c.value === 0) ? (
                  <EmptyChartState message="Aucun prix unitaire renseigné — saisissez les prix des articles pour activer cet indicateur." />
                ) : (
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
                )}
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
