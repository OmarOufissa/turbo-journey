import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw as Refresh, Download } from "lucide-react";

interface GrpRow { name: string; renewals: number; agents: number; ht: number; st: number; newSymbols: number; }
interface Data {
  period: { from: string; to: string };
  totals: { renewals: number; agents: number; ht: number; st: number; symbolsRenewed: number; newSymbols: number };
  byDivision: GrpRow[]; byService: GrpRow[]; byEquipe: GrpRow[];
  symbolsRenewed: { code: string; count: number }[];
  newSymbols: { code: string; count: number }[];
}

function isoAddMonths(months: number): string {
  const d = new Date(); d.setMonth(d.getMonth() - months);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}
const TODAY = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const PRESETS: { k: string; label: string; months: number }[] = [
  { k: "1m", label: "1 mois", months: 1 }, { k: "2m", label: "2 mois", months: 2 },
  { k: "3m", label: "3 mois", months: 3 }, { k: "6m", label: "6 mois", months: 6 },
  { k: "12m", label: "12 mois", months: 12 },
];
const KPI_COLORS = ["#1f5aa6", "#10b981", "#8b5cf6", "#f97316"];
const BAR_COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f97316", "#ef4444", "#ec4899", "#14b8a6", "#f59e0b", "#6366f1", "#84cc16", "#06b6d4", "#a855f7"];

function BarList({ rows, single }: { rows: { code: string; count: number }[]; single?: boolean }) {
  const max = Math.max(1, ...rows.map(r => r.count));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Aucun sur la période.</p>;
  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => (
        <div key={r.code} className="flex items-center gap-2">
          <span className="w-12 text-xs font-bold font-mono">{r.code}</span>
          <div className="flex-1 bg-muted rounded h-3.5 overflow-hidden">
            <div className="h-full rounded" style={{ width: `${(r.count / max) * 100}%`, background: single ? "#1f5aa6" : BAR_COLORS[i % BAR_COLORS.length] }} />
          </div>
          <span className="w-8 text-right text-xs font-bold">{r.count}</span>
        </div>
      ))}
    </div>
  );
}

export function RenewalsReport() {
  const [preset, setPreset] = useState("3m");
  const [from, setFrom] = useState(isoAddMonths(3));
  const [to, setTo] = useState(TODAY);
  const [level, setLevel] = useState<"byDivision" | "byService" | "byEquipe">("byDivision");
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    const token = localStorage.getItem("token");
    fetch(`/api/reports/renewals?from=${from}&to=${to}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { if (d.success) setData(d.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [from, to]);

  const choosePreset = (k: string, months: number) => { setPreset(k); setFrom(isoAddMonths(months)); setTo(TODAY); };

  const rows = data ? (data[level] ?? []) : [];
  const levelLabel = { byDivision: "Division", byService: "Service", byEquipe: "Équipe" }[level];
  const maxRenew = Math.max(1, ...rows.map(r => r.renewals));

  const exportCsv = () => {
    if (!data) return;
    const head = [levelLabel, "Renouvellements", "Agents", "HT", "ST", "Nouveaux symboles"];
    const lines = [head.join(";"), ...rows.map(r => [r.name, r.renewals, r.agents, r.ht, r.st, r.newSymbols].join(";"))];
    const csv = "﻿" + lines.join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `renouvellements_${from}_${to}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const t = data?.totals;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-lg font-bold"><Refresh className="w-5 h-5" />Renouvellements — rapport de période</div>

      {/* Period controls */}
      <div className="flex flex-wrap items-end gap-2">
        {PRESETS.map(p => (
          <Button key={p.k} size="sm" variant={preset === p.k ? "default" : "outline"} onClick={() => choosePreset(p.k, p.months)}>{p.label}</Button>
        ))}
        <div className="flex items-end gap-1 ml-2">
          <div className="flex flex-col"><label className="text-[11px] text-muted-foreground">Du</label>
            <Input type="date" value={from} max={to} className="w-36" onChange={e => { setPreset("custom"); setFrom(e.target.value); }} /></div>
          <div className="flex flex-col"><label className="text-[11px] text-muted-foreground">Au</label>
            <Input type="date" value={to} min={from} className="w-36" onChange={e => { setPreset("custom"); setTo(e.target.value); }} /></div>
        </div>
        <Button size="sm" variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-1" />Exporter (Excel)</Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l: "Renouvellements", v: t?.renewals ?? 0 },
          { l: "Agents concernés", v: t?.agents ?? 0 },
          { l: "Symboles renouvelés", v: t?.symbolsRenewed ?? 0 },
          { l: "Nouveaux symboles affectés", v: t?.newSymbols ?? 0 },
        ].map((k, i) => (
          <Card key={k.l} className="relative overflow-hidden">
            <div className="absolute inset-x-0 top-0 h-1" style={{ background: KPI_COLORS[i] }} />
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{k.l}</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold" style={{ color: KPI_COLORS[i] }}>{loading ? "…" : k.v}</p></CardContent>
          </Card>
        ))}
      </div>

      {/* Table by entity */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Renouvellements par {levelLabel.toLowerCase()}</CardTitle>
          <Select value={level} onValueChange={(v: any) => setLevel(v)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="byDivision">Par division</SelectItem>
              <SelectItem value="byService">Par service</SelectItem>
              <SelectItem value="byEquipe">Par équipe</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-muted-foreground">
              <th className="text-left py-2 px-2">{levelLabel}</th>
              <th className="text-right py-2 px-2">Renouv.</th>
              <th className="text-right py-2 px-2">Agents</th>
              <th className="text-right py-2 px-2">HT</th>
              <th className="text-right py-2 px-2">ST</th>
              <th className="text-right py-2 px-2">Nouv. symb.</th>
              <th className="w-32"></th>
            </tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.name} className="border-t hover:bg-muted/40">
                  <td className="py-1.5 px-2">{r.name}</td>
                  <td className="text-right py-1.5 px-2 font-mono font-semibold">{r.renewals}</td>
                  <td className="text-right py-1.5 px-2 font-mono">{r.agents}</td>
                  <td className="text-right py-1.5 px-2 font-mono text-cyan-700">{r.ht}</td>
                  <td className="text-right py-1.5 px-2 font-mono text-violet-700">{r.st}</td>
                  <td className="text-right py-1.5 px-2 font-mono text-orange-600">{r.newSymbols}</td>
                  <td className="px-2"><div className="bg-muted rounded h-2 overflow-hidden"><div className="h-full bg-primary rounded" style={{ width: `${(r.renewals / maxRenew) * 100}%` }} /></div></td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7} className="text-center text-muted-foreground py-4">Aucun renouvellement sur la période.</td></tr>}
            </tbody>
            {rows.length > 0 && (
              <tfoot><tr className="border-t-2 font-semibold">
                <td className="py-2 px-2">Total Direction</td>
                <td className="text-right py-2 px-2 font-mono">{t?.renewals ?? 0}</td>
                <td className="text-right py-2 px-2 font-mono">{t?.agents ?? 0}</td>
                <td className="text-right py-2 px-2 font-mono">{t?.ht ?? 0}</td>
                <td className="text-right py-2 px-2 font-mono">{t?.st ?? 0}</td>
                <td className="text-right py-2 px-2 font-mono">{t?.newSymbols ?? 0}</td>
                <td></td>
              </tr></tfoot>
            )}
          </table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Symboles renouvelés</CardTitle></CardHeader>
          <CardContent><BarList rows={data?.symbolsRenewed ?? []} /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nouveaux symboles affectés</CardTitle>
            <p className="text-xs text-muted-foreground">Présents au renouvellement mais absents de la version précédente.</p>
          </CardHeader>
          <CardContent><BarList rows={data?.newSymbols ?? []} single /></CardContent>
        </Card>
      </div>
    </div>
  );
}
