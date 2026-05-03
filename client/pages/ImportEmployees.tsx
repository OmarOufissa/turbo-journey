import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Upload, AlertCircle, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

interface ImportError {
  row: number;
  field: string;
  message: string;
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
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/import-employees?mode=${mode}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        setResult(data.data);
        toast({
          title: "Import terminé",
          description: `${data.data.successCount} importé(s), ${data.data.errorCount} erreur(s)`,
        });
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message ?? "Erreur lors de l'import", variant: "destructive" });
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-2xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">Importer des employés</h1>
          <p className="text-muted-foreground mt-1">Importez depuis un fichier Excel (.xlsx)</p>
        </div>

        <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
          <div className="space-y-1">
            <Label>Mode d'import</Label>
            <Select value={mode} onValueChange={v => setMode(v as "A" | "B")}>
              <SelectTrigger className="w-60">
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
            {loading ? "Importation..." : "Choisir un fichier"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileSelect}
            disabled={loading}
            className="hidden"
          />
        </div>

        {result && (
          <div className={`p-4 rounded-lg border space-y-3 ${result.errorCount === 0 ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"}`}>
            <div className="flex items-center gap-2">
              {result.errorCount === 0
                ? <CheckCircle className="w-5 h-5 text-green-600" />
                : <AlertCircle className="w-5 h-5 text-yellow-600" />}
              <p className="font-medium">
                {result.successCount} importé(s) · {result.errorCount} erreur(s)
              </p>
            </div>

            {result.errors.length > 0 && (
              <div className="text-xs space-y-1 max-h-40 overflow-auto border rounded p-2 bg-white/60">
                <p className="font-semibold">Erreurs :</p>
                {result.errors.map((err, i) => (
                  <div key={i} className="text-red-700">
                    Ligne {err.row} — {err.field}: {err.message}
                  </div>
                ))}
              </div>
            )}

            <Button variant="outline" size="sm" onClick={() => navigate("/employees")}>
              Voir les employés
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
