import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { FilePlus2, Plus, Trash2, Download, Loader2, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getEmployees } from "@/api/employees";
import { Employee } from "@/types/employee";

type DemandeType = "HT" | "ST";
interface Row { symbole: string; domaine: string; ouvrages: string; }

export default function DemandeHabilitation() {
  const { toast } = useToast();
  const token = localStorage.getItem("token") ?? "";

  const [htSymbols, setHtSymbols] = useState<string[]>([]);
  const [stSymbols, setStSymbols] = useState<string[]>([]);
  const [domaines, setDomaines] = useState<string[]>([]);
  const [ouvrages, setOuvrages] = useState<string[]>([]);

  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Employee[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [agent, setAgent] = useState<Employee | null>(null);

  const [type, setType] = useState<DemandeType>("HT");
  const [rows, setRows] = useState<Row[]>([{ symbole: "", domaine: "", ouvrages: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const debounce = useRef<any>(null);

  useEffect(() => {
    fetch("/api/demande-habilitation/options", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.success) { setHtSymbols(d.data.htSymbols); setStSymbols(d.data.stSymbols); setDomaines(d.data.domaines); } }).catch(() => {});
    fetch("/api/ref/ouvrages", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.success) setOuvrages(d.data.map((o: any) => o.name)); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!search.trim() || agent) { setResults([]); return; }
    debounce.current = setTimeout(async () => {
      try {
        const res = await getEmployees({ search: search.trim(), limit: 8 });
        if (res.success) { setResults(res.data.employees); setShowResults(true); }
      } catch { /* ignore */ }
    }, 250);
  }, [search, agent]);

  const symbols = type === "HT" ? htSymbols : stSymbols;

  const pickAgent = (e: Employee) => {
    setAgent(e);
    setSearch(`${e.matricule} — ${e.nom} ${e.prenom}`);
    setShowResults(false);
  };
  const clearAgent = () => { setAgent(null); setSearch(""); setResults([]); };

  const setRow = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const addRow = () => setRows(rs => [...rs, { symbole: "", domaine: "", ouvrages: "" }]);
  const removeRow = (i: number) => setRows(rs => rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs);

  const onTypeChange = (t: DemandeType) => { setType(t); setRows([{ symbole: "", domaine: "", ouvrages: "" }]); };

  const canSubmit = agent && rows.every(r => r.symbole && r.domaine && r.ouvrages);

  const generate = async () => {
    if (!agent) { toast({ title: "Agent requis", description: "Sélectionnez un agent.", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/demande-habilitation", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ employeeId: agent.id, type, rows }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Erreur" }));
        throw new Error(err.error || "Échec de la génération");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") || "";
      const fn = /filename="?([^"]+)"?/.exec(cd)?.[1] || `demande_habilitation_${type}_${agent.matricule}.docx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = fn; document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Demande générée", description: fn });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const ver = agent?.currentVersion;
  const currentHab = ver ? [...(ver.htCodes ?? []), ...(ver.stCodes ?? [])] : [];

  return (
    <Layout>
      <div className="p-6 max-w-4xl space-y-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FilePlus2 className="w-6 h-6" /> Demande d'habilitation</h1>
          <p className="text-muted-foreground text-sm mt-1">Générer le document Word officiel de demande d'habilitation électrique.</p>
        </div>

        {/* Agent */}
        <Card>
          <CardHeader><CardTitle className="text-base">1. Agent concerné</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Rechercher par matricule, nom ou prénom..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); if (agent) setAgent(null); }}
                  onFocus={() => results.length && setShowResults(true)}
                />
                {agent && <Button variant="ghost" size="sm" className="absolute right-1 top-1/2 -translate-y-1/2" onClick={clearAgent}>Changer</Button>}
              </div>
              {showResults && results.length > 0 && !agent && (
                <div className="absolute z-10 mt-1 w-full rounded-md border bg-popover shadow-md max-h-64 overflow-auto">
                  {results.map(e => (
                    <button key={e.id} onClick={() => pickAgent(e)} className="w-full text-left px-3 py-2 hover:bg-muted text-sm">
                      <span className="font-mono">{e.matricule}</span> — <span className="uppercase">{e.nom} {e.prenom}</span>
                      <span className="text-muted-foreground"> · {e.currentVersion?.division ?? ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {agent && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 rounded-md border bg-muted/30 p-3 text-sm">
                <Field label="Matricule" v={agent.matricule} />
                <Field label="Nom et prénom" v={`${agent.nom} ${agent.prenom}`} />
                <Field label="Fonction" v={ver?.fonction} />
                <Field label="Division" v={ver?.division} />
                <Field label="Service" v={ver?.service} />
                <Field label="Équipe" v={ver?.equipe ?? "—"} />
                <div className="col-span-2 md:col-span-3">
                  <p className="text-xs text-muted-foreground mb-1">Habilitations actuelles</p>
                  {currentHab.length ? <div className="flex flex-wrap gap-1">{currentHab.map(c => <Badge key={c} variant="secondary" className="font-mono text-xs">{c}</Badge>)}</div> : <span className="text-muted-foreground">Aucune</span>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Type */}
        <Card>
          <CardHeader><CardTitle className="text-base">2. Type de demande</CardTitle></CardHeader>
          <CardContent>
            <div className="flex gap-3">
              {(["HT", "ST"] as const).map(t => (
                <button key={t} onClick={() => onTypeChange(t)}
                  className={`px-5 py-2 rounded-lg border text-sm font-medium transition-colors ${type === t ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
                  {t === "HT" ? "HT — Hors Tension" : "ST — Sous Tension (TST)"}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Rows */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. Habilitations demandées</CardTitle>
            <CardDescription>Une ligne par symbole. Symboles filtrés selon le type ({type}).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-3 space-y-1">
                  {i === 0 && <Label className="text-xs">Symbole</Label>}
                  <Select value={r.symbole} onValueChange={v => setRow(i, { symbole: v })}>
                    <SelectTrigger><SelectValue placeholder="Symbole" /></SelectTrigger>
                    <SelectContent>{symbols.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-3 space-y-1">
                  {i === 0 && <Label className="text-xs">Domaine de tension</Label>}
                  <Select value={r.domaine} onValueChange={v => setRow(i, { domaine: v })}>
                    <SelectTrigger><SelectValue placeholder="Domaine" /></SelectTrigger>
                    <SelectContent>{domaines.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="col-span-5 space-y-1">
                  {i === 0 && <Label className="text-xs">Ouvrage concerné</Label>}
                  <SearchableSelect value={r.ouvrages} onChange={v => setRow(i, { ouvrages: v })} options={ouvrages} placeholder="Ouvrage..." />
                </div>
                <div className="col-span-1">
                  <Button variant="ghost" size="sm" onClick={() => removeRow(i)} disabled={rows.length === 1} className="text-red-500 hover:text-red-700">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addRow} className="gap-1"><Plus className="w-4 h-4" /> Ajouter une ligne</Button>
          </CardContent>
        </Card>

        <Button size="lg" className="w-full gap-2" disabled={!canSubmit || submitting} onClick={generate}>
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Générer et télécharger la demande
        </Button>
      </div>
    </Layout>
  );
}

function Field({ label, v }: { label: string; v?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{v || "—"}</p>
    </div>
  );
}
