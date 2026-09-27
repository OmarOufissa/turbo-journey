import { useEffect, useRef, useState } from "react";
import { Layout } from "@/components/Layout";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { getEmployees } from "@/api/employees";
import { useToast } from "@/hooks/use-toast";

interface FicheAgent { nom: string; prenom: string; matricule: string; division: string; service: string; fonction: string; equipe: string; }

// The validated evaluation-sheet tool is served as a same-origin static page
// (public/fiches-tool.html + public/fiches-tool.js) so it stays CSP-compliant
// inside the packaged Electron app (script-src 'self' blocks inline scripts).
// Real agents are handed to it over postMessage once it signals it is ready.
export default function FichesEvaluation() {
  const { toast } = useToast();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [agents, setAgents] = useState<FicheAgent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getEmployees({ limit: 1000, sort: "nom", sortDir: "asc" })
      .then((res) => {
        if (!res.success) throw new Error("load");
        const list: FicheAgent[] = res.data.employees
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
        setAgents(list);
      })
      .catch(() => toast({ title: "Erreur", description: "Impossible de charger les agents.", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, []);

  // Send agents to the tool: on its "ready" signal and whenever the list changes.
  useEffect(() => {
    const post = () => iframeRef.current?.contentWindow?.postMessage({ type: "fiches-agents", agents }, "*");
    const onMsg = (ev: MessageEvent) => {
      if (ev.data && ev.data.type === "fiches-ready") post();
    };
    window.addEventListener("message", onMsg);
    // In case the iframe was already ready before this effect ran.
    post();
    return () => window.removeEventListener("message", onMsg);
  }, [agents]);

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
            ref={iframeRef}
            title="Fiches d'évaluation"
            src="/fiches-tool.html"
            onLoad={() => iframeRef.current?.contentWindow?.postMessage({ type: "fiches-agents", agents }, "*")}
            style={{ width: "100%", height: "calc(100vh - 140px)", minHeight: "600px", border: "1px solid var(--border, #d0d5dd)", borderRadius: "8px", background: "#fff" }}
          />
        )}
      </div>
    </Layout>
  );
}
