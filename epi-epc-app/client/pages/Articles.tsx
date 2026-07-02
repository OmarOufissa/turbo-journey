import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StockBadge } from "@/components/shared/Badges";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { formatMoney } from "@/lib/utils";

interface Famille { id: number; nom: string }
interface ArticleRow {
  id: number;
  codeArticle: string;
  designation: string;
  familleNom: string | null;
  sousFamilleNom: string | null;
  stockDisponible: number;
  stockMin: number;
  stockMax: number | null;
  prixUnitaire: string | null;
  aTaille: boolean;
  aPointure: boolean;
  unite: string;
}

export default function Articles() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [familleId, setFamilleId] = useState<string>("all");
  const [stockStatut, setStockStatut] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);

  const { data: familles } = useQuery<Famille[]>({ queryKey: ["familles"], queryFn: () => apiGet("/articles/familles") });
  const { data, isLoading } = useQuery<{ rows: ArticleRow[]; total: number }>({
    queryKey: ["articles", q, familleId, stockStatut],
    queryFn: () =>
      apiGet(
        `/articles?pageSize=200${q ? `&q=${encodeURIComponent(q)}` : ""}${familleId !== "all" ? `&familleId=${familleId}` : ""}${stockStatut !== "all" ? `&stockStatut=${stockStatut}` : ""}`,
      ),
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/articles", body),
    onSuccess: () => {
      toast.success("Article créé");
      qc.invalidateQueries({ queryKey: ["articles"] });
      setCreateOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      codeArticle: fd.get("codeArticle"),
      designation: fd.get("designation"),
      familleId: fd.get("familleId") ? Number(fd.get("familleId")) : null,
      constructeur: fd.get("constructeur") || null,
      normes: fd.get("normes") || null,
      fournisseur: fd.get("fournisseur") || null,
      prixUnitaire: fd.get("prixUnitaire") || null,
      stockMin: Number(fd.get("stockMin") || 0),
      stockMax: fd.get("stockMax") ? Number(fd.get("stockMax")) : null,
      aTaille: fd.get("aTaille") === "on",
      aPointure: fd.get("aPointure") === "on",
      unite: fd.get("unite") || "pièce",
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Articles</h1>
          <p className="text-sm text-muted-foreground">{data?.total ?? "…"} référence(s) au catalogue</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> Nouvel article
        </Button>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un article, un code…" className="pl-8" />
          </div>
          <Select value={familleId} onValueChange={setFamilleId}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Famille" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les familles</SelectItem>
              {familles?.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={stockStatut} onValueChange={setStockStatut}>
            <SelectTrigger className="w-44"><SelectValue placeholder="État du stock" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les états</SelectItem>
              <SelectItem value="rupture">Rupture</SelectItem>
              <SelectItem value="faible">Stock faible</SelectItem>
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
              <TableHead>Famille</TableHead>
              <TableHead className="text-right">Disponible</TableHead>
              <TableHead>État</TableHead>
              <TableHead className="text-right">Prix unitaire</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Chargement…</TableCell></TableRow>
            )}
            {!isLoading && data?.rows.length === 0 && (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Aucun article ne correspond aux filtres</TableCell></TableRow>
            )}
            {data?.rows.map((a) => (
              <TableRow key={a.id} className="cursor-pointer" onClick={() => navigate(`/articles/${a.id}`)}>
                <TableCell className="font-mono text-xs text-muted-foreground">{a.codeArticle}</TableCell>
                <TableCell className="font-medium">
                  {a.designation}
                  {(a.aTaille || a.aPointure) && <span className="ml-2 text-xs text-muted-foreground">({a.aTaille ? "taille" : "pointure"})</span>}
                </TableCell>
                <TableCell className="text-muted-foreground">{a.familleNom}</TableCell>
                <TableCell className="text-right tabular-nums">{a.stockDisponible}</TableCell>
                <TableCell><StockBadge disponible={a.stockDisponible} min={a.stockMin} /></TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(a.prixUnitaire)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Nouvel article</DialogTitle></DialogHeader>
          <form onSubmit={onCreate} className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="codeArticle">Code article *</Label>
              <Input id="codeArticle" name="codeArticle" required placeholder="EPI-127" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="familleId">Famille</Label>
              <select id="familleId" name="familleId" className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm">
                <option value="">—</option>
                {familles?.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
              </select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="designation">Désignation *</Label>
              <Input id="designation" name="designation" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="constructeur">Constructeur</Label>
              <Input id="constructeur" name="constructeur" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="normes">Normes</Label>
              <Input id="normes" name="normes" placeholder="EN 397, EN 50365…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fournisseur">Fournisseur</Label>
              <Input id="fournisseur" name="fournisseur" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prixUnitaire">Prix unitaire (MAD)</Label>
              <Input id="prixUnitaire" name="prixUnitaire" type="number" step="0.01" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stockMin">Stock minimum</Label>
              <Input id="stockMin" name="stockMin" type="number" defaultValue={0} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stockMax">Stock maximum</Label>
              <Input id="stockMax" name="stockMax" type="number" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unite">Unité</Label>
              <Input id="unite" name="unite" defaultValue="pièce" />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="aTaille" name="aTaille" />
              <Label htmlFor="aTaille">Géré par taille</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="aPointure" name="aPointure" />
              <Label htmlFor="aPointure">Géré par pointure</Label>
            </div>
            <DialogFooter className="col-span-2">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending}>Créer l'article</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
