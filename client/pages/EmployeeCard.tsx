import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
  const [showAllVersions, setShowAllVersions] = useState(false);
  const [expandedVersionId, setExpandedVersionId] = useState<number | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [versionPdfLoading, setVersionPdfLoading] = useState<Record<number, boolean>>({});
  const token = localStorage.getItem("token");

  const reload = async () => {
    if (!id) return;
    getEmployee(id).then(res => { if (res.success) setEmployee(res.data); }).catch(() => {});
  };

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    getEmployee(id)
      .then(res => { if (res.success) setEmployee(res.data); })
      .catch(() => toast({ title: "Erreur", description: "Impossible de charger l'employé", variant: "destructive" }))
      .finally(() => setIsLoading(false));
  }, [id]);

  const handleRevert = async (versionId: number, versionNumber: number) => {
    if (!employee || employee.deleted || !window.confirm(`Revenir à la version ${versionNumber} ?`)) return;
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
        await reload();
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
        if (data.data?.auditLogId) setLastAction({ auditLogId: data.data.auditLogId, description: `PDF supprimé pour ${employee.matricule}`, timestamp: Date.now() });
        await reload();
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de supprimer le PDF", variant: "destructive" });
    }
  };

  const handleVersionGeneratePdf = async (versionId: number) => {
    if (!employee) return;
    setVersionPdfLoading(p => ({ ...p, [versionId]: true }));
    try {
      const res = await fetch(`/api/employees/${employee.id}/versions/${versionId}/generate-pdf`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Succès", description: "PDF généré" });
        await reload();
      } else {
        toast({ title: "Erreur", description: data.error ?? "Impossible de générer le PDF", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de générer le PDF", variant: "destructive" });
    } finally {
      setVersionPdfLoading(p => ({ ...p, [versionId]: false }));
    }
  };

  const handleVersionDeletePdf = async (versionId: number) => {
    if (!employee || !window.confirm("Supprimer le PDF de cette version ?")) return;
    setVersionPdfLoading(p => ({ ...p, [versionId]: true }));
    try {
      const res = await fetch(`/api/employees/${employee.id}/versions/${versionId}/pdf`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Succès", description: "PDF supprimé" });
        if (data.data?.auditLogId) setLastAction({ auditLogId: data.data.auditLogId, description: `PDF supprimé pour ${employee.matricule}`, timestamp: Date.now() });
        await reload();
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible de supprimer le PDF", variant: "destructive" });
    } finally {
      setVersionPdfLoading(p => ({ ...p, [versionId]: false }));
    }
  };

  if (isLoading) return <Layout><LoadingSpinner /></Layout>;
  if (!employee) return <Layout><div className="p-6">Employé introuvable</div></Layout>;

  function getDiff(current: EmployeeVersion, previous: EmployeeVersion) {
    const diffs: { field: string; old: string; new: string }[] = [];
    const fields: Array<[string, keyof EmployeeVersion]> = [
      ["Fonction", "fonction"],
      ["N° titre", "nDeTitre"],
      ["Validation", "dateValidation"],
      ["Expiration", "dateExpiration"],
    ];
    for (const [label, key] of fields) {
      const oldVal = String(previous[key] ?? "");
      const newVal = String(current[key] ?? "");
      if (oldVal !== newVal) diffs.push({ field: label, old: oldVal, new: newVal });
    }
    const oldST = (previous.stCodes ?? []).join(",");
    const newST = (current.stCodes ?? []).join(",");
    if (oldST !== newST) diffs.push({ field: "ST codes", old: oldST || "XXX", new: newST || "XXX" });
    const oldHT = (previous.htCodes ?? []).join(",");
    const newHT = (current.htCodes ?? []).join(",");
    if (oldHT !== newHT) diffs.push({ field: "HT codes", old: oldHT || "XXX", new: newHT || "XXX" });
    return diffs;
  }

  const ver = employee.currentVersion;
  const status = ver ? getExpirationStatus(ver.dateExpiration) : "valid";
  const config = EXPIRATION_COLOR_CONFIG[status];

  // Backend returns versions desc (newest first)
  const sortedVersions = employee.versions ?? [];
  const visibleVersions = showAllVersions ? sortedVersions : sortedVersions.slice(0, 5);

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/employees"><ArrowLeft className="w-4 h-4" /></Link>
            </Button>
            <h1 className="text-2xl font-bold">{employee.prenom} {employee.nom}</h1>
            <Badge variant="outline" className="font-mono">{employee.matricule}</Badge>
            {employee.deleted && <Badge variant="destructive">Supprimé</Badge>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowVersions(v => !v)}>
              <History className="w-4 h-4 mr-1" />{showVersions ? "Masquer" : "Historique"}
            </Button>
            {!employee.deleted && (
              <>
                <Button variant="outline" size="sm" onClick={handleGeneratePdf} disabled={pdfGenerating}>
                  <FileText className={cn("w-4 h-4 mr-1", pdfGenerating && "animate-spin")} />PDF
                </Button>
                <Button size="sm" asChild>
                  <Link to={`/employees/${employee.id}/edit`}><Edit2 className="w-4 h-4 mr-1" />Modifier</Link>
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Identity / Organisation / Habilitation cards */}
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
                    <div className="flex gap-1 flex-wrap justify-end">
                      {ver.pdfPath ? (
                        <>
                          <Button variant="outline" size="sm" asChild>
                            <a href={`/api/pdfs/${encodeURIComponent(ver.pdfPath)}?token=${token}`} target="_blank" rel="noreferrer">
                              <Eye className="w-3 h-3 mr-1" />Voir
                            </a>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <a href={`/api/pdfs/${encodeURIComponent(ver.pdfPath)}?token=${token}`} download>
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
                  {ver.pdfPath && <p className="text-xs text-muted-foreground mt-1">{ver.pdfPath}</p>}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Version history */}
        {showVersions && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Historique des versions
                <Badge variant="outline">{sortedVersions.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sortedVersions.length === 0 ? (
                <div className="space-y-2">
                  {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}
                </div>
              ) : (
                <>
                  {visibleVersions.map((v: EmployeeVersion, idx: number) => {
                    const isCurrent = v.id === ver?.id;
                    const isExpanded = expandedVersionId === v.id;
                    // Desc order: previous (older) version is the next element
                    const prevVersion = sortedVersions[idx + 1] as EmployeeVersion | undefined;
                    const diffs = isExpanded && prevVersion ? getDiff(v, prevVersion) : [];
                    const pdfLoading = versionPdfLoading[v.id] ?? false;

                    return (
                      <div
                        key={v.id}
                        className={cn(
                          "p-3 rounded-lg border",
                          isCurrent ? "border-primary bg-primary/5" : "border-border"
                        )}
                      >
                        {/* Version info row */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm">Version {v.versionNumber}</span>
                              {isCurrent && <Badge variant="default" className="text-xs">Actuelle</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground">N° {v.nDeTitre} · {v.fonction}</p>
                            <p className="text-xs font-mono text-muted-foreground">
                              ST: {v.stCodes.length > 0 ? v.stCodes.join(", ") : "XXX"} / HT: {v.htCodes.length > 0 ? v.htCodes.join(", ") : "XXX"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Val: {new Date(v.dateValidation).toLocaleDateString("fr-FR")} ·{" "}
                              Exp: {new Date(v.dateExpiration).toLocaleDateString("fr-FR")} ·{" "}
                              Créée le {new Date(v.createdAt).toLocaleDateString("fr-FR")}
                            </p>
                            {prevVersion && (
                              <Button
                                variant="ghost" size="sm" className="h-6 text-xs px-1"
                                onClick={() => setExpandedVersionId(isExpanded ? null : v.id)}
                              >
                                {isExpanded ? "Masquer diff" : "Voir diff vs précédente"}
                              </Button>
                            )}
                          </div>
                          {!isCurrent && !employee.deleted && (
                            <Button
                              variant="outline" size="sm" className="flex-shrink-0"
                              onClick={() => handleRevert(v.id, v.versionNumber)}
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />Restaurer
                            </Button>
                          )}
                        </div>

                        {/* Per-version PDF actions */}
                        <div className="mt-2 pt-2 border-t flex items-center gap-1 flex-wrap">
                          <span className="text-xs text-muted-foreground mr-1">PDF :</span>
                          {v.pdfPath ? (
                            <>
                              <Button variant="outline" size="sm" className="h-6 text-xs px-2" asChild>
                                <a href={`/api/pdfs/${encodeURIComponent(v.pdfPath)}?token=${token}`} target="_blank" rel="noreferrer">
                                  <Eye className="w-3 h-3 mr-1" />Voir
                                </a>
                              </Button>
                              <Button variant="outline" size="sm" className="h-6 text-xs px-2" asChild>
                                <a href={`/api/pdfs/${encodeURIComponent(v.pdfPath)}?token=${token}`} download>
                                  <Download className="w-3 h-3 mr-1" />Télécharger
                                </a>
                              </Button>
                              <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => handleVersionGeneratePdf(v.id)} disabled={pdfLoading}>
                                <RefreshCw className={cn("w-3 h-3 mr-1", pdfLoading && "animate-spin")} />Régénérer
                              </Button>
                              <Button variant="destructive" size="sm" className="h-6 text-xs px-2" onClick={() => handleVersionDeletePdf(v.id)} disabled={pdfLoading}>
                                <Trash2 className="w-3 h-3 mr-1" />Supprimer
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" className="h-6 text-xs px-2" onClick={() => handleVersionGeneratePdf(v.id)} disabled={pdfLoading}>
                              <FileText className={cn("w-3 h-3 mr-1", pdfLoading && "animate-spin")} />
                              {pdfLoading ? "Génération..." : "Générer PDF"}
                            </Button>
                          )}
                        </div>

                        {/* Diff panel */}
                        {isExpanded && (
                          <div className="mt-2 pt-2 border-t space-y-2">
                            {diffs.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Aucun changement détecté</p>
                            ) : diffs.map(d => (
                              <div key={d.field} className="text-xs">
                                <span className="font-medium text-yellow-700 dark:text-yellow-400">{d.field}</span>
                                <div className="flex items-center gap-1.5 ml-2 mt-0.5">
                                  <span className="line-through text-red-500">{d.old || "—"}</span>
                                  <span className="text-muted-foreground">→</span>
                                  <span className="text-green-600 font-medium">{d.new || "—"}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {sortedVersions.length > 5 && (
                    <Button
                      variant="ghost" size="sm" className="w-full text-muted-foreground"
                      onClick={() => setShowAllVersions(v => !v)}
                    >
                      {showAllVersions
                        ? "Masquer les versions anciennes"
                        : `Voir ${sortedVersions.length - 5} version(s) plus ancienne(s)`}
                    </Button>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
