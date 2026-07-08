import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, Search, ClipboardPlus } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toaster";
import { HierarchieCascade } from "@/components/shared/HierarchieCascade";
import { ArticleReferencePicker } from "@/components/shared/ArticleReferencePicker";
import { AffecterDialog } from "@/components/shared/AffecterDialog";

interface ArticleRow {
  id: number;
  codeArticle: string;
  designation: string;
  categorieNom: string | null;
  familleNom: string | null;
  sousFamilleNom: string | null;
  articleReferenceCode: string | null;
  articleReferenceDesignation: string | null;
  beneficiaireActuel: string | null;
  nbAffectationsActives: number;
  nbArticlesMemeReference: number;
  marque: string | null;
  modele: string | null;
  aTaille: boolean;
  aPointure: boolean;
  unite: string;
  fournisseur: string | null;
}

interface ArticleReferenceOpt { id: number; code: string; designation: string }

const HIERARCHIE_LABELS = ["Catégorie générale", "Famille", "Sous-famille"];

export default function Articles() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [ancestorId, setAncestorId] = useState<number | null>(null);
  const [articleReferenceFilter, setArticleReferenceFilter] = useState<number | null>(null);
  const [fournisseur, setFournisseur] = useState<string>("all");
  const [marqueFilter, setMarqueFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [createReferenceId, setCreateReferenceId] = useState<number | null>(null);
  const [affecterArticleId, setAffecterArticleId] = useState<number | null>(null);

  const { data: fournisseurs } = useQuery<string[]>({ queryKey: ["articles-fournisseurs"], queryFn: () => apiGet("/articles/fournisseurs") });
  const { data: marques } = useQuery<string[]>({ queryKey: ["articles-marques"], queryFn: () => apiGet("/articles/marques") });
  const { data: referencesForFilter } = useQuery<{ rows: ArticleReferenceOpt[] }>({
    queryKey: ["articles-reference-options", ancestorId],
    queryFn: () => apiGet(`/articles-reference?pageSize=500${ancestorId != null ? `&ancestorId=${ancestorId}` : ""}`),
  });

  const { data, isLoading } = useQuery<{ rows: ArticleRow[]; total: number }>({
    queryKey: ["articles", q, ancestorId, articleReferenceFilter, fournisseur, marqueFilter],
    queryFn: () =>
      apiGet(
        `/articles?pageSize=200${q ? `&q=${encodeURIComponent(q)}` : ""}${ancestorId != null ? `&ancestorId=${ancestorId}` : ""}${articleReferenceFilter != null ? `&articleReferenceId=${articleReferenceFilter}` : ""}${fournisseur !== "all" ? `&fournisseur=${encodeURIComponent(fournisseur)}` : ""}${marqueFilter !== "all" ? `&marque=${encodeURIComponent(marqueFilter)}` : ""}`,
      ),
  });

  const { data: referenceDetail } = useQuery<{ id: number; designation: string }>({
    queryKey: ["create-article-reference-detail", createReferenceId],
    queryFn: () => apiGet(`/articles-reference/${createReferenceId}`),
    enabled: createReferenceId != null,
  });
  const { data: articlesAtCreateReference } = useQuery<{ rows: { designation: string }[] }>({
    queryKey: ["create-articles-at-reference", createReferenceId],
    queryFn: () => apiGet(`/articles?articleReferenceId=${createReferenceId}&pageSize=200`),
    enabled: createReferenceId != null,
  });
  const designationOptions = Array.from(
    new Set([referenceDetail?.designation, ...(articlesAtCreateReference?.rows.map((a) => a.designation) ?? [])].filter((d): d is string => !!d)),
  );

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/articles", body),
    onSuccess: () => {
      toast.success("Article créé");
      qc.invalidateQueries({ queryKey: ["articles"] });
      setCreateOpen(false);
      setCreateReferenceId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!createReferenceId) {
      toast.error("Sélectionnez un article de référence");
      return;
    }
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      codeArticle: fd.get("codeArticle") || undefined,
      articleReferenceId: createReferenceId,
      designation: fd.get("designation"),
      constructeur: fd.get("constructeur") || null,
      marque: fd.get("marque") || null,
      modele: fd.get("modele") || null,
      normes: fd.get("normes") || null,
      fournisseur: fd.get("fournisseur") || null,
      dateAcquisition: fd.get("dateAcquisition") || null,
      prixUnitaire: fd.get("prixUnitaire") || null,
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
          <p className="text-sm text-muted-foreground">{data?.total ?? "…"} article(s) physique(s) au catalogue</p>
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
          <HierarchieCascade
            value={ancestorId}
            onChange={(id) => { setAncestorId(id); setArticleReferenceFilter(null); }}
            allowAll
            labels={HIERARCHIE_LABELS}
          />
          <Select value={articleReferenceFilter != null ? String(articleReferenceFilter) : "all"} onValueChange={(v) => setArticleReferenceFilter(v === "all" ? null : Number(v))}>
            <SelectTrigger className="w-52"><SelectValue placeholder="Article de référence" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes références</SelectItem>
              {referencesForFilter?.rows.map((r) => <SelectItem key={r.id} value={String(r.id)}>{r.designation}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={marqueFilter} onValueChange={setMarqueFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Marque" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes marques</SelectItem>
              {marques?.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fournisseur} onValueChange={setFournisseur}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Fournisseur" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous fournisseurs</SelectItem>
              {fournisseurs?.map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Catégorie</TableHead>
              <TableHead>Famille</TableHead>
              <TableHead>Sous-famille</TableHead>
              <TableHead>Article de référence</TableHead>
              <TableHead>Désignation</TableHead>
              <TableHead>Bénéficiaire</TableHead>
              <TableHead>Marque</TableHead>
              <TableHead>Modèle</TableHead>
              <TableHead className="text-right">Total des articles</TableHead>
              <TableHead>Code article</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={11} className="py-8 text-center text-muted-foreground">Chargement…</TableCell></TableRow>
            )}
            {!isLoading && data?.rows.length === 0 && (
              <TableRow><TableCell colSpan={11} className="py-8 text-center text-muted-foreground">Aucun article ne correspond aux filtres</TableCell></TableRow>
            )}
            {data?.rows.map((a) => (
              <TableRow key={a.id} className="cursor-pointer" onClick={() => navigate(`/articles/${a.id}`)}>
                <TableCell className="text-muted-foreground">{a.categorieNom ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{a.familleNom ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{a.sousFamilleNom ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{a.articleReferenceDesignation ?? "—"}</TableCell>
                <TableCell className="font-medium">
                  {a.designation}
                  {(a.aTaille || a.aPointure) && <span className="ml-2 text-xs text-muted-foreground">({a.aTaille ? "taille" : "pointure"})</span>}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {a.beneficiaireActuel ? (
                    <>
                      {a.beneficiaireActuel}
                      {a.nbAffectationsActives > 1 && <span className="text-xs"> (+{a.nbAffectationsActives - 1})</span>}
                    </>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{a.marque ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{a.modele ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{a.nbArticlesMemeReference}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{a.codeArticle}</TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setAffecterArticleId(a.id); }}>
                    <ClipboardPlus className="h-3.5 w-3.5" /> Affecter
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) setCreateReferenceId(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Nouvel article</DialogTitle></DialogHeader>
          <form onSubmit={onCreate} className="grid max-h-[75vh] grid-cols-2 gap-4 overflow-y-auto pr-1">
            <div className="col-span-2 space-y-1.5">
              <Label>Catégorie / Famille / Sous-famille / Article de référence *</Label>
              <ArticleReferencePicker value={createReferenceId} onChange={setCreateReferenceId} labels={HIERARCHIE_LABELS} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="codeArticle">Code article</Label>
              <Input id="codeArticle" name="codeArticle" placeholder="auto-généré si vide" />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="designation">Désignation *</Label>
              <Input
                key={createReferenceId ?? "none"}
                id="designation"
                name="designation"
                list="designation-options"
                required
                defaultValue={referenceDetail?.designation ?? ""}
                placeholder="Sélectionnez d'abord un article de référence…"
              />
              <datalist id="designation-options">
                {designationOptions.map((d) => <option key={d} value={d} />)}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="constructeur">Constructeur</Label>
              <Input id="constructeur" name="constructeur" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="marque">Marque</Label>
              <Input id="marque" name="marque" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="modele">Modèle</Label>
              <Input id="modele" name="modele" />
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
              <Label htmlFor="dateAcquisition">Date d'acquisition</Label>
              <Input id="dateAcquisition" name="dateAcquisition" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prixUnitaire">Prix unitaire (MAD)</Label>
              <Input id="prixUnitaire" name="prixUnitaire" type="number" step="0.01" />
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

      <AffecterDialog open={affecterArticleId != null} onClose={() => setAffecterArticleId(null)} initial={affecterArticleId != null ? { articleId: affecterArticleId } : undefined} />
    </div>
  );
}
