import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, AlertCircle, CheckCircle, Eye, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

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
  isNew: boolean;
  errors: ImportError[];
}

interface PreviewResult {
  rows: PreviewRow[];
  totalNew: number;
  totalUpdate: number;
  totalErrors: number;
}

interface ImportResult {
  successCount: number;
  errorCount: number;
  errors: ImportError[];
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
  const token = localStorage.getItem("token");

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".xlsx")) {
      toast({ title: "Erreur", description: "Seuls les fichiers .xlsx sont acceptés", variant: "destructive" });
      return;
    }

    setLoading(true);
    setPreview(null);
    setResult(null);
    setPendingFile(file);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/import-employees/preview", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setPreview(data.data);
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message ?? "Erreur lors de l'analyse", variant: "destructive" });
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingFile) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);

      const res = await fetch(`/api/import-employees?mode=${mode}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
        setPreview(null);
        setPendingFile(null);
        toast({ title: "Import terminé", description: `${data.data.successCount} importé(s), ${data.data.errorCount} erreur(s)` });
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message ?? "Erreur lors de l'import", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setPreview(null);
    setPendingFile(null);
  };

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">Importer des employés</h1>
          <p className="text-muted-foreground mt-1">Importez depuis un fichier Excel (.xlsx)</p>
        </div>

        {!preview && !result && (
          <>
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <div className="space-y-1">
                <Label>Mode d'import</Label>
                <Select value={mode} onValueChange={v => setMode(v as "A" | "B")}>
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">Mode A — Tout ou rien (rollback si erreur)</SelectItem>
                    <SelectItem value="B">Mode B — Ignorer les lignes invalides</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {mode === "A"
                    ? "Si une ligne est invalide, l'import entier est annulé."
                    : "Les lignes invalides sont ignorées, les autres sont importées."}
                </p>
              </div>
            </div>

            <div className="border-2 border-dashed border-border rounded-lg p-8 text-center space-y-4">
              <Upload className="w-10 h-10 mx-auto text-muted-foreground" />
              <div>
                <p className="font-medium">Sélectionner un fichier .xlsx</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Colonnes: Matricule, Nom, Prenom, Fonction, Division, Service, Equipe, ST_codes, HT_codes, N_de_titre, Date_validation, Date_expiration
                </p>
              </div>
              <Button onClick={() => fileInputRef.current?.click()} disabled={loading}>
                <Eye className="w-4 h-4 mr-1" />{loading ? "Analyse en cours..." : "Analyser le fichier"}
              </Button>
              <input ref={fileInputRef} type="file" accept=".xlsx" onChange={handleFileSelect} disabled={loading} className="hidden" />
            </div>
          </>
        )}

        {/* Preview step */}
        {preview && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Eye className="w-5 h-5" />Aperçu de l'import ({preview.rows.length} lignes)
              </h2>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleCancel}>Annuler</Button>
                <Button onClick={handleConfirmImport} disabled={loading || (mode === "A" && preview.totalErrors > 0)}>
                  <ArrowRight className="w-4 h-4 mr-1" />{loading ? "Import..." : "Confirmer l'import"}
                </Button>
              </div>
            </div>

            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-1 text-green-700">
                <CheckCircle className="w-4 h-4" /><span>{preview.totalNew} nouveau(x)</span>
              </div>
              <div className="flex items-center gap-1 text-blue-700">
                <ArrowRight className="w-4 h-4" /><span>{preview.totalUpdate} mise(s) à jour</span>
              </div>
              {preview.totalErrors > 0 && (
                <div className="flex items-center gap-1 text-red-700">
                  <AlertCircle className="w-4 h-4" /><span>{preview.totalErrors} erreur(s)</span>
                </div>
              )}
              {mode === "A" && preview.totalErrors > 0 && (
                <Badge variant="destructive">Mode A bloqué par erreurs</Badge>
              )}
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Matricule</TableHead>
                    <TableHead>Nom</TableHead>
                    <TableHead>Fonction</TableHead>
                    <TableHead>Division</TableHead>
                    <TableHead>ST / HT</TableHead>
                    <TableHead>Expiration</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.rows.map(row => (
                    <TableRow key={row.row} className={cn(row.errors.length > 0 && "bg-red-50 dark:bg-red-950/30")}>
                      <TableCell className="text-xs text-muted-foreground">{row.row}</TableCell>
                      <TableCell className="font-mono font-medium">{row.matricule || <span className="text-red-500 italic">vide</span>}</TableCell>
                      <TableCell>{row.prenom} {row.nom}</TableCell>
                      <TableCell className="text-sm">{row.fonction}</TableCell>
                      <TableCell className="text-sm">{row.division} / {row.service}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {row.stCodes.length > 0 ? row.stCodes.join(", ") : "—"} / {row.htCodes.length > 0 ? row.htCodes.join(", ") : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{row.dateExpiration || "—"}</TableCell>
                      <TableCell>
                        {row.errors.length > 0 ? (
                          <div className="space-y-0.5">
                            {row.errors.map((e, i) => (
                              <p key={i} className="text-xs text-red-600">{e.field}: {e.message}</p>
                            ))}
                          </div>
                        ) : (
                          <Badge variant={row.isNew ? "default" : "secondary"} className="text-xs">
                            {row.isNew ? "Nouveau" : "Mise à jour"}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Import result */}
        {result && (
          <div className={cn("p-4 rounded-lg border space-y-3", result.errorCount === 0 ? "bg-green-50 border-green-200 dark:bg-green-950/30" : "bg-yellow-50 border-yellow-200 dark:bg-yellow-950/30")}>
            <div className="flex items-center gap-2">
              {result.errorCount === 0 ? <CheckCircle className="w-5 h-5 text-green-600" /> : <AlertCircle className="w-5 h-5 text-yellow-600" />}
              <p className="font-medium">{result.successCount} importé(s) · {result.errorCount} erreur(s)</p>
            </div>
            {result.errors.length > 0 && (
              <div className="text-xs space-y-1 max-h-40 overflow-auto border rounded p-2 bg-white/60">
                {result.errors.map((err, i) => (
                  <div key={i} className="text-red-700">Ligne {err.row} — {err.field}: {err.message}</div>
                ))}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => navigate("/employees")}>Voir les employés</Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
