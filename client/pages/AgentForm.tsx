import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Save } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useToast } from "@/hooks/use-toast";
import { getEmployee, createAgent, updateAgentInfo } from "@/api/employees";

interface OrgItem { id: number; name: string; }

export default function AgentForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = localStorage.getItem("token");

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  const [matricule, setMatricule] = useState("");
  const [nom, setNom] = useState("");
  const [prenom, setPrenom] = useState("");
  const [fonction, setFonction] = useState("");
  const [aptitudeMedicale, setAptitudeMedicale] = useState("");
  const [divisionId, setDivisionId] = useState<string>("");
  const [serviceId, setServiceId] = useState<string>("");
  const [equipeId, setEquipeId] = useState<string>("");

  const [divisions, setDivisions] = useState<OrgItem[]>([]);
  const [services, setServices] = useState<OrgItem[]>([]);
  const [equipes, setEquipes] = useState<OrgItem[]>([]);

  const auth = { headers: { Authorization: `Bearer ${token}` } };

  // Load divisions
  useEffect(() => {
    fetch("/api/divisions", auth).then(r => r.json()).then(d => { if (d.success) setDivisions(d.data); }).catch(() => {});
  }, []);

  // Load services when division changes
  useEffect(() => {
    if (!divisionId) { setServices([]); return; }
    fetch(`/api/divisions/${divisionId}/services`, auth).then(r => r.json()).then(d => { if (d.success) setServices(d.data); }).catch(() => {});
  }, [divisionId]);

  // Load equipes when service changes
  useEffect(() => {
    if (!serviceId) { setEquipes([]); return; }
    fetch(`/api/services/${serviceId}/equipes`, auth).then(r => r.json()).then(d => { if (d.success) setEquipes(d.data); }).catch(() => {});
  }, [serviceId]);

  // Load agent for edit
  useEffect(() => {
    if (!isEdit) return;
    getEmployee(id!).then(res => {
      if (res.success) {
        const e = res.data;
        setMatricule(e.matricule);
        setNom(e.nom);
        setPrenom(e.prenom);
        setAptitudeMedicale(e.aptitudeMedicale ?? "");
        const v = e.currentVersion;
        if (v) {
          setFonction(v.fonction ?? "");
          setDivisionId(v.divisionId ? String(v.divisionId) : "");
          setServiceId(v.serviceId ? String(v.serviceId) : "");
          setEquipeId(v.equipeId ? String(v.equipeId) : "");
        }
      }
    }).catch(() => {
      toast({ title: "Erreur", description: "Impossible de charger l'agent", variant: "destructive" });
    }).finally(() => setLoading(false));
  }, [id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matricule.trim() || !nom.trim() || !prenom.trim() || !divisionId || !serviceId) {
      toast({ title: "Champs requis", description: "Matricule, nom, prénom, division et service sont obligatoires.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      matricule: matricule.trim(),
      nom: nom.trim().toUpperCase(),
      prenom: prenom.trim().toUpperCase(),
      fonction: fonction.trim() || null,
      aptitudeMedicale: aptitudeMedicale.trim() || null,
      divisionId: Number(divisionId),
      serviceId: Number(serviceId),
      equipeId: equipeId ? Number(equipeId) : null,
    };
    try {
      const res = isEdit ? await updateAgentInfo(id!, payload) : await createAgent(payload);
      if (res.success) {
        toast({ title: "Succès", description: isEdit ? "Agent modifié" : "Agent ajouté" });
        navigate("/employees");
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err?.message ?? "Enregistrement impossible", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Layout><LoadingSpinner /></Layout>;

  return (
    <Layout>
      <div className="p-6 max-w-2xl space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate("/employees")} className="gap-1">
          <ArrowLeft className="w-4 h-4" /> Retour
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>{isEdit ? "Modifier l'agent" : "Ajouter un agent"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="matricule">Matricule</Label>
                <Input id="matricule" value={matricule} onChange={e => setMatricule(e.target.value)} required />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nom">Nom</Label>
                  <Input id="nom" value={nom} onChange={e => setNom(e.target.value.toUpperCase())} required className="uppercase" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prenom">Prénom</Label>
                  <Input id="prenom" value={prenom} onChange={e => setPrenom(e.target.value.toUpperCase())} required className="uppercase" />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="fonction">Fonction</Label>
                <Input id="fonction" value={fonction} onChange={e => setFonction(e.target.value)} placeholder="Ex. Cadre Technique, Agent d'exploitation..." />
              </div>

              <div className="space-y-2">
                <Label>Division</Label>
                <Select value={divisionId} onValueChange={v => { setDivisionId(v); setServiceId(""); setEquipeId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner une division" /></SelectTrigger>
                  <SelectContent>
                    {divisions.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Service</Label>
                <Select value={serviceId} onValueChange={v => { setServiceId(v); setEquipeId(""); }} disabled={!divisionId}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner un service" /></SelectTrigger>
                  <SelectContent>
                    {services.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Équipe</Label>
                <Select value={equipeId} onValueChange={setEquipeId} disabled={!serviceId}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner une équipe (optionnel)" /></SelectTrigger>
                  <SelectContent>
                    {equipes.map(eq => <SelectItem key={eq.id} value={String(eq.id)}>{eq.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="aptitude">Aptitude médicale</Label>
                <Input id="aptitude" value={aptitudeMedicale} onChange={e => setAptitudeMedicale(e.target.value)} placeholder="Ex. Apte, Inapte, Apte avec restrictions..." />
              </div>

              <div className="flex gap-2 pt-2">
                <Button type="submit" disabled={saving} className="gap-1">
                  <Save className="w-4 h-4" /> {saving ? "Enregistrement..." : "Enregistrer"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => navigate("/employees")}>Annuler</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
