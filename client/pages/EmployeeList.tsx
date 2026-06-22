import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Trash2, Save, BookmarkCheck, X, Download, ChevronUp, ChevronDown, ChevronsUpDown, RefreshCw, AlertTriangle } from "lucide-react";
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
import { getExpirationStatus, EXPIRATION_COLOR_CONFIG } from "@/types/habilitation";
import { getEmployees, deleteEmployee } from "@/api/employees";
import { useBulkOperations } from "@/hooks/useBulkOperations";
import { BulkActionBar } from "@/components/employees/BulkActionBar";
import { BatchRenewDialog } from "@/components/employees/BatchRenewDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const COLOR_TOGGLE_KEY = "colorCodingEnabled";

function getExpirationRange(filter: string): { expirationFrom?: string; expirationTo?: string } {
  const now = new Date().toISOString().split("T")[0];
  const plus = (days: number) => new Date(Date.now() + days * 864e5).toISOString().split("T")[0];
  if (filter === "expired") return { expirationTo: now };
  if (filter === "3m") return { expirationFrom: now, expirationTo: plus(90) };
  if (filter === "6m") return { expirationFrom: now, expirationTo: plus(180) };
  if (filter === "9m") return { expirationFrom: now, expirationTo: plus(270) };
  return {};
}

interface OrgItem { id: number; name: string; }

const HT_CODE_OPTIONS = ["H0V", "B0V", "H1V", "B1V", "H2V", "B2V", "HC", "BC", "BR", "SF6"];
const ST_CODE_OPTIONS = ["H1N", "H2N", "H1T", "H2T"];

export type HabType = "HT" | "ST";

interface EmployeeListProps {
  habType: HabType;
}

export default function EmployeeList({ habType }: EmployeeListProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expirationFilter, setExpirationFilter] = useState("all");
  const [hasPdfFilter, setHasPdfFilter] = useState("all");
  const [codeFilter, setCodeFilter] = useState("all");
  const [divisionFilter, setDivisionFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [colorCodingEnabled, setColorCodingEnabled] = useState(() => {
    return localStorage.getItem(COLOR_TOGGLE_KEY) !== "false";
  });
  const [sort, setSort] = useState("expiration");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [divisions, setDivisions] = useState<OrgItem[]>([]);
  const [services, setServices] = useState<OrgItem[]>([]);

  const token = localStorage.getItem("token");
  const bulk = useBulkOperations(employees);

  const codeOptions = habType === "HT" ? HT_CODE_OPTIONS : ST_CODE_OPTIONS;
  const title = habType === "HT" ? "Employés HT (Hors Tension)" : "Employés ST (Sous Tension)";
  const codesLabel = habType === "HT" ? "HT" : "ST";

  useEffect(() => {
    fetch("/api/divisions", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.success) setDivisions(d.data); }).catch(() => {});
    fetch("/api/services", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { if (d.success) setServices(d.data); }).catch(() => {});
  }, [token]);

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
      if (hasPdfFilter !== "all") params.hasPdf = hasPdfFilter;
      const range = getExpirationRange(expirationFilter);
      if (range.expirationFrom) params.expirationFrom = range.expirationFrom;
      if (range.expirationTo) params.expirationTo = range.expirationTo;
      if (codeFilter !== "all") {
        if (habType === "HT") params.htCode = codeFilter;
        else params.stCode = codeFilter;
      }
      if (divisionFilter !== "all") params.divisionId = divisionFilter;
      if (serviceFilter !== "all") params.serviceId = serviceFilter;

      const res = await getEmployees(params);
      if (res.success) {
        const filtered = res.data.employees.filter(emp => {
          const ver = emp.currentVersion;
          if (!ver) return false;
          if (habType === "HT") return ver.htCodes && ver.htCodes.length > 0;
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
  }, [searchTerm, expirationFilter, hasPdfFilter, codeFilter, divisionFilter, serviceFilter, sort, sortDir, habType, toast]);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

  useEffect(() => {
    localStorage.setItem(COLOR_TOGGLE_KEY, String(colorCodingEnabled));
  }, [colorCodingEnabled]);

  const [deleteTarget, setDeleteTarget] = useState<{ id: number; matricule: string } | null>(null);

  const handleDelete = (id: number, matricule: string) => {
    setDeleteTarget({ id, matricule });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { id, matricule } = deleteTarget;
    try {
      await deleteEmployee(id);
      toast({ title: "Succès", description: `Employé ${matricule} supprimé` });
      fetchEmployees();
    } catch {
      toast({ title: "Erreur", description: "Impossible de supprimer l'employé", variant: "destructive" });
    }
  };

  const handleRenew = (emp: Employee) => {
    if (!emp.currentVersion) return;
    navigate(`/employees/${emp.id}/renew`);
  };

  const buildExportUrl = () => {
    const params = new URLSearchParams();
    if (searchTerm) params.set("search", searchTerm);
    if (hasPdfFilter !== "all") params.set("hasPdf", hasPdfFilter);
    const range = getExpirationRange(expirationFilter);
    if (range.expirationFrom) params.set("expirationFrom", range.expirationFrom);
    if (range.expirationTo) params.set("expirationTo", range.expirationTo);
    if (codeFilter !== "all") {
      if (habType === "HT") params.set("htCode", codeFilter);
      else params.set("stCode", codeFilter);
    }
    if (divisionFilter !== "all") params.set("divisionId", divisionFilter);
    if (serviceFilter !== "all") params.set("serviceId", serviceFilter);
    const qs = params.toString();
    return `/api/employees/export${qs ? `?${qs}` : ""}`;
  };

  const resetFilters = () => {
    setSearchTerm("");
    setExpirationFilter("all");
    setHasPdfFilter("all");
    setCodeFilter("all");
    setDivisionFilter("all");
    setServiceFilter("all");
  };

  const hasActiveFilters = searchTerm || expirationFilter !== "all" || hasPdfFilter !== "all" || codeFilter !== "all" || divisionFilter !== "all" || serviceFilter !== "all";

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

        {/* Filters */}
        <div className="flex flex-wrap gap-2 items-end">
          <Input
            placeholder="Rechercher par matricule, nom, prénom..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="max-w-xs"
          />
          <Select value={expirationFilter} onValueChange={setExpirationFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Expiration" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes expirations</SelectItem>
              <SelectItem value="expired">Expirés</SelectItem>
              <SelectItem value="3m">&lt; 3 mois</SelectItem>
              <SelectItem value="6m">&lt; 6 mois</SelectItem>
              <SelectItem value="9m">&lt; 9 mois</SelectItem>
            </SelectContent>
          </Select>
          <Select value={codeFilter} onValueChange={setCodeFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder={`Code ${codesLabel}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les codes</SelectItem>
              {codeOptions.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={divisionFilter} onValueChange={v => { setDivisionFilter(v); setServiceFilter("all"); }}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Division" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes divisions</SelectItem>
              {divisions.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={serviceFilter} onValueChange={setServiceFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous services</SelectItem>
              {services.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={hasPdfFilter} onValueChange={setHasPdfFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="PDF" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous (PDF)</SelectItem>
              <SelectItem value="true">Avec PDF</SelectItem>
              <SelectItem value="false">Sans PDF</SelectItem>
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
                    Nom<SortIcon col="nom" />
                  </TableHead>
                  <TableHead>Division / Service</TableHead>
                  <TableHead>Codes {codesLabel}</TableHead>
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
                  const codes = habType === "HT"
                    ? (ver?.htCodes ?? []).join(", ")
                    : (ver?.stCodes ?? []).join(", ");

                  return (
                    <TableRow
                      key={emp.id}
                      className={cn(
                        "cursor-pointer hover:bg-muted/50 transition-colors",
                        colorCodingEnabled && config.bgColor
                      )}
                      onClick={() => navigate(`/employees/${emp.id}`)}
                    >
                      <TableCell onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={bulk.selectedIds.has(emp.id)}
                          onCheckedChange={() => bulk.toggleOne(emp.id)}
                          aria-label={`Sélectionner ${emp.matricule}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono font-medium whitespace-nowrap">{emp.matricule}</TableCell>
                      <TableCell className="whitespace-nowrap">{emp.prenom} {emp.nom}</TableCell>
                      <TableCell className="max-w-[220px] truncate" title={ver ? `${ver.division} / ${ver.service}` : ""}>{ver ? `${ver.division} / ${ver.service}` : "—"}</TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap">{codes || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">
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
                        {emp.currentVersion && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRenew(emp)}
                            title="Créer un renouvellement"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                        )}
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

            <BatchRenewDialog
              open={bulk.renewDialogOpen}
              onOpenChange={bulk.setRenewDialogOpen}
              selectedCount={bulk.selectedIds.size}
              onConfirm={bulk.confirmBulkRenewal}
              isRenewing={bulk.isRunning}
            />

            <ConfirmDialog
              open={deleteTarget !== null}
              onOpenChange={(open) => !open && setDeleteTarget(null)}
              title="Supprimer l'employé"
              description={deleteTarget ? `Supprimer l'employé ${deleteTarget.matricule} ?` : ""}
              confirmText="Supprimer"
              variant="danger"
              onConfirm={confirmDelete}
            />
          </>
        )}
      </div>
    </Layout>
  );
}
