import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Upload, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { createEmployee } from "@/api/employees";
import { setLastAction } from "@/components/UndoButton";
import { ST_CODES, HT_CODES } from "@/types/habilitation";
import { VALID_FONCTIONS as FALLBACK_FONCTIONS } from "@/types/fonctions";
import { DOMAINE_OPTIONS as FALLBACK_DOMAINES, OUVRAGE_OPTIONS as FALLBACK_OUVRAGES, INDICATION_OPTIONS as FALLBACK_INDICATIONS } from "@/types/habRows";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { HabRows } from "@/types/employee";

interface OrgItem { id: number; name: string; }

const HAB_ROWS_META = [
  { key: 'H0V_B0V' as const, label: 'Non Électricien Habilité',    stKey: 'H0V', htKey: 'B0V' },
  { key: 'H1V_B1V' as const, label: 'Électricien Exécutant',        stKey: 'H1V', htKey: 'B1V' },
  { key: 'BR'      as const, label: 'Chargé des Interventions',     stKey: null,  htKey: 'BR'  },
  { key: 'H2V_B2V' as const, label: 'Chargé de Travaux',            stKey: 'H2V', htKey: 'B2V' },
  { key: 'HC_BC'   as const, label: 'Chargé de Consignation',       stKey: 'HC',  htKey: 'BC'  },
  { key: 'SF6'     as const, label: 'Habilités Spéciaux',           stKey: null,  htKey: 'SF6' },
  { key: 'H1N'     as const, label: 'Exécutant Sous Tension (N)',    stKey: 'H1N', htKey: null  },
  { key: 'H1T'     as const, label: 'Exécutant Sous Tension (T)',    stKey: 'H1T', htKey: null  },
  { key: 'H2N'     as const, label: 'Chargé de Travaux ST (N)',      stKey: 'H2N', htKey: null  },
  { key: 'H2T'     as const, label: 'Chargé de Travaux ST (T)',      stKey: 'H2T', htKey: null  },
];

function getActiveRows(stCodes: string[], htCodes: string[]) {
  return HAB_ROWS_META.filter(r =>
    (r.stKey && stCodes.includes(r.stKey)) || (r.htKey && htCodes.includes(r.htKey))
  );
}

export default function AddEmployee() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [divisions, setDivisions] = useState<OrgItem[]>([]);
  const [services, setServices] = useState<OrgItem[]>([]);
  const [equipes, setEquipes] = useState<OrgItem[]>([]);
  const [fonctionsList, setFonctionsList] = useState<string[]>([...FALLBACK_FONCTIONS]);
  const [domainesList, setDomainesList] = useState<string[]>([...FALLBACK_DOMAINES]);
  const [ouvragesList, setOuvragesList] = useState<string[]>([...FALLBACK_OUVRAGES]);
  const [indicationsList, setIndicationsList] = useState<string[]>([...FALLBACK_INDICATIONS]);
  const [isLoading, setIsLoading] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    matricule: "",
    nom: "",
    prenom: "",
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

  const setHabField = (key: keyof HabRows, field: 'domaine' | 'ouvrage' | 'indication', value: string) => {
    setHabRows(prev => ({
      ...prev,
      [key]: { domaine: '', ouvrage: '', indication: '', ...prev[key], [field]: value },
    }));
  };

  useEffect(() => {
    fetch("/api/divisions").then(r => r.json()).then(d => setDivisions(d.data ?? d)).catch(console.error);
    fetch("/api/ref/fonctions").then(r => r.json()).then(d => { if (d.success) setFonctionsList(d.data.map((i: any) => i.name)); }).catch(console.error);
    fetch("/api/ref/domaines").then(r => r.json()).then(d => { if (d.success) setDomainesList(d.data.map((i: any) => i.name)); }).catch(console.error);
    fetch("/api/ref/ouvrages").then(r => r.json()).then(d => { if (d.success) setOuvragesList(d.data.map((i: any) => i.name)); }).catch(console.error);
    fetch("/api/ref/indications").then(r => r.json()).then(d => { if (d.success) setIndicationsList(d.data.map((i: any) => i.name)); }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!form.divisionId) return;
    setForm(f => ({ ...f, serviceId: "", equipeId: "" }));
    setServices([]);
    setEquipes([]);
    fetch(`/api/divisions/${form.divisionId}/services`)
      .then(r => r.json())
      .then(d => setServices(d.data ?? d))
      .catch(console.error);
  }, [form.divisionId]);

  useEffect(() => {
    if (!form.serviceId) return;
    setForm(f => ({ ...f, equipeId: "" }));
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.stCodes.length === 0 && form.htCodes.length === 0) {
      toast({ title: "Erreur", description: "Au moins un code ST ou HT requis", variant: "destructive" });
      return;
    }
    if (new Date(form.dateExpiration) <= new Date(form.dateValidation)) {
      toast({ title: "Erreur", description: "Date d'expiration doit être après date de validation", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const res = await createEmployee({
        matricule: form.matricule,
        nom: form.nom,
        prenom: form.prenom,
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
      });
      if (res.success) {
        const newId = res.data.employee?.id;
        if (pdfFile && newId) {
          try {
            const buffer = await pdfFile.arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = "";
            for (let i = 0; i < bytes.length; i += 8192) {
              binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
            }
            const base64 = btoa(binary);
            const token = localStorage.getItem("token");
            await fetch(`/api/employees/${newId}/upload-pdf`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ pdfBase64: base64 }),
            });
          } catch {
            // PDF upload failure is non-fatal
          }
        }
        toast({ title: "Succès", description: `Employé ${form.matricule} créé` });
        if (res.data.auditLogId) setLastAction({ auditLogId: res.data.auditLogId, description: `Employé ${form.matricule} créé`, timestamp: Date.now() });
        navigate(`/employees/${newId}`);
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message ?? "Erreur lors de la création", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const activeRows = getActiveRows(form.stCodes, form.htCodes);

  return (
    <Layout>
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/employees"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <h1 className="text-2xl font-bold">Ajouter un employé</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Identité</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Matricule *</Label>
                <Input value={form.matricule} onChange={e => setForm(f => ({ ...f, matricule: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <Label>Nom *</Label>
                <Input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <Label>Prénom *</Label>
                <Input value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} required />
              </div>
              <div className="space-y-1">
                <Label>Fonction *</Label>
                <Select value={form.fonction} onValueChange={v => setForm(f => ({ ...f, fonction: v }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner une fonction" /></SelectTrigger>
                  <SelectContent>
                    {fonctionsList.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Organisation</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Division *</Label>
                <Select value={form.divisionId} onValueChange={v => setForm(f => ({ ...f, divisionId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner" /></SelectTrigger>
                  <SelectContent>
                    {divisions.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Service *</Label>
                <Select value={form.serviceId} onValueChange={v => setForm(f => ({ ...f, serviceId: v }))} disabled={!form.divisionId}>
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
            <CardHeader><CardTitle>Habilitation</CardTitle><CardDescription>Au moins un code ST ou HT requis</CardDescription></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label>N° de titre *</Label>
                <Input value={form.nDeTitre} onChange={e => setForm(f => ({ ...f, nDeTitre: e.target.value }))} required />
              </div>
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
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Date de validation *</Label>
                  <Input type="date" value={form.dateValidation} onChange={e => setForm(f => ({ ...f, dateValidation: e.target.value }))} required />
                </div>
                <div className="space-y-1">
                  <Label>Date d'expiration *</Label>
                  <Input type="date" value={form.dateExpiration} onChange={e => setForm(f => ({ ...f, dateExpiration: e.target.value }))} required />
                </div>
              </div>
            </CardContent>
          </Card>

          {activeRows.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Contenu du titre</CardTitle>
                <CardDescription>Remplir pour chaque code actif (affiché dans le tableau PDF)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {activeRows.map(r => (
                  <div key={r.key} className="space-y-3 border-b pb-4 last:border-b-0 last:pb-0">
                    <p className="text-sm font-semibold text-foreground">
                      {r.stKey && r.htKey ? `${r.stKey} / ${r.htKey}` : r.htKey ?? r.stKey} — {r.label}
                    </p>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Domaine de tension</Label>
                        <Select value={habRows[r.key]?.domaine ?? ''} onValueChange={v => setHabField(r.key, 'domaine', v === '__clear__' ? '' : v)}>
                          <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__clear__" className="text-muted-foreground italic">— Aucun —</SelectItem>
                            {domainesList.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Ouvrages Concernés</Label>
                        <SearchableSelect value={habRows[r.key]?.ouvrage ?? ''} onChange={v => setHabField(r.key, 'ouvrage', v)} options={ouvragesList} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Indications Complémentaires</Label>
                        <Select value={habRows[r.key]?.indication ?? ''} onValueChange={v => setHabField(r.key, 'indication', v === '__clear__' ? '' : v)}>
                          <SelectTrigger><SelectValue placeholder="Sélectionner..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__clear__" className="text-muted-foreground italic">— Aucun —</SelectItem>
                            {indicationsList.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="w-4 h-4" /> PDF existant (optionnel)</CardTitle>
              <CardDescription>Joindre le certificat PDF existant de cet employé</CardDescription>
            </CardHeader>
            <CardContent>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={e => setPdfFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="w-4 h-4 mr-2" />
                  Choisir un PDF
                </Button>
                {pdfFile ? (
                  <span className="text-sm text-foreground">{pdfFile.name}</span>
                ) : (
                  <span className="text-sm text-muted-foreground">Aucun fichier sélectionné</span>
                )}
                {pdfFile && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setPdfFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}>
                    Supprimer
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" asChild>
              <Link to="/employees">Annuler</Link>
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Création..." : "Créer l'employé"}
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
