import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, Undo2, Trash2 } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { StatutAffectationBadge } from "@/components/shared/Badges";
import { toast } from "@/components/ui/toaster";
import { formatDate } from "@/lib/utils";

interface AffectationRow {
  id: number;
  designation: string;
  codeArticle: string;
  beneficiaireType: string;
  agentNom: string | null;
  equipeNom: string | null;
  quantite: number;
  dateAffectation: string;
  statut: string;
  motif: string | null;
}
interface ArticleOpt { id: number; designation: string; codeArticle: string; stockDisponible: number }
interface AgentOpt { id: number; nom: string; matricule: string }
interface EquipeOpt { id: number; nom: string }

export default function Affectations() {
  const qc = useQueryClient();
  const [statut, setStatut] = useState("all");
  const [beneficiaireType, setBeneficiaireType] = useState("all");
  const [open, setOpen] = useState(false);
  const [retourTarget, setRetourTarget] = useState<AffectationRow | null>(null);
  const [beneficiaireKind, setBeneficiaireKind] = useState<"agent" | "equipe">("agent");

  const { data, isLoading } = useQuery<{ rows: AffectationRow[]; total: number }>({
    queryKey: ["affectations", statut, beneficiaireType],
    queryFn: () => apiGet(`/affectations?pageSize=300${statut !== "all" ? `&statut=${statut}` : ""}${beneficiaireType !== "all" ? `&beneficiaireType=${beneficiaireType}` : ""}`),
  });
  const { data: articles } = useQuery<{ rows: ArticleOpt[] }>({ queryKey: ["articles-all"], queryFn: () => apiGet("/articles?pageSize=500") });
  const { data: agents } = useQuery<{ rows: AgentOpt[] }>({ queryKey: ["agents-all"], queryFn: () => apiGet("/agents?pageSize=500"), enabled: open && beneficiaireKind === "agent" });
  const { data: equipes } = useQuery<EquipeOpt[]>({ queryKey: ["equipes-all"], queryFn: () => apiGet("/org/equipes"), enabled: open && beneficiaireKind === "equipe" });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/affectations", body),
    onSuccess: () => {
      toast.success("Affectation créée");
      qc.invalidateQueries({ queryKey: ["affectations"] });
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
      setRetourTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reformeMutation = useMutation({
    mutationFn: (body: { id: number; motif: string }) => apiPost(`/affectations/${body.id}/reforme`, body),
    onSuccess: () => {
      toast.success("Équipement réformé");
      qc.invalidateQueries({ queryKey: ["affectations"] });
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
    });
  }

  function onRetourSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!retourTarget) return;
    const fd = new FormData(e.currentTarget);
    retourMutation.mutate({ id: retourTarget.id, dateRetour: String(fd.get("dateRetour")), etatRetour: String(fd.get("etatRetour")) });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Affectations</h1>
          <p className="text-sm text-muted-foreground">{data?.total ?? "…"} dotation(s) individuelle(s) et collective(s)</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nouvelle affectation</Button>
      </div>

      <Card className="p-3">
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
      </Card>

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
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.designation}</TableCell>
                <TableCell>
                  {a.agentNom ?? a.equipeNom}
                  <span className="ml-1.5 text-xs text-muted-foreground">{a.beneficiaireType === "agent" ? "(EPI)" : "(EPC)"}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{a.quantite}</TableCell>
                <TableCell>{formatDate(a.dateAffectation)}</TableCell>
                <TableCell><StatutAffectationBadge statut={a.statut} /></TableCell>
                <TableCell className="text-right">
                  {a.statut === "actif" && (
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setRetourTarget(a)}><Undo2 className="h-3.5 w-3.5" /> Retour</Button>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => reformeMutation.mutate({ id: a.id, motif: "Fin de vie / hors service" })}>
                        <Trash2 className="h-3.5 w-3.5" /> Réformer
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

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
              <select id="articleId" name="articleId" required className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm">
                <option value="">Sélectionner…</option>
                {articles?.rows.map((a) => <option key={a.id} value={a.id}>{a.designation} ({a.stockDisponible} dispo)</option>)}
              </select>
            </div>
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
    </div>
  );
}
