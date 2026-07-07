import { useRef, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ArrowLeft, Upload, FileText, Pencil, Power, Trash2, ClipboardPlus, Undo2, AlertTriangle, RotateCcw } from "lucide-react";
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
import { StatutAffectationBadge } from "@/components/shared/Badges";
import { AffecterDialog } from "@/components/shared/AffecterDialog";
import { formatDate, formatMoney } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";
import type { Affectation } from "@shared/api";

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
  const [affecterOpen, setAffecterOpen] = useState(false);
  const [modifierTarget, setModifierTarget] = useState<Affectation | null>(null);
  const [retourTarget, setRetourTarget] = useState<Affectation | null>(null);
  const [perduTarget, setPerduTarget] = useState<Affectation | null>(null);
  const [reformeTarget, setReformeTarget] = useState<Affectation | null>(null);

  const { data, isLoading } = useQuery<ArticleDetailData>({ queryKey: ["article", id], queryFn: () => apiGet(`/articles/${id}`) });
  const { data: affectationsData } = useQuery<{ rows: Affectation[] }>({
    queryKey: ["article-affectations", id],
    queryFn: () => apiGet(`/affectations?articleId=${id}&pageSize=200`),
  });

  const modifierMutation = useMutation({
    mutationFn: (body: { id: number; dateAffectation: string; motif: string; observations: string }) => apiPut(`/affectations/${body.id}`, body),
    onSuccess: () => {
      toast.success("Affectation modifiée");
      qc.invalidateQueries({ queryKey: ["article-affectations", id] });
      setModifierTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const retourMutation = useMutation({
    mutationFn: (body: { id: number; dateRetour: string; etatRetour: string; motif: string; commentaire?: string }) => apiPost(`/affectations/${body.id}/retour`, body),
    onSuccess: () => {
      toast.success("Affectation retirée");
      qc.invalidateQueries({ queryKey: ["article-affectations", id] });
      qc.invalidateQueries({ queryKey: ["article", id] });
      setRetourTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const perduMutation = useMutation({
    mutationFn: (body: { id: number; datePerte: string; motif: string }) => apiPost(`/affectations/${body.id}/perdu`, body),
    onSuccess: () => {
      toast.success("Perte déclarée");
      qc.invalidateQueries({ queryKey: ["article-affectations", id] });
      setPerduTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reformeMutation = useMutation({
    mutationFn: (body: { id: number; motif: string }) => apiPost(`/affectations/${body.id}/reforme`, body),
    onSuccess: () => {
      toast.success("Équipement réformé");
      qc.invalidateQueries({ queryKey: ["article-affectations", id] });
      setReformeTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
      numeroSerie: String(fd.get("numeroSerie") || "") || null,
      garantieMois: fd.get("garantieMois") ? Number(fd.get("garantieMois")) : null,
      prixUnitaire: String(fd.get("prixUnitaire") || "") || null,
      observations: String(fd.get("observations") || "") || null,
    });
  }

  function onModifierSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!modifierTarget) return;
    const fd = new FormData(e.currentTarget);
    modifierMutation.mutate({
      id: modifierTarget.id,
      dateAffectation: String(fd.get("dateAffectation")),
      motif: String(fd.get("motif") || ""),
      observations: String(fd.get("observations") || ""),
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
          <Button size="sm" onClick={() => setAffecterOpen(true)}><ClipboardPlus className="h-3.5 w-3.5" /> Affecter</Button>
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}><Pencil className="h-3.5 w-3.5" /> Modifier</Button>
          <Button size="sm" variant="outline" onClick={() => toggleActifMutation.mutate()}>
            <Power className="h-3.5 w-3.5" /> {data.actif ? "Désactiver" : "Réactiver"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDeleteConfirmOpen(true)}>
            <Trash2 className="h-3.5 w-3.5 text-destructive" /> Supprimer
          </Button>
        </div>
      </div>

      <Tabs defaultValue="affectations">
        <TabsList>
          <TabsTrigger value="affectations">Affectations</TabsTrigger>
          <TabsTrigger value="info">Fiche technique</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        <TabsContent value="affectations">
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bénéficiaire</TableHead>
                  <TableHead>Motif</TableHead>
                  <TableHead>Date d'affectation</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Date de clôture</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!affectationsData || affectationsData.rows.length === 0) && (
                  <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Cet article n'a jamais été affecté</TableCell></TableRow>
                )}
                {affectationsData?.rows.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">
                      {a.agentNom ?? a.equipeNom}
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">{a.beneficiaireType === "agent" ? "(EPI)" : "(EPC)"}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{a.motif ?? "—"}</TableCell>
                    <TableCell>{formatDate(a.dateAffectation)}</TableCell>
                    <TableCell><StatutAffectationBadge statut={a.statut} /></TableCell>
                    <TableCell className="text-muted-foreground">{a.dateClotureStatut ? formatDate(a.dateClotureStatut) : "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setModifierTarget(a)}><Pencil className="h-3.5 w-3.5" /> Modifier</Button>
                        {a.statut === "actif" ? (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => setRetourTarget(a)}><Undo2 className="h-3.5 w-3.5" /> Retirer</Button>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setPerduTarget(a)}><AlertTriangle className="h-3.5 w-3.5" /> Perdu</Button>
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setReformeTarget(a)}><Trash2 className="h-3.5 w-3.5" /> Réformer</Button>
                          </>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => setAffecterOpen(true)}><RotateCcw className="h-3.5 w-3.5" /> Réaffecter</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

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

      <AffecterDialog open={affecterOpen} onClose={() => setAffecterOpen(false)} initial={{ articleId: Number(id) }} />

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

      <Dialog open={!!modifierTarget} onOpenChange={(o) => !o && setModifierTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Modifier l'affectation</DialogTitle></DialogHeader>
          {modifierTarget && (
            <p className="-mt-2 text-sm text-muted-foreground">{modifierTarget.agentNom ?? modifierTarget.equipeNom}</p>
          )}
          <form onSubmit={onModifierSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="dateAffectation">Date</Label>
              <Input id="dateAffectation" name="dateAffectation" type="date" required defaultValue={modifierTarget?.dateAffectation ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="motif">Motif</Label>
              <Input id="motif" name="motif" defaultValue={modifierTarget?.motif ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="observations">Observations</Label>
              <Textarea id="observations" name="observations" rows={2} defaultValue={modifierTarget?.observations ?? ""} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setModifierTarget(null)}>Annuler</Button>
              <Button type="submit" disabled={modifierMutation.isPending}>Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!retourTarget} onOpenChange={(o) => !o && setRetourTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Retirer l'affectation</DialogTitle></DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!retourTarget) return;
              const fd = new FormData(e.currentTarget);
              retourMutation.mutate({
                id: retourTarget.id,
                dateRetour: String(fd.get("dateRetour")),
                etatRetour: String(fd.get("etatRetour")),
                motif: String(fd.get("motif") || ""),
                commentaire: String(fd.get("commentaire") || "") || undefined,
              });
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5"><Label htmlFor="dateRetour">Date de retrait</Label><Input id="dateRetour" name="dateRetour" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></div>
            <div className="space-y-1.5">
              <Label htmlFor="etatRetour">État à réception</Label>
              <select id="etatRetour" name="etatRetour" className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm">
                <option value="bon">Bon état — réutilisable</option>
                <option value="usage_normal">Usure normale — réutilisable</option>
                <option value="endommage">Endommagé — hors service</option>
                <option value="hors_service">Hors service — hors rotation</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="motif">Motif du retrait *</Label><Input id="motif" name="motif" required placeholder="Fin de mission, mutation, retour normal…" /></div>
            <div className="space-y-1.5"><Label htmlFor="commentaire">Commentaire</Label><Textarea id="commentaire" name="commentaire" rows={2} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRetourTarget(null)}>Annuler</Button>
              <Button type="submit" disabled={retourMutation.isPending}>Confirmer le retrait</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!perduTarget} onOpenChange={(o) => !o && setPerduTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Déclarer la perte de l'équipement</DialogTitle></DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!perduTarget) return;
              const fd = new FormData(e.currentTarget);
              perduMutation.mutate({ id: perduTarget.id, datePerte: String(fd.get("datePerte")), motif: String(fd.get("motif") || "") });
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5"><Label htmlFor="datePerte">Date de constatation</Label><Input id="datePerte" name="datePerte" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></div>
            <div className="space-y-1.5"><Label htmlFor="motif">Motif *</Label><Textarea id="motif" name="motif" required rows={2} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPerduTarget(null)}>Annuler</Button>
              <Button type="submit" variant="destructive" disabled={perduMutation.isPending}>Confirmer la déclaration de perte</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reformeTarget} onOpenChange={(o) => !o && setReformeTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Réformer l'équipement</DialogTitle></DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!reformeTarget) return;
              const fd = new FormData(e.currentTarget);
              reformeMutation.mutate({ id: reformeTarget.id, motif: String(fd.get("motif") || "") });
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5"><Label htmlFor="motif">Motif de réforme *</Label><Textarea id="motif" name="motif" required rows={2} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReformeTarget(null)}>Annuler</Button>
              <Button type="submit" variant="destructive" disabled={reformeMutation.isPending}>Confirmer la réforme</Button>
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
