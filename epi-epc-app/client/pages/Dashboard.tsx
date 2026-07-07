import { useMemo, useState } from "react";
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
import { Package, AlertTriangle, Ban, CalendarClock, Users, Network, ShieldCheck, ArrowRight, ClipboardList, Filter, Trash2, ClipboardPlus } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { DashboardKpis, DashboardCharts, DashboardReglementaire, Division, Service, Equipe, BesoinLine } from "@shared/api";
import { StatCard } from "@/components/shared/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { HierarchieCascade } from "@/components/shared/HierarchieCascade";
import { AffecterDialog, type AffecterInitial } from "@/components/shared/AffecterDialog";
import { formatDate, formatMoney } from "@/lib/utils";
import { categoricalColor, coverageColor } from "@/lib/chartColors";

interface DashboardFilters {
  divisionId: number | null;
  serviceId: number | null;
  equipeId: number | null;
  fournisseur: string | null;
  hierarchieAncestorId: number | null;
  dateDebut: string;
  dateFin: string;
}

const EMPTY_FILTERS: DashboardFilters = {
  divisionId: null,
  serviceId: null,
  equipeId: null,
  fournisseur: null,
  hierarchieAncestorId: null,
  dateDebut: "",
  dateFin: "",
};

function buildFilterQs(f: DashboardFilters) {
  const parts: string[] = [];
  if (f.divisionId != null) parts.push(`divisionId=${f.divisionId}`);
  if (f.serviceId != null) parts.push(`serviceId=${f.serviceId}`);
  if (f.equipeId != null) parts.push(`equipeId=${f.equipeId}`);
  if (f.fournisseur) parts.push(`fournisseur=${encodeURIComponent(f.fournisseur)}`);
  if (f.hierarchieAncestorId != null) parts.push(`hierarchieAncestorId=${f.hierarchieAncestorId}`);
  if (f.dateDebut) parts.push(`dateDebut=${f.dateDebut}`);
  if (f.dateFin) parts.push(`dateFin=${f.dateFin}`);
  return parts.join("&");
}

const GRID = "hsl(var(--border))";
const AXIS_TICK = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

interface ArticlesStatut {
  expires: number;
  arrivantAEcheance: number;
  dureeVieAtteinte: number;
  reformes: number;
}
interface BesoinsResponse {
  parDivision: { divisionId: number | null; besoin: number; dote: number }[];
  parEquipe: { equipeId: number; equipeNom: string; besoin: number; dote: number }[];
  parAgent: { agentId: number; agentNom: string; besoin: number; dote: number }[];
  parCategorie: { categorieId: number | null; categorieNom: string; besoin: number; dote: number }[];
  parFamille: { familleId: number | null; familleNom: string; besoin: number; dote: number }[];
}

export default function Dashboard() {
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_FILTERS);
  const [affecterOpen, setAffecterOpen] = useState(false);
  const [affecterBeneficiaire, setAffecterBeneficiaire] = useState<{ type: "agent" | "equipe"; id: number } | null>(null);
  const qs = useMemo(() => buildFilterQs(filters), [filters]);
  const qsSuffix = qs ? `?${qs}` : "";

  const { data: divisions } = useQuery<Division[]>({ queryKey: ["org-divisions"], queryFn: () => apiGet("/org/divisions") });
  const { data: services } = useQuery<Service[]>({ queryKey: ["org-services"], queryFn: () => apiGet("/org/services") });
  const { data: equipes } = useQuery<Equipe[]>({ queryKey: ["org-equipes"], queryFn: () => apiGet("/org/equipes") });
  const { data: fournisseurs } = useQuery<string[]>({ queryKey: ["articles-fournisseurs"], queryFn: () => apiGet("/articles/fournisseurs") });

  const { data: kpis, isLoading: loadingKpis } = useQuery<DashboardKpis>({ queryKey: ["dashboard", "kpis", qs], queryFn: () => apiGet(`/dashboard/kpis${qsSuffix}`) });
  const { data: charts, isLoading: loadingCharts } = useQuery<DashboardCharts>({ queryKey: ["dashboard", "charts", qs], queryFn: () => apiGet(`/dashboard/charts${qsSuffix}`) });
  const { data: reglementaire, isLoading: loadingReglementaire } = useQuery<DashboardReglementaire>({
    queryKey: ["dashboard", "reglementaire", qs],
    queryFn: () => apiGet(`/dashboard/reglementaire${qsSuffix}`),
  });
  const { data: besoins, isLoading: loadingBesoins } = useQuery<BesoinsResponse>({
    queryKey: ["dashboard", "besoins", qs],
    queryFn: () => apiGet(`/dashboard/besoins${qsSuffix}`),
  });
  const { data: articlesStatut, isLoading: loadingArticlesStatut } = useQuery<ArticlesStatut>({
    queryKey: ["dashboard", "articles-statut", qs],
    queryFn: () => apiGet(`/dashboard/articles-statut${qsSuffix}`),
  });

  const servicesForDivision = filters.divisionId != null ? services?.filter((s) => s.divisionId === filters.divisionId) : services;
  const equipesForService = filters.serviceId != null ? equipes?.filter((e) => e.serviceId === filters.serviceId) : equipes;
  const divisionNomById = useMemo(() => new Map(divisions?.map((d) => [d.id, d.nom])), [divisions]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Tableau de bord</h1>
          <p className="text-sm text-muted-foreground">Vue d'ensemble de la dotation EPI/EPC — Direction Transport Casablanca</p>
        </div>
        <Button onClick={() => setAffecterOpen(true)}><ClipboardPlus className="h-4 w-4" /> Affecter un matériel</Button>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
          <HierarchieCascade
            value={filters.hierarchieAncestorId}
            onChange={(id) => setFilters((f) => ({ ...f, hierarchieAncestorId: id }))}
            allowAll
            labels={["Catégorie générale", "Famille", "Sous-famille"]}
          />
          <Select value={filters.divisionId != null ? String(filters.divisionId) : "all"} onValueChange={(v) => setFilters((f) => ({ ...f, divisionId: v === "all" ? null : Number(v), serviceId: null, equipeId: null }))}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Division" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes divisions</SelectItem>
              {divisions?.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.serviceId != null ? String(filters.serviceId) : "all"} onValueChange={(v) => setFilters((f) => ({ ...f, serviceId: v === "all" ? null : Number(v), equipeId: null }))}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Service" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous services</SelectItem>
              {servicesForDivision?.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.equipeId != null ? String(filters.equipeId) : "all"} onValueChange={(v) => setFilters((f) => ({ ...f, equipeId: v === "all" ? null : Number(v) }))}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Équipe" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes équipes</SelectItem>
              {equipesForService?.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filters.fournisseur ?? "all"} onValueChange={(v) => setFilters((f) => ({ ...f, fournisseur: v === "all" ? null : v }))}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Fournisseur" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous fournisseurs</SelectItem>
              {fournisseurs?.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" className="w-40" value={filters.dateDebut} onChange={(e) => setFilters((f) => ({ ...f, dateDebut: e.target.value }))} placeholder="Du" />
          <Input type="date" className="w-40" value={filters.dateFin} onChange={(e) => setFilters((f) => ({ ...f, dateFin: e.target.value }))} placeholder="Au" />
        </div>
      </Card>

      {loadingKpis || !kpis ? (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Références articles" value={kpis.totalReferences} icon={Package} hint={`${kpis.totalArticles.toLocaleString("fr-FR")} unités au total`} />
          <StatCard label="Bénéficiaires actifs" value={kpis.totalBeneficiaires} icon={Users} />
          <StatCard label="Équipes" value={kpis.totalEquipes} icon={Network} />
          <StatCard label="Agents conformes" value={kpis.agentsConformes} icon={ShieldCheck} tone="success" />
          <StatCard label="Agents avec besoin" value={kpis.agentsAvecBesoin} icon={AlertTriangle} tone={kpis.agentsAvecBesoin ? "warning" : "success"} />
          <StatCard label="Équipes conformes" value={kpis.equipesConformes} icon={ShieldCheck} tone="success" />
          <StatCard label="Équipes avec besoin" value={kpis.equipesAvecBesoin} icon={AlertTriangle} tone={kpis.equipesAvecBesoin ? "warning" : "success"} />
          <StatCard label="Contrôles réglementaires à réaliser" value={kpis.controlesReglementairesARealiser} icon={CalendarClock} tone={kpis.controlesReglementairesARealiser ? "critical" : "success"} />
          <StatCard label="Contrôles périodiques à réaliser" value={kpis.controlesPeriodiquesARealiser} icon={CalendarClock} tone={kpis.controlesPeriodiquesARealiser ? "warning" : "success"} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardList className="h-4 w-4" /> Besoins vs. dotation</CardTitle>
          <p className="text-xs text-muted-foreground">Écart entre le gabarit de dotation applicable (besoin) et les affectations actives (doté), par division / équipe / agent / catégorie / famille</p>
        </CardHeader>
        <CardContent>
          {loadingBesoins || !besoins ? (
            <Skeleton className="h-48" />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <BesoinTable
                title="Par division"
                rows={besoins.parDivision.map((r) => ({ label: r.divisionId != null ? (divisionNomById.get(r.divisionId) ?? "?") : "Sans division", besoin: r.besoin, dote: r.dote }))}
                onAffecter={setAffecterBeneficiaire}
              />
              <BesoinTable
                title="Par équipe"
                rows={besoins.parEquipe.map((r) => ({ label: r.equipeNom, besoin: r.besoin, dote: r.dote, beneficiaire: { type: "equipe" as const, id: r.equipeId } }))}
                onAffecter={setAffecterBeneficiaire}
              />
              <BesoinTable
                title="Par agent"
                rows={besoins.parAgent.map((r) => ({ label: r.agentNom, besoin: r.besoin, dote: r.dote, beneficiaire: { type: "agent" as const, id: r.agentId } }))}
                onAffecter={setAffecterBeneficiaire}
              />
              <BesoinTable
                title="Par catégorie"
                rows={besoins.parCategorie.map((r) => ({ label: r.categorieNom, besoin: r.besoin, dote: r.dote }))}
                onAffecter={setAffecterBeneficiaire}
              />
              <BesoinTable
                title="Par famille"
                rows={besoins.parFamille.map((r) => ({ label: r.familleNom, besoin: r.besoin, dote: r.dote }))}
                onAffecter={setAffecterBeneficiaire}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Ban className="h-4 w-4" /> État des articles</CardTitle>
          <p className="text-xs text-muted-foreground">Expirés, arrivant à échéance, durée de vie atteinte, réformés</p>
        </CardHeader>
        <CardContent>
          {loadingArticlesStatut || !articlesStatut ? (
            <Skeleton className="h-20" />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Expirés" value={articlesStatut.expires} icon={Ban} tone={articlesStatut.expires ? "critical" : "success"} />
              <StatCard label="Arrivant à échéance" value={articlesStatut.arrivantAEcheance} icon={CalendarClock} tone={articlesStatut.arrivantAEcheance ? "warning" : "success"} />
              <StatCard label="Durée de vie atteinte" value={articlesStatut.dureeVieAtteinte} icon={AlertTriangle} tone={articlesStatut.dureeVieAtteinte ? "warning" : "success"} />
              <StatCard label="Réformés" value={articlesStatut.reformes} icon={Trash2} />
            </div>
          )}
        </CardContent>
      </Card>

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
                    to={`/controles?reglementaireOnly=true&hierarchieId=${f.familleId}`}
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

      <AffecterDialog
        open={affecterOpen || affecterBeneficiaire != null}
        onClose={() => { setAffecterOpen(false); setAffecterBeneficiaire(null); }}
        initial={affecterBeneficiaire != null ? ({ beneficiaire: affecterBeneficiaire } satisfies AffecterInitial) : undefined}
      />
    </div>
  );
}

interface BesoinTableRow {
  label: string;
  besoin: number;
  dote: number;
  beneficiaire?: { type: "agent" | "equipe"; id: number };
}

function BesoinTable({ title, rows, onAffecter }: { title: string; rows: BesoinTableRow[]; onAffecter: (b: { type: "agent" | "equipe"; id: number }) => void }) {
  const sorted = [...rows].sort((a, b) => b.besoin - a.besoin - (b.dote - a.dote)).slice(0, 12);
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <Table>
        <TableHeader>
          <TableRow><TableHead className="h-8">Nom</TableHead><TableHead className="h-8 text-right">Besoin</TableHead><TableHead className="h-8 text-right">Doté</TableHead><TableHead className="h-8" /></TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 && <TableRow><TableCell colSpan={4} className="py-4 text-center text-xs text-muted-foreground">Aucune donnée</TableCell></TableRow>}
          {sorted.map((r, i) => (
            <TableRow key={i}>
              <TableCell className="truncate text-sm">{r.label}</TableCell>
              <TableCell className="text-right tabular-nums text-sm">{r.besoin}</TableCell>
              <TableCell className="text-right tabular-nums text-sm">
                <span className={r.dote < r.besoin ? "text-destructive font-medium" : ""}>{r.dote}</span>
              </TableCell>
              <TableCell className="text-right">
                {r.beneficiaire && r.dote < r.besoin && (
                  <Button size="sm" variant="ghost" onClick={() => onAffecter(r.beneficiaire!)}><ClipboardPlus className="h-3.5 w-3.5" /></Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
