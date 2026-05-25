import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ST_CODES, HT_CODES } from "@/types/habilitation";
import { VALID_FONCTIONS } from "@/types/fonctions";
import { DOMAINE_OPTIONS, OUVRAGE_OPTIONS, INDICATION_OPTIONS } from "@/types/habRows";
import type { Employee, HabRows } from "@/types/employee";

interface OrgItem { id: number; name: string; }

const HAB_ROWS_META = [
  { key: 'H0V_B0V' as const, label: 'Non Électricien Habilité',    stKey: 'H0V', htKey: 'B0V' },
  { key: 'H1V_B1V' as const, label: 'Électricien Exécutant',        stKey: 'H1V', htKey: 'B1V' },
  { key: 'BR'      as const, label: 'Chargé des Interventions',     stKey: null,  htKey: 'BR'  },
  { key: 'H2V_B2V' as const, label: 'Chargé de Travaux',            stKey: 'H2V', htKey: 'B2V' },
  { key: 'HC_BC'   as const, label: 'Chargé de Consignation',       stKey: 'HC',  htKey: 'BC'  },
  { key: 'SF6'     as const, label: 'Habilités Spéciaux',           stKey: null,  htKey: 'SF6' },
];

function getActiveRows(stCodes: string[], htCodes: string[]) {
  return HAB_ROWS_META.filter(r =>
    (r.stKey && stCodes.includes(r.stKey)) || (r.htKey && htCodes.includes(r.htKey))
  );
}

export default function RenewalForm() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loadingEmployee, setLoadingEmployee] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [divisions, setDivisions] = useState<OrgItem[]>([]);
  const [services, setServices] = useState<OrgItem[]>([]);
  const [equipes, setEquipes] = useState<OrgItem[]>([]);

  const [form, setForm] = useState({
    fonction: "",
    divisionId: "",
    serviceId: "",
    equipeId: "",
    stCodes: [] as string[],
    htCodes: [] as string[],
    nDeTitre: "",
    dateValidation: "",
    dateExpiration: "",
  });

  const [habRows, setHabRows] = useState<HabRows>({});

  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!id) return;
    setLoadingEmployee(true);
    fetch(`/api/employees/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(({ data }) => {
        setEmployee(data);
        const v = data?.currentVersion;
        if (v) {
          setForm({
            fonction: v.fonction ?? "",
            divisionId: String(v.divisionId ?? ""),
            serviceId: String(v.serviceId ?? ""),
            equipeId: v.equipeId ? String(v.equipeId) : "",
            stCodes: v.stCodes ?? [],
            htCodes: v.htCodes ?? [],
            nDeTitre: v.nDeTitre ?? "",
            dateValidation: v.dateValidation ?? "",
            dateExpiration: v.dateExpiration ?? "",
          });
          if (v.habRows) setHabRows(v.habRows);
        }
      })
      .catch(() => toast({ title: "Erreur", description: "Impossible de charger l'employé", variant: "destructive" }))
      .finally(() => setLoadingEmployee(false));
  }, [id]);

  useEffect(() => {
    fetch("/api/divisions")
      .then(r => r.json())
      .then(d => setDivisions(d.data ?? d))
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (!form.divisionId) return;
    setServices([]);
    setEquipes([]);
    fetch(`/api/divisions/${form.divisionId}/services`)
      .then(r => r.json())
      .then(d => setServices(d.data ?? d))
      .catch(console.error);
  }, [form.divisionId]);

  useEffect(() => {
    if (!form.serviceId) return;
    setEquipes([]);
    fetch(`/api/services/${form.serviceId}/equipes`)
      .then(r => r.json())
      .then(d => setEquipes(d.data ?? d))
      .catch(console.error);
  }, [form.serviceId]);

  const toggleCode = (type: "st" | "ht", code: string) => {
    setForm(f => {
      const key = type === "st" ? "stCodes" : "htCodes";
      const arr = f[key];
      return { ...f, [key]: arr.includes(code) ? arr.filter(c => c !== code) : [...arr, code] };
    });
  };

  const setHabField = (key: keyof HabRows, field: 'domaine' | 'ouvrage' | 'indication', value: string) => {
    setHabRows(prev => ({
      ...prev,
      [key]: { domaine: '', ouvrage: '', indication: '', ...prev[key], [field]: value },
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee || !id) return;

    if (form.stCodes.length === 0 && form.htCodes.length === 0) {
      toast({ title: "Erreur", description: "Au moins un code ST ou HT requis", variant: "destructive" });
      return;
    }
    if (new Date(form.dateExpiration) <= new Date(form.dateValidation)) {
      toast({ title: "Erreur", description: "Date d'expiration doit être après date de validation", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const snapshot = {
        stCodes: form.stCodes,
        htCodes: form.htCodes,
        nDeTitre: form.nDeTitre,
        fonction: form.fonction,
        divisionId: parseInt(form.divisionId),
        serviceId: parseInt(form.serviceId),
        equipeId: form.equipeId ? parseInt(form.equipeId) : null,
        habRows: Object.keys(habRows).length > 0 ? habRows : null,
        dateValidation: form.dateValidation,
        dateExpiration: form.dateExpiration,
      };

      const res = await fetch("/api/renewals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ employeeId: parseInt(id), snapshot }),
      });
      const body = await res.json();

      if (!res.ok) {
        throw new Error(body.error ?? "Erreur lors de la création du renouvellement");
      }

      toast({ title: "Renouvellement créé", description: `Renouvellement en attente créé pour ${employee.prenom} ${employee.nom}` });
      navigate(`/employees/${id}`);
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message ?? "Erreur", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingEmployee) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!employee || !employee.currentVersion) {
    return (
      <Layout>
        <div className="p-6 text-center">
          <p className="text-muted-foreground">Employé introuvable ou sans version active.</p>
          <Button asChild className="mt-4"><Link to="/employees">Retour</Link></Button>
        </div>
      </Layout>
    );
  }

  const activeRows = getActiveRows(form.stCodes, form.htCodes);

  return (
    <Layout>
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/employees/${id}`}><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <RefreshCw className="w-5 h-5" />
              Créer un renouvellement
            </h1>
            <p className="text-sm text-muted-foreground">
              {employee.prenom} {employee.nom} — {employee.matricule}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 p-4 text-sm text-blue-800 dark:text-blue-200">
          Le renouvellement sera mis en attente et s'activera automatiquement à l'expiration de la version actuelle ({new Date(employee.currentVersion.dateExpiration).toLocaleDateString("fr-FR")}).
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Prochaine version</CardTitle>
              <CardDescription>Modifiez les données pour la future version de l'habilitation</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Fonction *</Label>
                <Select value={form.fonction} onValueChange={v => setForm(f => ({ ...f, fonction: v }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    {VALID_FONCTIONS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>N° de titre *</Label>
                <Input value={form.nDeTitre} onChange={e => setForm(f => ({ ...f, nDeTitre: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <Label>Date de validation *</Label>
                <Input type="date" value={form.dateValidation} onChange={e => setForm(f => ({ ...f, dateValidation: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <Label>Date d'expiration *</Label>
                <Input type="date" value={form.dateExpiration} onChange={e => setForm(f => ({ ...f, dateExpiration: e.target.value }))} required />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Organisation</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Division *</Label>
                <Select value={form.divisionId} onValueChange={v => setForm(f => ({ ...f, divisionId: v, serviceId: "", equipeId: "" }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    {divisions.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Service *</Label>
                <Select value={form.serviceId} onValueChange={v => setForm(f => ({ ...f, serviceId: v, equipeId: "" }))} disabled={!form.divisionId}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    {services.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Équipe</Label>
                <Select value={form.equipeId} onValueChange={v => setForm(f => ({ ...f, equipeId: v }))} disabled={!form.serviceId}>
                  <SelectTrigger><SelectValue placeholder="Optionnel" /></SelectTrigger>
                  <SelectContent>
                    {equipes.map(e => <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Habilitation</CardTitle>
              <CardDescription>Au moins un code ST ou HT requis</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Codes ST</Label>
                  <div className="grid grid-cols-2 gap-1">
                    {ST_CODES.map(code => (
                      <label key={code} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox checked={form.stCodes.includes(code)} onCheckedChange={() => toggleCode("st", code)} />
                        <span className="text-sm font-mono">{code}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Codes HT</Label>
                  <div className="grid grid-cols-2 gap-1">
                    {HT_CODES.map(code => (
                      <label key={code} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox checked={form.htCodes.includes(code)} onCheckedChange={() => toggleCode("ht", code)} />
                        <span className="text-sm font-mono">{code}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {activeRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Contenu du titre</CardTitle>
                <CardDescription>Remplir pour chaque code actif</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {activeRows.map(r => (
                  <div key={r.key} className="space-y-3 border-b pb-4 last:border-b-0 last:pb-0">
                    <p className="text-sm font-semibold">
                      {r.stKey && r.htKey ? `${r.stKey} / ${r.htKey}` : r.htKey ?? r.stKey} — {r.label}
                    </p>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Domaine de tension</Label>
                        <Select value={habRows[r.key]?.domaine ?? ''} onValueChange={v => setHabField(r.key, 'domaine', v)}>
                          <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                          <SelectContent>
                            {DOMAINE_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Ouvrages Concernés</Label>
                        <Select value={habRows[r.key]?.ouvrage ?? ''} onValueChange={v => setHabField(r.key, 'ouvrage', v)}>
                          <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                          <SelectContent>
                            {OUVRAGE_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Indications Complémentaires</Label>
                        <Select value={habRows[r.key]?.indication ?? ''} onValueChange={v => setHabField(r.key, 'indication', v)}>
                          <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                          <SelectContent>
                            {INDICATION_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" asChild>
              <Link to={`/employees/${id}`}>Annuler</Link>
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Création..." : "Créer le renouvellement"}
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
