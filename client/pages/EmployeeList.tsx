import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, X, Download, ChevronUp, ChevronDown, ChevronsUpDown, RefreshCw, AlertTriangle, Eye } from "lucide-react";
import { Layout } from "@/components/Layout";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Employee } from "@/types/employee";
import { getExpirationStatus, EXPIRATION_COLOR_CONFIG, HT_CODES, ST_CODES } from "@/types/habilitation";
import { getEmployees } from "@/api/employees";
import { useBulkOperations } from "@/hooks/useBulkOperations";
import { BulkActionBar } from "@/components/employees/BulkActionBar";
import { BatchRenewDialog } from "@/components/employees/BatchRenewDialog";

const COLOR_TOGGLE_KEY = "colorCodingEnabled";

interface OrgItem { id: number; name: string; }

export type HabType = "HT" | "ST";

interface EmployeeListProps {
  habType: HabType;
}

export default function EmployeeList({ habType }: EmployeeListProps) {
  const isHT = habType === "HT";
  const navigate = useNavigate();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [codeFilter, setCodeFilter] = useState("all");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [equipeFilter, setEquipeFilter] = useState("all");
  const [colorCodingEnabled, setColorCodingEnabled] = useState(() => {
    return localStorage.getItem(COLOR_TOGGLE_KEY) !== "false";
  });
  const [sort, setSort] = useState("expiration");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [divisions, setDivisions] = useState<OrgItem[]>([]);
  const [services, setServices] = useState<OrgItem[]>([]);
  const [equipes, setEquipes] = useState<OrgItem[]>([]);

  const token = localStorage.getItem("token");
  const auth = { headers: { Authorization: `Bearer ${token}` } };
  const bulk = useBulkOperations(employees);

  const codeOptions = isHT ? HT_CODES : ST_CODES;
  const title = isHT ? "Habilitation HT" : "Habilitation ST";

  // Hierarchical filters: Division -> Service -> Équipe -> Symboles.
  useEffect(() => {
    fetch("/api/divisions", auth).then(r => r.json()).then(d => { if (d.success) setDivisions(d.data); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (divisionFilter === "all") { setServices([]); return; }
    fetch(`/api/divisions/${divisionFilter}/services`, auth).then(r => r.json()).then(d => { if (d.success) setServices(d.data); }).catch(() => {});
  }, [divisionFilter]);
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
      if (codeFilter !== "all") {
        if (isHT) params.htCode = codeFilter;
        else params.stCode = codeFilter;
      }
      if (divisionFilter !== "all") params.divisionId = divisionFilter;
      if (serviceFilter !== "all") params.serviceId = serviceFilter;
      if (equipeFilter !== "all") params.equipeId = equipeFilter;

      const res = await getEmployees(params);
      if (res.success) {
        const filtered = res.data.employees.filter(emp => {
          const ver = emp.currentVersion;
          if (!ver) return false;
          if (isHT) return ver.htCodes && ver.htCodes.length > 0;
          return ver.stCodes && ver.stCodes.length > 0;
        });
        setEmployees(filtered);
        setTotal(filtered.length);
      }
    } catch (err) {
      toast({ title: "Erreur", description: "Impossible de charger les employés", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, codeFilter, divisionFilter, serviceFilter, equipeFilter, sort, sortDir, isHT, toast]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  useEffect(() => {
    localStorage.setItem(COLOR_TOGGLE_KEY, String(colorCodingEnabled));
  }, [colorCodingEnabled]);

  const handleRenew = (emp: Employee) => {
    if (!emp.currentVersion) return;
    navigate(`/employees/${emp.id}/renew?type=${habType.toLowerCase()}`);
  };

  const buildExportUrl = () => {
    const params = new URLSearchParams();
    if (searchTerm) params.set("search", searchTerm);
    if (codeFilter !== "all") {
      if (isHT) params.set("htCode", codeFilter);
      else params.set("stCode", codeFilter);
    }
    if (divisionFilter !== "all") params.set("divisionId", divisionFilter);
    if (serviceFilter !== "all") params.set("serviceId", serviceFilter);
    if (equipeFilter !== "all") params.set("equipeId", equipeFilter);
    const qs = params.toString();
    return `/api/employees/export${qs ? `?${qs}` : ""}`;
  };

  const resetFilters = () => {
    setSearchTerm("");
    setCodeFilter("all");
    setDivisionFilter("all");
    setServiceFilter("all");
    setEquipeFilter("all");
  };

  const hasActiveFilters = searchTerm || codeFilter !== "all" || divisionFilter !== "all" || serviceFilter !== "all" || equipeFilter !== "all";

  return (
    <Layout>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{title} ({total})</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={buildExportUrl()} download>
                <Download className="w-4 h-4 mr-1" />Exporter ({total})
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setColorCodingEnabled(v => !v)}>
              {colorCodingEnabled ? "Désactiver couleurs" : "Activer couleurs"}
            </Button>
            <Button asChild size="sm">
              <Link to="/employees/add"><Plus className="w-4 h-4 mr-1" />Ajouter</Link>
            </Button>
          </div>
        </div>

        {total > employees.length && (
          <div className="flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Seuls les {employees.length} premiers employés sur {total} sont affichés.
          </div>
        )}

        {/* Filters — hierarchical: Division -> Service -> Équipe -> Symboles */}
        <div className="flex flex-wrap gap-2 items-end">
          <Input
            placeholder="Rechercher par matricule, nom, prénom..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="max-w-xs"
          />
          <Select value={divisionFilter} onValueChange={v => { setDivisionFilter(v); setServiceFilter("all"); setEquipeFilter("all"); setCodeFilter("all"); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Division" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes divisions</SelectItem>
              {divisions.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={serviceFilter} onValueChange={v => { setServiceFilter(v); setEquipeFilter("all"); setCodeFilter("all"); }} disabled={divisionFilter === "all"}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous services</SelectItem>
              {services.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={equipeFilter} onValueChange={v => { setEquipeFilter(v); setCodeFilter("all"); }} disabled={serviceFilter === "all"}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Équipe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes équipes</SelectItem>
              {equipes.map(eq => <SelectItem key={eq.id} value={String(eq.id)}>{eq.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={codeFilter} onValueChange={setCodeFilter} disabled={equipeFilter === "all"}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Symboles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Symboles</SelectItem>
              {codeOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
            title="Aucun employé"
            description={hasActiveFilters ? "Aucun résultat avec ces filtres" : "Ajoutez votre premier employé"}
            action={hasActiveFilters ? { label: "Réinitialiser filtres", onClick: resetFilters } : { label: "Ajouter un employé", onClick: () => navigate("/employees/add") }}
          />
        ) : (
          <>
            <BulkActionBar
              selectedCount={bulk.selectedIds.size}
              totalCount={employees.length}
              allSelected={bulk.allSelected}
              someSelected={bulk.someSelected}
              isRunning={bulk.isRunning}
              progress={bulk.progress}
              onToggleAll={bulk.toggleAll}
              onClearSelection={bulk.clearSelection}
              onAction={(action) => bulk.runBulkAction(action)}
            />
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={bulk.allSelected}
                        onCheckedChange={() => bulk.toggleAll()}
                        aria-label="Tout sélectionner"
                      />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort("matricule")}>
                      Matricule<SortIcon col="matricule" />
                    </TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort("nom")}>
                      Nom et prénom<SortIcon col="nom" />
                    </TableHead>
                    <TableHead>Équipe</TableHead>
                    <TableHead>Symbole</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => handleSort("expiration")}>
                      Expiration<SortIcon col="expiration" />
                    </TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map(emp => {
                    const ver = emp.currentVersion;
                    const status = ver ? getExpirationStatus(ver.dateExpiration) : "valid";
                    const config = EXPIRATION_COLOR_CONFIG[status];
                    const codes = isHT ? (ver?.htCodes ?? []) : (ver?.stCodes ?? []);
                    return (
                      <TableRow
                        key={emp.id}
                        className={cn(
                          "cursor-pointer hover:bg-muted/50 transition-colors",
                          colorCodingEnabled && config.bgColor
                        )}
                        onClick={() => navigate(`/employees/${emp.id}?type=${habType.toLowerCase()}`)}
                      >
                        <TableCell onClick={e => e.stopPropagation()}>
                          <Checkbox
                            checked={bulk.selectedIds.has(emp.id)}
                            onCheckedChange={() => bulk.toggleOne(emp.id)}
                            aria-label={`Sélectionner ${emp.matricule}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono font-medium whitespace-nowrap">{emp.matricule}</TableCell>
                        <TableCell className="whitespace-nowrap uppercase">{emp.nom} {emp.prenom}</TableCell>
                        <TableCell className="whitespace-nowrap">{ver?.equipe || "—"}</TableCell>
                        <TableCell>
                          {codes.length > 0
                            ? <span className="flex gap-1 whitespace-nowrap">{codes.map(c => <Badge key={c} variant="secondary" className="text-xs font-mono">{c}</Badge>)}</span>
                            : <span className="text-muted-foreground text-sm">—</span>}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {ver ? (
                            <span className={cn("text-sm font-medium", colorCodingEnabled && config.textColor)}>
                              {new Date(ver.dateExpiration).toLocaleDateString("fr-FR")}
                              {colorCodingEnabled && ` (${config.name})`}
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell onClick={e => e.stopPropagation()} className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => navigate(`/employees/${emp.id}?type=${habType.toLowerCase()}`)}>
                            <Eye className="w-4 h-4 mr-1" />Voir
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleRenew(emp)}>
                            <RefreshCw className="w-4 h-4 mr-1" />Renouveler
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <BatchRenewDialog
              open={bulk.renewDialogOpen}
              onOpenChange={bulk.setRenewDialogOpen}
              selectedCount={bulk.selectedIds.size}
              onConfirm={bulk.confirmBulkRenewal}
              isRenewing={bulk.isRunning}
            />
          </>
        )}
      </div>
    </Layout>
  );
}
