import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toaster";
import { initials } from "@/lib/utils";

interface AgentRow {
  id: number;
  matricule: string;
  nom: string;
  fonction: string | null;
  statut: string;
  divisionNom: string | null;
  serviceNom: string | null;
  equipeNom: string | null;
}
interface Division { id: number; nom: string }

export default function Agents() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [divisionId, setDivisionId] = useState("all");
  const [open, setOpen] = useState(false);

  const { data: divisions } = useQuery<Division[]>({ queryKey: ["divisions"], queryFn: () => apiGet("/org/divisions") });
  const { data, isLoading } = useQuery<{ rows: AgentRow[]; total: number }>({
    queryKey: ["agents", q, divisionId],
    queryFn: () => apiGet(`/agents?pageSize=300${q ? `&q=${encodeURIComponent(q)}` : ""}${divisionId !== "all" ? `&divisionId=${divisionId}` : ""}`),
  });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/agents", body),
    onSuccess: () => {
      toast.success("Bénéficiaire créé");
      qc.invalidateQueries({ queryKey: ["agents"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      matricule: fd.get("matricule"),
      nom: fd.get("nom"),
      fonction: fd.get("fonction") || null,
      poste: fd.get("poste") || null,
      telephone: fd.get("telephone") || null,
      dateEmbauche: fd.get("dateEmbauche") || null,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Bénéficiaires</h1>
          <p className="text-sm text-muted-foreground">{data?.total ?? "…"} agent(s)</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nouveau bénéficiaire</Button>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, matricule, fonction…" className="pl-8" />
          </div>
          <Select value={divisionId} onValueChange={setDivisionId}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Division" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les divisions</SelectItem>
              {divisions?.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.nom}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Matricule</TableHead>
              <TableHead>Fonction</TableHead>
              <TableHead>Division / Service / Équipe</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Chargement…</TableCell></TableRow>}
            {!isLoading && data?.rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Aucun agent</TableCell></TableRow>}
            {data?.rows.map((a) => (
              <TableRow key={a.id} className="cursor-pointer" onClick={() => navigate(`/agents/${a.id}`)}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-8 w-8"><AvatarFallback>{initials(a.nom)}</AvatarFallback></Avatar>
                    <span className="font-medium">{a.nom}</span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{a.matricule}</TableCell>
                <TableCell>{a.fonction ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {[a.divisionNom, a.serviceNom, a.equipeNom].filter(Boolean).join(" / ") || "—"}
                </TableCell>
                <TableCell><Badge variant={a.statut === "actif" ? "success" : "muted"}>{a.statut}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouveau bénéficiaire</DialogTitle></DialogHeader>
          <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label htmlFor="matricule">Matricule *</Label><Input id="matricule" name="matricule" required /></div>
            <div className="space-y-1.5"><Label htmlFor="nom">Nom complet *</Label><Input id="nom" name="nom" required /></div>
            <div className="space-y-1.5"><Label htmlFor="fonction">Fonction</Label><Input id="fonction" name="fonction" /></div>
            <div className="space-y-1.5"><Label htmlFor="poste">Poste</Label><Input id="poste" name="poste" /></div>
            <div className="space-y-1.5"><Label htmlFor="telephone">Téléphone</Label><Input id="telephone" name="telephone" /></div>
            <div className="space-y-1.5"><Label htmlFor="dateEmbauche">Date d'embauche</Label><Input id="dateEmbauche" name="dateEmbauche" type="date" /></div>
            <p className="col-span-2 text-xs text-muted-foreground">L'affectation à une division / service / équipe se fait depuis la page Organisation.</p>
            <DialogFooter className="col-span-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
              <Button type="submit" disabled={createMutation.isPending}>Créer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
