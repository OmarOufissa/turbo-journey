import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, Building2, Briefcase, Users2, Plus } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

interface EquipeNode { id: number; nom: string; teamType: string | null; effectif: number }
interface ServiceNode { id: number; nom: string; effectifDirect: number; equipes: EquipeNode[] }
interface DivisionNode { id: number; nom: string; services: ServiceNode[] }

type NewEntityKind = "division" | "service" | "equipe";

export default function Organisation() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<DivisionNode[]>({ queryKey: ["org-tree"], queryFn: () => apiGet("/org/tree") });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ kind: NewEntityKind; parentId?: number } | null>(null);

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const createMutation = useMutation({
    mutationFn: (body: { kind: NewEntityKind; payload: Record<string, unknown> }) => {
      const path = body.kind === "division" ? "/org/divisions" : body.kind === "service" ? "/org/services" : "/org/equipes";
      return apiPost(path, body.payload);
    },
    onSuccess: () => {
      toast.success("Créé avec succès");
      qc.invalidateQueries({ queryKey: ["org-tree"] });
      setDialog(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!dialog) return;
    const fd = new FormData(e.currentTarget);
    const nom = String(fd.get("nom"));
    const code = nom.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const payload: Record<string, unknown> = { nom, code };
    if (dialog.kind === "service") payload.divisionId = dialog.parentId;
    if (dialog.kind === "equipe") {
      payload.serviceId = dialog.parentId;
      payload.teamType = fd.get("teamType") || null;
    }
    createMutation.mutate({ kind: dialog.kind, payload });
  }

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Organisation</h1>
          <p className="text-sm text-muted-foreground">Direction → Division → Service → Équipe</p>
        </div>
        <Button onClick={() => setDialog({ kind: "division" })}><Plus className="h-4 w-4" /> Nouvelle division</Button>
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
                  <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "service", parentId: division.id })}><Plus className="h-3.5 w-3.5" /> Service</Button>
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
                              {service.equipes.length > 0 ? (svcOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />) : <span className="w-3.5" />}
                              <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-sm font-medium">{service.nom}</span>
                              <Badge variant="outline">{svcEffectif} agent(s)</Badge>
                            </button>
                            <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "equipe", parentId: service.id })}><Plus className="h-3.5 w-3.5" /> Équipe</Button>
                          </div>
                          {svcOpen && service.equipes.length > 0 && (
                            <div className="ml-9 space-y-0.5 border-l border-border pl-4">
                              {service.equipes.map((eq) => (
                                <div key={eq.id} className={cn("flex items-center gap-2 py-1.5 text-sm")}>
                                  <Users2 className="h-3.5 w-3.5 text-muted-foreground" />
                                  <span>{eq.nom}</span>
                                  {eq.teamType && <Badge variant="muted">{eq.teamType}</Badge>}
                                  <Badge variant="outline">{eq.effectif} membre(s)</Badge>
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

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog?.kind === "division" && "Nouvelle division"}
              {dialog?.kind === "service" && "Nouveau service"}
              {dialog?.kind === "equipe" && "Nouvelle équipe"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="nom">Nom *</Label>
              <Input id="nom" name="nom" required autoFocus />
            </div>
            {dialog?.kind === "equipe" && (
              <div className="space-y-1.5">
                <Label htmlFor="teamType">Type d'équipe (pour le gabarit de dotation)</Label>
                <Input id="teamType" name="teamType" placeholder="Équipe Lignes, Équipe TST Postes…" />
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending}>Créer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
