import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { apiGet, downloadFile } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

interface HistoriqueRow {
  id: number;
  typeEvenement: string;
  entiteType: string;
  entiteId: number | null;
  agentNom: string | null;
  equipeNom: string | null;
  articleDesignation: string | null;
  utilisateurNom: string | null;
  dateEvenement: string;
}

const TYPE_LABELS: Record<string, string> = {
  dotation: "Dotation",
  dotation_kit: "Dotation (gabarit)",
  retour: "Retour",
  reforme: "Réforme",
  controle_realise: "Contrôle réalisé",
  planification_controle: "Planification contrôle",
  envoi_reparation: "Envoi en réparation",
  maj_reparation: "Mise à jour réparation",
  creation_article: "Création article",
  modification_article: "Modification article",
  creation_agent: "Création agent",
  modification_agent: "Modification agent",
  archivage_agent: "Archivage agent",
  ajout_document: "Ajout document",
  creation_division: "Création division",
  creation_service: "Création service",
  creation_equipe: "Création équipe",
  creation_marche: "Création marché",
  initialisation_base: "Initialisation de la base",
};

export default function Historique() {
  const [typeEvenement, setTypeEvenement] = useState("");
  const { data, isLoading } = useQuery<{ rows: HistoriqueRow[]; total: number }>({
    queryKey: ["historique", typeEvenement],
    queryFn: () => apiGet(`/historique?pageSize=200${typeEvenement ? `&typeEvenement=${typeEvenement}` : ""}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Historique</h1>
          <p className="text-sm text-muted-foreground">Journal d'audit complet — aucune donnée n'est jamais supprimée</p>
        </div>
        <Button variant="outline" onClick={() => downloadFile("/rapports/historique.xlsx")}><Download className="h-4 w-4" /> Exporter</Button>
      </div>

      <Card className="p-3">
        <Input value={typeEvenement} onChange={(e) => setTypeEvenement(e.target.value)} placeholder="Filtrer par type d'événement (ex: dotation, retour, reforme…)" className="max-w-md" />
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Événement</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Équipe</TableHead>
              <TableHead>Article</TableHead>
              <TableHead>Utilisateur</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Chargement…</TableCell></TableRow>}
            {data?.rows.map((h) => (
              <TableRow key={h.id}>
                <TableCell className="whitespace-nowrap text-sm">{formatDate(h.dateEvenement)}</TableCell>
                <TableCell><Badge variant="outline">{TYPE_LABELS[h.typeEvenement] ?? h.typeEvenement}</Badge></TableCell>
                <TableCell>{h.agentNom ?? "—"}</TableCell>
                <TableCell>{h.equipeNom ?? "—"}</TableCell>
                <TableCell>{h.articleDesignation ?? "—"}</TableCell>
                <TableCell className="text-muted-foreground">{h.utilisateurNom ?? "Système"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
