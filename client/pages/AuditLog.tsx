/**
 * PHASE 1: AUDIT LOG PAGE
 * 
 * Complete audit trail with:
 * - Searchable, filterable table of all logged actions
 * - Expandable rows showing old vs new data
 * - Revert capability with confirmation
 * - Export as JSON/CSV
 * - Pagination
 */

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { format } from "date-fns";
import { ChevronDown, ChevronUp, RotateCcw, Download } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface AuditLog {
  id: number;
  userId: number | null;
  action: string;
  entityType: string;
  entityId: number | null;
  matricule: string | null;
  snapshotOld: Record<string, any> | null;
  snapshotNew: Record<string, any> | null;
  revertedFromAuditLogId: number | null;
  createdAt: string;
}

interface AuditFilter {
  action?: string;
  entityType?: string;
  matricule?: string;
  startDate?: string;
  endDate?: string;
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.length > 0 ? v.join(", ") : "[]";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function SnapshotDiff({
  old: oldSnap,
  next: newSnap,
}: {
  old: Record<string, any> | null;
  next: Record<string, any> | null;
}) {
  const allKeys = Array.from(
    new Set([...Object.keys(oldSnap ?? {}), ...Object.keys(newSnap ?? {})])
  );

  if (allKeys.length === 0) {
    return <p className="text-muted-foreground text-sm">Aucune donnée snapshot disponible</p>;
  }

  return (
    <div className="overflow-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-3 py-2 font-medium text-muted-foreground w-32">Champ</th>
            <th className="text-left px-3 py-2 font-medium text-orange-600 dark:text-orange-400">Avant</th>
            <th className="text-left px-3 py-2 font-medium text-green-600 dark:text-green-400">Après</th>
          </tr>
        </thead>
        <tbody>
          {allKeys.map((key) => {
            const oldVal = formatVal(oldSnap?.[key]);
            const newVal = formatVal(newSnap?.[key]);
            const changed = oldSnap && newSnap && oldVal !== newVal;
            return (
              <tr key={key} className={cn("border-b", changed && "bg-yellow-50/60 dark:bg-yellow-900/20")}>
                <td className="px-3 py-1.5 font-mono text-muted-foreground">{key}</td>
                <td className={cn("px-3 py-1.5 font-mono", changed && "text-orange-700 dark:text-orange-300 line-through opacity-70")}>
                  {oldSnap ? oldVal : "—"}
                </td>
                <td className={cn("px-3 py-1.5 font-mono", changed && "text-green-700 dark:text-green-300 font-semibold")}>
                  {newSnap ? newVal : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AuditLog() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filters, setFilters] = useState<AuditFilter>({});
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;

  // Revert confirmation dialog
  const [revertDialog, setRevertDialog] = useState<{
    open: boolean;
    logId: number | null;
    action: string | null;
    matricule: string | null;
  }>({ open: false, logId: null, action: null, matricule: null });

  const [reverting, setReverting] = useState(false);

  // Fetch audit logs
  useEffect(() => {
    fetchAuditLogs();
  }, [filters, page]);

  const fetchAuditLogs = async () => {
    try {
      setLoading(true);

      const params = new URLSearchParams();
      if (filters.action) params.append("action", filters.action);
      if (filters.entityType) params.append("entityType", filters.entityType);
      if (filters.matricule) params.append("matricule", filters.matricule);
      if (filters.startDate) params.append("startDate", filters.startDate);
      if (filters.endDate) params.append("endDate", filters.endDate);
      params.append("limit", String(pageSize));
      params.append("offset", String(page * pageSize));

      const response = await fetch(`/api/audit-logs?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch audit logs");
      }

      const data = await response.json();
      setLogs(Array.isArray(data) ? data : []);
      // Estimate total (if backend returns count, use that)
      setTotalCount(data.length >= pageSize ? (page + 1) * pageSize + pageSize : page * pageSize + data.length);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur de chargement";
      toast({
        title: "Erreur",
        description: message,
        variant: "destructive",
      });
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: keyof AuditFilter, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: (value === "all" ? "" : value) || undefined,
    }));
    setPage(0); // Reset to first page on filter change
  };

  const handleRevert = async () => {
    if (!revertDialog.logId) return;

    try {
      setReverting(true);

      const response = await fetch(`/api/audit-logs/${revertDialog.logId}/revert`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Erreur lors de la réversion");
      }

      const result = await response.json();

      toast({
        title: "Succès",
        description: result.message || "Donnée restituée avec succès",
      });

      setRevertDialog({ open: false, logId: null, action: null, matricule: null });
      await fetchAuditLogs();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors de la réversion";
      toast({
        title: "Erreur",
        description: message,
        variant: "destructive",
      });
    } finally {
      setReverting(false);
    }
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.action) params.append("action", filters.action);
      if (filters.entityType) params.append("entityType", filters.entityType);
      if (filters.startDate) params.append("startDate", filters.startDate);
      if (filters.endDate) params.append("endDate", filters.endDate);

      const response = await fetch(`/api/audit-logs/export?${params}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Succès",
        description: "Audit logs exported successfully",
      });
    } catch (err) {
      toast({
        title: "Erreur",
        description: "Erreur lors de l'export",
        variant: "destructive",
      });
    }
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return "—";
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
  };

  const getActionColor = (action: string): string => {
    if (action.includes("CREATE")) return "text-green-600 dark:text-green-400";
    if (action.includes("UPDATE")) return "text-blue-600 dark:text-blue-400";
    if (action.includes("DELETE")) return "text-red-600 dark:text-red-400";
    if (action.includes("REVERT")) return "text-orange-600 dark:text-orange-400";
    return "text-gray-600 dark:text-gray-400";
  };

  if (loading && logs.length === 0) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <LoadingSpinner />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold gradient-text">Journal d'Audit</h1>
            <p className="text-muted-foreground mt-1">
              Historique complet de tous les changements
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="w-4 h-4" />
            Exporter
          </Button>
        </div>

        {/* Filters */}
        <div className="glass p-6 rounded-xl space-y-4">
          <h3 className="font-semibold">Filtres</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Action Filter */}
            <div className="space-y-2">
              <Label htmlFor="action-filter">Action</Label>
              <Select
                value={filters.action || "all"}
                onValueChange={(value) => handleFilterChange("action", value)}
              >
                <SelectTrigger className="glass-input">
                  <SelectValue placeholder="Toutes les actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les actions</SelectItem>
                  <SelectItem value="CREATE_EMPLOYEE">Créer Employé</SelectItem>
                  <SelectItem value="UPDATE_EMPLOYEE">Modifier Employé</SelectItem>
                  <SelectItem value="DELETE_EMPLOYEE">Supprimer Employé</SelectItem>
                  <SelectItem value="CREATE_HABILITATION">Créer Habilitation</SelectItem>
                  <SelectItem value="UPDATE_HABILITATION">Modifier Habilitation</SelectItem>
                  <SelectItem value="DELETE_HABILITATION">Supprimer Habilitation</SelectItem>
                  <SelectItem value="RENEW_HABILITATION">Renouveler Habilitation</SelectItem>
                  <SelectItem value="REVERT_EMPLOYEE">Revert Employé</SelectItem>
                  <SelectItem value="REVERT_HABILITATION">Revert Habilitation</SelectItem>
                  <SelectItem value="UPLOAD_PDF">Upload PDF</SelectItem>
                  <SelectItem value="DELETE_PDF">Supprimer PDF</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Entity Type Filter */}
            <div className="space-y-2">
              <Label htmlFor="entity-filter">Type d'Entité</Label>
              <Select
                value={filters.entityType || "all"}
                onValueChange={(value) => handleFilterChange("entityType", value)}
              >
                <SelectTrigger className="glass-input">
                  <SelectValue placeholder="Tous types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous types</SelectItem>
                  <SelectItem value="employee">Employé</SelectItem>
                  <SelectItem value="renewal">Renouvellement</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Matricule Search */}
            <div className="space-y-2">
              <Label htmlFor="matricule-search">Matricule</Label>
              <Input
                id="matricule-search"
                placeholder="Rechercher matricule"
                className="glass-input"
                value={filters.matricule || ""}
                onChange={(e) => handleFilterChange("matricule", e.target.value)}
              />
            </div>

            {/* Date Range */}
            <div className="space-y-2">
              <Label htmlFor="start-date">Depuis</Label>
              <Input
                id="start-date"
                type="date"
                className="glass-input"
                value={filters.startDate || ""}
                onChange={(e) => handleFilterChange("startDate", e.target.value)}
              />
            </div>
          </div>

          {Object.keys(filters).length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilters({});
                setPage(0);
              }}
            >
              Réinitialiser les filtres
            </Button>
          )}
        </div>

        {/* Logs Table */}
        {logs.length === 0 ? (
          <EmptyState title="Aucun log d'audit" description="Aucune entrée correspondant à vos filtres" />
        ) : (
          <div className="glass rounded-xl overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-white/20 hover:bg-transparent">
                  <TableHead>ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entité</TableHead>
                  <TableHead>Matricule</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <div key={log.id} className="space-y-0">
                    {/* Main Row */}
                    <TableRow className="border-b border-white/10 hover:bg-white/5">
                      <TableCell className="font-mono text-sm">{log.id}</TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(log.createdAt), "dd/MM/yyyy HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        <span className={`font-semibold ${getActionColor(log.action)}`}>
                          {log.action}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.entityType}
                      </TableCell>
                      <TableCell className="font-mono font-semibold">
                        {log.matricule || "—"}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setExpandedId(expandedId === log.id ? null : log.id)
                          }
                        >
                          {expandedId === log.id ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </Button>

                        {/* Revert button - only show for reversible actions */}
                        {log.action.includes("CREATE") ||
                        log.action.includes("UPDATE") ||
                        log.action.includes("RENEW") ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-orange-600 hover:text-orange-700"
                            onClick={() =>
                              setRevertDialog({
                                open: true,
                                logId: log.id,
                                action: log.action,
                                matricule: log.matricule,
                              })
                            }
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>

                    {/* Expanded Details Row — side-by-side diff */}
                    {expandedId === log.id && (
                      <TableRow className="border-b border-white/10 bg-black/20">
                        <TableCell colSpan={6} className="p-4">
                          {!log.snapshotOld && !log.snapshotNew ? (
                            <p className="text-muted-foreground text-sm">Aucune donnée snapshot disponible</p>
                          ) : (
                            <SnapshotDiff old={log.snapshotOld} next={log.snapshotNew} />
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </div>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {logs.length > 0 && (
          <div className="flex items-center justify-between p-4 glass rounded-xl">
            <p className="text-sm text-muted-foreground">
              Page {page + 1} • {logs.length} entrées affichées
            </p>
            <div className="space-x-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(Math.max(0, page - 1))}
              >
                Précédent
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={logs.length < pageSize}
                onClick={() => setPage(page + 1)}
              >
                Suivant
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Revert Confirmation Dialog */}
      <AlertDialog open={revertDialog.open} onOpenChange={(open) => {
        if (!open) {
          setRevertDialog({ open: false, logId: null, action: null, matricule: null });
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Êtes-vous sûr ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vous êtes sur le point de revenir en arrière de l'action <strong>{revertDialog.action}</strong> pour{" "}
              <strong>{revertDialog.matricule}</strong>. Cette action:
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li>Restaurera les données à l'état antérieur</li>
                <li>Créera une nouvelle entrée d'audit (la réversion ne sera pas supprimée)</li>
                <li>Conservera l'historique complet</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="rounded" />
              Ne plus afficher ce message
            </label>
          </div>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleRevert}
            disabled={reverting}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {reverting ? "Réversion en cours..." : "Révertir"}
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
