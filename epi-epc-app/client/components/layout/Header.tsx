import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Menu, Search, Bell, Sun, Moon, LogOut } from "lucide-react";
import { useTheme } from "next-themes";
import { useAuth } from "@/lib/auth";
import { apiGet } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/utils";

interface SearchResults {
  agents: { id: number; nom: string; matricule: string }[];
  articles: { id: number; designation: string; codeArticle: string }[];
  equipes: { id: number; nom: string }[];
  postes: { id: number; nom: string }[];
  marches: { id: number; numero: string; objet: string }[];
}

export function Header({ onMenuClick }: { onMenuClick: () => void }) {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const { data: results } = useQuery<SearchResults>({
    queryKey: ["recherche", q],
    queryFn: () => apiGet(`/recherche?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });

  const { data: alertes } = useQuery<{ id: number }[]>({
    queryKey: ["alertes", "non-lues"],
    queryFn: () => apiGet("/alertes?lue=false"),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const hasResults = results && (results.agents.length || results.articles.length || results.equipes.length || results.postes.length || results.marches.length);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur">
      <button onClick={onMenuClick} className="rounded-md p-2 hover:bg-accent lg:hidden">
        <Menu className="h-5 w-5" />
      </button>

      <div ref={boxRef} className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Rechercher un agent, un article, une équipe…"
          className="pl-8"
        />
        {open && q.trim().length >= 2 && (
          <div className="absolute left-0 right-0 top-11 max-h-96 overflow-y-auto rounded-md border border-border bg-popover shadow-lg animate-fade-in">
            {!hasResults && <p className="p-3 text-sm text-muted-foreground">Aucun résultat</p>}
            {results?.agents.map((a) => (
              <button key={`a-${a.id}`} onClick={() => { navigate(`/agents/${a.id}`); setOpen(false); setQ(""); }} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent">
                <span>{a.nom}</span>
                <span className="text-xs text-muted-foreground">Agent · {a.matricule}</span>
              </button>
            ))}
            {results?.articles.map((a) => (
              <button key={`art-${a.id}`} onClick={() => { navigate(`/articles/${a.id}`); setOpen(false); setQ(""); }} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent">
                <span>{a.designation}</span>
                <span className="text-xs text-muted-foreground">Article · {a.codeArticle}</span>
              </button>
            ))}
            {results?.equipes.map((e) => (
              <button key={`eq-${e.id}`} onClick={() => { navigate(`/organisation`); setOpen(false); setQ(""); }} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent">
                <span>{e.nom}</span>
                <span className="text-xs text-muted-foreground">Équipe</span>
              </button>
            ))}
            {results?.postes.map((p) => (
              <button key={`p-${p.id}`} onClick={() => { navigate(`/organisation`); setOpen(false); setQ(""); }} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent">
                <span>{p.nom}</span>
                <span className="text-xs text-muted-foreground">Poste</span>
              </button>
            ))}
            {results?.marches.map((m) => (
              <button key={`m-${m.id}`} onClick={() => { navigate(`/marches`); setOpen(false); setQ(""); }} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent">
                <span className="truncate">{m.objet}</span>
                <span className="text-xs text-muted-foreground">Marché · {m.numero}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Basculer le thème">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="relative" onClick={() => navigate("/alertes")} aria-label="Alertes">
          <Bell className="h-4 w-4" />
          {!!alertes?.length && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
              {alertes.length > 99 ? "99+" : alertes.length}
            </span>
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-accent">
              <Avatar className="h-7 w-7">
                <AvatarFallback>{initials(user?.nom ?? "?")}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium sm:inline">{user?.nom}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{user?.nom}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" /> Déconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
