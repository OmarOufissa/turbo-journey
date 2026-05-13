import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, AlertCircle, CheckCircle, Eye, ArrowRight, FileDiff, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

type DiffStatus = "new" | "modified" | "unchanged" | "duplicate" | "invalid";

interface DiffField {
  field: string;
  before: string | null;
  after: string;
  changed: boolean;
}

interface ImportError {
  row: number;
  field: string;
  message: string;
}

interface PreviewRow {
  row: number;
  matricule: string;
  nom: string;
  prenom: string;
  fonction: string;
  division: string;
  service: string;
  stCodes: string[];
  htCodes: string[];
  dateExpiration: string;
  status: DiffStatus;
  isNew: boolean;
  errors: ImportError[];
  diff?: DiffField[];
  existingEmployeeId?: number;
}

interface PreviewResult {
  rows: PreviewRow[];
  totalNew: number;
  totalUpdate: number;
  totalUnchanged: number;
  totalErrors: number;
}

interface ImportResult {
  successCount: number;
  errorCount: number;
  errors: ImportError[];
}

const STATUS_CONFIG: Record<DiffStatus, { label: string; cls: string }> = {
  new: { label: "Nouveau", cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  modified: { label: "Modifié", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  unchanged: { label: "Identique", cls: "bg-muted text-muted-foreground" },
  duplicate: { label: "Doublon", cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  invalid: { label: "Invalide", cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
};

function DiffCell({ field }: { field: DiffField }) {
  return (
    <div className={`text-xs ${field.changed ? "bg-yellow-50 dark:bg-yellow-900/10 rounded p-1" : ""}`}>
      <div className="text-muted-foreground font-medium">{field.field}</div>
      {field.changed ? (
        <div className="space-y-0.5">
          <div className="line-through text-red-600 dark:text-red-400">{field.before ?? "—"}</div>
          <div className="text-green-700 dark:text-green-400 font-medium">{field.after || "—"}</div>
        </div>
      ) : (
        <div>{field.after || "—"}</div>
      )}
    </div>
  );
}

export default function ImportEmployees() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"A" | "B">("A");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [filterStatus, setFilterStatus] = useState<DiffStatus | "all">("all");
  const token = localStorage.getItem("token");

  function toggleRow(rowNum: number) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowNum)) next.delete(rowNum);
      else next.add(rowNum);
      return next;
    });
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".xlsx")) {
      toast({ title: "Format invalide", description: "Seuls les fichiers .xlsx sont acceptés", variant: "destructive" });
      return;
    }
    setPendingFile(file);
    setResult(null);
    setLoading(true);

    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/import-employees/preview", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Erreur de prévisualisation");
      setPreview(json.data);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!pendingFile) return;
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", pendingFile);
      const res = await fetch(`/api/import-employees?mode=${mode}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Erreur d'import");
      setResult(json.data);
      toast({
        title: `Import terminé`,
        description: `${json.data.successCount} employé(s) importé(s), ${json.data.errorCount} erreur(s)`,
      });
    } catch (err: any) {
      toast({ title: "Erreur d'import", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const filteredRows = preview?.rows.filter((r) =>
    filterStatus === "all" ? true : r.status === filterStatus
  ) ?? [];

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Upload className="w-8 h-8" />
            Import Excel
          </h1>
          <p className="text-muted-foreground mt-1">Importer des employés depuis un fichier .xlsx</p>
        </div>

        {/* Controls */}
        <div className="flex items-end gap-4 flex-wrap">
          <div className="space-y-1">
            <Label>Mode d'import</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as "A" | "B")}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A">Mode A — Tout ou rien</SelectItem>
                <SelectItem value="B">Mode B — Ignorer les erreurs</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className="gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Sélectionner un fichier .xlsx
          </Button>

          {preview && !result && (
            <Button
              onClick={handleImport}
              disabled={loading || preview.totalErrors > 0 && mode === "A"}
              className="gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              Importer ({preview.totalNew + preview.totalUpdate} lignes)
            </Button>
          )}

          <input ref={fileInputRef} type="file" accept=".xlsx" onChange={handleFileSelect} className="hidden" />
        </div>

        {/* Import Result */}
        {result && (
          <div className={`rounded-xl border p-4 ${result.errorCount === 0 ? "bg-green-50 border-green-200 dark:bg-green-900/10 dark:border-green-800" : "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/10 dark:border-yellow-800"}`}>
            <div className="flex items-center gap-2 font-semibold mb-2">
              {result.errorCount === 0 ? <CheckCircle className="w-5 h-5 text-green-600" /> : <AlertCircle className="w-5 h-5 text-yellow-600" />}
              {result.successCount} importé(s), {result.errorCount} erreur(s)
            </div>
            {result.errors.length > 0 && (
              <div className="space-y-1">
                {result.errors.slice(0, 10).map((e, i) => (
                  <div key={i} className="text-xs text-red-700 dark:text-red-400">
                    Ligne {e.row} — {e.field}: {e.message}
                  </div>
                ))}
                {result.errors.length > 10 && (
                  <div className="text-xs text-muted-foreground">…et {result.errors.length - 10} autre(s)</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Preview Stats */}
        {preview && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Nouveaux", count: preview.totalNew, status: "new" as DiffStatus, color: "text-green-700" },
                { label: "Modifiés", count: preview.totalUpdate, status: "modified" as DiffStatus, color: "text-blue-700" },
                { label: "Identiques", count: preview.totalUnchanged ?? 0, status: "unchanged" as DiffStatus, color: "text-muted-foreground" },
                { label: "Invalides", count: preview.totalErrors, status: "invalid" as DiffStatus, color: "text-red-700" },
              ].map(({ label, count, status, color }) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus((prev) => prev === status ? "all" : status)}
                  className={`rounded-xl border p-4 text-left transition-colors hover:bg-muted/50 ${filterStatus === status ? "ring-2 ring-primary" : ""}`}
                >
                  <div className={`text-2xl font-bold ${color}`}>{count}</div>
                  <div className="text-sm text-muted-foreground">{label}</div>
                </button>
              ))}
            </div>

            {/* Filter bar */}
            {filterStatus !== "all" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileDiff className="w-4 h-4" />
                Filtre actif: <strong>{STATUS_CONFIG[filterStatus].label}</strong>
                <button onClick={() => setFilterStatus("all")} className="text-primary hover:underline ml-1">
                  Afficher tout
                </button>
              </div>
            )}

            {/* Diff Table */}
            {filteredRows.length === 0 ? (
              <EmptyState
                icon={FileDiff}
                title="Aucune ligne à afficher"
                description="Modifiez le filtre pour voir d'autres résultats"
              />
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Matricule</TableHead>
                      <TableHead>Nom</TableHead>
                      <TableHead>Division</TableHead>
                      <TableHead>Codes HT</TableHead>
                      <TableHead>Expiration</TableHead>
                      <TableHead>Erreurs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row) => {
                      const cfg = STATUS_CONFIG[row.status];
                      const isExpanded = expandedRows.has(row.row);
                      return (
                        <>
                          <TableRow
                            key={row.row}
                            className={cn("cursor-pointer", row.status === "invalid" && "bg-red-50/50 dark:bg-red-900/5")}
                            onClick={() => row.diff && toggleRow(row.row)}
                          >
                            <TableCell className="text-muted-foreground text-xs">{row.row}</TableCell>
                            <TableCell>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.cls}`}>
                                {cfg.label}
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{row.matricule || "—"}</TableCell>
                            <TableCell className="text-sm">{row.prenom} {row.nom}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{row.division}</TableCell>
                            <TableCell className="text-sm">{row.htCodes.join(", ") || "—"}</TableCell>
                            <TableCell className="text-sm">{row.dateExpiration || "—"}</TableCell>
                            <TableCell>
                              {row.errors.length > 0 && (
                                <div className="space-y-0.5">
                                  {row.errors.slice(0, 2).map((e, i) => (
                                    <div key={i} className="text-[10px] text-red-600 dark:text-red-400">
                                      {e.field}: {e.message}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>

                          {/* Side-by-side diff expansion */}
                          {isExpanded && row.diff && (
                            <TableRow key={`${row.row}-diff`} className="bg-muted/20">
                              <TableCell colSpan={8} className="py-3">
                                <div className="text-xs font-medium text-muted-foreground mb-2">
                                  Modifications détectées pour {row.matricule}
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                  {row.diff.filter((d) => d.changed).map((d) => (
                                    <DiffCell key={d.field} field={d} />
                                  ))}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}

        {!preview && !loading && (
          <EmptyState
            icon={Upload}
            title="Sélectionnez un fichier Excel"
            description="Glissez un fichier .xlsx ou cliquez sur le bouton ci-dessus. Un aperçu des modifications sera affiché avant l'import."
          />
        )}
      </div>
    </Layout>
  );
}
