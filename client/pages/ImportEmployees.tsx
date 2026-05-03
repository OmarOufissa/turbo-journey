import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Upload, AlertCircle, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

export default function ImportEmployees() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    corrected?: number;
    issues?: { matricule: string; division: string; service: string; equipe: string; reason: string }[];
  } | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const text = await file.text();
      const response = await fetch("/api/employees/import", {
        method: "POST",
        headers: {
          "Content-Type": "text/plain",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: text,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || "Import failed");
      }

      const data = await response.json();
      setResult(data);
      const corrected = data.corrected ?? 0;
      toast({
        title: "Import réussi",
        description: `${data.imported} employé(s) importé(s), ${data.skipped} ignoré(s), ${corrected} corrigé(s)` ,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur lors de l'import";
      toast({
        title: "Erreur",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold">Importer des Employés</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-1">
            Téléchargez un fichier TSV pour importer des employés
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-8 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700">
          <div className="text-center space-y-4">
            <Upload className="w-12 h-12 mx-auto text-slate-400" />
            <div>
              <p className="font-medium">Sélectionner un fichier</p>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Format: TSV avec colonnes MATRICULE, Nom, Prénom, etc.
              </p>
            </div>
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="mx-auto"
            >
              {loading ? "Importation..." : "Choisir un fichier"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".tsv,.txt"
              onChange={handleFileSelect}
              disabled={loading}
              className="hidden"
            />
          </div>
        </div>

        {result && (
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-4 rounded-lg space-y-3">
            <div className="flex gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-green-900 dark:text-green-100">
                  Import terminé
                </p>
                <p className="text-sm text-green-800 dark:text-green-200">
                  {result.imported} employé(s) importé(s), {result.skipped} ignoré(s), {result.corrected ?? 0} corrigé(s)
                </p>
                <Button
                  onClick={() => navigate("/employees")}
                  className="mt-3"
                  variant="outline"
                >
                  Retour à la liste
                </Button>
              </div>
            </div>
            {result.issues && result.issues.length > 0 && (
              <div className="bg-white/60 dark:bg-slate-900/40 border border-green-200/60 dark:border-green-800/60 p-3 rounded-md text-xs max-h-40 overflow-auto">
                <p className="font-medium mb-1">Lignes avec problèmes (aperçu) :</p>
                <ul className="space-y-1">
                  {result.issues.slice(0, 10).map((issue, index) => (
                    <li key={`${issue.matricule}-${index}`} className="flex gap-2">
                      <span className="font-mono">{issue.matricule}</span>
                      <span className="text-slate-700 dark:text-slate-200">
                        {issue.reason} · {issue.division} / {issue.service} / {issue.equipe}
                      </span>
                    </li>
                  ))}
                  {result.issues.length > 10 && (
                    <li className="text-slate-600 dark:text-slate-300 mt-1">
                      + {result.issues.length - 10} ligne(s) supplémentaire(s) avec des problèmes
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900 dark:text-blue-100">Format attendu</p>
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Le fichier doit être en format TSV avec les colonnes au minimum : MATRICULE, Nom, Prénom, DIVISION, SERVICE (ou SECTION), EQUIPE.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
