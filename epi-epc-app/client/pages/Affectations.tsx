import { Fragment, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, Undo2, Trash2, ChevronRight, ChevronDown, LayoutList, Layers, ShieldCheck } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { StatutAffectationBadge } from "@/components/shared/Badges";
import { toast } from "@/components/ui/toaster";
import { formatDate, cn } from "@/lib/utils";

interface AffectationRow {
  id: number;
  articleId: number;
  designation: string;
  codeArticle: string;
  beneficiaireType: string;
  agentNom: string | null;
  equipeNom: string | null;
  quantite: number;
  dateAffectation: string | null;
  statut: string;
  motif: string | null;
  numeroSerie: string | null;
  lieuEmplacement: string | null;
  marque: string | null;
  soumisControleReglementaire: boolean;
}
interface GroupRow {
  articleId: number;
  designation: string;
  codeArticle: string;
  beneficiaireType: string;
  nbBeneficiaires: number;
  totalQuantite: number;
  nbActif: number;
  nbRetourne: number;
  nbPerdu: number;
  nbReforme: number;
}
interface ArticleOpt { id: number; designation: string; codeArticle: string; stockDisponible: number; soumisControleReglementaire: boolean }
interface AgentOpt { id: number; nom: string; matricule: string }
interface EquipeOpt { id: number; nom: string }

export default function Affectations() {
  const qc = useQueryClient();
  const [vue, setVue] = useState<"groupee" | "detaillee">("groupee");
  const [statut, setStatut] = useState("all");
  const [beneficiaireType, setBeneficiaireType] = useState("all");
  const [open, setOpen] = useState(false);
  const [retourTarget, setRetourTarget] = useState<AffectationRow | null>(null);
  const [beneficiaireKind, setBeneficiaireKind] = useState<"agent" | "equipe">("agent");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedArticleId, setSelectedArticleId] = useState("");
  const [controleTarget, setControleTarget] = useState<AffectationRow | null>(null);

  const filterQs = `${statut !== "all" ? `&statut=${statut}` : ""}${beneficiaireType !== "all" ? `&beneficiaireType=${beneficiaireType}` : ""}`;

  const { data: groups, isLoading: loadingGroups } = useQuery<GroupRow[]>({
    queryKey: ["affectations-groupes", statut, beneficiaireType],
    queryFn: () => apiGet(`/affectations/groupes?${filterQs.replace(/^&/, "")}`),
    enabled: vue === "groupee",
  });

  const { data, isLoading } = useQuery<{ rows: AffectationRow[]; total: number }>({
    queryKey: ["affectations", statut, beneficiaireType],
    queryFn: () => apiGet(`/affectations?pageSize=300${filterQs}`),
    enabled: vue === "detaillee",
  });

  const { data: articles } = useQuery<{ rows: ArticleOpt[] }>({ queryKey: ["articles-all"], queryFn: () => apiGet("/articles?pageSize=500") });
  const { data: agents } = useQuery<{ rows: AgentOpt[] }>({ queryKey: ["agents-all"], queryFn: () => apiGet("/agents?pageSize=500"), enabled: open && beneficiaireKind === "agent" });
  const { data: equipes } = useQuery<EquipeOpt[]>({ queryKey: ["equipes-all"], queryFn: () => apiGet("/org/equipes"), enabled: open && beneficiaireKind === "equipe" });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/affectations", body),
    onSuccess: () => {
      toast.success("Affectation créée");
      qc.invalidateQueries({ queryKey: ["affectations"] });
      qc.invalidateQueries({ queryKey: ["affectations-groupes"] });
      qc.invalidateQueries({ queryKey: ["articles-all"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const retourMutation = useMutation({
    mutationFn: (body: { id: number; dateRetour: string; etatRetour: string }) => apiPost(`/affectations/${body.id}/retour`, body),
    onSuccess: () => {
      toast.success("Retour enregistré");
      qc.invalidateQueries({ queryKey: ["affectations"] });
      qc.invalidateQueries({ queryKey: ["affectations-groupes"] });
      setRetourTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reformeMutation = useMutation({
    mutationFn: (body: { id: number; motif: string }) => apiPost(`/affectations/${body.id}/reforme`, body),
    onSuccess: () => {
      toast.success("Équipement réformé");
      qc.invalidateQueries({ queryKey: ["affectations"] });
      qc.invalidateQueries({ queryKey: ["affectations-groupes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const controleMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/controles", body),
    onSuccess: () => {
      toast.success("Contrôle planifié");
      qc.invalidateQueries({ queryKey: ["dashboard", "reglementaire"] });
      setControleTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      articleId: Number(fd.get("articleId")),
      beneficiaireType: beneficiaireKind,
      agentId: beneficiaireKind === "agent" ? Number(fd.get("agentId")) : undefined,
      equipeId: beneficiaireKind === "equipe" ? Number(fd.get("equipeId")) : undefined,
      quantite: Number(fd.get("quantite") || 1),
      taille: fd.get("taille") || undefined,
      pointure: fd.get("pointure") || undefined,
      dateAffectation: fd.get("dateAffectation"),
      motif: fd.get("motif") || undefined,
      numeroSerie: fd.get("numeroSerie") || undefined,
      lieuEmplacement: fd.get("lieuEmplacement") || undefined,
      marque: fd.get("marque") || undefined,
      dateFabricationUnite: fd.get("dateFabricationUnite") || undefined,
    });
  }

  function onControleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!controleTarget) return;
    const fd = new FormData(e.currentTarget);
    controleMutation.mutate({
      articleId: controleTarget.articleId,
      affectationId: controleTarget.id,
      type: fd.get("type"),
      datePlanifiee: fd.get("datePlanifiee"),
    });
  }

  function onRetourSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!retourTarget) return;
    const fd = new FormData(e.currentTarget);
    retourMutation.mutate({ id: retourTarget.id, dateRetour: String(fd.get("dateRetour")), etatRetour: String(fd.get("etatRetour")) });
  }

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Affectations</h1>
          <p className="text-sm text-muted-foreground">
            {vue === "groupee"
              ? `${groups?.length ?? "…"} article(s) affecté(s)`
              : `${data?.total ?? "…"} dotation(s) individuelle(s) et collective(s)`}
          </p>
        </div>
        <Button onClick={() => { setSelectedArticleId(""); setOpen(true); }}><Plus className="h-4 w-4" /> Nouvelle affectation</Button>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <Select value={beneficiaireType} onValueChange={setBeneficiaireType}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Bénéficiaire" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Agents et équipes</SelectItem>
                <SelectItem value="agent">Agents (EPI)</SelectItem>
                <SelectItem value="equipe">Équipes (EPC)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statut} onValueChange={setStatut}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="actif">Actif</SelectItem>
                <SelectItem value="retourne">Retourné</SelectItem>
                <SelectItem value="perdu">Perdu</SelectItem>
                <SelectItem value="reforme">Réformé</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-1 rounded-md bg-muted p-1">
            <Button size="sm" variant={vue === "groupee" ? "default" : "ghost"} onClick={() => setVue("groupee")}>
              <Layers className="h-3.5 w-3.5" /> Groupée par article
            </Button>
            <Button size="sm" variant={vue === "detaillee" ? "default" : "ghost"} onClick={() => setVue("detaillee")}>
              <LayoutList className="h-3.5 w-3.5" /> Détaillée
            </Button>
          </div>
        </div>
      </Card>

      {vue === "groupee" ? (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead>Article</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Bénéficiaires</TableHead>
                <TableHead className="text-right">Qté totale</TableHead>
                <TableHead>Répartition par statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingGroups && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Chargement…</TableCell></TableRow>}
              {!loadingGroups && groups?.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Aucune affectation ne correspond aux filtres</TableCell></TableRow>
              )}
              {groups?.map((g) => {
                const key = `${g.articleId}-${g.beneficiaireType}`;
                const isOpen = expanded.has(key);
                return (
                  <Fragment key={key}>
                    <TableRow className="cursor-pointer" onClick={() => toggleExpanded(key)}>
                      <TableCell className="w-8">
                        {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                      </TableCell>
                      <TableCell className="font-medium">
                        {g.designation}
                        <span className="ml-2 font-mono text-xs text-muted-foreground">{g.codeArticle}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{g.beneficiaireType === "agent" ? "EPI · agents" : "EPC · équipes"}</Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{g.nbBeneficiaires}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.totalQuantite}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {g.nbActif > 0 && <Badge variant="success">{g.nbActif} actif</Badge>}
                          {g.nbRetourne > 0 && <Badge variant="muted">{g.nbRetourne} retourné</Badge>}
                          {g.nbPerdu > 0 && <Badge variant="destructive">{g.nbPerdu} perdu</Badge>}
                          {g.nbReforme > 0 && <Badge variant="warning">{g.nbReforme} réformé</Badge>}
                        </div>
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/30 p-0">
                          <GroupDetail
                            articleId={g.articleId}
                            beneficiaireType={g.beneficiaireType}
                            statut={statut}
                            onRetour={setRetourTarget}
                            onReforme={(id) => reformeMutation.mutate({ id, motif: "Fin de vie / hors service" })}
                            onPlanifierControle={setControleTarget}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Article</TableHead>
                <TableHead>Bénéficiaire</TableHead>
                <TableHead className="text-right">Qté</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Chargement…</TableCell></TableRow>}
              {data?.rows.map((a) => (
                <AffectationDetailRow
                  key={a.id}
                  a={a}
                  onRetour={setRetourTarget}
                  onReforme={(id) => reformeMutation.mutate({ id, motif: "Fin de vie / hors service" })}
                  onPlanifierControle={setControleTarget}
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nouvelle affectation</DialogTitle></DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={beneficiaireKind === "agent" ? "default" : "outline"} onClick={() => setBeneficiaireKind("agent")}>À un agent (EPI)</Button>
              <Button type="button" size="sm" variant={beneficiaireKind === "equipe" ? "default" : "outline"} onClick={() => setBeneficiaireKind("equipe")}>À une équipe (EPC)</Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="articleId">Article *</Label>
              <select
                id="articleId"
                name="articleId"
                required
                value={selectedArticleId}
                onChange={(e) => setSelectedArticleId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              >
                <option value="">Sélectionner…</option>
                {articles?.rows.map((a) => <option key={a.id} value={a.id}>{a.designation} ({a.stockDisponible} dispo)</option>)}
              </select>
            </div>
            {articles?.rows.find((a) => String(a.id) === selectedArticleId)?.soumisControleReglementaire && (
              <div className="space-y-3 rounded-md border border-dashed p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" /> Équipement soumis à contrôle règlementaire — identifiez l'unité physique
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label htmlFor="numeroSerie">N° de série</Label><Input id="numeroSerie" name="numeroSerie" /></div>
                  <div className="space-y-1.5"><Label htmlFor="marque">Marque</Label><Input id="marque" name="marque" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label htmlFor="lieuEmplacement">Lieu / emplacement</Label><Input id="lieuEmplacement" name="lieuEmplacement" /></div>
                  <div className="space-y-1.5"><Label htmlFor="dateFabricationUnite">Date de fabrication</Label><Input id="dateFabricationUnite" name="dateFabricationUnite" type="date" /></div>
                </div>
              </div>
            )}
            {beneficiaireKind === "agent" ? (
              <div className="space-y-1.5">
                <Label htmlFor="agentId">Agent *</Label>
                <select id="agentId" name="agentId" required className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm">
                  <option value="">Sélectionner…</option>
                  {agents?.rows.map((a) => <option key={a.id} value={a.id}>{a.nom} ({a.matricule})</option>)}
                </select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="equipeId">Équipe *</Label>
                <select id="equipeId" name="equipeId" required className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm">
                  <option value="">Sélectionner…</option>
                  {equipes?.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label htmlFor="quantite">Quantité</Label><Input id="quantite" name="quantite" type="number" defaultValue={1} min={1} /></div>
              <div className="space-y-1.5"><Label htmlFor="taille">Taille</Label><Input id="taille" name="taille" placeholder="M, L, XL…" /></div>
              <div className="space-y-1.5"><Label htmlFor="pointure">Pointure</Label><Input id="pointure" name="pointure" placeholder="42" /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="dateAffectation">Date</Label><Input id="dateAffectation" name="dateAffectation" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></div>
            <div className="space-y-1.5"><Label htmlFor="motif">Motif</Label><Input id="motif" name="motif" placeholder="Dotation initiale, renouvellement, remplacement…" /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending}>Affecter</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!retourTarget} onOpenChange={(o) => !o && setRetourTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Retour d'équipement</DialogTitle></DialogHeader>
          <form onSubmit={onRetourSubmit} className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="dateRetour">Date de retour</Label><Input id="dateRetour" name="dateRetour" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></div>
            <div className="space-y-1.5">
              <Label htmlFor="etatRetour">État à réception</Label>
              <select id="etatRetour" name="etatRetour" className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm">
                <option value="bon">Bon état — remis en stock</option>
                <option value="usage_normal">Usure normale — remis en stock</option>
                <option value="endommage">Endommagé — hors stock</option>
                <option value="hors_service">Hors service — hors stock</option>
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRetourTarget(null)}>Annuler</Button>
              <Button type="submit" disabled={retourMutation.isPending}>Confirmer le retour</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!controleTarget} onOpenChange={(o) => !o && setControleTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Planifier un contrôle règlementaire</DialogTitle></DialogHeader>
          {controleTarget && (
            <p className="-mt-2 text-sm text-muted-foreground">
              {controleTarget.designation}
              {controleTarget.lieuEmplacement ? ` — ${controleTarget.lieuEmplacement}` : ""}
              {controleTarget.numeroSerie ? ` (${controleTarget.numeroSerie})` : ""}
            </p>
          )}
          <form onSubmit={onControleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="type">Type de contrôle</Label>
              <select id="type" name="type" required className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm">
                <option value="inspection">Inspection</option>
                <option value="essai_dielectrique">Essai diélectrique</option>
                <option value="etalonnage">Étalonnage</option>
                <option value="maintenance">Maintenance</option>
                <option value="renouvellement">Renouvellement / réépreuve</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="datePlanifiee">Date planifiée</Label><Input id="datePlanifiee" name="datePlanifiee" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setControleTarget(null)}>Annuler</Button>
              <Button type="submit" disabled={controleMutation.isPending}>Planifier</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GroupDetail({
  articleId,
  beneficiaireType,
  statut,
  onRetour,
  onReforme,
  onPlanifierControle,
}: {
  articleId: number;
  beneficiaireType: string;
  statut: string;
  onRetour: (a: AffectationRow) => void;
  onReforme: (id: number) => void;
  onPlanifierControle: (a: AffectationRow) => void;
}) {
  const { data, isLoading } = useQuery<{ rows: AffectationRow[]; total: number }>({
    queryKey: ["affectations", "groupe-detail", articleId, beneficiaireType, statut],
    queryFn: () =>
      apiGet(`/affectations?pageSize=500&articleId=${articleId}&beneficiaireType=${beneficiaireType}${statut !== "all" ? `&statut=${statut}` : ""}`),
  });

  if (isLoading) return <p className="p-4 text-sm text-muted-foreground">Chargement des bénéficiaires…</p>;

  return (
    <Table>
      <TableBody>
        {data?.rows.map((a) => (
          <AffectationDetailRow key={a.id} a={a} onRetour={onRetour} onReforme={onReforme} onPlanifierControle={onPlanifierControle} indented />
        ))}
      </TableBody>
    </Table>
  );
}

function AffectationDetailRow({
  a,
  onRetour,
  onReforme,
  onPlanifierControle,
  indented,
}: {
  a: AffectationRow;
  onRetour: (a: AffectationRow) => void;
  onReforme: (id: number) => void;
  onPlanifierControle: (a: AffectationRow) => void;
  indented?: boolean;
}) {
  return (
    <TableRow>
      <TableCell className={cn("font-medium", indented && "pl-10")}>
        {indented ? (a.agentNom ?? a.equipeNom) : a.designation}
        {(a.lieuEmplacement || a.numeroSerie) && (
          <div className="text-xs font-normal text-muted-foreground">
            {[a.lieuEmplacement, a.numeroSerie].filter(Boolean).join(" · ")}
          </div>
        )}
      </TableCell>
      <TableCell>
        {indented ? (
          a.motif ?? "—"
        ) : (
          <>
            {a.agentNom ?? a.equipeNom}
            <span className="ml-1.5 text-xs text-muted-foreground">{a.beneficiaireType === "agent" ? "(EPI)" : "(EPC)"}</span>
          </>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{a.quantite}</TableCell>
      <TableCell>{formatDate(a.dateAffectation)}</TableCell>
      <TableCell><StatutAffectationBadge statut={a.statut} /></TableCell>
      <TableCell className="text-right">
        {a.statut === "actif" && (
          <div className="flex justify-end gap-1">
            {a.soumisControleReglementaire && (
              <Button size="sm" variant="ghost" onClick={() => onPlanifierControle(a)}><ShieldCheck className="h-3.5 w-3.5" /> Contrôle</Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => onRetour(a)}><Undo2 className="h-3.5 w-3.5" /> Retour</Button>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onReforme(a.id)}>
              <Trash2 className="h-3.5 w-3.5" /> Réformer
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
