import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { Layout } from "@/components/Layout";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Employee } from "@/types/employee";
import { getExpirationStatus, EXPIRATION_COLOR_CONFIG } from "@/types/habilitation";
import { getEmployees, deleteEmployee } from "@/api/employees";

const COLOR_TOGGLE_KEY = "colorCodingEnabled";

export default function Employees() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [colorCodingEnabled, setColorCodingEnabled] = useState(() => {
    return localStorage.getItem(COLOR_TOGGLE_KEY) !== "false";
  });

  const fetchEmployees = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await getEmployees({ page, limit: 20 });
      if (res.success) {
        setEmployees(res.data.employees);
        setTotal(res.data.total);
      }
    } catch (err) {
      toast({ title: "Erreur", description: "Impossible de charger les employés", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [page, toast]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  useEffect(() => {
    localStorage.setItem(COLOR_TOGGLE_KEY, String(colorCodingEnabled));
  }, [colorCodingEnabled]);

  const handleDelete = async (id: number, matricule: string) => {
    if (!window.confirm(`Supprimer l'employé ${matricule} ?`)) return;
    try {
      await deleteEmployee(id);
      toast({ title: "Succès", description: `Employé ${matricule} supprimé` });
      fetchEmployees();
    } catch {
      toast({ title: "Erreur", description: "Impossible de supprimer l'employé", variant: "destructive" });
    }
  };

  const filtered = employees.filter(emp => {
    const q = searchTerm.toLowerCase();
    return (
      emp.matricule.toLowerCase().includes(q) ||
      emp.nom.toLowerCase().includes(q) ||
      emp.prenom.toLowerCase().includes(q) ||
      (emp.currentVersion?.fonction ?? "").toLowerCase().includes(q)
    );
  });

  const totalPages = Math.ceil(total / 20);

  return (
    <Layout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Employés ({total})</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setColorCodingEnabled(v => !v)}>
              {colorCodingEnabled ? "Désactiver couleurs" : "Activer couleurs"}
            </Button>
            <Button asChild size="sm">
              <Link to="/employees/add"><Plus className="w-4 h-4 mr-1" />Ajouter</Link>
            </Button>
          </div>
        </div>

        <Input
          placeholder="Rechercher par matricule, nom, prénom..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="max-w-md"
        />

        {isLoading ? (
          <LoadingSpinner />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="Aucun employé"
            description="Ajoutez votre premier employé"
            action={<Link to="/employees/add"><Button>Ajouter un employé</Button></Link>}
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Matricule</TableHead>
                  <TableHead>Nom</TableHead>
                  <TableHead>Fonction</TableHead>
                  <TableHead>Division / Service</TableHead>
                  <TableHead>ST / HT</TableHead>
                  <TableHead>Expiration</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(emp => {
                  const ver = emp.currentVersion;
                  const status = ver ? getExpirationStatus(ver.dateExpiration) : "valid";
                  const config = EXPIRATION_COLOR_CONFIG[status];
                  const stStr = ver && ver.stCodes.length > 0 ? ver.stCodes.join(", ") : "XXX";
                  const htStr = ver && ver.htCodes.length > 0 ? ver.htCodes.join(", ") : "XXX";

                  return (
                    <TableRow
                      key={emp.id}
                      className={cn(
                        "cursor-pointer hover:bg-muted/50 transition-colors",
                        colorCodingEnabled && config.bgColor
                      )}
                      onClick={() => navigate(`/employees/${emp.id}`)}
                    >
                      <TableCell className="font-mono font-medium">{emp.matricule}</TableCell>
                      <TableCell>{emp.prenom} {emp.nom}</TableCell>
                      <TableCell>{ver?.fonction ?? "—"}</TableCell>
                      <TableCell>{ver ? `${ver.division} / ${ver.service}` : "—"}</TableCell>
                      <TableCell className="font-mono text-sm">
                        ST: {stStr} / HT: {htStr}
                      </TableCell>
                      <TableCell>
                        {ver ? (
                          <span className={cn("text-sm font-medium", colorCodingEnabled && config.textColor)}>
                            {new Date(ver.dateExpiration).toLocaleDateString("fr-FR")}
                            {colorCodingEnabled && ` (${config.name})`}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()} className="flex gap-1">
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/employees/${emp.id}/edit`}>Modifier</Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(emp.id, emp.matricule)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  Précédent
                </Button>
                <span className="text-sm text-muted-foreground">Page {page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  Suivant
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
