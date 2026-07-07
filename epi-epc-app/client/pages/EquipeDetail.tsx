import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ArrowLeft, ClipboardPlus, Undo2, AlertTriangle, Trash2 } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { AffecterDialog } from "@/components/shared/AffecterDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatutAffectationBadge } from "@/components/shared/Badges";
import { toast } from "@/components/ui/toaster";
import { formatDate } from "@/lib/utils";
import type { BesoinLine } from "@shared/api";

interface EquipeData {
  id: number;
  code: string;
  nom: string;
  teamType: string | null;
  serviceId: number;
  serviceNom: string | null;
  divisionId: number | null;
  divisionNom: string | null;
  membres: { id: number; matricule: string; nom: string; prenom: string | null; poste: string | null; statut: string }[];
  dotations: { id: number; articleId: number; designation: string; quantite: number; dateAffectation: string | null; statut: string; motif: string | null }[];
  besoins: BesoinLine[];
}

export default function EquipeDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [affecterOpen, setAffecterOpen] = useState(false);
  const [retourTarget, setRetourTarget] = useState<EquipeData["dotations"][number] | null>(null);
  const [perduTarget, setPerduTarget] = useState<EquipeData["dotations"][number] | null>(null);
  const [reformeTarget, setReformeTarget] = useState<EquipeData["dotations"][number] | null>(null);

  const { data, isLoading } = useQuery<EquipeData>({ queryKey: ["equipe", id], queryFn: () => apiGet(`/org/equipes/${id}`) });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["equipe", id] });
  }

  const retourMutation = useMutation({
    mutationFn: (body: { id: number; dateRetour: string; etatRetour: string; motif: string; commentaire?: string }) => apiPost(`/affectations/${body.id}/retour`, body),
    onSuccess: () => {
      toast.success("Affectation retirée");
      invalidate();
      setRetourTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const perduMutation = useMutation({
    mutationFn: (body: { id: number; datePerte: string; motif: string }) => apiPost(`/affectations/${body.id}/perdu`, body),
    onSuccess: () => {
      toast.success("Perte déclarée");
      invalidate();
      setPerduTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reformeMutation = useMutation({
    mutationFn: (body: { id: number; motif: string }) => apiPost(`/affectations/${body.id}/reforme`, body),
    onSuccess: () => {
      toast.success("Équipement réformé");
      invalidate();
      setReformeTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onRetourSubmit(e: React.FormEvent<HTMLFormElement>) {
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
  }

  function onPerduSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!perduTarget) return;
    const fd = new FormData(e.currentTarget);
    perduMutation.mutate({ id: perduTarget.id, datePerte: String(fd.get("datePerte")), motif: String(fd.get("motif") || "") });
  }

  function onReformeSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reformeTarget) return;
    const fd = new FormData(e.currentTarget);
    reformeMutation.mutate({ id: reformeTarget.id, motif: String(fd.get("motif") || "") });
  }

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <div className="space-y-4">
      <Link to="/organisation" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour à l'organisation
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{data.nom}</h1>
          <p className="text-sm text-muted-foreground">
            {data.code}
            {data.teamType && ` · ${data.teamType}`}
            {data.serviceNom && ` · ${data.serviceNom}`}
            {data.divisionNom && ` · ${data.divisionNom}`}
          </p>
        </div>
        <Button onClick={() => setAffecterOpen(true)}><ClipboardPlus className="h-4 w-4" /> Affecter un matériel</Button>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-x-8 gap-y-3 p-5 text-sm sm:grid-cols-4">
          <Field label="Division" value={data.divisionNom} />
          <Field label="Service" value={data.serviceNom} />
          <Field label="Type d'équipe" value={data.teamType} />
          <Field label="Effectif" value={String(data.membres.length)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Membres</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Matricule</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Poste</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.membres.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Aucun membre affecté à cette équipe</TableCell></TableRow>}
              {data.membres.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{m.matricule}</TableCell>
                  <TableCell className="font-medium"><Link to={`/agents/${m.id}`} className="hover:underline">{m.nom} {m.prenom ?? ""}</Link></TableCell>
                  <TableCell className="text-muted-foreground">{m.poste ?? "—"}</TableCell>
                  <TableCell><Badge variant={m.statut === "actif" ? "success" : "muted"}>{m.statut}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Besoin vs. dotation</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Article de référence</TableHead>
                <TableHead className="text-right">Besoin</TableHead>
                <TableHead className="text-right">Doté</TableHead>
                <TableHead className="text-right">Écart</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.besoins.length === 0 && <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Aucun gabarit de dotation applicable à cette équipe</TableCell></TableRow>}
              {data.besoins.map((b) => (
                <TableRow key={b.articleReferenceId}>
                  <TableCell className="font-medium">{b.referenceDesignation}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.quantiteBesoin}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={b.quantiteDotee < b.quantiteBesoin ? "text-destructive font-medium" : ""}>{b.quantiteDotee}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{b.ecart}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Dotation collective (EPC)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Article</TableHead>
                <TableHead className="text-right">Qté</TableHead>
                <TableHead>Motif</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.dotations.length === 0 && <TableRow><TableCell colSpan={6} className="py-6 text-center text-muted-foreground">Aucune dotation collective enregistrée</TableCell></TableRow>}
              {data.dotations.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.designation}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.quantite}</TableCell>
                  <TableCell className="text-muted-foreground">{d.motif ?? "—"}</TableCell>
                  <TableCell>{formatDate(d.dateAffectation)}</TableCell>
                  <TableCell><StatutAffectationBadge statut={d.statut} /></TableCell>
                  <TableCell className="text-right">
                    {d.statut === "actif" && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setRetourTarget(d)}><Undo2 className="h-3.5 w-3.5" /> Retirer</Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setPerduTarget(d)}><AlertTriangle className="h-3.5 w-3.5" /> Perdu</Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setReformeTarget(d)}><Trash2 className="h-3.5 w-3.5" /> Réformer</Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AffecterDialog open={affecterOpen} onClose={() => { setAffecterOpen(false); invalidate(); }} initial={{ beneficiaire: { type: "equipe", id: Number(id) } }} />

      <Dialog open={!!retourTarget} onOpenChange={(o) => !o && setRetourTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Retirer l'affectation</DialogTitle></DialogHeader>
          <form onSubmit={onRetourSubmit} className="space-y-4">
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
            <div className="space-y-1.5"><Label htmlFor="motif">Motif du retrait *</Label><Input id="motif" name="motif" required placeholder="Fin de mission, retour normal…" /></div>
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
          <form onSubmit={onPerduSubmit} className="space-y-4">
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
          <form onSubmit={onReformeSubmit} className="space-y-4">
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

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5">{value || "—"}</p>
    </div>
  );
}
