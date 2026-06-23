import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Edit2, History, RotateCcw, FileText, Download, Eye, Trash2, RefreshCw, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { Employee, EmployeeVersion } from "@/types/employee";
import { getEmployee, revertToVersion } from "@/api/employees";
import { setLastAction } from "@/components/UndoButton";
import { getExpirationStatus, EXPIRATION_COLOR_CONFIG } from "@/types/habilitation";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const TST_CODES = ['H1N', 'H1T', 'H2N', 'H2T'];
function isTstEmployee(ver: EmployeeVersion): boolean {
  return ver.stCodes.some(c => TST_CODES.includes(c));
}

type PendingConfirm =
  | { type: "revert"; versionId: number; versionNumber: number }
  | { type: "deletePdf" }
  | { type: "versionDeletePdf"; versionId: number };

function PdfSection({ label, pdfPath, pdfStatus, token, onUploadSigned, signedUploading }: {
  label: string;
  pdfPath?: string | null;
  pdfStatus?: "draft" | "signed" | null;
  token: string | null;
  onUploadSigned: () => void;
  signedUploading: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-muted-foreground text-sm font-medium">{label}</span>
        {pdfPath && (
          <Badge variant={pdfStatus === "signed" ? "default" : "secondary"} className="text-xs">
            {pdfStatus === "signed" ? "Signé" : "Brouillon"}
          </Badge>
        )}
      </div>
      {pdfPath ? (
        <div className="flex gap-1 flex-wrap">
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/pdfs/${encodeURIComponent(pdfPath)}?token=${token}`} target="_blank" rel="noreferrer">
              <Eye className="w-3 h-3 mr-1" />Voir
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`/api/pdfs/${encodeURIComponent(pdfPath)}?token=${token}`} download>
              <Download className="w-3 h-3 mr-1" />Télécharger
            </a>
          </Button>
          {pdfStatus !== "signed" && (
            <Button variant="outline" size="sm" onClick={onUploadSigned} disabled={signedUploading}>
              <Upload className={cn("w-3 h-3 mr-1", signedUploading && "animate-spin")} />
              Signé
            </Button>
          )}
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">Pas encore généré</span>
      )}
    </div>
  );
}

export default function EmployeeCard() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  // When opened from the HT/ST employee list, scope the view to that
  // habilitation type so a TST employee only shows the relevant codes + PDF.
  const viewType = searchParams.get("type"); // "ht" | "st" | null
  const showHt = viewType !== "st";
  const showSt = viewType !== "ht";
  const { toast } = useToast();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showVersions, setShowVersions] = useState(false);
  const [showAllVersions, setShowAllVersions] = useState(false);
  const [expandedVersionId, setExpandedVersionId] = useState<number | null>(null);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [versionPdfLoading, setVersionPdfLoading] = useState<Record<number, boolean>>({});
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [signedUploading, setSignedUploading] = useState(false);
  const signedFileRef = useRef<HTMLInputElement>(null);
  const versionSignedFileRef = useRef<HTMLInputElement>(null);
  const [uploadingVersionId, setUploadingVersionId] = useState<number | null>(null);
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

  const handleRevert = (versionId: number, versionNumber: number) => {
    if (!employee || employee.deleted) return;
    setPendingConfirm({ type: "revert", versionId, versionNumber });
  };

  const doRevert = async (versionId: number, versionNumber: number) => {
    if (!employee) return;
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

  const handleDeletePdf = () => {
    if (!employee) return;
    setPendingConfirm({ type: "deletePdf" });
  };

  const doDeletePdf = async () => {
    if (!employee) return;
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

  const [uploadPdfType, setUploadPdfType] = useState<'ht' | 'st' | undefined>();

  const handleUploadSigned = async (file: File, versionId?: number, pdfType?: 'ht' | 'st') => {
    if (!employee) return;
    setSignedUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const body: any = { pdfBase64: base64 };
      if (versionId) body.versionId = versionId;
      if (pdfType) body.pdfType = pdfType;

      const res = await fetch(`/api/employees/${employee.id}/upload-signed-pdf`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Succès", description: "PDF signé uploadé" });
        await reload();
      } else {
        toast({ title: "Erreur", description: data.error ?? "Impossible d'uploader", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erreur", description: "Impossible d'uploader le PDF signé", variant: "destructive" });
    } finally {
      setSignedUploading(false);
      setUploadingVersionId(null);
      setUploadPdfType(undefined);
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

  const handleVersionDeletePdf = (versionId: number) => {
    if (!employee) return;
    setPendingConfirm({ type: "versionDeletePdf", versionId });
  };

  const doVersionDeletePdf = async (versionId: number) => {
    if (!employee) return;
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

  const handleConfirmAction = () => {
    if (!pendingConfirm) return;
    switch (pendingConfirm.type) {
      case "revert":
        doRevert(pendingConfirm.versionId, pendingConfirm.versionNumber);
        break;
      case "deletePdf":
        doDeletePdf();
        break;
      case "versionDeletePdf":
        doVersionDeletePdf(pendingConfirm.versionId);
        break;
    }
  };

  const getConfirmDialogProps = () => {
    switch (pendingConfirm?.type) {
      case "revert":
        return { title: "Restaurer la version", description: `Revenir à la version ${pendingConfirm.versionNumber} ?`, confirmText: "Restaurer", variant: "warning" as const };
      case "deletePdf":
      case "versionDeletePdf":
        return { title: "Supprimer le PDF", description: "Supprimer le PDF de cette version ?", confirmText: "Supprimer", variant: "danger" as const };
      default:
        return { title: "", description: "" };
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
    if (oldST !== newST) diffs.push({ field: "ST codes", old: oldST || "—", new: newST || "—" });
    const oldHT = (previous.htCodes ?? []).join(",");
    const newHT = (current.htCodes ?? []).join(",");
    if (oldHT !== newHT) diffs.push({ field: "HT codes", old: oldHT || "—", new: newHT || "—" });
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
            <Button variant="outline" size="sm" asChild>
              <Link to={`/employees/${employee.id}/history`}>
                <History className="w-4 h-4 mr-1" />Historique complet
              </Link>
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
                {showSt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">ST codes</span>
                    <span className="font-mono">{ver.stCodes.length > 0 ? ver.stCodes.join(", ") : "—"}</span>
                  </div>
                )}
                {showHt && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">HT codes</span>
                    <span className="font-mono">{ver.htCodes.length > 0 ? ver.htCodes.join(", ") : "—"}</span>
                  </div>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground">Validation</span><span>{new Date(ver.dateValidation).toLocaleDateString("fr-FR")}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Expiration</span><span className={cn("font-medium", config.textColor)}>{new Date(ver.dateExpiration).toLocaleDateString("fr-FR")}</span></div>

                <div className="pt-3 border-t space-y-3">
                  {isTstEmployee(ver) ? (
                    <>
                      {showHt && (
                        <PdfSection
                          label="PDF HT (Hors Tension)"
                          pdfPath={ver.pdfPath}
                          pdfStatus={ver.pdfStatus}
                          token={token}
                          onUploadSigned={() => { setUploadPdfType('ht'); signedFileRef.current?.click(); }}
                          signedUploading={signedUploading}
                        />
                      )}
                      {showSt && (
                        <PdfSection
                          label="PDF ST (Sous Tension)"
                          pdfPath={ver.pdfPathSt}
                          pdfStatus={ver.pdfStatusSt}
                          token={token}
                          onUploadSigned={() => { setUploadPdfType('st'); signedFileRef.current?.click(); }}
                          signedUploading={signedUploading}
                        />
                      )}
                      <div className="flex gap-1 flex-wrap">
                        {(ver.pdfPath || ver.pdfPathSt) ? (
                          <>
                            <Button variant="outline" size="sm" onClick={handleGeneratePdf} disabled={pdfGenerating}>
                              <RefreshCw className={cn("w-3 h-3 mr-1", pdfGenerating && "animate-spin")} />Régénérer les 2 PDFs
                            </Button>
                            <Button variant="destructive" size="sm" onClick={handleDeletePdf}>
                              <Trash2 className="w-3 h-3 mr-1" />Supprimer les PDFs
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" onClick={handleGeneratePdf} disabled={pdfGenerating}>
                            <FileText className={cn("w-3 h-3 mr-1", pdfGenerating && "animate-spin")} />
                            {pdfGenerating ? "Génération..." : "Générer PDFs (HT + ST)"}
                          </Button>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Document PDF</span>
                        {ver.pdfPath && (
                          <Badge variant={ver.pdfStatus === "signed" ? "default" : "secondary"}>
                            {ver.pdfStatus === "signed" ? "Signé" : "Brouillon"}
                          </Badge>
                        )}
                      </div>
                      <div className="flex gap-1 flex-wrap mt-2">
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
                            {ver.pdfStatus !== "signed" && (
                              <Button variant="outline" size="sm" onClick={() => signedFileRef.current?.click()} disabled={signedUploading}>
                                <Upload className={cn("w-3 h-3 mr-1", signedUploading && "animate-spin")} />
                                {signedUploading ? "Upload..." : "Uploader signé"}
                              </Button>
                            )}
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
                    </>
                  )}
                  <input
                    ref={signedFileRef}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleUploadSigned(file, undefined, uploadPdfType);
                      e.target.value = "";
                    }}
                  />
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
                              ST: {v.stCodes.length > 0 ? v.stCodes.join(", ") : "—"} / HT: {v.htCodes.length > 0 ? v.htCodes.join(", ") : "—"}
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
                        <div className="mt-2 pt-2 border-t space-y-1">
                          {isTstEmployee(v) ? (
                            <>
                              {showHt && (
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-xs text-muted-foreground mr-1">HT :</span>
                                {v.pdfPath ? (
                                  <>
                                    <Badge variant={v.pdfStatus === "signed" ? "default" : "secondary"} className="text-xs mr-1">
                                      {v.pdfStatus === "signed" ? "Signé" : "Brouillon"}
                                    </Badge>
                                    <Button variant="outline" size="sm" className="h-6 text-xs px-2" asChild>
                                      <a href={`/api/pdfs/${encodeURIComponent(v.pdfPath)}?token=${token}`} target="_blank" rel="noreferrer">
                                        <Eye className="w-3 h-3 mr-1" />Voir
                                      </a>
                                    </Button>
                                    {v.pdfStatus !== "signed" && (
                                      <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => { setUploadingVersionId(v.id); setUploadPdfType('ht'); versionSignedFileRef.current?.click(); }} disabled={signedUploading}>
                                        <Upload className="w-3 h-3 mr-1" />Signé
                                      </Button>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </div>
                              )}
                              {showSt && (
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-xs text-muted-foreground mr-1">ST :</span>
                                {v.pdfPathSt ? (
                                  <>
                                    <Badge variant={v.pdfStatusSt === "signed" ? "default" : "secondary"} className="text-xs mr-1">
                                      {v.pdfStatusSt === "signed" ? "Signé" : "Brouillon"}
                                    </Badge>
                                    <Button variant="outline" size="sm" className="h-6 text-xs px-2" asChild>
                                      <a href={`/api/pdfs/${encodeURIComponent(v.pdfPathSt)}?token=${token}`} target="_blank" rel="noreferrer">
                                        <Eye className="w-3 h-3 mr-1" />Voir
                                      </a>
                                    </Button>
                                    {v.pdfStatusSt !== "signed" && (
                                      <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => { setUploadingVersionId(v.id); setUploadPdfType('st'); versionSignedFileRef.current?.click(); }} disabled={signedUploading}>
                                        <Upload className="w-3 h-3 mr-1" />Signé
                                      </Button>
                                    )}
                                  </>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </div>
                              )}
                              <div className="flex items-center gap-1 flex-wrap">
                                {(v.pdfPath || v.pdfPathSt) ? (
                                  <>
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
                                    {pdfLoading ? "Génération..." : "Générer PDFs"}
                                  </Button>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-xs text-muted-foreground mr-1">PDF :</span>
                              {v.pdfPath && (
                                <Badge variant={v.pdfStatus === "signed" ? "default" : "secondary"} className="text-xs mr-1">
                                  {v.pdfStatus === "signed" ? "Signé" : "Brouillon"}
                                </Badge>
                              )}
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
                                  {v.pdfStatus !== "signed" && (
                                    <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => { setUploadingVersionId(v.id); versionSignedFileRef.current?.click(); }} disabled={signedUploading}>
                                      <Upload className="w-3 h-3 mr-1" />Signé
                                    </Button>
                                  )}
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

        <input
          ref={versionSignedFileRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file && uploadingVersionId) handleUploadSigned(file, uploadingVersionId, uploadPdfType);
            e.target.value = "";
          }}
        />

        <ConfirmDialog
          open={pendingConfirm !== null}
          onOpenChange={(open) => !open && setPendingConfirm(null)}
          onConfirm={handleConfirmAction}
          {...getConfirmDialogProps()}
        />
      </div>
    </Layout>
  );
}
