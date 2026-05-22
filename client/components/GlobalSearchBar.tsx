/**
 * Global search bar — debounced 300ms, accent-insensitive multi-token server-side search.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getExpirationThreshold, expirationBadgeClass } from "@/lib/dateUtils";
import { useNavigate } from "react-router-dom";

interface SearchResult {
  type: "employee";
  id: number;
  matricule: string;
  nom: string;
  prenom: string;
  fonction: string | null;
  division: string | null;
  service: string | null;
  dateExpiration: string | null;
  stCodes: string[];
  htCodes: string[];
  deleted: boolean;
}

const API_BASE = "/api";
const getToken = () => localStorage.getItem("token") ?? "";

export function GlobalSearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}&limit=10`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json();
      setResults(json.data ?? []);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); setOpen(false); setLoading(false); return; }
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleSelect(result: SearchResult) {
    setOpen(false);
    setQuery("");
    navigate(`/employees/${result.id}`);
  }

  function clear() {
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-72">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher (matricule, nom, code…)"
          className="pl-9 pr-8 h-9 text-sm"
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Escape") clear(); }}
        />
        {(loading || query) && (
          <button
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 w-full min-w-[380px] bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="max-h-80 overflow-y-auto">
            {results.map((r) => {
              const status = getExpirationThreshold(r.dateExpiration ?? undefined);
              const badgeCls = expirationBadgeClass(status);
              return (
                <button
                  key={r.id}
                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/50 text-left transition-colors border-b border-border/50 last:border-0"
                  onClick={() => handleSelect(r)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm truncate">
                        {r.prenom} {r.nom}
                      </span>
                      {r.deleted && (
                        <span className="text-[10px] bg-red-100 text-red-700 px-1 rounded">Corbeille</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex gap-2 flex-wrap">
                      <span className="font-mono">{r.matricule}</span>
                      {r.division && <span>{r.division}</span>}
                      {r.service && <span>· {r.service}</span>}
                    </div>
                    {(r.htCodes.length > 0 || r.stCodes.length > 0) && (
                      <div className="flex gap-1.5 mt-1 flex-wrap">
                        {r.htCodes.map((c) => (
                          <span key={c} className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-1.5 py-0.5 rounded">{c}</span>
                        ))}
                        {r.stCodes.map((c) => (
                          <span key={c} className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 px-1.5 py-0.5 rounded">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {r.dateExpiration && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${badgeCls}`}>
                      {status === "expired" ? "Expiré" : status === "valid" ? "Valide" : `≤${status}`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="px-4 py-2 text-xs text-muted-foreground bg-muted/30 border-t border-border">
            {results.length} résultat{results.length > 1 ? "s" : ""} · Appuyez sur Échap pour fermer
          </div>
        </div>
      )}

      {open && query.trim() && !loading && results.length === 0 && (
        <div className="absolute top-full mt-1 w-full bg-card border border-border rounded-xl shadow-xl z-50 px-4 py-6 text-center text-sm text-muted-foreground">
          Aucun résultat pour « {query} »
        </div>
      )}
    </div>
  );
}
