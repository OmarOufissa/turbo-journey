import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Upload, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getEmployee, updateEmployee } from "@/api/employees";
import { setLastAction } from "@/components/UndoButton";
import { ST_CODES, HT_CODES } from "@/types/habilitation";
import { VALID_FONCTIONS } from "@/types/fonctions";
import { DOMAINE_OPTIONS, OUVRAGE_OPTIONS, INDICATION_OPTIONS } from "@/types/habRows";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import type { HabRows } from "@/types/employee";

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

export default function EditEmployee() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();

  const [divisions, setDivisions] = useState<OrgItem[]>([]);
  const [services, setServices] = useState<OrgItem[]>([]);
  const [equipes, setEquipes] = useState<OrgItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [matricule, setMatricule] = useState("");
  const [currentVersionNumber, setCurrentVersionNumber] = useState<number | null>(null);

  const [form, setForm] = useState({
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
    if (!id) return;
    getEmployee(id)
      .then(res => {
        if (!res.success) throw new Error("Not found");
        const emp = res.data;
        const ver = emp.currentVersion;
        setMatricule(emp.matricule);
        setCurrentVersionNumber(ver?.versionNumber ?? null);
        setForm({
          nom: emp.nom,
          prenom: emp.prenom,
          fonction: ver?.fonction ?? "",
          divisionId: ver ? String(ver.divisionId) : "",
          serviceId: ver ? String(ver.serviceId) : "",
          equipeId: ver?.equipeId ? String(ver.equipeId) : "",
          stCodes: ver?.stCodes ?? [],
          htCodes: ver?.htCodes ?? [],
          nDeTitre: ver?.nDeTitre ?? "",
          dateValidation: ver?.dateValidation ?? "",
          dateExpiration: ver?.dateExpiration ?? "",
        });
        if (ver?.habRows) setHabRows(ver.habRows as HabRows);
      })
      .catch(() => {
        toast({ title: "Erreur", description: "Employé introuvable", variant: "destructive" });
        navigate("/employees");
      })
      .finally(() => setIsLoading(false));
  }, [id]);

  useEffect(() => {
    fetch("/api/divisions").then(r => r.json()).then(d => setDivisions(d.data ?? d)).catch(console.error);
  }, []);

  useEffect(() => {
    if (!form.divisionId) return;
    fetch(`/api/divisions/${form.divisionId}/services`).then(r => r.json()).then(d => setServices(d.data ?? d)).catch(console.error);
  }, [form.divisionId]);

  useEffect(() => {
    if (!form.serviceId) return;
    fetch(`/api/services/${form.serviceId}/equipes`).then(r => r.json()).then(d => setEquipes(d.data ?? d)).catch(console.error);
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
    setIsSaving(true);
    try {
      const res = await updateEmployee(id!, {
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
        if (pdfFile && id) {
          try {
            const buffer = await pdfFile.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
            const token = localStorage.getItem("token");
            await fetch(`/api/employees/${id}/upload-pdf`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({ pdfBase64: base64 }),
            });
          } catch {
            // PDF upload failure is non-fatal
          }
        }
        toast({ title: "Succès", description: `Nouvelle version créée pour ${matricule}` });
        if (res.data.auditLogId) setLastAction({ auditLogId: res.data.auditLogId, description: `Version mise à jour pour ${matricule}`, timestamp: Date.now() });
        navigate(`/employees/${id}`);
      }
    } catch (err: any) {
      toast({ title: "Erreur", description: err.message ?? "Erreur lors de la modification", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) return <Layout><LoadingSpinner /></Layout>;

  const activeRows = getActiveRows(form.stCodes, form.htCodes);

  return (
    <Layout>
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/employees/${id}`}><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <h1 className="text-2xl font-bold">Modifier {matricule}</h1>
        </div>

        <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded">
          Cette modification créera la{" "}
          <span className="font-semibold text-foreground">
            version {currentVersionNumber !== null ? currentVersionNumber + 1 : "suivante"}
          </span>{" "}
          de l'habilitation. L'historique sera conservé.
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Identité</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Nom</Label>
                <Input value={form.nom} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Prénom</Label>
                <Input value={form.prenom} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Fonction *</Label>
                <Select value={form.fonction} onValueChange={v => setForm(f => ({ ...f, fonction: v }))}>
                  <SelectTrigger><SelectValue placeholder="Sélectionner une fonction" /></SelectTrigger>
                  <SelectContent>
                    {VALID_FONCTIONS.map(fn => <SelectItem key={fn} value={fn}>{fn}</SelectItem>)}
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileText className="w-4 h-4" /> PDF existant (optionnel)</CardTitle>
              <CardDescription>Joindre ou remplacer le certificat PDF de cet employé</CardDescription>
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
              <Link to={`/employees/${id}`}>Annuler</Link>
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Enregistrement..." : "Enregistrer (nouvelle version)"}
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
