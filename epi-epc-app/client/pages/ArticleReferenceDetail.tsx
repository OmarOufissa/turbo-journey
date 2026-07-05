import { useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Upload, FileText, Pencil, Plus, Trash2, Power } from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";

interface CaracteristiqueRow {
  cle: string;
  valeur: string;
  unite?: string;
}

interface ArticleReferenceDetailData {
  id: number;
  code: string;
  designation: string;
  hierarchieParentId: number;
  soumisControleReglementaire: boolean | null;
  caracteristiquesTechniques: CaracteristiqueRow[] | null;
  ficheTechniquePdfUrl: string | null;
  photoUrl: string | null;
  normes: string[] | null;
  certifications: string[] | null;
  dureeVieRecommandeeMois: number | null;
  quantiteReference: number | null;
  typeDotation: string | null;
  observations: string | null;
  actif: boolean;
  hierarchie: { id: number; nom: string }[];
  articles: { id: number; codeArticle: string; designation: string; stockDisponible: number; actif: boolean }[];
  kitLignes: { kitTemplateId: number; kitLabel: string; quantite: number }[];
  documents: { id: number; typeDocument: string; nomFichier: string; url: string }[];
}

export default function ArticleReferenceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [caracteristiques, setCaracteristiques] = useState<CaracteristiqueRow[]>([]);

  const { data, isLoading } = useQuery<ArticleReferenceDetailData>({
    queryKey: ["article-reference", id],
    queryFn: () => apiGet(`/articles-reference/${id}`),
  });

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPut(`/articles-reference/${id}`, body),
    onSuccess: () => {
      toast.success("Article de référence modifié");
      qc.invalidateQueries({ queryKey: ["article-reference", id] });
      setEditOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActifMutation = useMutation({
    mutationFn: () => apiPost(`/articles-reference/${id}/${data?.actif ? "desactiver" : "reactiver"}`),
    onSuccess: () => {
      toast.success(data?.actif ? "Référence désactivée" : "Référence réactivée");
      qc.invalidateQueries({ queryKey: ["article-reference", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiDelete(`/articles-reference/${id}`),
    onSuccess: () => {
      toast.success("Article de référence supprimé");
      navigate("/articles-reference");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("fichier", file);
      fd.append("entiteType", "article_reference");
      fd.append("entiteId", String(id));
      fd.append("typeDocument", "fiche_technique");
      return apiPost("/documents/upload", fd);
    },
    onSuccess: () => {
      toast.success("Document ajouté");
      qc.invalidateQueries({ queryKey: ["article-reference", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: number) => apiDelete(`/documents/${docId}`),
    onSuccess: () => {
      toast.success("Document supprimé");
      qc.invalidateQueries({ queryKey: ["article-reference", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openEdit() {
    setCaracteristiques(data?.caracteristiquesTechniques ?? []);
    setEditOpen(true);
  }

  function onSubmitEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const normes = String(fd.get("normes") || "").split(",").map((s) => s.trim()).filter(Boolean);
    const certifications = String(fd.get("certifications") || "").split(",").map((s) => s.trim()).filter(Boolean);
    updateMutation.mutate({
      designation: String(fd.get("designation")),
      dureeVieRecommandeeMois: fd.get("dureeVieRecommandeeMois") ? Number(fd.get("dureeVieRecommandeeMois")) : null,
      quantiteReference: fd.get("quantiteReference") ? Number(fd.get("quantiteReference")) : null,
      typeDotation: String(fd.get("typeDotation") || "") || null,
      normes: normes.length ? normes : null,
      certifications: certifications.length ? certifications : null,
      observations: String(fd.get("observations") || "") || null,
      caracteristiquesTechniques: caracteristiques.filter((c) => c.cle && c.valeur).length ? caracteristiques.filter((c) => c.cle && c.valeur) : null,
    });
  }

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <div className="space-y-4">
      <Link to="/articles-reference" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour aux articles de référence
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{data.designation}</h1>
          <p className="text-sm text-muted-foreground">
            {data.code}
            {data.hierarchie.map((n) => ` · ${n.nom}`).join("")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!data.actif && <Badge variant="muted">Inactif</Badge>}
          {data.soumisControleReglementaire && <Badge variant="warning">Soumis à contrôle réglementaire</Badge>}
          <Button size="sm" variant="outline" onClick={openEdit}><Pencil className="h-3.5 w-3.5" /> Modifier</Button>
          <Button size="sm" variant="outline" onClick={() => toggleActifMutation.mutate()}>
            <Power className="h-3.5 w-3.5" /> {data.actif ? "Désactiver" : "Réactiver"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => deleteMutation.mutate()}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Articles rattachés</p><p className="text-xl font-semibold tabular-nums">{data.articles.length}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Quantité de référence</p><p className="text-xl font-semibold tabular-nums">{data.quantiteReference ?? "—"}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Durée de vie recommandée</p><p className="text-xl font-semibold tabular-nums">{data.dureeVieRecommandeeMois ? `${data.dureeVieRecommandeeMois} mois` : "—"}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Type de dotation</p><p className="text-xl font-semibold">{data.typeDotation ?? "—"}</p></Card>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Fiche technique</TabsTrigger>
          <TabsTrigger value="articles">Articles rattachés</TabsTrigger>
          <TabsTrigger value="gabarits">Gabarits de dotation</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardContent className="grid grid-cols-2 gap-x-8 gap-y-3 p-5 text-sm sm:grid-cols-3">
              <Field label="Normes" value={data.normes?.join(", ")} />
              <Field label="Certifications" value={data.certifications?.join(", ")} />
              <Field label="Durée de vie recommandée" value={data.dureeVieRecommandeeMois ? `${data.dureeVieRecommandeeMois} mois` : null} />
              <Field label="Quantité de référence" value={data.quantiteReference} />
              <Field label="Type de dotation" value={data.typeDotation} />
              {data.observations && (
                <div className="col-span-full">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Observations</p>
                  <p className="mt-1">{data.observations}</p>
                </div>
              )}
              {data.caracteristiquesTechniques && data.caracteristiquesTechniques.length > 0 && (
                <div className="col-span-full">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Caractéristiques techniques</p>
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>Caractéristique</TableHead><TableHead>Valeur</TableHead><TableHead>Unité</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.caracteristiquesTechniques.map((c, i) => (
                        <TableRow key={i}><TableCell>{c.cle}</TableCell><TableCell>{c.valeur}</TableCell><TableCell>{c.unite ?? "—"}</TableCell></TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="articles">
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Code</TableHead><TableHead>Désignation</TableHead><TableHead className="text-right">Disponible</TableHead><TableHead>Statut</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {data.articles.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Aucun article physique rattaché</TableCell></TableRow>}
                {data.articles.map((a) => (
                  <TableRow key={a.id} className="cursor-pointer" onClick={() => navigate(`/articles/${a.id}`)}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{a.codeArticle}</TableCell>
                    <TableCell>{a.designation}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.stockDisponible}</TableCell>
                    <TableCell><Badge variant={a.actif ? "success" : "muted"}>{a.actif ? "Actif" : "Inactif"}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="gabarits">
          <Card className="overflow-hidden">
            <Table>
              <TableHeader><TableRow><TableHead>Gabarit</TableHead><TableHead className="text-right">Quantité</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.kitLignes.length === 0 && <TableRow><TableCell colSpan={2} className="py-6 text-center text-muted-foreground">Cette référence n'apparaît dans aucun gabarit de dotation</TableCell></TableRow>}
                {data.kitLignes.map((l, i) => (
                  <TableRow key={i}><TableCell>{l.kitLabel}</TableCell><TableCell className="text-right tabular-nums">{l.quantite}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Fiche technique, certificats, photo</CardTitle>
              <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
                <Upload className="h-4 w-4" /> Ajouter un document
              </Button>
              <input ref={fileInput} type="file" className="hidden" onChange={(e) => e.target.files?.[0] && uploadMutation.mutate(e.target.files[0])} />
            </CardHeader>
            <CardContent className="space-y-2">
              {data.documents.length === 0 && <p className="text-sm text-muted-foreground">Aucun document</p>}
              {data.documents.map((d) => (
                <div key={d.id} className="flex items-center gap-2 rounded-md border border-border p-2.5 text-sm hover:bg-accent">
                  <a href={d.url} target="_blank" rel="noreferrer" className="flex flex-1 items-center gap-2 truncate">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">{d.nomFichier}</span>
                  </a>
                  <Badge variant="outline">{d.typeDocument}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => deleteDocMutation.mutate(d.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Modifier l'article de référence</DialogTitle></DialogHeader>
          <form onSubmit={onSubmitEdit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <div className="space-y-1.5">
              <Label htmlFor="designation">Désignation *</Label>
              <Input id="designation" name="designation" required defaultValue={data.designation} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dureeVieRecommandeeMois">Durée de vie recommandée (mois)</Label>
                <Input id="dureeVieRecommandeeMois" name="dureeVieRecommandeeMois" type="number" defaultValue={data.dureeVieRecommandeeMois ?? ""} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quantiteReference">Quantité de référence</Label>
                <Input id="quantiteReference" name="quantiteReference" type="number" defaultValue={data.quantiteReference ?? ""} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="typeDotation">Type de dotation</Label>
              <Input id="typeDotation" name="typeDotation" defaultValue={data.typeDotation ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="normes">Normes (séparées par une virgule)</Label>
              <Input id="normes" name="normes" defaultValue={data.normes?.join(", ") ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="certifications">Certifications (séparées par une virgule)</Label>
              <Input id="certifications" name="certifications" defaultValue={data.certifications?.join(", ") ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="observations">Observations</Label>
              <Textarea id="observations" name="observations" rows={2} defaultValue={data.observations ?? ""} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Caractéristiques techniques</Label>
                <Button type="button" size="sm" variant="outline" onClick={() => setCaracteristiques((prev) => [...prev, { cle: "", valeur: "", unite: "" }])}>
                  <Plus className="h-3.5 w-3.5" /> Ajouter
                </Button>
              </div>
              {caracteristiques.map((c, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_80px_auto] gap-1.5">
                  <Input
                    placeholder="Clé"
                    value={c.cle}
                    onChange={(e) => setCaracteristiques((prev) => prev.map((row, idx) => (idx === i ? { ...row, cle: e.target.value } : row)))}
                  />
                  <Input
                    placeholder="Valeur"
                    value={c.valeur}
                    onChange={(e) => setCaracteristiques((prev) => prev.map((row, idx) => (idx === i ? { ...row, valeur: e.target.value } : row)))}
                  />
                  <Input
                    placeholder="Unité"
                    value={c.unite ?? ""}
                    onChange={(e) => setCaracteristiques((prev) => prev.map((row, idx) => (idx === i ? { ...row, unite: e.target.value } : row)))}
                  />
                  <Button type="button" size="sm" variant="ghost" onClick={() => setCaracteristiques((prev) => prev.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={updateMutation.isPending}>Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5">{value || "—"}</p>
    </div>
  );
}
