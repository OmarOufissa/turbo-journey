import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { apiGet } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { initials } from "@/lib/utils";
import type { Division, Service, Equipe } from "@shared/api";

interface AgentRow {
  id: number;
  matricule: string;
  nom: string;
  fonction: string | null;
  statut: string;
  divisionNom: string | null;
  serviceNom: string | null;
  equipeNom: string | null;
}

export default function Agents() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [divisionId, setDivisionId] = useState("all");
  const [serviceId, setServiceId] = useState("all");
  const [equipeId, setEquipeId] = useState("all");
  const [statut, setStatut] = useState("all");

  const { data: divisions } = useQuery<Division[]>({ queryKey: ["org-divisions"], queryFn: () => apiGet("/org/divisions") });
  const { data: services } = useQuery<Service[]>({ queryKey: ["org-services"], queryFn: () => apiGet("/org/services") });
  const { data: equipes } = useQuery<Equipe[]>({ queryKey: ["org-equipes"], queryFn: () => apiGet("/org/equipes") });

  const { data, isLoading } = useQuery<{ rows: AgentRow[]; total: number }>({
    queryKey: ["agents", q, divisionId, serviceId, equipeId, statut],
    queryFn: () =>
      apiGet(
        `/agents?pageSize=300${q ? `&q=${encodeURIComponent(q)}` : ""}${divisionId !== "all" ? `&divisionId=${divisionId}` : ""}${serviceId !== "all" ? `&serviceId=${serviceId}` : ""}${equipeId !== "all" ? `&equipeId=${equipeId}` : ""}${statut !== "all" ? `&statut=${statut}` : ""}`,
      ),
  });

  const servicesForDivision = divisionId !== "all" ? services?.filter((s) => String(s.divisionId) === divisionId) : services;
  const equipesForService = serviceId !== "all" ? equipes?.filter((e) => String(e.serviceId) === serviceId) : equipes;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Bénéficiaires</h1>
        <p className="text-sm text-muted-foreground">{data?.total ?? "…"} agent(s) — l'ajout, la modification et l'archivage se font depuis la page Organisation</p>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, matricule, fonction…" className="pl-8" />
          </div>
          <Select value={divisionId} onValueChange={(v) => { setDivisionId(v); setServiceId("all"); setEquipeId("all"); }}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Division" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les divisions</SelectItem>
              {divisions?.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={serviceId} onValueChange={(v) => { setServiceId(v); setEquipeId("all"); }}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Service" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les services</SelectItem>
              {servicesForDivision?.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={equipeId} onValueChange={setEquipeId}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Équipe" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les équipes</SelectItem>
              {equipesForService?.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.nom}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statut} onValueChange={setStatut}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Statut" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous statuts</SelectItem>
              <SelectItem value="actif">Actif</SelectItem>
              <SelectItem value="inactif">Inactif</SelectItem>
              <SelectItem value="archive">Archivé</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Agent</TableHead>
              <TableHead>Matricule</TableHead>
              <TableHead>Fonction</TableHead>
              <TableHead>Division / Service / Équipe</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Chargement…</TableCell></TableRow>}
            {!isLoading && data?.rows.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Aucun agent</TableCell></TableRow>}
            {data?.rows.map((a) => (
              <TableRow key={a.id} className="cursor-pointer" onClick={() => navigate(`/agents/${a.id}`)}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <Avatar className="h-8 w-8"><AvatarFallback>{initials(a.nom)}</AvatarFallback></Avatar>
                    <span className="font-medium">{a.nom}</span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{a.matricule}</TableCell>
                <TableCell>{a.fonction ?? "—"}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {[a.divisionNom, a.serviceNom, a.equipeNom].filter(Boolean).join(" / ") || "—"}
                </TableCell>
                <TableCell><Badge variant={a.statut === "actif" ? "success" : "muted"}>{a.statut}</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
