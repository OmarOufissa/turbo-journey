import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, Pencil, FileText } from "lucide-react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useToast } from "@/hooks/use-toast";
import { getEmployee } from "@/api/employees";
import { Employee } from "@/types/employee";

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );
}

export default function AgentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getEmployee(id).then(res => {
      if (res.success) setEmployee(res.data);
    }).catch(() => {
      toast({ title: "Erreur", description: "Impossible de charger l'agent", variant: "destructive" });
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Layout><LoadingSpinner /></Layout>;
  if (!employee) return <Layout><div className="p-6">Agent introuvable.</div></Layout>;

  const ver = employee.currentVersion;
  const htCodes = ver?.htCodes ?? [];
  const stCodes = ver?.stCodes ?? [];
  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");

  return (
    <Layout>
      <div className="p-6 max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate("/employees")} className="gap-1">
            <ArrowLeft className="w-4 h-4" /> Retour
          </Button>
          <Button size="sm" asChild className="gap-1">
            <Link to={`/agents/${employee.id}/edit`}><Pencil className="w-4 h-4" /> Modifier</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="uppercase">{employee.nom} {employee.prenom}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Matricule" value={employee.matricule} />
            <Field label="Fonction" value={ver?.fonction} />
            <Field label="Aptitude médicale" value={employee.aptitudeMedicale} />
            <Field label="Division" value={ver?.division} />
            <Field label="Service" value={ver?.service} />
            <Field label="Équipe" value={ver?.equipe} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Habilitation en vigueur</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label="N° de titre" value={ver?.nDeTitre} />
              <Field label="Date de validation" value={fmt(ver?.dateValidation)} />
              <Field label="Date d'expiration" value={fmt(ver?.dateExpiration)} />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Symboles Hors Tension (HT)</p>
              {htCodes.length > 0
                ? <div className="flex flex-wrap gap-1">{htCodes.map(c => <Badge key={c} variant="secondary" className="font-mono text-xs">{c}</Badge>)}</div>
                : <p className="text-sm text-muted-foreground">—</p>}
            </div>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Symboles Sous Tension (ST)</p>
              {stCodes.length > 0
                ? <div className="flex flex-wrap gap-1">{stCodes.map(c => <Badge key={c} variant="secondary" className="font-mono text-xs">{c}</Badge>)}</div>
                : <p className="text-sm text-muted-foreground">—</p>}
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          {htCodes.length > 0 && (
            <Button variant="outline" size="sm" asChild className="gap-1">
              <Link to={`/employees/${employee.id}?type=ht`}><FileText className="w-4 h-4" /> Habilitation HT (détail, historique, PDF)</Link>
            </Button>
          )}
          {stCodes.length > 0 && (
            <Button variant="outline" size="sm" asChild className="gap-1">
              <Link to={`/employees/${employee.id}?type=st`}><FileText className="w-4 h-4" /> Habilitation ST (détail, historique, PDF)</Link>
            </Button>
          )}
        </div>
      </div>
    </Layout>
  );
}
