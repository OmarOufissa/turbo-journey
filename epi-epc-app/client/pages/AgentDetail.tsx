import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ArrowLeft, FileDown, PackagePlus } from "lucide-react";
import { apiGet, apiPost, downloadFile } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { StatutAffectationBadge } from "@/components/shared/Badges";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { initials, formatDate } from "@/lib/utils";

interface AgentData {
  id: number;
  matricule: string;
  nom: string;
  fonction: string | null;
  poste: string | null;
  telephone: string | null;
  dateEmbauche: string | null;
  divisionNom: string | null;
  serviceNom: string | null;
  equipeNom: string | null;
  equipeId: number | null;
  dotations: { id: number; designation: string; quantite: number; taille: string | null; pointure: string | null; dateAffectation: string; statut: string; motif: string | null }[];
}
interface KitTemplate { id: number; code: string; label: string; appliesToType: string }

export default function AgentDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [kitOpen, setKitOpen] = useState(false);

  const { data, isLoading } = useQuery<AgentData>({ queryKey: ["agent", id], queryFn: () => apiGet(`/agents/${id}`) });
  const { data: kits } = useQuery<KitTemplate[]>({ queryKey: ["kit-templates"], queryFn: () => apiGet("/kit-templates") });

  const applyKit = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/affectations/kit/appliquer", body),
    onSuccess: (res: any) => {
      toast.success(`${res.created} article(s) affecté(s)${res.ignoredForStock?.length ? ` — ${res.ignoredForStock.length} ignoré(s) (stock insuffisant)` : ""}`);
      qc.invalidateQueries({ queryKey: ["agent", id] });
      setKitOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onApplyKit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    applyKit.mutate({
      kitTemplateId: Number(fd.get("kitTemplateId")),
      agentId: Number(id),
      dateAffectation: fd.get("dateAffectation"),
      motif: fd.get("motif") || undefined,
    });
  }

  if (isLoading || !data) return <p className="text-sm text-muted-foreground">Chargement…</p>;

  return (
    <div className="space-y-4">
      <Link to="/agents" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour aux bénéficiaires
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-14 w-14 text-lg"><AvatarFallback>{initials(data.nom)}</AvatarFallback></Avatar>
          <div>
            <h1 className="text-xl font-semibold">{data.nom}</h1>
            <p className="text-sm text-muted-foreground">Matricule {data.matricule} · {data.fonction ?? "Fonction non renseignée"}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadFile(`/rapports/dotation-individuelle/${id}`)}>
            <FileDown className="h-4 w-4" /> Fiche de dotation
          </Button>
          <Button onClick={() => setKitOpen(true)}>
            <PackagePlus className="h-4 w-4" /> Appliquer un gabarit
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-x-8 gap-y-3 p-5 text-sm sm:grid-cols-4">
          <Field label="Division" value={data.divisionNom} />
          <Field label="Service" value={data.serviceNom} />
          <Field label="Équipe" value={data.equipeNom} />
          <Field label="Poste" value={data.poste} />
          <Field label="Téléphone" value={data.telephone} />
          <Field label="Date d'embauche" value={formatDate(data.dateEmbauche)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Dotation individuelle (EPI)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Article</TableHead>
                <TableHead className="text-right">Qté</TableHead>
                <TableHead>Taille / Pointure</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.dotations.length === 0 && <TableRow><TableCell colSpan={5} className="py-6 text-center text-muted-foreground">Aucune dotation enregistrée</TableCell></TableRow>}
              {data.dotations.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-medium">{d.designation}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.quantite}</TableCell>
                  <TableCell className="text-muted-foreground">{d.taille || d.pointure || "—"}</TableCell>
                  <TableCell>{formatDate(d.dateAffectation)}</TableCell>
                  <TableCell><StatutAffectationBadge statut={d.statut} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={kitOpen} onOpenChange={setKitOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Appliquer un gabarit de dotation standard</DialogTitle></DialogHeader>
          <form onSubmit={onApplyKit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="kitTemplateId">Gabarit</Label>
              <Select name="kitTemplateId" required>
                <SelectTrigger id="kitTemplateId"><SelectValue placeholder="Choisir un gabarit" /></SelectTrigger>
                <SelectContent>
                  {kits?.map((k) => <SelectItem key={k.id} value={String(k.id)}>{k.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dateAffectation">Date de dotation</Label>
              <Input id="dateAffectation" name="dateAffectation" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="motif">Motif</Label>
              <Input id="motif" name="motif" placeholder="Dotation initiale, renouvellement…" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setKitOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={applyKit.isPending}>Appliquer</Button>
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
