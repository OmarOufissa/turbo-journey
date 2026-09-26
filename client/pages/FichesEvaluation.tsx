import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { getEmployees } from "@/api/employees";
import { useToast } from "@/hooks/use-toast";
// The validated evaluation-sheet tool, imported as raw HTML and fed the real agents.
import ficheTemplate from "./fichesEvaluationTemplate.html?raw";

interface FicheAgent { nom: string; prenom: string; matricule: string; division: string; service: string; fonction: string; equipe: string; }

export default function FichesEvaluation() {
  const { toast } = useToast();
  const [srcDoc, setSrcDoc] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getEmployees({ limit: 1000, sort: "nom", sortDir: "asc" })
      .then((res) => {
        if (!res.success) throw new Error("load");
        const agents: FicheAgent[] = res.data.employees
          .filter((e) => e.currentVersion)
          .map((e) => ({
            nom: e.nom,
            prenom: e.prenom,
            matricule: e.matricule,
            division: e.currentVersion?.division || "",
            service: e.currentVersion?.service || "",
            fonction: e.currentVersion?.fonction || "",
            equipe: e.currentVersion?.equipe || "",
          }));
        const json = JSON.stringify(agents);
        // function replacement avoids $-pattern interpretation in the injected JSON
        setSrcDoc(ficheTemplate.replace("__AGENTS__", () => json));
      })
      .catch(() => toast({ title: "Erreur", description: "Impossible de charger les agents.", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div className="p-4">
        <h1 className="text-2xl font-bold mb-1">Fiches d'évaluation</h1>
        <p className="text-sm text-muted-foreground mb-3">
          Génération des fiches d'évaluation (Formation / Examen) — habilitations électriques hors tension. Utilise la base des agents. Remplir puis <b>Imprimer / Enregistrer en PDF</b>.
        </p>
        {loading ? (
          <LoadingSpinner />
        ) : (
          <iframe
            title="Fiches d'évaluation"
            srcDoc={srcDoc}
            style={{ width: "100%", height: "calc(100vh - 140px)", minHeight: "600px", border: "1px solid var(--border, #d0d5dd)", borderRadius: "8px", background: "#fff" }}
          />
        )}
      </div>
    </Layout>
  );
}
