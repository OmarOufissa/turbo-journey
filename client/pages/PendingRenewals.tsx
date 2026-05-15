import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { setLastAction } from "@/components/UndoButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

interface PendingRenewal {
  id: number;
  employeeId: number;
  snapshot: Record<string, any>;
  createdAt: string;
  matricule?: string;
  nom?: string;
  prenom?: string;
}

export default function PendingRenewals() {
  const { toast } = useToast();
  const [renewals, setRenewals] = useState<PendingRenewal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const token = localStorage.getItem("token");

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/renewals", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setRenewals(data.data ?? data ?? []);
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger les renouvellements", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  async function activate(id: number) {
    if (!window.confirm("Activer ce renouvellement ?")) return;
    try {
      const res = await fetch(`/api/renewals/${id}/activate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur");
      toast({ title: "Succès", description: "Renouvellement activé" });
      if (data.data?.auditLogId) setLastAction({ auditLogId: data.data.auditLogId, description: "Renouvellement activé", timestamp: Date.now() });
      fetchData();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  }

  async function cancel(id: number) {
    if (!window.confirm("Annuler ce renouvellement ?")) return;
    try {
      const res = await fetch(`/api/renewals/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast({ title: "Succès", description: "Renouvellement annulé" });
      fetchData();
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    }
  }

  const filtered = renewals.filter(r => {
    const q = searchTerm.toLowerCase();
    return (
      (r.matricule ?? r.snapshot?.matricule ?? "").toLowerCase().includes(q) ||
      (r.nom ?? r.snapshot?.nom ?? "").toLowerCase().includes(q) ||
      (r.prenom ?? r.snapshot?.prenom ?? "").toLowerCase().includes(q)
    );
  });

  if (isLoading) return <Layout><LoadingSpinner /></Layout>;

  return (
    <Layout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Renouvellements en attente ({renewals.length})</h1>
        </div>

        <Input
          placeholder="Rechercher par matricule, nom..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="max-w-md"
        />

        {filtered.length === 0 ? (
          <EmptyState title="Aucun renouvellement en attente" description="Tous les renouvellements ont été traités" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Matricule</TableHead>
                <TableHead>Employé</TableHead>
                <TableHead>N° titre</TableHead>
                <TableHead>Expiration prévue</TableHead>
                <TableHead>ST / HT</TableHead>
                <TableHead>Date demande</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => {
                const snap = r.snapshot ?? {};
                const matricule = r.matricule ?? snap.matricule ?? "—";
                const nom = r.nom ?? snap.nom ?? "—";
                const prenom = r.prenom ?? snap.prenom ?? "—";
                const stStr = (snap.stCodes ?? []).join(", ") || "XXX";
                const htStr = (snap.htCodes ?? []).join(", ") || "XXX";

                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono">{matricule}</TableCell>
                    <TableCell>{prenom} {nom}</TableCell>
                    <TableCell>{snap.nDeTitre ?? "—"}</TableCell>
                    <TableCell>
                      {snap.dateExpiration ? new Date(snap.dateExpiration).toLocaleDateString("fr-FR") : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">ST: {stStr} / HT: {htStr}</TableCell>
                    <TableCell>{new Date(r.createdAt).toLocaleDateString("fr-FR")}</TableCell>
                    <TableCell className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => activate(r.id)}>
                        <Check className="w-4 h-4 mr-1" />Activer
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => cancel(r.id)} className="text-red-500">
                        <X className="w-4 h-4 mr-1" />Annuler
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </Layout>
  );
}
