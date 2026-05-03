import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Employee } from "@/types/employee";
import { getEmployees, restoreEmployee, permanentDeleteEmployee } from "@/api/employees";

export default function Trash() {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  // 2-step permanent delete state
  const [pendingPermanentDelete, setPendingPermanentDelete] = useState<{ id: number; matricule: string } | null>(null);
  const [confirmInput, setConfirmInput] = useState("");

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setIsLoading(true);
    try {
      const res = await getEmployees({ deleted: true, limit: 100 });
      if (res.success) setEmployees(res.data.employees);
    } catch {
      toast({ title: "Erreur", description: "Impossible de charger la corbeille", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRestore(id: number, matricule: string) {
    try {
      await restoreEmployee(id);
      toast({ title: "Succès", description: `Employé ${matricule} restauré` });
      fetchData();
    } catch {
      toast({ title: "Erreur", description: "Impossible de restaurer l'employé", variant: "destructive" });
    }
  }

  async function handlePermanentDelete() {
    if (!pendingPermanentDelete) return;
    if (confirmInput !== pendingPermanentDelete.matricule) {
      toast({ title: "Erreur", description: "Matricule incorrect", variant: "destructive" });
      return;
    }
    try {
      await permanentDeleteEmployee(pendingPermanentDelete.id, confirmInput);
      toast({ title: "Succès", description: `Employé ${pendingPermanentDelete.matricule} supprimé définitivement` });
      setPendingPermanentDelete(null);
      setConfirmInput("");
      fetchData();
    } catch {
      toast({ title: "Erreur", description: "Impossible de supprimer définitivement", variant: "destructive" });
    }
  }

  const filtered = employees.filter(emp => {
    const q = searchTerm.toLowerCase();
    return emp.matricule.toLowerCase().includes(q) || emp.nom.toLowerCase().includes(q) || emp.prenom.toLowerCase().includes(q);
  });

  if (isLoading) return <Layout><LoadingSpinner /></Layout>;

  return (
    <Layout>
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/employees"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <h1 className="text-2xl font-bold">Corbeille ({employees.length})</h1>
        </div>

        <Input
          placeholder="Rechercher..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="max-w-md"
        />

        {filtered.length === 0 ? (
          <EmptyState title="Corbeille vide" description="Aucun employé supprimé" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Matricule</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Prénom</TableHead>
                <TableHead>Division / Service</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(emp => (
                <TableRow key={emp.id}>
                  <TableCell className="font-mono">{emp.matricule}</TableCell>
                  <TableCell>{emp.nom}</TableCell>
                  <TableCell>{emp.prenom}</TableCell>
                  <TableCell>
                    {emp.currentVersion ? `${emp.currentVersion.division} / ${emp.currentVersion.service}` : "—"}
                  </TableCell>
                  <TableCell className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleRestore(emp.id, emp.matricule)}>
                      <RotateCcw className="w-4 h-4 mr-1" />Restaurer
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setPendingPermanentDelete({ id: emp.id, matricule: emp.matricule });
                        setConfirmInput("");
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />Supprimer définitivement
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* 2-step permanent delete confirmation */}
        {pendingPermanentDelete && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setPendingPermanentDelete(null)}>
            <div className="bg-background border rounded-lg p-6 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold text-red-600">Suppression définitive</h2>
              <p className="text-sm text-muted-foreground">
                Cette action est irréversible. Tapez le matricule <strong>{pendingPermanentDelete.matricule}</strong> pour confirmer.
              </p>
              <Input
                placeholder={`Tapez ${pendingPermanentDelete.matricule}`}
                value={confirmInput}
                onChange={e => setConfirmInput(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPendingPermanentDelete(null)}>Annuler</Button>
                <Button
                  variant="destructive"
                  disabled={confirmInput !== pendingPermanentDelete.matricule}
                  onClick={handlePermanentDelete}
                >
                  Supprimer définitivement
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
