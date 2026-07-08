import { useEffect, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ShieldCheck, FileText } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArticleReferencePicker } from "@/components/shared/ArticleReferencePicker";
import { toast } from "@/components/ui/toaster";
import { formatDate } from "@/lib/utils";
import type { Division, Service, Equipe, Poste, Agent } from "@shared/api";

const MOTIFS = ["Dotation initiale", "Renouvellement", "Remplacement"] as const;

type BeneficiaireType = "agent" | "equipe" | "poste";

interface ArticleOpt { id: number; codeArticle: string; designation: string; beneficiaireActuel: string | null }
interface ArticleDetailInfo {
  id: number;
  codeArticle: string;
  designation: string;
  fournisseur: string | null;
  dateAcquisition: string | null;
  dureeVieMois: number | null;
  soumisControleReglementaire: boolean | null;
  categorieNom: string | null;
  documents: { id: number }[];
}

export interface AffecterInitial {
  articleId?: number;
  beneficiaire?: { type: BeneficiaireType; id: number };
}

// Le type de bénéficiaire autorisé dépend de la catégorie générale (niveau 1) de l'article —
// EPI -> agent ou poste ; toute autre catégorie (EPC, LCI, appareils de levage/sous pression,
// vêtements) -> équipe ou poste. Tant que la catégorie n'est pas encore connue (chargement),
// les trois types restent proposés — la validation serveur reste de toute façon autoritaire.
function allowedBeneficiaireTypes(categorieNom: string | null | undefined): BeneficiaireType[] {
  if (categorieNom == null) return ["agent", "equipe", "poste"];
  return categorieNom === "EPI" ? ["agent", "poste"] : ["equipe", "poste"];
}

export function AffecterDialog({ open, onClose, initial, onSuccess }: { open: boolean; onClose: () => void; initial?: AffecterInitial; onSuccess?: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const [articleReferenceId, setArticleReferenceId] = useState<number | null>(null);
  const [articleId, setArticleId] = useState<number | null>(initial?.articleId ?? null);
  const [beneficiaireType, setBeneficiaireType] = useState<BeneficiaireType>(initial?.beneficiaire?.type ?? "agent");
  const [divisionId, setDivisionId] = useState<number | null>(null);
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [equipeId, setEquipeId] = useState<number | null>(initial?.beneficiaire?.type === "equipe" ? initial.beneficiaire.id : null);
  const [agentId, setAgentId] = useState<number | null>(initial?.beneficiaire?.type === "agent" ? initial.beneficiaire.id : null);
  const [posteId, setPosteId] = useState<number | null>(initial?.beneficiaire?.type === "poste" ? initial.beneficiaire.id : null);
  const [dateAffectation, setDateAffectation] = useState(new Date().toISOString().slice(0, 10));
  const [motif, setMotif] = useState<string>("Dotation initiale");
  const [motifAutre, setMotifAutre] = useState("");
  const [observations, setObservations] = useState("");
  const [numeroSerieAuto, setNumeroSerieAuto] = useState(true);
  const [numeroSerieManuel, setNumeroSerieManuel] = useState("");
  const [lieuEmplacement, setLieuEmplacement] = useState("");
  const [marqueUnite, setMarqueUnite] = useState("");
  const [dateFabricationUnite, setDateFabricationUnite] = useState("");
  const [step, setStep] = useState<"form" | "recap">("form");

  useEffect(() => {
    if (open) {
      setArticleReferenceId(null);
      setArticleId(initial?.articleId ?? null);
      setBeneficiaireType(initial?.beneficiaire?.type ?? "agent");
      setDivisionId(null);
      setServiceId(null);
      setEquipeId(initial?.beneficiaire?.type === "equipe" ? initial.beneficiaire.id : null);
      setAgentId(initial?.beneficiaire?.type === "agent" ? initial.beneficiaire.id : null);
      setPosteId(initial?.beneficiaire?.type === "poste" ? initial.beneficiaire.id : null);
      setDateAffectation(new Date().toISOString().slice(0, 10));
      setMotif("Dotation initiale");
      setMotifAutre("");
      setObservations("");
      setNumeroSerieAuto(true);
      setNumeroSerieManuel("");
      setLieuEmplacement("");
      setMarqueUnite("");
      setDateFabricationUnite("");
      setStep("form");
    }
  }, [open, initial]);

  const articlePrefilled = initial?.articleId != null;
  const beneficiairePrefilled = initial?.beneficiaire != null;

  const { data: articlesAtReference } = useQuery<{ rows: ArticleOpt[] }>({
    queryKey: ["affecter-articles-at-reference", articleReferenceId],
    queryFn: () => apiGet(`/articles?articleReferenceId=${articleReferenceId}&pageSize=200`),
    enabled: articleReferenceId != null && !articlePrefilled,
  });

  const { data: articleInfo } = useQuery<ArticleDetailInfo>({
    queryKey: ["affecter-article-detail", articleId],
    queryFn: () => apiGet(`/articles/${articleId}`),
    enabled: articleId != null,
  });

  const { data: controles } = useQuery<{ statut: string; datePlanifiee: string }[]>({
    queryKey: ["affecter-article-controles", articleId],
    queryFn: () => apiGet(`/controles?articleId=${articleId}`),
    enabled: articleId != null,
  });

  const allowedTypes = allowedBeneficiaireTypes(articleInfo?.categorieNom);
  const beneficiaireTypeMismatch = !beneficiairePrefilled && articleInfo != null && !allowedTypes.includes(beneficiaireType);

  // Si le type de bénéficiaire choisi devient invalide pour la catégorie de l'article
  // sélectionné (ex. une équipe choisie puis un article EPI sélectionné), on bascule
  // automatiquement sur le premier type encore autorisé.
  useEffect(() => {
    if (beneficiairePrefilled || articleInfo == null) return;
    if (!allowedBeneficiaireTypes(articleInfo.categorieNom).includes(beneficiaireType)) {
      setBeneficiaireType(allowedBeneficiaireTypes(articleInfo.categorieNom)[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleInfo?.categorieNom]);

  const { data: divisions } = useQuery<Division[]>({ queryKey: ["org-divisions"], queryFn: () => apiGet("/org/divisions"), enabled: open && !beneficiairePrefilled });
  const { data: services } = useQuery<Service[]>({ queryKey: ["org-services"], queryFn: () => apiGet("/org/services"), enabled: open && !beneficiairePrefilled });
  const { data: equipes } = useQuery<Equipe[]>({ queryKey: ["org-equipes"], queryFn: () => apiGet("/org/equipes"), enabled: open && !beneficiairePrefilled });
  const { data: postes } = useQuery<Poste[]>({ queryKey: ["org-postes"], queryFn: () => apiGet("/org/postes"), enabled: open && !beneficiairePrefilled });
  const { data: agentsAtEquipe } = useQuery<{ rows: Agent[] }>({
    queryKey: ["affecter-agents-equipe", equipeId],
    queryFn: () => apiGet(`/agents?equipeId=${equipeId}&pageSize=200`),
    enabled: open && !beneficiairePrefilled && beneficiaireType === "agent" && equipeId != null,
  });

  const { data: agentDetail } = useQuery<Agent>({
    queryKey: ["affecter-agent-detail", agentId],
    queryFn: () => apiGet(`/agents/${agentId}`),
    enabled: agentId != null,
  });
  const { data: equipeDetail } = useQuery<Equipe>({
    queryKey: ["affecter-equipe-detail", equipeId],
    queryFn: () => apiGet<Equipe[]>(`/org/equipes`).then((rows) => rows.find((e) => e.id === equipeId)!),
    enabled: equipeId != null,
  });
  const { data: posteDetail } = useQuery<Poste>({
    queryKey: ["affecter-poste-detail", posteId],
    queryFn: () => apiGet<Poste[]>(`/org/postes`).then((rows) => rows.find((p) => p.id === posteId)!),
    enabled: posteId != null,
  });

  const servicesForDivision = divisionId != null ? services?.filter((s) => s.divisionId === divisionId) : services;
  const equipesForService = serviceId != null ? equipes?.filter((e) => e.serviceId === serviceId) : equipes;
  const postesForService = serviceId != null ? postes?.filter((p) => p.serviceId === serviceId) : postes;

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/affectations", body),
    onSuccess: () => {
      toast.success("Affectation créée");
      qc.invalidateQueries({ queryKey: ["affectations"] });
      qc.invalidateQueries({ queryKey: ["affectations-groupes"] });
      qc.invalidateQueries({ queryKey: ["articles"] });
      qc.invalidateQueries({ queryKey: ["article"] });
      qc.invalidateQueries({ queryKey: ["agent"] });
      qc.invalidateQueries({ queryKey: ["equipe"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onSuccess?.();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const beneficiaireOk = beneficiaireType === "agent" ? agentId != null : beneficiaireType === "equipe" ? equipeId != null : posteId != null;
  const canRecap = articleId != null && beneficiaireOk && dateAffectation && !beneficiaireTypeMismatch;
  const motifFinal = motif === "Autre" ? motifAutre : motif;
  const beneficiaireNom = beneficiaireType === "agent" ? agentDetail?.nom : beneficiaireType === "equipe" ? equipeDetail?.nom : posteDetail?.nom;

  function submit() {
    createMutation.mutate({
      articleId,
      beneficiaireType,
      agentId: beneficiaireType === "agent" ? agentId : undefined,
      equipeId: beneficiaireType === "equipe" ? equipeId : undefined,
      posteId: beneficiaireType === "poste" ? posteId : undefined,
      quantite: 1,
      dateAffectation,
      motif: motifFinal || undefined,
      observations: observations || undefined,
      numeroSerie: numeroSerieAuto ? undefined : numeroSerieManuel || undefined,
      numeroSerieAuto,
      lieuEmplacement: lieuEmplacement || undefined,
      marque: marqueUnite || undefined,
      dateFabricationUnite: dateFabricationUnite || undefined,
    });
  }

  const controleStatut = controles && controles.length > 0
    ? controles.some((c) => c.statut === "en_retard") ? "en_retard" : controles.some((c) => c.statut === "planifie") ? "planifie" : "realise"
    : null;

  const TYPE_LABELS: Record<BeneficiaireType, string> = { agent: "Agent (EPI)", equipe: "Équipe (EPC)", poste: "Poste" };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Affecter un matériel</DialogTitle></DialogHeader>

        {step === "form" && (
          <div className="max-h-[65vh] space-y-5 overflow-y-auto pr-1">
            {!articlePrefilled && (
              <section className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">1. Matériel</p>
                <ArticleReferencePicker value={articleReferenceId} onChange={(id) => { setArticleReferenceId(id); setArticleId(null); }} />
                {articleReferenceId != null && (
                  <Select value={articleId != null ? String(articleId) : undefined} onValueChange={(v) => setArticleId(Number(v))}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Article physique (unité)…" /></SelectTrigger>
                    <SelectContent>
                      {articlesAtReference?.rows.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.codeArticle} — {a.designation} ({a.beneficiaireActuel ? `affecté à ${a.beneficiaireActuel}` : "disponible"})
                        </SelectItem>
                      ))}
                      {articlesAtReference?.rows.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">Aucun article disponible pour cette référence</div>}
                    </SelectContent>
                  </Select>
                )}
              </section>
            )}

            {articleInfo && (
              <div className="rounded-md border border-dashed p-3 text-sm">
                <p className="font-medium">{articleInfo.designation} <span className="font-mono text-xs text-muted-foreground">({articleInfo.codeArticle})</span></p>
                <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                  <span>Fournisseur : {articleInfo.fournisseur ?? "—"}</span>
                  <span>Acquisition : {formatDate(articleInfo.dateAcquisition)}</span>
                  <span>Durée de vie : {articleInfo.dureeVieMois ? `${articleInfo.dureeVieMois} mois` : "—"}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {articleInfo.soumisControleReglementaire && (
                    <Badge variant={controleStatut === "en_retard" ? "destructive" : controleStatut === "planifie" ? "warning" : "success"}>
                      <ShieldCheck className="mr-1 h-3 w-3" />
                      {controleStatut === "en_retard" ? "Contrôle en retard" : controleStatut === "planifie" ? "Contrôle planifié" : controleStatut === "realise" ? "Contrôle à jour" : "Soumis à contrôle"}
                    </Badge>
                  )}
                  <Badge variant="outline"><FileText className="mr-1 h-3 w-3" /> {articleInfo.documents?.length ?? 0} document(s)</Badge>
                </div>
              </div>
            )}

            {!beneficiairePrefilled && (
              <section className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">2. Bénéficiaire</p>
                <div className="flex gap-2">
                  {allowedTypes.map((t) => (
                    <Button key={t} type="button" size="sm" variant={beneficiaireType === t ? "default" : "outline"} onClick={() => setBeneficiaireType(t)}>
                      {TYPE_LABELS[t]}
                    </Button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select value={divisionId != null ? String(divisionId) : "all"} onValueChange={(v) => { setDivisionId(v === "all" ? null : Number(v)); setServiceId(null); setEquipeId(null); setAgentId(null); setPosteId(null); }}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="Division" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Division…</SelectItem>
                      {divisions?.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.nom}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={serviceId != null ? String(serviceId) : "all"} onValueChange={(v) => { setServiceId(v === "all" ? null : Number(v)); setEquipeId(null); setAgentId(null); setPosteId(null); }}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="Service" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Service…</SelectItem>
                      {servicesForDivision?.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.nom}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {beneficiaireType === "equipe" && (
                    <Select value={equipeId != null ? String(equipeId) : "all"} onValueChange={(v) => setEquipeId(v === "all" ? null : Number(v))}>
                      <SelectTrigger className="w-40"><SelectValue placeholder="Équipe" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Équipe…</SelectItem>
                        {equipesForService?.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.nom}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {beneficiaireType === "poste" && (
                    <Select value={posteId != null ? String(posteId) : "all"} onValueChange={(v) => setPosteId(v === "all" ? null : Number(v))}>
                      <SelectTrigger className="w-40"><SelectValue placeholder="Poste" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Poste…</SelectItem>
                        {postesForService?.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.nom}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                  {beneficiaireType === "agent" && (
                    <Select value={agentId != null ? String(agentId) : undefined} onValueChange={(v) => setAgentId(Number(v))}>
                      <SelectTrigger className="w-48"><SelectValue placeholder="Agent…" /></SelectTrigger>
                      <SelectContent>
                        {agentsAtEquipe?.rows.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.nom} ({a.matricule})</SelectItem>)}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </section>
            )}

            {beneficiairePrefilled && (
              <div className="rounded-md border border-dashed p-3 text-sm">
                Bénéficiaire : <span className="font-medium">{beneficiaireNom}</span>
                {beneficiaireTypeMismatch && (
                  <p className="mt-1 text-xs text-destructive">
                    Ce bénéficiaire n'est pas compatible avec la catégorie de cet article ({articleInfo?.categorieNom ?? "?"}).
                  </p>
                )}
              </div>
            )}

            <section className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">3. Numéro de série</p>
              <div className="flex items-center gap-2">
                <Switch checked={numeroSerieAuto} onCheckedChange={setNumeroSerieAuto} />
                <Label>Génération automatique</Label>
              </div>
              {!numeroSerieAuto && (
                <Input placeholder="Numéro de série de l'unité affectée" value={numeroSerieManuel} onChange={(e) => setNumeroSerieManuel(e.target.value)} />
              )}
            </section>

            {articleInfo?.soumisControleReglementaire && (
              <section className="space-y-3 rounded-md border border-dashed p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <ShieldCheck className="h-3.5 w-3.5" /> Équipement soumis à contrôle règlementaire — identifiez l'unité physique
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5"><Label htmlFor="marqueUnite">Marque</Label><Input id="marqueUnite" value={marqueUnite} onChange={(e) => setMarqueUnite(e.target.value)} /></div>
                  <div className="space-y-1.5"><Label htmlFor="lieuEmplacement">Lieu / emplacement</Label><Input id="lieuEmplacement" value={lieuEmplacement} onChange={(e) => setLieuEmplacement(e.target.value)} /></div>
                </div>
                <div className="space-y-1.5"><Label htmlFor="dateFabricationUnite">Date de fabrication</Label><Input id="dateFabricationUnite" type="date" value={dateFabricationUnite} onChange={(e) => setDateFabricationUnite(e.target.value)} /></div>
              </section>
            )}

            <section className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">4. Informations d'affectation</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label htmlFor="dateAffectation">Date d'affectation</Label><Input id="dateAffectation" type="date" value={dateAffectation} onChange={(e) => setDateAffectation(e.target.value)} /></div>
                <div className="space-y-1.5">
                  <Label>Motif</Label>
                  <Select value={motif} onValueChange={setMotif}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MOTIFS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      <SelectItem value="Autre">Autre…</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {motif === "Autre" && <Input placeholder="Préciser le motif" value={motifAutre} onChange={(e) => setMotifAutre(e.target.value)} />}
              <div className="space-y-1.5"><Label htmlFor="observations">Observations</Label><Textarea id="observations" rows={2} value={observations} onChange={(e) => setObservations(e.target.value)} /></div>
              <p className="text-xs text-muted-foreground">Affecté par : {user?.nom ?? "—"}</p>
            </section>
          </div>
        )}

        {step === "recap" && (
          <div className="space-y-3 text-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Récapitulatif</p>
            <div className="rounded-md border p-3">
              <p><span className="text-muted-foreground">Matériel :</span> {articleInfo?.designation} ({articleInfo?.codeArticle})</p>
              <p><span className="text-muted-foreground">Bénéficiaire :</span> {beneficiaireNom} ({TYPE_LABELS[beneficiaireType]})</p>
              <p><span className="text-muted-foreground">Date :</span> {formatDate(dateAffectation)}</p>
              <p><span className="text-muted-foreground">Motif :</span> {motifFinal || "—"}</p>
              <p><span className="text-muted-foreground">Numéro de série :</span> {numeroSerieAuto ? "généré automatiquement" : (numeroSerieManuel || "—")}</p>
              {observations && <p><span className="text-muted-foreground">Observations :</span> {observations}</p>}
            </div>
            <p className="text-xs text-muted-foreground">Confirmez-vous cette affectation ?</p>
          </div>
        )}

        <DialogFooter>
          {step === "form" ? (
            <>
              <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
              <Button type="button" disabled={!canRecap} onClick={() => setStep("recap")}>Continuer</Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => setStep("form")}>Retour</Button>
              <Button type="button" disabled={createMutation.isPending} onClick={submit}>Confirmer l'affectation</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
