import { Layout } from "@/components/Layout";
import { useState, useEffect, useMemo, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Legend, Cell } from "recharts";
import { getEmployees } from "@/api/employees";
import { expirationForType } from "@/types/employee";
import type { Employee } from "@/types/employee";
import { RefreshCw, Printer, Download } from "lucide-react";
import { EmptyState } from "@/components/shared/EmptyState";

// The whole perimeter is a single Direction (confirmed with the user).
const DIRECTION_NAME = "Direction Transport Région Centre";

type Tone = "blue" | "emerald" | "amber" | "red" | "violet" | "cyan" | "rose" | "indigo" | "orange";
const TONES: Record<Tone, { bar: string; value: string }> = {
  blue:    { bar: "bg-blue-500",    value: "text-blue-600 dark:text-blue-400" },
  emerald: { bar: "bg-emerald-500", value: "text-emerald-600 dark:text-emerald-400" },
  amber:   { bar: "bg-amber-500",   value: "text-amber-600 dark:text-amber-400" },
  red:     { bar: "bg-red-500",     value: "text-red-600 dark:text-red-400" },
  violet:  { bar: "bg-violet-500",  value: "text-violet-600 dark:text-violet-400" },
  cyan:    { bar: "bg-cyan-500",    value: "text-cyan-600 dark:text-cyan-400" },
  rose:    { bar: "bg-rose-500",    value: "text-rose-600 dark:text-rose-400" },
  indigo:  { bar: "bg-indigo-500",  value: "text-indigo-600 dark:text-indigo-400" },
  orange:  { bar: "bg-orange-500",  value: "text-orange-600 dark:text-orange-400" },
};

function StatCard({ title, value, sub, tone = "blue" }: { title: string; value: string | number; sub?: string; tone?: Tone }) {
  const t = TONES[tone];
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute inset-x-0 top-0 h-1 ${t.bar}`} />
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle></CardHeader>
      <CardContent>
        <p className={`text-3xl font-bold ${t.value}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const MONTHS = ["Jan","Fév","Mar","Avr","Mai","Juin","Juil","Aoû","Sep","Oct","Nov","Déc"];
function monthLabel(ym: string) { const [y, m] = ym.split("-"); return `${MONTHS[parseInt(m) - 1]} ${y.slice(2)}`; }
const PIE_COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f97316", "#ef4444", "#ec4899", "#14b8a6", "#f59e0b", "#6366f1", "#84cc16"];

function isoPlusMonths(m: number): string {
  const d = new Date(); d.setMonth(d.getMonth() + m);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
const TODAY = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

type HabType = "HT" | "ST";
interface Hab { agentId: number; type: HabType; exp?: string; codes: string[]; division: string; service: string; equipe: string; hasPdf: boolean; }
type Status = "valid" | "lt6" | "lt3" | "expired" | "none";
function statusOf(exp?: string): Status {
  if (!exp) return "none";
  if (exp < TODAY) return "expired";
  if (exp <= isoPlusMonths(3)) return "lt3";
  if (exp <= isoPlusMonths(6)) return "lt6";
  return "valid";
}

export default function Stats() {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const printRef = useRef<HTMLIFrameElement>(null);

  const [divisionFilter, setDivisionFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [equipeFilter, setEquipeFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "ht" | "st">("all");

  const load = () => {
    setLoading(true); setError(false);
    getEmployees({ page: 1, limit: 5000 })
      .then(res => { if (res.success) setEmployees(res.data.employees.filter(e => e.currentVersion)); else setError(true); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  // Cascade filter options derived from the data itself
  const divisions = useMemo(() => {
    const m = new Map<string, string>();
    (employees ?? []).forEach(e => { const v = e.currentVersion!; if (v.divisionId) m.set(String(v.divisionId), v.division); });
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [employees]);
  const services = useMemo(() => {
    const m = new Map<string, string>();
    (employees ?? []).forEach(e => { const v = e.currentVersion!; if (divisionFilter !== "all" && String(v.divisionId) !== divisionFilter) return; if (v.serviceId) m.set(String(v.serviceId), v.service); });
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, divisionFilter]);
  const equipes = useMemo(() => {
    const m = new Map<string, string>();
    (employees ?? []).forEach(e => { const v = e.currentVersion!; if (divisionFilter !== "all" && String(v.divisionId) !== divisionFilter) return; if (serviceFilter !== "all" && String(v.serviceId) !== serviceFilter) return; if (v.equipeId) m.set(String(v.equipeId), v.equipe || "(Sans équipe)"); });
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [employees, divisionFilter, serviceFilter]);

  // Habilitations in scope, respecting the HT/ST toggle
  const habs = useMemo<Hab[]>(() => {
    const out: Hab[] = [];
    (employees ?? []).forEach(e => {
      const v = e.currentVersion!;
      if (divisionFilter !== "all" && String(v.divisionId) !== divisionFilter) return;
      if (serviceFilter !== "all" && String(v.serviceId) !== serviceFilter) return;
      if (equipeFilter !== "all" && String(v.equipeId) !== equipeFilter) return;
      const base = { agentId: e.id, division: v.division, service: v.service, equipe: v.equipe || "(Sans équipe)" };
      if ((v.htCodes?.length ?? 0) > 0 && typeFilter !== "st")
        out.push({ ...base, type: "HT", exp: expirationForType(v, "ht"), codes: v.htCodes, hasPdf: !!v.pdfPath });
      if ((v.stCodes?.length ?? 0) > 0 && typeFilter !== "ht")
        out.push({ ...base, type: "ST", exp: expirationForType(v, "st"), codes: v.stCodes, hasPdf: !!v.pdfPathSt });
    });
    return out;
  }, [employees, divisionFilter, serviceFilter, equipeFilter, typeFilter]);

  // Which sub-level to break the comparative table down by
  const level: "division" | "service" | "equipe" | "none" =
    equipeFilter !== "all" ? "none" : serviceFilter !== "all" ? "equipe" : divisionFilter !== "all" ? "service" : "division";
  const levelLabel = { division: "Division", service: "Service", equipe: "Équipe", none: "Entité" }[level];
  const groupName = (h: Hab) => level === "division" ? h.division : level === "service" ? h.service : level === "equipe" ? h.equipe : (equipeName() || "Sélection");
  function equipeName() { return equipes.find(e => e.id === equipeFilter)?.name ?? ""; }

  const agg = (list: Hab[]) => {
    const agents = new Set(list.map(h => h.agentId)).size;
    let expired = 0, lt3 = 0, lt6 = 0, valid = 0, noPdf = 0, ht = 0, st = 0;
    list.forEach(h => {
      const s = statusOf(h.exp);
      if (s === "expired") expired++; else if (s === "lt3") lt3++; else if (s === "lt6") lt6++; else valid++;
      if (!h.hasPdf) noPdf++;
      if (h.type === "HT") ht++; else st++;
    });
    const total = list.length;
    const conform = total ? Math.round(((total - expired) / total) * 100) : 100;
    return { agents, total, expired, lt3, lt6, valid, noPdf, ht, st, conform };
  };

  const global = useMemo(() => agg(habs), [habs]);

  // Comparative table rows per sub-entity
  const rows = useMemo(() => {
    const groups = new Map<string, Hab[]>();
    habs.forEach(h => { const k = groupName(h); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(h); });
    return [...groups].map(([name, list]) => ({ name, ...agg(list) })).sort((a, b) => b.total - a.total);
  }, [habs, level]);

  // 12-month renewal forecast
  const forecast = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (let i = 0; i < 12; i++) buckets[isoPlusMonths(i).slice(0, 7)] = 0;
    habs.forEach(h => { if (h.exp && h.exp >= TODAY.slice(0, 7) + "-01") { const ym = h.exp.slice(0, 7); if (ym in buckets) buckets[ym]++; } });
    return Object.keys(buckets).sort().map(ym => ({ month: ym, label: monthLabel(ym), count: buckets[ym] }));
  }, [habs]);

  // Symbols distribution
  const codePie = useMemo(() => {
    const c: Record<string, number> = {};
    habs.forEach(h => h.codes.forEach(code => { c[code] = (c[code] ?? 0) + 1; }));
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value], i) => ({ name, value, color: PIE_COLORS[i % PIE_COLORS.length] }));
  }, [habs]);

  const scopePath = [DIRECTION_NAME,
    divisionFilter !== "all" ? divisions.find(d => d.id === divisionFilter)?.name : null,
    serviceFilter !== "all" ? services.find(s => s.id === serviceFilter)?.name : null,
    equipeFilter !== "all" ? equipes.find(e => e.id === equipeFilter)?.name : null,
  ].filter(Boolean).join(" › ");
  const typeLabel = typeFilter === "all" ? "HT + ST" : typeFilter.toUpperCase();

  const resetFilters = () => { setDivisionFilter("all"); setServiceFilter("all"); setEquipeFilter("all"); setTypeFilter("all"); };

  // ── Exports ───────────────────────────────────────────────────────────────
  const exportCsv = () => {
    const head = [levelLabel, "Agents", "Habilitations", "Valides", "< 3 mois", "< 6 mois", "Expirées", "% Conformité"];
    const lines = [head.join(";"), ...rows.map(r => [r.name, r.agents, r.total, r.valid, r.lt3, r.lt6, r.expired, r.conform + "%"].join(";"))];
    const csv = "﻿" + lines.join("\r\n"); // BOM for Excel accents
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `statistiques_habilitations_${TODAY}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const printReport = () => {
    const esc = (s: any) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const kpi = (label: string, val: string | number) => `<div class="kpi"><div class="kv">${val}</div><div class="kl">${label}</div></div>`;
    // Grab a rendered chart's SVG and make it scale to the page width.
    const captureChart = (id: string): string => {
      const svg = document.getElementById(id)?.querySelector("svg");
      if (!svg) return "";
      const clone = svg.cloneNode(true) as SVGElement;
      const w = clone.getAttribute("width"), h = clone.getAttribute("height");
      if (w && h && !clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${parseFloat(w)} ${parseFloat(h)}`);
      clone.removeAttribute("width"); clone.removeAttribute("height");
      clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
      return clone.outerHTML;
    };
    const donut = captureChart("stat-chart-donut");
    const statusBars = captureChart("stat-chart-status");
    const forecast = captureChart("stat-chart-forecast");
    const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8">
      <style>
        *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;padding:18px;font-size:12px}
        h1{font-size:18px;margin:0 0 2px} .sub{color:#555;margin:0 0 2px}
        .meta{color:#666;font-size:11px;margin-bottom:12px}
        .kpis{display:flex;flex-wrap:wrap;gap:10px;margin:10px 0 16px}
        .kpi{border:1px solid #ccc;border-radius:8px;padding:8px 12px;min-width:120px}
        .kv{font-size:20px;font-weight:bold} .kl{font-size:10px;color:#555;text-transform:uppercase;letter-spacing:.03em}
        h2{font-size:13px;margin:16px 0 6px;border-bottom:1px solid #ddd;padding-bottom:3px}
        .charts{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}
        .chart{border:1px solid #e0e0e0;border-radius:8px;padding:8px}
        .chart.wide{flex:1 1 100%} .chart.half{flex:1 1 300px}
        .chart svg{width:100%;height:auto;max-height:260px}
        .chart .t{font-size:11px;font-weight:bold;margin-bottom:4px;color:#333}
        table{border-collapse:collapse;width:100%;margin-top:8px} th,td{border:1px solid #bbb;padding:5px 7px;font-size:11px}
        th{background:#f0f0f0;text-align:left} td.n,th.n{text-align:right}
        .exp{color:#b42318;font-weight:bold} .ok{color:#1a7f37;font-weight:bold}
        @page{size:A4 portrait;margin:12mm}
      </style></head><body>
      <h1>Statistiques des habilitations électriques</h1>
      <div class="sub">${esc(scopePath)}</div>
      <div class="meta">Type : ${typeLabel} — Édité le ${new Date().toLocaleDateString("fr-FR")} ${new Date().toLocaleTimeString("fr-FR").slice(0,5)}</div>
      <div class="kpis">
        ${kpi("Agents", global.agents)}
        ${kpi("Habilitations", global.total)}
        ${kpi("Taux de conformité", global.conform + "%")}
        ${kpi("Expirées", global.expired)}
        ${kpi("À renouveler < 3 mois", global.lt3)}
        ${kpi("À renouveler < 6 mois", global.lt6)}
        ${kpi("HT / ST", global.ht + " / " + global.st)}
        ${kpi("Sans PDF", global.noPdf)}
      </div>
      ${(donut || forecast || statusBars) ? `<h2>Synthèse visuelle</h2><div class="charts">
        ${donut ? `<div class="chart half"><div class="t">Taux de conformité</div>${donut}</div>` : ""}
        ${forecast ? `<div class="chart half"><div class="t">Renouvellements à venir (12 mois)</div>${forecast}</div>` : ""}
        ${statusBars ? `<div class="chart wide"><div class="t">Statut des habilitations par ${esc(levelLabel.toLowerCase())}</div>${statusBars}</div>` : ""}
      </div>` : ""}
      <h2>Détail par ${esc(levelLabel.toLowerCase())}</h2>
      <table>
        <thead><tr><th>${levelLabel}</th><th class="n">Agents</th><th class="n">Habil.</th><th class="n">Valides</th><th class="n">&lt; 3 mois</th><th class="n">&lt; 6 mois</th><th class="n">Expirées</th><th class="n">% Conf.</th></tr></thead>
        <tbody>
        ${rows.map(r => `<tr><td>${esc(r.name)}</td><td class="n">${r.agents}</td><td class="n">${r.total}</td><td class="n">${r.valid}</td><td class="n">${r.lt3}</td><td class="n">${r.lt6}</td><td class="n exp">${r.expired}</td><td class="n ${r.conform >= 80 ? "ok" : "exp"}">${r.conform}%</td></tr>`).join("")}
        </tbody>
        <tfoot><tr><th>Total</th><th class="n">${global.agents}</th><th class="n">${global.total}</th><th class="n">${global.valid}</th><th class="n">${global.lt3}</th><th class="n">${global.lt6}</th><th class="n">${global.expired}</th><th class="n">${global.conform}%</th></tr></tfoot>
      </table>
      </body></html>`;
    const ifr = printRef.current;
    if (!ifr) return;
    ifr.srcdoc = html;
    ifr.onload = () => { try { ifr.contentWindow?.focus(); ifr.contentWindow?.print(); } catch {} };
  };

  if (loading) return (
    <Layout><div className="p-6 space-y-4">
      <Skeleton className="h-8 w-56" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-72" />
    </div></Layout>
  );

  if (!employees || employees.length === 0) return (
    <Layout><div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Statistiques</h1>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4 mr-1" />Réessayer</Button>
      </div>
      <EmptyState title={error ? "Impossible de charger les statistiques" : "Aucune donnée"} description={error ? "Une erreur s'est produite. Réessayez." : "Aucun agent actif trouvé."} />
    </div></Layout>
  );

  return (
    <Layout>
      <iframe ref={printRef} title="impression" style={{ position: "fixed", width: 0, height: 0, border: 0, visibility: "hidden" }} />
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Statistiques des habilitations</h1>
            <p className="text-sm text-muted-foreground">{scopePath} — {typeLabel}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={printReport}><Printer className="w-4 h-4 mr-1" />Imprimer / PDF</Button>
            <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1" />Exporter (Excel)</Button>
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4 mr-1" />Actualiser</Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-end">
          <Select value={divisionFilter} onValueChange={v => { setDivisionFilter(v); setServiceFilter("all"); setEquipeFilter("all"); }}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Division" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Toutes divisions</SelectItem>{divisions.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={serviceFilter} onValueChange={v => { setServiceFilter(v); setEquipeFilter("all"); }} disabled={divisionFilter === "all"}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Service" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tous services</SelectItem>{services.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={equipeFilter} onValueChange={setEquipeFilter} disabled={serviceFilter === "all"}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Équipe" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Toutes équipes</SelectItem>{equipes.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent><SelectItem value="all">HT + ST</SelectItem><SelectItem value="ht">HT seulement</SelectItem><SelectItem value="st">ST seulement</SelectItem></SelectContent>
          </Select>
          {(divisionFilter !== "all" || typeFilter !== "all") && <Button variant="ghost" size="sm" onClick={resetFilters}>Réinitialiser</Button>}
        </div>

        {/* KPI band */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard tone="blue" title="Agents" value={global.agents} sub={`${global.total} habilitations`} />
          <StatCard tone="emerald" title="Taux de conformité" value={`${global.conform}%`} sub={`${global.valid} valides`} />
          <StatCard tone="red" title="Expirées" value={global.expired} />
          <StatCard tone="orange" title="À renouveler < 3 mois" value={global.lt3} />
          <StatCard tone="amber" title="À renouveler < 6 mois" value={global.lt6} />
          <StatCard tone="cyan" title="Habilitations HT" value={global.ht} />
          <StatCard tone="violet" title="Habilitations ST" value={global.st} />
          <StatCard tone="rose" title="Sans PDF" value={global.noPdf} sub="version actuelle" />
        </div>

        {/* Comparative table by sub-entity */}
        <Card>
          <CardHeader><CardTitle>Répartition par {levelLabel.toLowerCase()}</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left py-2 px-2">{levelLabel}</th>
                  <th className="text-right py-2 px-2">Agents</th>
                  <th className="text-right py-2 px-2">Habil.</th>
                  <th className="text-right py-2 px-2">Valides</th>
                  <th className="text-right py-2 px-2">&lt; 3 mois</th>
                  <th className="text-right py-2 px-2">&lt; 6 mois</th>
                  <th className="text-right py-2 px-2">Expirées</th>
                  <th className="text-right py-2 px-2">% Conf.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.name} className="border-t hover:bg-muted/40">
                    <td className="py-1.5 px-2">{r.name}</td>
                    <td className="text-right py-1.5 px-2 font-mono">{r.agents}</td>
                    <td className="text-right py-1.5 px-2 font-mono">{r.total}</td>
                    <td className="text-right py-1.5 px-2 font-mono text-emerald-600">{r.valid}</td>
                    <td className="text-right py-1.5 px-2 font-mono text-orange-600">{r.lt3}</td>
                    <td className="text-right py-1.5 px-2 font-mono text-amber-600">{r.lt6}</td>
                    <td className="text-right py-1.5 px-2 font-mono text-red-600">{r.expired}</td>
                    <td className={`text-right py-1.5 px-2 font-mono font-semibold ${r.conform >= 80 ? "text-emerald-600" : "text-red-600"}`}>{r.conform}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td className="py-2 px-2">Total</td>
                  <td className="text-right py-2 px-2 font-mono">{global.agents}</td>
                  <td className="text-right py-2 px-2 font-mono">{global.total}</td>
                  <td className="text-right py-2 px-2 font-mono">{global.valid}</td>
                  <td className="text-right py-2 px-2 font-mono">{global.lt3}</td>
                  <td className="text-right py-2 px-2 font-mono">{global.lt6}</td>
                  <td className="text-right py-2 px-2 font-mono">{global.expired}</td>
                  <td className="text-right py-2 px-2 font-mono">{global.conform}%</td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>

        {/* Visual: stacked status bars per entity (presentation-friendly) */}
        <Card>
          <CardHeader><CardTitle>Statut des habilitations par {levelLabel.toLowerCase()}</CardTitle></CardHeader>
          <CardContent id="stat-chart-status">
            <ResponsiveContainer width="100%" height={Math.max(220, Math.min(rows.length, 15) * 34 + 40)}>
              <BarChart layout="vertical" data={rows.slice(0, 15).map(r => ({ name: r.name, Valides: r.valid, "< 6 mois": r.lt6, "< 3 mois": r.lt3, "Expirées": r.expired }))} margin={{ left: 10, right: 20 }}>
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={180} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Valides" stackId="a" fill="#10b981" />
                <Bar dataKey="< 6 mois" stackId="a" fill="#f59e0b" />
                <Bar dataKey="< 3 mois" stackId="a" fill="#f97316" />
                <Bar dataKey="Expirées" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {rows.length > 15 && <p className="text-xs text-muted-foreground mt-2">15 premières entités affichées — affinez le filtre pour le détail.</p>}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Conformity donut */}
          <Card>
            <CardHeader><CardTitle>Taux de conformité</CardTitle></CardHeader>
            <CardContent>
              <div className="relative" id="stat-chart-donut">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={[
                      { name: "Valides", value: global.valid, color: "#10b981" },
                      { name: "< 6 mois", value: global.lt6, color: "#f59e0b" },
                      { name: "< 3 mois", value: global.lt3, color: "#f97316" },
                      { name: "Expirées", value: global.expired, color: "#ef4444" },
                    ].filter(d => d.value > 0)} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={62} outerRadius={92}>
                      {["#10b981", "#f59e0b", "#f97316", "#ef4444"].map((c, i) => <Cell key={i} fill={c} />)}
                    </Pie>
                    <Legend /><Tooltip formatter={(v: number, n: string) => [`${v}`, n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none" style={{ top: "-28px" }}>
                  <span className={`text-3xl font-bold ${global.conform >= 80 ? "text-emerald-600" : "text-red-600"}`}>{global.conform}%</span>
                  <span className="text-xs text-muted-foreground">conformes</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Renouvellements à venir (12 mois)</CardTitle></CardHeader>
            <CardContent id="stat-chart-forecast">
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={forecast}>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`${v} habilitation(s)`, "À renouveler"]} labelFormatter={l => `Mois : ${l}`} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>{forecast.map((_, i) => <Cell key={i} fill={i < 3 ? "#ef4444" : i < 6 ? "#f59e0b" : "#3b82f6"} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          {codePie.length > 0 && (
            <Card>
              <CardHeader><CardTitle>Symboles les plus fréquents</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={codePie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name} (${value})`}>
                      {codePie.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Legend /><Tooltip formatter={(v: number, n: string) => [`${v}`, n]} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
}
