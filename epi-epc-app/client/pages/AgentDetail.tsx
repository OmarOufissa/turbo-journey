import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { ArrowLeft, FileDown, PackagePlus, Pencil, Plus, Trash2, Ruler, ClipboardPlus } from "lucide-react";
import { apiGet, apiPost, apiPut, downloadFile } from "@/lib/api";
import { AffecterDialog } from "@/components/shared/AffecterDialog";
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
import { MENSURATION_KEYS, mensurationLabel } from "@/lib/mensurations";

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
  mensurations: { cle: string; valeur: string }[];
  dotations: { id: number; designation: string; quantite: number; taille: string | null; pointure: string | null; dateAffectation: string; statut: string; motif: string | null }[];
}
interface KitTemplate { id: number; code: string; label: string; appliesToType: string }

export default function AgentDetail() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [kitOpen, setKitOpen] = useState(false);
  const [affecterOpen, setAffecterOpen] = useState(false);
  const [mensurationsOpen, setMensurationsOpen] = useState(false);
  const [mensurationRows, setMensurationRows] = useState<{ cle: string; valeur: string }[]>([]);

  const { data, isLoading } = useQuery<AgentData>({ queryKey: ["agent", id], queryFn: () => apiGet(`/agents/${id}`) });
  const { data: kits } = useQuery<KitTemplate[]>({ queryKey: ["kit-templates"], queryFn: () => apiGet("/kit-templates") });

  const updateMensurationsMutation = useMutation({
    mutationFn: (mensurations: { cle: string; valeur: string }[]) => apiPut(`/agents/${id}/mensurations`, { mensurations }),
    onSuccess: () => {
      toast.success("Mensurations enregistrées");
      qc.invalidateQueries({ queryKey: ["agent", id] });
      setMensurationsOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openMensurations() {
    const existing = new Map(data?.mensurations.map((m) => [m.cle, m.valeur]));
    const rows = MENSURATION_KEYS.map((k) => ({ cle: k.cle, valeur: existing.get(k.cle) ?? "" }));
    for (const m of data?.mensurations ?? []) {
      if (!MENSURATION_KEYS.some((k) => k.cle === m.cle)) rows.push({ cle: m.cle, valeur: m.valeur });
    }
    setMensurationRows(rows);
    setMensurationsOpen(true);
  }

  const applyKit = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/affectations/kit/appliquer", body),
    onSuccess: (res: any) => {
      toast.success(`${res.created} article(s) affecté(s)`);
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
          <Button variant="outline" onClick={() => setKitOpen(true)}>
            <PackagePlus className="h-4 w-4" /> Appliquer un gabarit
          </Button>
          <Button onClick={() => setAffecterOpen(true)}>
            <ClipboardPlus className="h-4 w-4" /> Affecter un matériel
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
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Mensurations</CardTitle>
          <Button size="sm" variant="outline" onClick={openMensurations}><Pencil className="h-3.5 w-3.5" /> Modifier</Button>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-8 gap-y-3 p-5 text-sm sm:grid-cols-4">
          {data.mensurations.length === 0 && <p className="col-span-full text-sm text-muted-foreground">Aucune mensuration renseignée</p>}
          {data.mensurations.map((m) => (
            <Field key={m.cle} label={mensurationLabel(m.cle)} value={m.valeur} />
          ))}
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

      <Dialog open={mensurationsOpen} onOpenChange={setMensurationsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Mensurations</DialogTitle></DialogHeader>
          <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {mensurationRows.map((row, i) => (
              <div key={row.cle || i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                <Label className="text-sm">{mensurationLabel(row.cle) || row.cle}</Label>
                <Input
                  value={row.valeur}
                  onChange={(e) => setMensurationRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, valeur: e.target.value } : r)))}
                />
                {!MENSURATION_KEYS.some((k) => k.cle === row.cle) && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setMensurationRows((prev) => prev.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
            <div className="flex items-center gap-2 pt-2">
              <Ruler className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Mensuration personnalisée :</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setMensurationRows((prev) => [...prev, { cle: `custom_${Date.now()}`, valeur: "" }])}
              >
                <Plus className="h-3.5 w-3.5" /> Ajouter
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMensurationsOpen(false)}>Annuler</Button>
            <Button
              type="button"
              disabled={updateMensurationsMutation.isPending}
              onClick={() => updateMensurationsMutation.mutate(mensurationRows.filter((r) => r.valeur.trim()))}
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <AffecterDialog open={affecterOpen} onClose={() => setAffecterOpen(false)} initial={{ beneficiaire: { type: "agent", id: Number(id) } }} />
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
