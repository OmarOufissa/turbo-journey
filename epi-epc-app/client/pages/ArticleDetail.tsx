import { useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Upload, FileText, Pencil, Power, Trash2 } from "lucide-react";
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
import { StockBadge } from "@/components/shared/Badges";
import { formatDate, formatMoney } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";

interface ArticleDetailData {
  id: number;
  codeArticle: string;
  codeInterne: string | null;
  codeFournisseur: string | null;
  articleReferenceId: number | null;
  articleReferenceCode: string | null;
  articleReferenceDesignation: string | null;
  designation: string;
  description: string | null;
  hierarchie: { id: number; nom: string }[];
  referenceFabricant: string | null;
  constructeur: string | null;
  marque: string | null;
  modele: string | null;
  normes: string | null;
  certification: string | null;
  dateFabrication: string | null;
  dateAcquisition: string | null;
  numeroSerie: string | null;
  dureeVieMois: number | null;
  dateLimiteUtilisation: string | null;
  poidsKg: string | null;
  dimensions: string | null;
  couleur: string | null;
  aTaille: boolean;
  aPointure: boolean;
  observations: string | null;
  prixUnitaire: string | null;
  marcheNumero: string | null;
  fournisseur: string | null;
  garantieMois: number | null;
  stockMin: number;
  stockMax: number | null;
  stockDisponible: number;
  stockReserve: number;
  stockCommande: number;
  unite: string;
  actif: boolean;
  mouvements: { id: number; type: string; quantite: number; dateMouvement: string; motif: string | null }[];
  documents: { id: number; typeDocument: string; nomFichier: string; url: string }[];
}

const MOUVEMENT_LABELS: Record<string, string> = {
  entree_achat: "Entrée — achat",
  entree_retour: "Entrée — retour",
  sortie_affectation: "Sortie — dotation",
  sortie_reforme: "Sortie — réforme",
  sortie_perte: "Sortie — perte",
  ajustement: "Ajustement",
};

export default function ArticleDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [editOpen, setEditOpen] = useState(false);

  const { data, isLoading } = useQuery<ArticleDetailData>({ queryKey: ["article", id], queryFn: () => apiGet(`/articles/${id}`) });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append("fichier", file);
      fd.append("entiteType", "article");
      fd.append("entiteId", String(id));
      fd.append("typeDocument", "autre");
      return apiPost("/documents/upload", fd);
    },
    onSuccess: () => {
      toast.success("Document ajouté");
      qc.invalidateQueries({ queryKey: ["article", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: number) => apiDelete(`/documents/${docId}`),
    onSuccess: () => {
      toast.success("Document supprimé");
      qc.invalidateQueries({ queryKey: ["article", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPut(`/articles/${id}`, body),
    onSuccess: () => {
      toast.success("Article modifié");
      qc.invalidateQueries({ queryKey: ["article", id] });
      setEditOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActifMutation = useMutation({
    mutationFn: () => apiPost(`/articles/${id}/${data?.actif ? "desactiver" : "reactiver"}`),
    onSuccess: () => {
      toast.success(data?.actif ? "Article désactivé" : "Article réactivé");
      qc.invalidateQueries({ queryKey: ["article", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmitEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    updateMutation.mutate({
      designation: String(fd.get("designation")),
      constructeur: String(fd.get("constructeur") || "") || null,
      marque: String(fd.get("marque") || "") || null,
      modele: String(fd.get("modele") || "") || null,
      fournisseur: String(fd.get("fournisseur") || "") || null,
      normes: String(fd.get("normes") || "") || null,
      certification: String(fd.get("certification") || "") || null,
      dateAcquisition: String(fd.get("dateAcquisition") || "") || null,
      numeroSerie: String(fd.get("numeroSerie") || "") || null,
      garantieMois: fd.get("garantieMois") ? Number(fd.get("garantieMois")) : null,
      prixUnitaire: String(fd.get("prixUnitaire") || "") || null,
      observations: String(fd.get("observations") || "") || null,
    });
  }

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <div className="space-y-4">
      <Link to="/articles" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour au catalogue
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{data.designation}</h1>
          <p className="text-sm text-muted-foreground">
            {data.codeArticle}
            {data.articleReferenceDesignation && ` · Réf. ${data.articleReferenceDesignation} (${data.articleReferenceCode})`}
            {data.hierarchie.map((n) => ` · ${n.nom}`).join("")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!data.actif && <Badge variant="muted">Inactif</Badge>}
          <StockBadge disponible={data.stockDisponible} min={data.stockMin} />
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-3.5 w-3.5" /> Modifier</Button>
          <Button size="sm" variant="outline" onClick={() => toggleActifMutation.mutate()}>
            <Power className="h-3.5 w-3.5" /> {data.actif ? "Désactiver" : "Réactiver"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4"><p className="text-xs text-muted-foreground">Disponible</p><p className="text-xl font-semibold tabular-nums">{data.stockDisponible}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Réservé</p><p className="text-xl font-semibold tabular-nums">{data.stockReserve}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Commandé</p><p className="text-xl font-semibold tabular-nums">{data.stockCommande}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">Seuil mini / maxi</p><p className="text-xl font-semibold tabular-nums">{data.stockMin} / {data.stockMax ?? "—"}</p></Card>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Fiche technique</TabsTrigger>
          <TabsTrigger value="stock">Mouvements de stock</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardContent className="grid grid-cols-2 gap-x-8 gap-y-3 p-5 text-sm sm:grid-cols-3">
              <Field label="Code interne" value={data.codeInterne} />
              <Field label="Code fournisseur" value={data.codeFournisseur} />
              <Field label="Référence fabricant" value={data.referenceFabricant} />
              <Field label="Constructeur" value={data.constructeur} />
              <Field label="Marque" value={data.marque} />
              <Field label="Modèle" value={data.modele} />
              <Field label="Fournisseur" value={data.fournisseur} />
              <Field label="Marché" value={data.marcheNumero} />
              <Field label="Normes" value={data.normes} />
              <Field label="Certification" value={data.certification} />
              <Field label="Date de fabrication" value={formatDate(data.dateFabrication)} />
              <Field label="Date d'acquisition" value={formatDate(data.dateAcquisition)} />
              <Field label="Numéro de série (lot)" value={data.numeroSerie} />
              <Field label="Durée de vie" value={data.dureeVieMois ? `${data.dureeVieMois} mois` : null} />
              <Field label="Date limite d'utilisation" value={formatDate(data.dateLimiteUtilisation)} />
              <Field label="Garantie" value={data.garantieMois ? `${data.garantieMois} mois` : null} />
              <Field label="Poids" value={data.poidsKg ? `${data.poidsKg} kg` : null} />
              <Field label="Dimensions" value={data.dimensions} />
              <Field label="Couleur" value={data.couleur} />
              <Field label="Prix unitaire" value={formatMoney(data.prixUnitaire)} />
              <Field label="Unité de gestion" value={data.unite} />
              <Field label="Taille / pointure" value={[data.aTaille && "Taille", data.aPointure && "Pointure"].filter(Boolean).join(", ") || "Non applicable"} />
              {data.observations && (
                <div className="col-span-full">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Observations</p>
                  <p className="mt-1">{data.observations}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="stock">
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantité</TableHead>
                  <TableHead>Motif</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.mouvements.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Aucun mouvement</TableCell></TableRow>}
                {data.mouvements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{formatDate(m.dateMouvement)}</TableCell>
                    <TableCell>{MOUVEMENT_LABELS[m.type] ?? m.type}</TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${m.quantite < 0 ? "text-destructive" : "text-success"}`}>{m.quantite > 0 ? `+${m.quantite}` : m.quantite}</TableCell>
                    <TableCell className="text-muted-foreground">{m.motif ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="documents">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Notices, certificats, fiches techniques</CardTitle>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Modifier l'article</DialogTitle></DialogHeader>
          <form onSubmit={onSubmitEdit} className="grid max-h-[70vh] grid-cols-2 gap-4 overflow-y-auto pr-1">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="designation">Désignation *</Label>
              <Input id="designation" name="designation" required defaultValue={data.designation} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="constructeur">Constructeur</Label>
              <Input id="constructeur" name="constructeur" defaultValue={data.constructeur ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="marque">Marque</Label>
              <Input id="marque" name="marque" defaultValue={data.marque ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="modele">Modèle</Label>
              <Input id="modele" name="modele" defaultValue={data.modele ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fournisseur">Fournisseur</Label>
              <Input id="fournisseur" name="fournisseur" defaultValue={data.fournisseur ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="normes">Normes</Label>
              <Input id="normes" name="normes" defaultValue={data.normes ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="certification">Certification</Label>
              <Input id="certification" name="certification" defaultValue={data.certification ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dateAcquisition">Date d'acquisition</Label>
              <Input id="dateAcquisition" name="dateAcquisition" type="date" defaultValue={data.dateAcquisition ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="numeroSerie">Numéro de série (lot)</Label>
              <Input id="numeroSerie" name="numeroSerie" defaultValue={data.numeroSerie ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="garantieMois">Garantie (mois)</Label>
              <Input id="garantieMois" name="garantieMois" type="number" defaultValue={data.garantieMois ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prixUnitaire">Prix unitaire (MAD)</Label>
              <Input id="prixUnitaire" name="prixUnitaire" type="number" step="0.01" defaultValue={data.prixUnitaire ?? ""} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="observations">Observations</Label>
              <Textarea id="observations" name="observations" rows={2} defaultValue={data.observations ?? ""} />
            </div>
            <DialogFooter className="col-span-2">
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
