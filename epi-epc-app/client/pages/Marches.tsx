import { useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, Download } from "lucide-react";
import { apiGet, apiPost, downloadFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { formatDate, formatMoney } from "@/lib/utils";

interface Marche {
  id: number;
  numero: string;
  annee: number;
  objet: string;
  fournisseur: string;
  montant: string | null;
  dateNotification: string | null;
  dateLivraison: string | null;
  statut: string;
  nbArticles: number;
}

const STATUT_VARIANT: Record<string, "muted" | "warning" | "success"> = {
  notifie: "muted",
  en_cours: "warning",
  livre: "success",
  solde: "success",
};

export default function Marches() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery<Marche[]>({ queryKey: ["marches"], queryFn: () => apiGet("/marches") });

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost("/marches", body),
    onSuccess: () => {
      toast.success("Marché créé");
      qc.invalidateQueries({ queryKey: ["marches"] });
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMutation.mutate({
      numero: fd.get("numero"),
      annee: Number(fd.get("annee")),
      objet: fd.get("objet"),
      fournisseur: fd.get("fournisseur"),
      montant: fd.get("montant") || null,
      dateNotification: fd.get("dateNotification") || null,
      dateLivraison: fd.get("dateLivraison") || null,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Marchés</h1>
          <p className="text-sm text-muted-foreground">Contrats et bons de commande d'approvisionnement</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadFile("/rapports/marches.xlsx")}><Download className="h-4 w-4" /> Exporter</Button>
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nouveau marché</Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Numéro</TableHead>
              <TableHead>Objet</TableHead>
              <TableHead>Fournisseur</TableHead>
              <TableHead className="text-right">Montant</TableHead>
              <TableHead>Notification</TableHead>
              <TableHead>Livraison</TableHead>
              <TableHead className="text-right">Articles</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Chargement…</TableCell></TableRow>}
            {!isLoading && data?.length === 0 && (
              <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Aucun marché enregistré — ajoutez le premier avec « Nouveau marché »</TableCell></TableRow>
            )}
            {data?.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="font-mono text-xs">{m.numero}</TableCell>
                <TableCell className="max-w-sm truncate font-medium">{m.objet}</TableCell>
                <TableCell className="text-muted-foreground">{m.fournisseur}</TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(m.montant)}</TableCell>
                <TableCell>{formatDate(m.dateNotification)}</TableCell>
                <TableCell>{formatDate(m.dateLivraison)}</TableCell>
                <TableCell className="text-right tabular-nums">{m.nbArticles}</TableCell>
                <TableCell><Badge variant={STATUT_VARIANT[m.statut] ?? "muted"}>{m.statut.replace("_", " ")}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouveau marché</DialogTitle></DialogHeader>
          <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label htmlFor="numero">Numéro *</Label><Input id="numero" name="numero" required placeholder="12/DTC/2026" /></div>
            <div className="space-y-1.5"><Label htmlFor="annee">Année *</Label><Input id="annee" name="annee" type="number" required defaultValue={new Date().getFullYear()} /></div>
            <div className="col-span-2 space-y-1.5"><Label htmlFor="objet">Objet *</Label><Input id="objet" name="objet" required /></div>
            <div className="col-span-2 space-y-1.5"><Label htmlFor="fournisseur">Fournisseur *</Label><Input id="fournisseur" name="fournisseur" required /></div>
            <div className="space-y-1.5"><Label htmlFor="montant">Montant (MAD)</Label><Input id="montant" name="montant" type="number" step="0.01" /></div>
            <div className="space-y-1.5"><Label htmlFor="dateNotification">Date de notification</Label><Input id="dateNotification" name="dateNotification" type="date" /></div>
            <div className="space-y-1.5"><Label htmlFor="dateLivraison">Date de livraison</Label><Input id="dateLivraison" name="dateLivraison" type="date" /></div>
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
