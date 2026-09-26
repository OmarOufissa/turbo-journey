import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/Layout";
import { FilePlus2, Download, Loader2, Search, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getEmployees } from "@/api/employees";
import { Employee } from "@/types/employee";

type DemandeType = "HT" | "ST";
interface Detail { domaines: string[]; ouvrages: string; }

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
  const [selected, setSelected] = useState<string[]>([]);           // ordered selected symbols
  const [detail, setDetail] = useState<Record<string, Detail>>({}); // per-symbol domaine/ouvrage
  const [ouvFilter, setOuvFilter] = useState<Record<string, string>>({}); // per-symbol ouvrage search
  const [submitting, setSubmitting] = useState(false);
  const matchOuv = (s: string) => { const f = (ouvFilter[s] || "").toLowerCase(); return f ? ouvrages.filter(o => o.toLowerCase().includes(f)) : ouvrages; };
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

  const pickAgent = (e: Employee) => { setAgent(e); setSearch(`${e.matricule} — ${e.nom} ${e.prenom}`); setShowResults(false); };
  const clearAgent = () => { setAgent(null); setSearch(""); setResults([]); };

  const onTypeChange = (t: DemandeType) => { setType(t); setSelected([]); setDetail({}); };

  const toggleSymbol = (s: string) => {
    setSelected(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
    setDetail(prev => prev[s] ? prev : { ...prev, [s]: { domaines: [], ouvrages: "" } });
  };
  const setSymDomaine = (s: string, d: string) => setDetail(prev => {
    const cur = prev[s] || { domaines: [], ouvrages: "" };
    const domaines = cur.domaines.includes(d) ? cur.domaines.filter(x => x !== d) : [...cur.domaines, d];
    return { ...prev, [s]: { ...cur, domaines } };
  });
  const setSymOuvrage = (s: string, v: string) => setDetail(prev => ({ ...prev, [s]: { ...(prev[s] || { domaines: [], ouvrages: "" }), ouvrages: v } }));

  const canSubmit = !!agent && selected.length > 0 && selected.every(s => (detail[s]?.domaines.length ?? 0) > 0 && (detail[s]?.ouvrages ?? "").trim());

  const generate = async () => {
    if (!agent) { toast({ title: "Agent requis", description: "Sélectionnez un agent.", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const rows = selected.map(s => ({ symbole: s, domaine: (detail[s]?.domaines || []).join(" "), ouvrages: (detail[s]?.ouvrages || "").trim() }));
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
      const a = document.createElement("a"); a.href = url; a.download = fn; a.style.display = "none"; document.body.appendChild(a); a.click();
      setTimeout(() => { try { a.remove(); URL.revokeObjectURL(url); } catch {} }, 4000);
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
      <style>{CSS}</style>
      <div className="dh-scope">
        <div className="dh-wrap">
          <div className="dh-head">
            <h1><FilePlus2 className="w-6 h-6" /> Demande d'habilitation</h1>
            <p>Générer le document Word officiel de demande d'habilitation électrique.</p>
          </div>

          {/* 1. Type */}
          <section className="dh-card">
            <div className="dh-step">1. Type de demande</div>
            <div className="dh-seg">
              {(["HT", "ST"] as const).map(t => (
                <button key={t} className={type === t ? "on" : ""} onClick={() => onTypeChange(t)}>
                  {t === "HT" ? "HT — Hors Tension" : "ST — Sous Tension (TST)"}
                </button>
              ))}
            </div>
          </section>

          {/* 2. Symboles (carreaux, multi) */}
          <section className="dh-card">
            <div className="dh-step">2. Symboles d'habilitation <span className="dh-sub">— sélection multiple</span></div>
            <div className="dh-tiles">
              {symbols.map(s => (
                <button key={s} className={`dh-tile ${selected.includes(s) ? "on" : ""}`} onClick={() => toggleSymbol(s)} aria-pressed={selected.includes(s)}>
                  {s}
                </button>
              ))}
            </div>
          </section>

          {/* 3. Agent */}
          <section className="dh-card">
            <div className="dh-step">3. Agent concerné</div>
            <div className="dh-searchbox">
              <Search className="dh-searchicon w-4 h-4" />
              <input
                className="dh-input dh-search"
                placeholder="Rechercher par matricule, nom ou prénom…"
                value={search}
                onChange={e => { setSearch(e.target.value); if (agent) setAgent(null); }}
                onFocus={() => results.length && setShowResults(true)}
              />
              {agent && <button className="dh-change" onClick={clearAgent}><X className="w-3 h-3" /> Changer</button>}
              {showResults && results.length > 0 && !agent && (
                <div className="dh-results">
                  {results.map(e => (
                    <button key={e.id} className="dh-result" onClick={() => pickAgent(e)}>
                      <span className="dh-mono">{e.matricule}</span> — <b>{e.nom} {e.prenom}</b>
                      <span className="dh-muted"> · {e.currentVersion?.division ?? ""}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {agent && (
              <div className="dh-summary">
                <F label="Matricule" v={agent.matricule} />
                <F label="Nom et prénom" v={`${agent.nom} ${agent.prenom}`} />
                <F label="Fonction" v={ver?.fonction} />
                <F label="Division" v={ver?.division} />
                <F label="Service" v={ver?.service} />
                <F label="Équipe" v={ver?.equipe ?? "—"} />
                <div className="dh-hab">
                  <div className="dh-flabel">Habilitations actuelles</div>
                  {currentHab.length ? <div className="dh-badges">{currentHab.map(c => <span key={c} className="dh-badge">{c}</span>)}</div> : <span className="dh-muted">Aucune</span>}
                </div>
              </div>
            )}
          </section>

          {/* 4. Détail par symbole */}
          <section className="dh-card">
            <div className="dh-step">4. Détail des habilitations demandées</div>
            {selected.length === 0 ? (
              <div className="dh-empty">Sélectionnez au moins un symbole ci-dessus.</div>
            ) : (
              <div className="dh-details">
                {selected.map(s => (
                  <div key={s} className="dh-detrow">
                    <div className="dh-symtag">{s}</div>
                    <div className="dh-detfields">
                      <div>
                        <div className="dh-flabel">Domaine de tension (multi)</div>
                        <div className="dh-chips">
                          {domaines.map(d => (
                            <button key={d} className={`dh-chip ${detail[s]?.domaines.includes(d) ? "on" : ""}`} onClick={() => setSymDomaine(s, d)}>{d}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="dh-flabel">Ouvrage concerné — cliquez pour choisir</div>
                        <input className="dh-input dh-ouvsearch" value={ouvFilter[s] || ""} onChange={e => setOuvFilter(f => ({ ...f, [s]: e.target.value }))} placeholder="Filtrer les ouvrages…" />
                        <div className="dh-ouvlist">
                          {matchOuv(s).map(o => (
                            <button key={o} type="button" className={`dh-ouvopt ${detail[s]?.ouvrages === o ? "on" : ""}`} onClick={() => setSymOuvrage(s, o)}>{o}</button>
                          ))}
                          {matchOuv(s).length === 0 && <div className="dh-ouvnone">Aucun ouvrage ne correspond.</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <button className="dh-btn" disabled={!canSubmit || submitting} onClick={generate}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Générer et télécharger la demande
          </button>
        </div>
      </div>
    </Layout>
  );
}

function F({ label, v }: { label: string; v?: string | null }) {
  return <div><div className="dh-flabel">{label}</div><div className="dh-fval">{v || "—"}</div></div>;
}

const CSS = `
.dh-scope{--accent:#1f5aa6;--accent-soft:#e8f0fb;--ink:#1a1d22;--muted:#5b6470;--line:#c9d0d8;--panel:#fff;--bg:#eef1f4;
  background:var(--bg);color:var(--ink);min-height:100%;font-family:Arial,"Helvetica Neue",Helvetica,sans-serif}
.dh-wrap{max-width:1000px;margin:0 auto;padding:20px 16px}
.dh-head h1{display:flex;align-items:center;gap:8px;font-size:22px;font-weight:800;margin:0 0 2px}
.dh-head p{color:var(--muted);font-size:13px;margin:0 0 16px}
.dh-card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin-bottom:16px;box-shadow:0 1px 2px rgba(0,0,0,.05)}
.dh-step{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink);font-weight:800;margin-bottom:12px}
.dh-sub{color:var(--muted);font-weight:600;text-transform:none;letter-spacing:0}
.dh-seg{display:inline-flex;border:1.5px solid var(--accent);border-radius:9px;overflow:hidden}
.dh-seg button{font:inherit;font-weight:700;padding:9px 18px;border:0;background:#fff;color:var(--accent);cursor:pointer}
.dh-seg button.on{background:var(--accent);color:#fff}
.dh-tiles{display:flex;flex-wrap:wrap;gap:10px}
.dh-tile{min-width:66px;padding:12px 16px;border:1.5px solid var(--line);border-radius:12px;background:#fff;cursor:pointer;
  font-weight:800;font-size:15px;color:var(--ink);transition:all .12s}
.dh-tile:hover{border-color:var(--accent)}
.dh-tile.on{background:var(--accent-soft);border-color:var(--accent);color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
.dh-searchbox{position:relative}
.dh-searchicon{position:absolute;left:11px;top:50%;transform:translateY(-50%);color:var(--muted)}
.dh-input{width:100%;font:inherit;padding:9px 11px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--ink)}
.dh-search{padding-left:34px}
.dh-change{position:absolute;right:6px;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;gap:4px;
  border:1px solid var(--line);background:#fff;border-radius:7px;padding:5px 9px;font:inherit;font-size:12px;cursor:pointer;color:var(--muted)}
.dh-results{position:absolute;z-index:20;top:calc(100% + 4px);left:0;right:0;background:#fff;border:1px solid var(--line);
  border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.12);max-height:260px;overflow:auto}
.dh-result{display:block;width:100%;text-align:left;padding:9px 11px;border:0;background:#fff;cursor:pointer;font:inherit;font-size:13px}
.dh-result:hover{background:var(--accent-soft)}
.dh-mono{font-family:ui-monospace,Menlo,Consolas,monospace}
.dh-muted{color:var(--muted)}
.dh-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:14px;border:1px solid var(--line);
  border-radius:10px;background:#f7f9fc;padding:14px}
.dh-flabel{font-size:11px;text-transform:uppercase;letter-spacing:.03em;color:var(--muted);font-weight:700;margin-bottom:3px}
.dh-fval{font-weight:600;font-size:13px}
.dh-hab{grid-column:1/-1}
.dh-badges{display:flex;flex-wrap:wrap;gap:6px}
.dh-badge{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;font-weight:700;background:var(--accent-soft);
  color:var(--accent);border:1px solid var(--accent);border-radius:6px;padding:2px 7px}
.dh-empty{color:var(--muted);border:1px dashed var(--line);border-radius:10px;padding:22px;text-align:center;font-size:13px}
.dh-details{display:flex;flex-direction:column;gap:12px}
.dh-detrow{display:flex;gap:14px;align-items:flex-start;border:1px solid var(--line);border-radius:10px;padding:12px;background:#f7f9fc}
.dh-symtag{flex:0 0 auto;min-width:58px;text-align:center;font-weight:800;font-size:15px;color:var(--accent);
  background:var(--accent-soft);border:1.5px solid var(--accent);border-radius:10px;padding:10px 12px}
.dh-detfields{flex:1;display:grid;grid-template-columns:1fr;gap:12px}
.dh-chips{display:flex;flex-wrap:wrap;gap:6px}
.dh-chip{font:inherit;font-size:12px;font-weight:700;border:1px solid var(--line);background:#fff;border-radius:7px;padding:6px 10px;cursor:pointer;color:var(--ink)}
.dh-chip.on{background:var(--accent);border-color:var(--accent);color:#fff}
.dh-ouvsearch{margin-bottom:6px}
.dh-ouvlist{max-height:190px;overflow:auto;border:1px solid var(--line);border-radius:8px;background:#fff}
.dh-ouvopt{display:block;width:100%;text-align:left;padding:8px 11px;border:0;border-bottom:1px solid #eef1f4;background:#fff;cursor:pointer;font:inherit;font-size:13px;line-height:1.4;white-space:normal;color:var(--ink)}
.dh-ouvopt:last-child{border-bottom:0}
.dh-ouvopt:hover{background:var(--accent-soft)}
.dh-ouvopt.on{background:var(--accent);color:#fff;font-weight:700}
.dh-ouvnone{padding:10px 11px;color:var(--muted);font-size:13px}
.dh-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;background:var(--accent);color:#fff;border:0;
  border-radius:10px;padding:13px 18px;font:inherit;font-weight:800;font-size:15px;cursor:pointer}
.dh-btn:disabled{opacity:.45;cursor:not-allowed}
@media(max-width:640px){.dh-summary{grid-template-columns:repeat(2,1fr)}.dh-detrow{flex-direction:column}.dh-detfields{grid-template-columns:1fr}}
`;
