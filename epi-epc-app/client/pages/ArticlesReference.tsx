import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { ArticleReference } from "@shared/api";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HierarchieCascade } from "@/components/shared/HierarchieCascade";

const HIERARCHIE_LABELS = ["Catégorie générale", "Famille", "Sous-famille"];

export default function ArticlesReference() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [ancestorId, setAncestorId] = useState<number | null>(null);
  const [actif, setActif] = useState<string>("true");

  const { data, isLoading } = useQuery<{ rows: ArticleReference[]; total: number }>({
    queryKey: ["articles-reference", q, ancestorId, actif],
    queryFn: () =>
      apiGet(
        `/articles-reference?pageSize=200${q ? `&q=${encodeURIComponent(q)}` : ""}${ancestorId != null ? `&ancestorId=${ancestorId}` : ""}${actif !== "all" ? `&actif=${actif}` : ""}`,
      ),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Articles de référence</h1>
        <p className="text-sm text-muted-foreground">{data?.total ?? "…"} référence(s) de catalogue — base à laquelle tout article physique doit être rattaché</p>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une référence, un code…" className="pl-8" />
          </div>
          <HierarchieCascade value={ancestorId} onChange={setAncestorId} allowAll labels={HIERARCHIE_LABELS} />
          <Select value={actif} onValueChange={setActif}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Statut" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="true">Actives</SelectItem>
              <SelectItem value="false">Inactives</SelectItem>
              <SelectItem value="all">Toutes</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Désignation</TableHead>
              <TableHead>Classification</TableHead>
              <TableHead className="text-right">Articles rattachés</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Chargement…</TableCell></TableRow>}
            {!isLoading && data?.rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Aucune référence ne correspond aux filtres</TableCell></TableRow>
            )}
            {data?.rows.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => navigate(`/articles-reference/${r.id}`)}>
                <TableCell className="font-mono text-xs text-muted-foreground">{r.code}</TableCell>
                <TableCell className="font-medium">{r.designation}</TableCell>
                <TableCell className="text-muted-foreground">{r.hierarchieParentNom}</TableCell>
                <TableCell className="text-right tabular-nums">{r.nbArticles ?? 0}</TableCell>
                <TableCell><Badge variant={r.actif ? "success" : "muted"}>{r.actif ? "Actif" : "Inactif"}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
