import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { StatutControleBadge } from "@/components/shared/Badges";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toaster";
import { formatDate, formatMoney } from "@/lib/utils";

interface Controle {
  id: number;
  designation: string;
  familleNom: string | null;
  soumisControleReglementaire: boolean;
  lieuEmplacement: string | null;
  numeroSerie: string | null;
  type: string;
  datePlanifiee: string;
  dateRealisee: string | null;
  resultat: string | null;
  prochaineEcheance: string | null;
  statut: string;
  realiseParNom: string | null;
}
interface FamilleOpt { id: number; nom: string; soumisControleReglementaire: boolean }
interface Reparation {
  id: number;
  designation: string;
  dateEnvoi: string;
  dateRetourPrevue: string | null;
  dateRetourReelle: string | null;
  prestataire: string | null;
  cout: string | null;
  statut: string;
  motif: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  inspection: "Inspection",
  essai_dielectrique: "Essai diélectrique",
  etalonnage: "Étalonnage",
  maintenance: "Maintenance",
  renouvellement: "Renouvellement",
};

export default function Controles() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [statut, setStatut] = useState("all");
  const [familleId, setFamilleId] = useState(searchParams.get("familleId") ?? "all");
  const [reglementaireOnly, setReglementaireOnly] = useState(searchParams.get("reglementaireOnly") === "true");
  const [realiserTarget, setRealiserTarget] = useState<Controle | null>(null);

  const { data: familles } = useQuery<FamilleOpt[]>({ queryKey: ["familles"], queryFn: () => apiGet("/articles/familles") });
  const reglFamilles = familles?.filter((f) => f.soumisControleReglementaire) ?? [];

  const controlesQs = [
    statut !== "all" ? `statut=${statut}` : null,
    familleId !== "all" ? `familleId=${familleId}` : null,
    reglementaireOnly ? "reglementaireOnly=true" : null,
  ]
    .filter(Boolean)
    .join("&");

  const { data: controles, isLoading } = useQuery<Controle[]>({
    queryKey: ["controles", statut, familleId, reglementaireOnly],
    queryFn: () => apiGet(`/controles${controlesQs ? `?${controlesQs}` : ""}`),
  });
  const { data: reparations } = useQuery<Reparation[]>({ queryKey: ["reparations"], queryFn: () => apiGet("/reparations") });

  const realiserMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost(`/controles/${body.id}/realiser`, body),
    onSuccess: () => {
      toast.success("Contrôle enregistré");
      qc.invalidateQueries({ queryKey: ["controles"] });
      setRealiserTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!realiserTarget) return;
    const fd = new FormData(e.currentTarget);
    realiserMutation.mutate({
      id: realiserTarget.id,
      dateRealisee: fd.get("dateRealisee"),
      resultat: fd.get("resultat"),
      observations: fd.get("observations") || undefined,
      prochaineEcheanceMois: Number(fd.get("prochaineEcheanceMois") || 12),
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Contrôles périodiques & réparations</h1>
        <p className="text-sm text-muted-foreground">Inspections, essais diélectriques, étalonnages, maintenance et suivi des réparations</p>
      </div>

      <Tabs defaultValue="controles">
        <TabsList>
          <TabsTrigger value="controles">Contrôles périodiques</TabsTrigger>
          <TabsTrigger value="reparations">Réparations</TabsTrigger>
        </TabsList>

        <TabsContent value="controles" className="space-y-4">
          <Card className="flex flex-wrap items-center gap-2 p-3">
            <Select value={statut} onValueChange={setStatut}>
              <SelectTrigger className="w-48"><SelectValue placeholder="Statut" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="planifie">Planifié</SelectItem>
                <SelectItem value="en_retard">En retard</SelectItem>
                <SelectItem value="realise">Réalisé</SelectItem>
              </SelectContent>
            </Select>
            <Select value={familleId} onValueChange={setFamilleId}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Famille" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes familles</SelectItem>
                {reglFamilles.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.nom}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              variant={reglementaireOnly ? "default" : "outline"}
              onClick={() => setReglementaireOnly((v) => !v)}
            >
              <ShieldCheck className="h-3.5 w-3.5" /> Soumis à contrôle règlementaire uniquement
            </Button>
          </Card>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Article</TableHead>
                  <TableHead>Famille</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead>Réalisé le</TableHead>
                  <TableHead>Résultat</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Chargement…</TableCell></TableRow>}
                {!isLoading && controles?.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Aucun contrôle planifié pour le moment</TableCell></TableRow>
                )}
                {controles?.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {c.designation}
                      {(c.lieuEmplacement || c.numeroSerie) && (
                        <div className="text-xs font-normal text-muted-foreground">
                          {[c.lieuEmplacement, c.numeroSerie].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{c.familleNom ?? "—"}</TableCell>
                    <TableCell>{TYPE_LABELS[c.type] ?? c.type}</TableCell>
                    <TableCell>{formatDate(c.datePlanifiee)}</TableCell>
                    <TableCell>{formatDate(c.dateRealisee)}</TableCell>
                    <TableCell>{c.resultat ? <Badge variant={c.resultat === "conforme" ? "success" : "warning"}>{c.resultat.replace("_", " ")}</Badge> : "—"}</TableCell>
                    <TableCell><StatutControleBadge statut={c.statut} /></TableCell>
                    <TableCell className="text-right">
                      {c.statut !== "realise" && (
                        <Button size="sm" variant="ghost" onClick={() => setRealiserTarget(c)}><CheckCircle2 className="h-3.5 w-3.5" /> Réaliser</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="reparations">
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Article</TableHead>
                  <TableHead>Prestataire</TableHead>
                  <TableHead>Envoi</TableHead>
                  <TableHead>Retour prévu</TableHead>
                  <TableHead className="text-right">Coût</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reparations?.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Aucune réparation en cours</TableCell></TableRow>}
                {reparations?.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.designation}</TableCell>
                    <TableCell>{r.prestataire ?? "—"}</TableCell>
                    <TableCell>{formatDate(r.dateEnvoi)}</TableCell>
                    <TableCell>{formatDate(r.dateRetourPrevue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(r.cout)}</TableCell>
                    <TableCell><Badge variant={r.statut === "terminee" ? "success" : r.statut === "irreparable" ? "destructive" : "muted"}>{r.statut}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!realiserTarget} onOpenChange={(o) => !o && setRealiserTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Réaliser le contrôle</DialogTitle></DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5"><Label htmlFor="dateRealisee">Date de réalisation</Label><Input id="dateRealisee" name="dateRealisee" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></div>
            <div className="space-y-1.5">
              <Label htmlFor="resultat">Résultat</Label>
              <select id="resultat" name="resultat" className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm">
                <option value="conforme">Conforme</option>
                <option value="non_conforme">Non conforme</option>
                <option value="a_revoir">À revoir</option>
              </select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="prochaineEcheanceMois">Prochaine échéance (mois)</Label><Input id="prochaineEcheanceMois" name="prochaineEcheanceMois" type="number" defaultValue={12} /></div>
            <div className="space-y-1.5"><Label htmlFor="observations">Observations</Label><Input id="observations" name="observations" /></div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRealiserTarget(null)}>Annuler</Button>
              <Button type="submit" disabled={realiserMutation.isPending}>Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
