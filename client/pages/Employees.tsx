import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Trash2, X, Download, ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle } from "lucide-react";
import { Layout } from "@/components/Layout";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Employee } from "@/types/employee";
import { getEmployees, deleteEmployee } from "@/api/employees";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface OrgItem { id: number; name: string; }

// Shorten org names to keep the table compact: Division -> Div., Exploitation -> Exp.
function abbrev(s?: string | null): string {
  return (s || "")
    .replace(/\bDivision\b/gi, "Div.")
    .replace(/\bExploitation\b/gi, "Exp.");
}

export default function Employees() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [equipeFilter, setEquipeFilter] = useState("all");
  const [sort, setSort] = useState("nom");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [divisions, setDivisions] = useState<OrgItem[]>([]);
  const [services, setServices] = useState<OrgItem[]>([]);
  const [equipes, setEquipes] = useState<OrgItem[]>([]);

  const token = localStorage.getItem("token");
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  // Load divisions once
  useEffect(() => {
    fetch("/api/divisions", auth).then(r => r.json()).then(d => { if (d.success) setDivisions(d.data); }).catch(() => {});
  }, []);
  // Services cascade from division
  useEffect(() => {
    if (divisionFilter === "all") { setServices([]); return; }
    fetch(`/api/divisions/${divisionFilter}/services`, auth).then(r => r.json()).then(d => { if (d.success) setServices(d.data); }).catch(() => {});
  }, [divisionFilter]);
  // Équipes cascade from service
  useEffect(() => {
    if (serviceFilter === "all") { setEquipes([]); return; }
    fetch(`/api/services/${serviceFilter}/equipes`, auth).then(r => r.json()).then(d => { if (d.success) setEquipes(d.data); }).catch(() => {});
  }, [serviceFilter]);

  const handleSort = (col: string) => {
    if (sort === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSort(col); setSortDir("asc"); }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sort !== col) return <ChevronsUpDown className="w-3 h-3 ml-1 inline text-muted-foreground" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 ml-1 inline" />
      : <ChevronDown className="w-3 h-3 ml-1 inline" />;
  };

  const fetchEmployees = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: Record<string, any> = { page: 1, limit: 1000, sort, sortDir };
      if (searchTerm) params.search = searchTerm;
      if (divisionFilter !== "all") params.divisionId = divisionFilter;
      if (serviceFilter !== "all") params.serviceId = serviceFilter;
      if (equipeFilter !== "all") params.equipeId = equipeFilter;

      const res = await getEmployees(params);
      if (res.success) {
        setEmployees(res.data.employees);
        setTotal(res.data.total);
      }
    } catch (err) {
      toast({ title: "Erreur", description: "Impossible de charger les agents", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, divisionFilter, serviceFilter, equipeFilter, sort, sortDir, toast]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  const [deleteTarget, setDeleteTarget] = useState<{ id: number; matricule: string } | null>(null);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { id, matricule } = deleteTarget;
    try {
      await deleteEmployee(id);
      toast({ title: "Succès", description: `Agent ${matricule} supprimé` });
      fetchEmployees();
    } catch {
      toast({ title: "Erreur", description: "Impossible de supprimer l'agent", variant: "destructive" });
    }
  };

  const resetFilters = () => {
    setSearchTerm("");
    setDivisionFilter("all");
    setServiceFilter("all");
    setEquipeFilter("all");
  };

  const hasActiveFilters = searchTerm || divisionFilter !== "all" || serviceFilter !== "all" || equipeFilter !== "all";

  const buildExportUrl = () => {
    const params = new URLSearchParams();
    if (searchTerm) params.set("search", searchTerm);
    if (divisionFilter !== "all") params.set("divisionId", divisionFilter);
    if (serviceFilter !== "all") params.set("serviceId", serviceFilter);
    if (equipeFilter !== "all") params.set("equipeId", equipeFilter);
    const qs = params.toString();
    return `/api/employees/export${qs ? `?${qs}` : ""}`;
  };

  return (
    <Layout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Agents habilités ({total})</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={buildExportUrl()} download>
                <Download className="w-4 h-4 mr-1" />Exporter ({total})
              </a>
            </Button>
            <Button asChild size="sm">
              <Link to="/agents/add"><Plus className="w-4 h-4 mr-1" />Ajouter</Link>
            </Button>
          </div>
        </div>

        {total > employees.length && (
          <div className="flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Seuls les {employees.length} premiers agents sur {total} sont affichés. Affinez votre recherche ou vos filtres pour voir les autres.
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-end">
          <Input
            placeholder="Rechercher par matricule, nom, prénom..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="max-w-xs"
          />
          <Select value={divisionFilter} onValueChange={v => { setDivisionFilter(v); setServiceFilter("all"); setEquipeFilter("all"); }}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Division" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes divisions</SelectItem>
              {divisions.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={serviceFilter} onValueChange={v => { setServiceFilter(v); setEquipeFilter("all"); }} disabled={divisionFilter === "all"}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous services</SelectItem>
              {services.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={equipeFilter} onValueChange={setEquipeFilter} disabled={serviceFilter === "all"}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Équipe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes équipes</SelectItem>
              {equipes.map(eq => <SelectItem key={eq.id} value={String(eq.id)}>{eq.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="w-3 h-3 mr-1" />Réinitialiser
            </Button>
          )}
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : employees.length === 0 ? (
          <EmptyState
            title="Aucun agent"
            description={hasActiveFilters ? "Aucun résultat avec ces filtres" : "Ajoutez votre premier agent"}
            action={hasActiveFilters ? { label: "Réinitialiser filtres", onClick: resetFilters } : { label: "Ajouter un agent", onClick: () => navigate("/agents/add") }}
          />
        ) : (
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("matricule")}>
                  Matricule<SortIcon col="matricule" />
                </TableHead>
                <TableHead className="cursor-pointer select-none" onClick={() => handleSort("nom")}>
                  Nom et prénom<SortIcon col="nom" />
                </TableHead>
                <TableHead>Div.</TableHead>
                <TableHead>Équipe</TableHead>
                <TableHead>Aptitude</TableHead>
                <TableHead>Symbole</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map(emp => {
                const ver = emp.currentVersion;
                const codes = [...(ver?.htCodes ?? []), ...(ver?.stCodes ?? [])];
                return (
                  <TableRow
                    key={emp.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/agents/${emp.id}/edit`)}
                  >
                    <TableCell className="font-mono font-medium whitespace-nowrap">{emp.matricule}</TableCell>
                    <TableCell className="whitespace-nowrap uppercase">{emp.nom} {emp.prenom}</TableCell>
                    <TableCell className="max-w-[160px] truncate" title={ver?.division ?? ""}>{abbrev(ver?.division) || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap">{ver?.equipe || "—"}</TableCell>
                    <TableCell className="max-w-[140px] truncate" title={emp.aptitudeMedicale ?? ""}>{emp.aptitudeMedicale || "—"}</TableCell>
                    <TableCell>
                      {codes.length > 0
                        ? <span className="flex gap-1 whitespace-nowrap">{codes.map(c => <Badge key={c} variant="secondary" className="text-xs font-mono">{c}</Badge>)}</span>
                        : <span className="text-muted-foreground text-sm">Aucune</span>}
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()} className="flex gap-1">
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/agents/${emp.id}/edit`}>Modifier</Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleteTarget({ id: emp.id, matricule: emp.matricule })}
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
          </div>
        )}

        <ConfirmDialog
          open={deleteTarget !== null}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          title="Supprimer l'agent"
          description={deleteTarget ? `Supprimer l'agent ${deleteTarget.matricule} ?` : ""}
          confirmText="Supprimer"
          variant="danger"
          onConfirm={confirmDelete}
        />
      </div>
    </Layout>
  );
}
