import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit2, History, RotateCcw, FileText, Download, Eye, Trash2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Employee, EmployeeVersion } from "@/types/employee";
import { getEmployee, revertToVersion } from "@/api/employees";
import { setLastAction } from "@/components/UndoButton";
import { getExpirationStatus, EXPIRATION_COLOR_CONFIG } from "@/types/habilitation";
import { cn } from "@/lib/utils";

export default function EmployeeCard() {
  const { id } = useParams();
  const { toast } = useToast();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showVersions, setShowVersions] = useState(false);
  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    getEmployee(id)
      .then(res => { if (res.success) setEmployee(res.data); })
      .catch(() => toast({ title: "Erreur", description: "Impossible de charger l'employé", variant: "destructive" }))
      .finally(() => setIsLoading(false));
  }, [id]);

  const handleRevert = async (versionId: number, versionNumber: number) => {
    if (!employee || !window.confirm(`Revenir à la version ${versionNumber} ?`)) return;
    try {
      const res = await revertToVersion(employee.id, versionId);
      if (res.success) {
        toast({ title: "Succès", description: `Version ${versionNumber} restaurée` });
        if (res.data.auditLogId) setLastAction({ auditLogId: res.data.auditLogId, description: `Version ${versionNumber} restaurée pour ${employee.matricule}`, timestamp: Date.now() });
        setEmployee(res.data.employee);
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de revenir à cette version", variant: "destructive" });
    }
  };

  const [pdfGenerating, setPdfGenerating] = useState(false);

  const handleGeneratePdf = async () => {
    if (!employee) return;
    setPdfGenerating(true);
    try {
      const res = await fetch(`/api/employees/${employee.id}/generate-pdf`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Succès", description: "PDF généré" });
        const updated = await getEmployee(employee.id.toString());
        if (updated.success) setEmployee(updated.data);
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de générer le PDF", variant: "destructive" });
    } finally {
      setPdfGenerating(false);
    }
  };

  const handleDeletePdf = async () => {
    if (!employee || !window.confirm("Supprimer le PDF de cette version ?")) return;
    try {
      const res = await fetch(`/api/employees/${employee.id}/pdf`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Succès", description: "PDF supprimé" });
        const updated = await getEmployee(employee.id.toString());
        if (updated.success) setEmployee(updated.data);
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de supprimer le PDF", variant: "destructive" });
    }
  };

  if (isLoading) return <Layout><LoadingSpinner /></Layout>;
  if (!employee) return <Layout><div className="p-6">Employé introuvable</div></Layout>;

  const ver = employee.currentVersion;
  const status = ver ? getExpirationStatus(ver.dateExpiration) : "valid";
  const config = EXPIRATION_COLOR_CONFIG[status];

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/employees"><ArrowLeft className="w-4 h-4" /></Link>
            </Button>
            <h1 className="text-2xl font-bold">{employee.prenom} {employee.nom}</h1>
            <Badge variant="outline" className="font-mono">{employee.matricule}</Badge>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowVersions(v => !v)}>
              <History className="w-4 h-4 mr-1" />{showVersions ? "Masquer" : "Historique"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleGeneratePdf}>
              <FileText className="w-4 h-4 mr-1" />PDF
            </Button>
            <Button size="sm" asChild>
              <Link to={`/employees/${employee.id}/edit`}><Edit2 className="w-4 h-4 mr-1" />Modifier</Link>
            </Button>
          </div>
        </div>

        {ver && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-sm">Identité</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Matricule</span><span className="font-mono">{employee.matricule}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Nom</span><span>{employee.nom}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Prénom</span><span>{employee.prenom}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Fonction</span><span>{ver.fonction}</span></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">Organisation</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Division</span><span>{ver.division}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Service</span><span>{ver.service}</span></div>
                {ver.equipe && <div className="flex justify-between"><span className="text-muted-foreground">Équipe</span><span>{ver.equipe}</span></div>}
              </CardContent>
            </Card>

            <Card className={cn("md:col-span-2", config.bgColor)}>
              <CardHeader>
                <CardTitle className="text-sm flex items-center justify-between">
                  Habilitation (v{ver.versionNumber})
                  <Badge className={config.textColor}>{config.name}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">N° titre</span><span className="font-mono">{ver.nDeTitre}</span></div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ST codes</span>
                  <span className="font-mono">{ver.stCodes.length > 0 ? ver.stCodes.join(", ") : "XXX"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">HT codes</span>
                  <span className="font-mono">{ver.htCodes.length > 0 ? ver.htCodes.join(", ") : "XXX"}</span>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">Validation</span><span>{new Date(ver.dateValidation).toLocaleDateString("fr-FR")}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Expiration</span><span className={cn("font-medium", config.textColor)}>{new Date(ver.dateExpiration).toLocaleDateString("fr-FR")}</span></div>

                <div className="pt-3 border-t">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Document PDF</span>
                    <div className="flex gap-1">
                      {ver.pdfPath ? (
                        <>
                          <Button variant="outline" size="sm" asChild>
                            <a href={`/uploads/pdfs/${ver.pdfPath}`} target="_blank" rel="noreferrer">
                              <Eye className="w-3 h-3 mr-1" />Voir
                            </a>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <a href={`/uploads/pdfs/${ver.pdfPath}`} download>
                              <Download className="w-3 h-3 mr-1" />Télécharger
                            </a>
                          </Button>
                          <Button variant="outline" size="sm" onClick={handleGeneratePdf} disabled={pdfGenerating}>
                            <RefreshCw className={cn("w-3 h-3 mr-1", pdfGenerating && "animate-spin")} />Régénérer
                          </Button>
                          <Button variant="destructive" size="sm" onClick={handleDeletePdf}>
                            <Trash2 className="w-3 h-3 mr-1" />Supprimer
                          </Button>
                        </>
                      ) : (
                        <Button size="sm" onClick={handleGeneratePdf} disabled={pdfGenerating}>
                          <FileText className={cn("w-3 h-3 mr-1", pdfGenerating && "animate-spin")} />
                          {pdfGenerating ? "Génération..." : "Générer PDF"}
                        </Button>
                      )}
                    </div>
                  </div>
                  {ver.pdfPath && (
                    <p className="text-xs text-muted-foreground mt-1">{ver.pdfPath}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Version timeline */}
        {showVersions && employee.versions && employee.versions.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Historique des versions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {employee.versions.map((v: EmployeeVersion) => (
                <div
                  key={v.id}
                  className={cn(
                    "flex items-start justify-between p-3 rounded-lg border",
                    v.id === ver?.id ? "border-primary bg-primary/5" : "border-border"
                  )}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">Version {v.versionNumber}</span>
                      {v.id === ver?.id && <Badge variant="default" className="text-xs">Actuelle</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ST: {v.stCodes.length > 0 ? v.stCodes.join(", ") : "XXX"} / HT: {v.htCodes.length > 0 ? v.htCodes.join(", ") : "XXX"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Exp: {new Date(v.dateExpiration).toLocaleDateString("fr-FR")} · Créée le {new Date(v.createdAt).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                  {v.id !== ver?.id && (
                    <Button variant="outline" size="sm" onClick={() => handleRevert(v.id, v.versionNumber)}>
                      <RotateCcw className="w-3 h-3 mr-1" />Restaurer
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
