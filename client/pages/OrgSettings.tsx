import { Layout } from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { Plus, Trash2, Building2, Layers, Users } from "lucide-react";

interface Division { id: number; name: string; }
interface Service { id: number; name: string; divisionId: number; }
interface Equipe  { id: number; name: string; serviceId: number; }

const token = () => localStorage.getItem("token") ?? "";

async function apiFetch(url: string, opts?: RequestInit) {
  const res = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}`, ...(opts?.headers ?? {}) } });
  return res.json();
}

export default function OrgSettings() {
  const { toast } = useToast();
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [equipes, setEquipes]   = useState<Equipe[]>([]);

  // New-item forms
  const [newDiv, setNewDiv] = useState("");
  const [newSvc, setNewSvc] = useState({ name: "", divisionId: "" });
  const [newEq,  setNewEq]  = useState({ name: "", serviceId: "" });

  const [selDivForSvc, setSelDivForSvc] = useState<string>("all");
  const [selSvcForEq,  setSelSvcForEq]  = useState<string>("all");

  const load = async () => {
    const [d, s] = await Promise.all([
      apiFetch("/api/divisions"),
      apiFetch("/api/services"),
    ]);
    if (d.success) setDivisions(d.data);
    if (s.success) setServices(s.data);
  };

  const loadEquipes = async (serviceId: string) => {
    if (!serviceId) return;
    const r = await apiFetch(`/api/services/${serviceId}/equipes`);
    if (r.success) setEquipes(prev => [...prev.filter(e => e.serviceId !== parseInt(serviceId)), ...r.data]);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (selSvcForEq) loadEquipes(selSvcForEq); }, [selSvcForEq]);

  const addDivision = async () => {
    if (!newDiv.trim()) return;
    const r = await apiFetch("/api/org/divisions", { method: "POST", body: JSON.stringify({ name: newDiv.trim() }) });
    if (r.success) { setNewDiv(""); load(); toast({ title: "Division créée" }); }
    else toast({ title: "Erreur", description: r.error, variant: "destructive" });
  };

  const addService = async () => {
    if (!newSvc.name.trim() || !newSvc.divisionId) return;
    const r = await apiFetch("/api/org/services", { method: "POST", body: JSON.stringify({ name: newSvc.name.trim(), divisionId: parseInt(newSvc.divisionId) }) });
    if (r.success) { setNewSvc({ name: "", divisionId: "" }); load(); toast({ title: "Service créé" }); }
    else toast({ title: "Erreur", description: r.error, variant: "destructive" });
  };

  const addEquipe = async () => {
    if (!newEq.name.trim() || !newEq.serviceId) return;
    const r = await apiFetch("/api/org/equipes", { method: "POST", body: JSON.stringify({ name: newEq.name.trim(), serviceId: parseInt(newEq.serviceId) }) });
    if (r.success) { setNewEq({ name: "", serviceId: "" }); loadEquipes(newEq.serviceId); toast({ title: "Équipe créée" }); }
    else toast({ title: "Erreur", description: r.error, variant: "destructive" });
  };

  const deleteDiv = async (id: number) => {
    if (!window.confirm("Supprimer cette division ? Cela supprimera également ses services et équipes.")) return;
    const r = await apiFetch(`/api/org/divisions/${id}`, { method: "DELETE" });
    if (r.success) { load(); toast({ title: "Division supprimée" }); }
    else toast({ title: "Erreur", description: r.error, variant: "destructive" });
  };

  const deleteSvc = async (id: number) => {
    if (!window.confirm("Supprimer ce service ?")) return;
    const r = await apiFetch(`/api/org/services/${id}`, { method: "DELETE" });
    if (r.success) { load(); toast({ title: "Service supprimé" }); }
    else toast({ title: "Erreur", description: r.error, variant: "destructive" });
  };

  const deleteEq = async (id: number, serviceId: number) => {
    if (!window.confirm("Supprimer cette équipe ?")) return;
    const r = await apiFetch(`/api/org/equipes/${id}`, { method: "DELETE" });
    if (r.success) { loadEquipes(String(serviceId)); toast({ title: "Équipe supprimée" }); }
    else toast({ title: "Erreur", description: r.error, variant: "destructive" });
  };

  const filteredServices = selDivForSvc !== "all" ? services.filter(s => s.divisionId === parseInt(selDivForSvc)) : services;
  const filteredEquipes  = selSvcForEq  !== "all" ? equipes.filter(e => e.serviceId === parseInt(selSvcForEq)) : equipes;

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">Gestion de la structure organisationnelle</h1>
          <p className="text-muted-foreground mt-1">Gérez les divisions, services et équipes</p>
        </div>

        {/* Divisions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Building2 className="w-5 h-5" />Divisions ({divisions.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="Nom de la division" value={newDiv} onChange={e => setNewDiv(e.target.value)} onKeyDown={e => e.key === "Enter" && addDivision()} className="max-w-xs" />
              <Button size="sm" onClick={addDivision}><Plus className="w-4 h-4 mr-1" />Ajouter</Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {divisions.map(d => (
                <div key={d.id} className="flex items-center justify-between p-2 border rounded-lg">
                  <span className="text-sm font-medium truncate">{d.name}</span>
                  <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 shrink-0 ml-2" onClick={() => deleteDiv(d.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Services */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Layers className="w-5 h-5" />Services ({services.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Input placeholder="Nom du service" value={newSvc.name} onChange={e => setNewSvc(p => ({ ...p, name: e.target.value }))} className="max-w-xs" />
              <Select value={newSvc.divisionId} onValueChange={v => setNewSvc(p => ({ ...p, divisionId: v }))}>
                <SelectTrigger className="w-52"><SelectValue placeholder="Division" /></SelectTrigger>
                <SelectContent>{divisions.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" onClick={addService}><Plus className="w-4 h-4 mr-1" />Ajouter</Button>
            </div>

            <div className="flex gap-2 items-center">
              <Label className="text-xs text-muted-foreground shrink-0">Filtrer par division:</Label>
              <Select value={selDivForSvc} onValueChange={setSelDivForSvc}>
                <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="Toutes" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes</SelectItem>
                  {divisions.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {filteredServices.map(s => {
                const div = divisions.find(d => d.id === s.divisionId);
                return (
                  <div key={s.id} className="flex items-center justify-between p-2 border rounded-lg">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{div?.name ?? "—"}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 shrink-0 ml-2" onClick={() => deleteSvc(s.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Equipes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="w-5 h-5" />Équipes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2 flex-wrap">
              <Input placeholder="Nom de l'équipe" value={newEq.name} onChange={e => setNewEq(p => ({ ...p, name: e.target.value }))} className="max-w-xs" />
              <Select value={newEq.serviceId} onValueChange={v => { setNewEq(p => ({ ...p, serviceId: v })); loadEquipes(v); }}>
                <SelectTrigger className="w-52"><SelectValue placeholder="Service" /></SelectTrigger>
                <SelectContent>{services.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" onClick={addEquipe}><Plus className="w-4 h-4 mr-1" />Ajouter</Button>
            </div>

            <div className="flex gap-2 items-center">
              <Label className="text-xs text-muted-foreground shrink-0">Filtrer par service:</Label>
              <Select value={selSvcForEq} onValueChange={setSelSvcForEq}>
                <SelectTrigger className="w-48 h-8 text-xs"><SelectValue placeholder="Tous" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {services.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {filteredEquipes.map(e => {
                const svc = services.find(s => s.id === e.serviceId);
                return (
                  <div key={e.id} className="flex items-center justify-between p-2 border rounded-lg">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{e.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{svc?.name ?? "—"}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 shrink-0 ml-2" onClick={() => deleteEq(e.id, e.serviceId)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
