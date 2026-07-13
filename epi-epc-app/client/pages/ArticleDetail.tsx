import { useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Upload, FileText, Pencil, Power, Trash2 } from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatMoney } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";

interface ArticleDetailData {
  id: number;
  codeArticle: string;
  codeInterne: string | null;
  articleReferenceId: number | null;
  articleReferenceCode: string | null;
  articleReferenceDesignation: string | null;
  designation: string;
  description: string | null;
  hierarchie: { id: number; nom: string }[];
  constructeur: string | null;
  marque: string | null;
  modele: string | null;
  normes: string | null;
  certification: string | null;
  dateFabrication: string | null;
  dateAcquisition: string | null;
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
  unite: string;
  actif: boolean;
  documents: { id: number; typeDocument: string; nomFichier: string; url: string }[];
}

export default function ArticleDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

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

  const deleteMutation = useMutation({
    mutationFn: () => apiDelete(`/articles/${id}`),
    onSuccess: () => {
      toast.success("Article supprimé");
      navigate("/articles");
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setDeleteConfirmOpen(false);
    },
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
      garantieMois: fd.get("garantieMois") ? Number(fd.get("garantieMois")) : null,
      prixUnitaire: String(fd.get("prixUnitaire") || "") || null,
      observations: String(fd.get("observations") || "") || null,
    });
  }

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  const categorieNom = data.hierarchie[0]?.nom ?? null;
  const familleNom = data.hierarchie[1]?.nom ?? null;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground hover:text-foreground" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4" /> Précédent
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{data.designation}</h1>
        </div>
        <div className="flex items-center gap-2">
          {!data.actif && <Badge variant="muted">Inactif</Badge>}
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-3.5 w-3.5" /> Modifier</Button>
          <Button size="sm" variant="outline" onClick={() => toggleActifMutation.mutate()}>
            <Power className="h-3.5 w-3.5" /> {data.actif ? "Désactiver" : "Réactiver"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDeleteConfirmOpen(true)}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" /> Supprimer
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Informations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5 text-sm">
          {categorieNom && (
            <p><span className="text-muted-foreground">Catégorie :</span> {categorieNom}</p>
          )}
          {familleNom && (
            <p><span className="text-muted-foreground">Famille :</span> {familleNom}</p>
          )}
          {data.articleReferenceDesignation && (
            <p>
              <span className="text-muted-foreground">Article de référence :</span> {data.articleReferenceDesignation}
              {data.articleReferenceCode && ` (${data.articleReferenceCode})`}
            </p>
          )}
          <p><span className="text-muted-foreground">Code article :</span> {data.codeArticle}</p>
        </CardContent>
      </Card>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Fiche technique</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardContent className="grid grid-cols-2 gap-x-8 gap-y-3 p-5 text-sm sm:grid-cols-3">
              <Field label="Code interne" value={data.codeInterne} />
              <Field label="Constructeur" value={data.constructeur} />
              <Field label="Marque" value={data.marque} />
              <Field label="Modèle" value={data.modele} />
              <Field label="Fournisseur" value={data.fournisseur} />
              <Field label="Marché" value={data.marcheNumero} />
              <Field label="Normes" value={data.normes} />
              <Field label="Certification" value={data.certification} />
              <Field label="Date de fabrication" value={formatDate(data.dateFabrication)} />
              <Field label="Date d'acquisition" value={formatDate(data.dateAcquisition)} />
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

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmer la suppression</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Supprimer « {data.designation} » ? Cette action est irréversible et échouera si l'article a déjà un historique (affectations, contrôles, réforme) — désactivez-le dans ce cas plutôt que de le supprimer.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Annuler</Button>
            <Button type="button" variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate()}>
              Supprimer
            </Button>
          </DialogFooter>
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
