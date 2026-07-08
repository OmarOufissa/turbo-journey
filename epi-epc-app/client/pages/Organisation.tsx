import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, Building2, Briefcase, Users2, Plus, Pencil, Trash2, UserPlus, Archive, ClipboardPlus, ArrowUpRight } from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete, ApiError } from "@/lib/api";
import type { Agent } from "@shared/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";
import { AffecterDialog } from "@/components/shared/AffecterDialog";

interface EquipeNode { id: number; nom: string; teamType: string | null; effectif: number }
interface PosteNode { id: number; nom: string }
interface ServiceNode { id: number; nom: string; effectifDirect: number; equipes: EquipeNode[]; postes: PosteNode[] }
interface DivisionNode { id: number; nom: string; services: ServiceNode[] }

type NewEntityKind = "division" | "service" | "equipe" | "poste";
type OrgDialog =
  | { mode: "create-org"; kind: NewEntityKind; parentId?: number }
  | { mode: "edit-org"; kind: NewEntityKind; id: number; nom: string; teamType?: string | null }
  | { mode: "create-agent"; divisionId: number | null; serviceId: number | null; equipeId: number | null }
  | { mode: "edit-agent"; agent: Agent };
type DeleteOrgTarget = { kind: NewEntityKind; id: number; nom: string };

const ORG_PATHS: Record<NewEntityKind, string> = {
  division: "/org/divisions",
  service: "/org/services",
  equipe: "/org/equipes",
  poste: "/org/postes",
};
const ORG_LABELS: Record<NewEntityKind, string> = { division: "la division", service: "le service", equipe: "l'équipe", poste: "le poste" };

export default function Organisation() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<DivisionNode[]>({ queryKey: ["org-tree"], queryFn: () => apiGet("/org/tree") });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<OrgDialog | null>(null);
  const [deleteOrgTarget, setDeleteOrgTarget] = useState<DeleteOrgTarget | null>(null);
  const [affecterEquipeId, setAffecterEquipeId] = useState<number | null>(null);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const createOrgMutation = useMutation({
    mutationFn: (body: { kind: NewEntityKind; payload: Record<string, unknown> }) => apiPost(ORG_PATHS[body.kind], body.payload),
    onSuccess: () => {
      toast.success("Créé avec succès");
      qc.invalidateQueries({ queryKey: ["org-tree"] });
      setDialog(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateOrgMutation = useMutation({
    mutationFn: ({ kind, id, payload }: { kind: NewEntityKind; id: number; payload: Record<string, unknown> }) => apiPut(`${ORG_PATHS[kind]}/${id}`, payload),
    onSuccess: () => {
      toast.success("Modifié avec succès");
      qc.invalidateQueries({ queryKey: ["org-tree"] });
      setDialog(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteOrgMutation = useMutation({
    mutationFn: ({ kind, id }: { kind: NewEntityKind; id: number }) => apiDelete(`${ORG_PATHS[kind]}/${id}`),
    onSuccess: () => {
      toast.success("Supprimé avec succès");
      qc.invalidateQueries({ queryKey: ["org-tree"] });
      setDeleteOrgTarget(null);
    },
    onError: (e: Error) => {
      if (e instanceof ApiError && e.status === 409) toast.error(e.message);
      else toast.error(e.message);
      setDeleteOrgTarget(null);
    },
  });

  function onSubmitOrg(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dialog) return;
    const fd = new FormData(e.currentTarget);
    const nom = String(fd.get("nom"));
    if (dialog.mode === "create-org") {
      const code = nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const payload: Record<string, unknown> = { nom, code };
      if (dialog.kind === "service") payload.divisionId = dialog.parentId;
      if (dialog.kind === "equipe") {
        payload.serviceId = dialog.parentId;
        payload.teamType = fd.get("teamType") || null;
      }
      if (dialog.kind === "poste") payload.serviceId = dialog.parentId;
      createOrgMutation.mutate({ kind: dialog.kind, payload });
    } else if (dialog.mode === "edit-org") {
      const payload: Record<string, unknown> = { nom };
      if (dialog.kind === "equipe") payload.teamType = fd.get("teamType") || null;
      updateOrgMutation.mutate({ kind: dialog.kind, id: dialog.id, payload });
    }
  }

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Organisation</h1>
          <p className="text-sm text-muted-foreground">Direction → Division → Service → Équipe / Poste → Agent</p>
        </div>
        <Button onClick={() => setDialog({ mode: "create-org", kind: "division" })}><Plus className="h-4 w-4" /> Nouvelle division</Button>
      </div>

      <Card>
        <CardContent className="divide-y divide-border p-0">
          {data.map((division) => {
            const divKey = `d${division.id}`;
            const divOpen = expanded.has(divKey);
            const divEffectif = division.services.reduce((s, svc) => s + svc.effectifDirect + svc.equipes.reduce((a, e) => a + e.effectif, 0), 0);
            return (
              <div key={division.id}>
                <div className="flex items-center gap-2 px-4 py-3">
                  <button onClick={() => toggle(divKey)} className="flex flex-1 items-center gap-2 text-left">
                    {divOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    <Building2 className="h-4 w-4 text-primary" />
                    <span className="font-semibold">{division.nom}</span>
                    <Badge variant="outline">{divEffectif} agent(s)</Badge>
                  </button>
                  <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: "create-org", kind: "service", parentId: division.id })}><Plus className="h-3.5 w-3.5" /> Service</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: "edit-org", kind: "division", id: division.id, nom: division.nom })}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeleteOrgTarget({ kind: "division", id: division.id, nom: division.nom })}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
                {divOpen && (
                  <div className="space-y-0.5 bg-muted/30 pb-2 pl-9 pr-4">
                    {division.services.map((service) => {
                      const svcKey = `s${service.id}`;
                      const svcOpen = expanded.has(svcKey);
                      const svcEffectif = service.effectifDirect + service.equipes.reduce((a, e) => a + e.effectif, 0);
                      return (
                        <div key={service.id} className="rounded-md">
                          <div className="flex items-center gap-2 py-2">
                            <button onClick={() => toggle(svcKey)} className="flex flex-1 items-center gap-2 text-left">
                              {svcOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                              <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm font-medium">{service.nom}</span>
                              <Badge variant="outline">{svcEffectif} agent(s)</Badge>
                            </button>
                            <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: "create-org", kind: "equipe", parentId: service.id })}><Plus className="h-3.5 w-3.5" /> Équipe</Button>
                            <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: "create-org", kind: "poste", parentId: service.id })}><Plus className="h-3.5 w-3.5" /> Poste</Button>
                            <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: "create-agent", divisionId: division.id, serviceId: service.id, equipeId: null })}><UserPlus className="h-3.5 w-3.5" /> Agent</Button>
                            <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: "edit-org", kind: "service", id: service.id, nom: service.nom })}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button size="sm" variant="ghost" onClick={() => setDeleteOrgTarget({ kind: "service", id: service.id, nom: service.nom })}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                          </div>
                          {svcOpen && (
                            <div className="ml-9 space-y-1 border-l border-border pl-4">
                              {service.effectifDirect > 0 && (
                                <AgentList divisionId={division.id} serviceId={service.id} equipeId={null} onEdit={(a) => setDialog({ mode: "edit-agent", agent: a })} />
                              )}
                              {service.equipes.map((eq) => {
                                const eqKey = `e${eq.id}`;
                                const eqOpen = expanded.has(eqKey);
                                return (
                                  <div key={eq.id}>
                                    <div className={cn("flex items-center gap-2 py-1.5 text-sm")}>
                                      <button onClick={() => toggle(eqKey)} className="flex flex-1 items-center gap-2 text-left">
                                        {eqOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                        <Users2 className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span>{eq.nom}</span>
                                        {eq.teamType && <Badge variant="muted">{eq.teamType}</Badge>}
                                        <Badge variant="outline">{eq.effectif} membre(s)</Badge>
                                      </button>
                                      <Link to={`/organisation/equipes/${eq.id}`} onClick={(e) => e.stopPropagation()}>
                                        <Button size="sm" variant="ghost" type="button"><ArrowUpRight className="h-3.5 w-3.5" /> Fiche</Button>
                                      </Link>
                                      <Button size="sm" variant="ghost" onClick={() => setAffecterEquipeId(eq.id)}><ClipboardPlus className="h-3.5 w-3.5" /> Affecter</Button>
                                      <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: "create-agent", divisionId: division.id, serviceId: service.id, equipeId: eq.id })}><UserPlus className="h-3.5 w-3.5" /></Button>
                                      <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: "edit-org", kind: "equipe", id: eq.id, nom: eq.nom, teamType: eq.teamType })}><Pencil className="h-3.5 w-3.5" /></Button>
                                      <Button size="sm" variant="ghost" onClick={() => setDeleteOrgTarget({ kind: "equipe", id: eq.id, nom: eq.nom })}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                                    </div>
                                    {eqOpen && (
                                      <div className="ml-9 border-l border-border pl-4">
                                        <AgentList divisionId={division.id} serviceId={service.id} equipeId={eq.id} onEdit={(a) => setDialog({ mode: "edit-agent", agent: a })} />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                              {service.postes.map((p) => (
                                <div key={p.id} className="flex items-center gap-2 py-1.5 text-sm">
                                  <span className="flex flex-1 items-center gap-2">
                                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                                    {p.nom}
                                  </span>
                                  <Button size="sm" variant="ghost" onClick={() => setDialog({ mode: "edit-org", kind: "poste", id: p.id, nom: p.nom })}><Pencil className="h-3.5 w-3.5" /></Button>
                                  <Button size="sm" variant="ghost" onClick={() => setDeleteOrgTarget({ kind: "poste", id: p.id, nom: p.nom })}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={dialog?.mode === "create-org" || dialog?.mode === "edit-org"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "edit-org" && `Modifier ${ORG_LABELS[dialog.kind]}`}
              {dialog?.mode === "create-org" && dialog.kind === "division" && "Nouvelle division"}
              {dialog?.mode === "create-org" && dialog.kind === "service" && "Nouveau service"}
              {dialog?.mode === "create-org" && dialog.kind === "equipe" && "Nouvelle équipe"}
              {dialog?.mode === "create-org" && dialog.kind === "poste" && "Nouveau poste"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmitOrg} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nom">Nom *</Label>
              <Input id="nom" name="nom" required autoFocus defaultValue={dialog?.mode === "edit-org" ? dialog.nom : ""} />
            </div>
            {((dialog?.mode === "create-org" && dialog.kind === "equipe") || (dialog?.mode === "edit-org" && dialog.kind === "equipe")) && (
              <div className="space-y-1.5">
                <Label htmlFor="teamType">Type d'équipe (pour le gabarit de dotation)</Label>
                <Input id="teamType" name="teamType" placeholder="Équipe Lignes, Équipe TST Postes…" defaultValue={dialog?.mode === "edit-org" ? dialog.teamType ?? "" : ""} />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>Annuler</Button>
              <Button type="submit" disabled={createOrgMutation.isPending || updateOrgMutation.isPending}>Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AgentFormDialog
        dialog={dialog}
        onClose={() => setDialog(null)}
      />

      <Dialog open={!!deleteOrgTarget} onOpenChange={(o) => !o && setDeleteOrgTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmer la suppression</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Supprimer « {deleteOrgTarget?.nom} » ? Cette action échouera si des éléments y sont encore rattachés.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteOrgTarget(null)}>Annuler</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteOrgMutation.isPending}
              onClick={() => deleteOrgTarget && deleteOrgMutation.mutate({ kind: deleteOrgTarget.kind, id: deleteOrgTarget.id })}
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AffecterDialog open={affecterEquipeId != null} onClose={() => setAffecterEquipeId(null)} initial={affecterEquipeId != null ? { beneficiaire: { type: "equipe", id: affecterEquipeId } } : undefined} />
    </div>
  );
}

function AgentList({
  divisionId,
  serviceId,
  equipeId,
  onEdit,
}: {
  divisionId: number;
  serviceId: number;
  equipeId: number | null;
  onEdit: (a: Agent) => void;
}) {
  const qc = useQueryClient();
  const { data } = useQuery<{ rows: Agent[] }>({
    queryKey: ["org-agents", serviceId, equipeId],
    queryFn: () => apiGet(`/agents?serviceId=${serviceId}${equipeId != null ? `&equipeId=${equipeId}` : ""}&pageSize=200`),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => apiPost(`/agents/${id}/archiver`),
    onSuccess: () => {
      toast.success("Agent archivé");
      qc.invalidateQueries({ queryKey: ["org-agents"] });
      qc.invalidateQueries({ queryKey: ["org-tree"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = equipeId == null ? data?.rows.filter((a) => !a.equipeId) : data?.rows;

  if (!rows || rows.length === 0) return null;

  return (
    <div className="space-y-0.5 py-1">
      {rows.map((a) => (
        <div key={a.id} className="flex items-center gap-2 py-1 text-sm">
          <span className="flex-1">
            {a.nom} {a.prenom ?? ""} <span className="text-xs text-muted-foreground">({a.matricule}{a.fonction ? ` · ${a.fonction}` : ""})</span>
          </span>
          {a.statut !== "actif" && <Badge variant="muted">{a.statut}</Badge>}
          <Button size="sm" variant="ghost" onClick={() => onEdit(a)}><Pencil className="h-3 w-3" /></Button>
          {a.statut === "actif" && (
            <Button size="sm" variant="ghost" onClick={() => archiveMutation.mutate(a.id)}><Archive className="h-3 w-3 text-destructive" /></Button>
          )}
        </div>
      ))}
    </div>
  );
}

function AgentFormDialog({ dialog, onClose }: { dialog: OrgDialog | null; onClose: () => void }) {
  const qc = useQueryClient();
  const open = dialog?.mode === "create-agent" || dialog?.mode === "edit-agent";

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/agents", body),
    onSuccess: () => {
      toast.success("Agent créé");
      qc.invalidateQueries({ queryKey: ["org-agents"] });
      qc.invalidateQueries({ queryKey: ["org-tree"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) => apiPut(`/agents/${id}`, body),
    onSuccess: () => {
      toast.success("Agent modifié");
      qc.invalidateQueries({ queryKey: ["org-agents"] });
      qc.invalidateQueries({ queryKey: ["org-tree"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dialog) return;
    const fd = new FormData(e.currentTarget);
    const payload = {
      matricule: String(fd.get("matricule")),
      nom: String(fd.get("nom")),
      prenom: String(fd.get("prenom") || "") || null,
      fonction: String(fd.get("fonction") || "") || null,
      poste: String(fd.get("poste") || "") || null,
      dateEmbauche: String(fd.get("dateEmbauche") || "") || null,
      telephone: String(fd.get("telephone") || "") || null,
      email: String(fd.get("email") || "") || null,
    };
    if (dialog.mode === "create-agent") {
      createMutation.mutate({ ...payload, divisionId: dialog.divisionId, serviceId: dialog.serviceId, equipeId: dialog.equipeId });
    } else if (dialog.mode === "edit-agent") {
      updateMutation.mutate({ id: dialog.agent.id, body: payload });
    }
  }

  const agent = dialog?.mode === "edit-agent" ? dialog.agent : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{agent ? "Modifier l'agent" : "Nouvel agent"}</DialogTitle></DialogHeader>
        <form onSubmit={onSubmit} className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="matricule">Matricule *</Label>
            <Input id="matricule" name="matricule" required defaultValue={agent?.matricule ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nom">Nom *</Label>
            <Input id="nom" name="nom" required defaultValue={agent?.nom ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prenom">Prénom</Label>
            <Input id="prenom" name="prenom" defaultValue={agent?.prenom ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fonction">Fonction</Label>
            <Input id="fonction" name="fonction" defaultValue={agent?.fonction ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="poste">Poste</Label>
            <Input id="poste" name="poste" defaultValue={agent?.poste ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dateEmbauche">Date d'embauche</Label>
            <Input id="dateEmbauche" name="dateEmbauche" type="date" defaultValue={agent?.dateEmbauche ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="telephone">Téléphone</Label>
            <Input id="telephone" name="telephone" defaultValue={agent?.telephone ?? ""} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" defaultValue={agent?.email ?? ""} />
          </div>
          <DialogFooter className="col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
