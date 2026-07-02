import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, FileText, Download } from "lucide-react";
import { apiGet, downloadFile } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AgentOpt { id: number; nom: string; matricule: string }
interface EquipeOpt { id: number; nom: string }

const EXCEL_REPORTS = [
  { path: "/rapports/etat-stock.xlsx", label: "État des stocks", description: "Disponible, réservé, commandé, seuils par article" },
  { path: "/rapports/inventaire.xlsx", label: "Inventaire complet", description: "Fiche complète de chaque article du catalogue" },
  { path: "/rapports/marches.xlsx", label: "État des marchés", description: "Contrats, montants et statuts de livraison" },
  { path: "/rapports/consommation-annuelle.xlsx", label: "Consommation annuelle", description: "Quantités distribuées par article et par année" },
  { path: "/rapports/a-renouveler.xlsx", label: "Équipements à renouveler", description: "Contrôles et échéances à venir ou en retard" },
  { path: "/rapports/budget.xlsx", label: "Budget par division", description: "Coût de dotation ventilé par division et famille" },
  { path: "/rapports/historique.xlsx", label: "Historique complet", description: "Journal d'audit exhaustif (5000 dernières lignes)" },
];

export default function Rapports() {
  const [agentId, setAgentId] = useState("");
  const [equipeId, setEquipeId] = useState("");
  const { data: agents } = useQuery<{ rows: AgentOpt[] }>({ queryKey: ["agents-all"], queryFn: () => apiGet("/agents?pageSize=500") });
  const { data: equipes } = useQuery<EquipeOpt[]>({ queryKey: ["equipes-all"], queryFn: () => apiGet("/org/equipes") });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Rapports</h1>
        <p className="text-sm text-muted-foreground">Génération et export des documents de gestion (PDF / Excel)</p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Fiches individuelles et collectives (PDF)</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground text-base"><FileText className="h-4 w-4" /> Dotation individuelle</CardTitle>
              <CardDescription>Fiche PDF de la dotation EPI complète d'un agent</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Select value={agentId} onValueChange={setAgentId}>
                <SelectTrigger><SelectValue placeholder="Choisir un agent" /></SelectTrigger>
                <SelectContent>
                  {agents?.rows.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.nom} ({a.matricule})</SelectItem>)}
                </SelectContent>
              </Select>
              <Button disabled={!agentId} onClick={() => downloadFile(`/rapports/dotation-individuelle/${agentId}`)}>
                <Download className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-foreground text-base"><FileText className="h-4 w-4" /> Dotation par équipe</CardTitle>
              <CardDescription>Fiche PDF EPC collective + EPI des membres d'une équipe</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Select value={equipeId} onValueChange={setEquipeId}>
                <SelectTrigger><SelectValue placeholder="Choisir une équipe" /></SelectTrigger>
                <SelectContent>
                  {equipes?.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.nom}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button disabled={!equipeId} onClick={() => downloadFile(`/rapports/dotation-equipe/${equipeId}`)}>
                <Download className="h-4 w-4" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">États et exports (Excel)</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {EXCEL_REPORTS.map((r) => (
            <Card key={r.path}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-foreground text-base"><FileSpreadsheet className="h-4 w-4 text-success" /> {r.label}</CardTitle>
                <CardDescription>{r.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="outline" className="w-full" onClick={() => downloadFile(r.path)}>
                  <Download className="h-4 w-4" /> Télécharger
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
