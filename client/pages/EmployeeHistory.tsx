import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Download, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/shared/EmptyState";
import { Employee, EmployeeVersion } from "@/types/employee";
import { getEmployee } from "@/api/employees";
import { getExpirationStatus, EXPIRATION_COLOR_CONFIG } from "@/types/habilitation";
import { cn } from "@/lib/utils";

export default function EmployeeHistory() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { toast } = useToast();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  useEffect(() => {
    if (!employeeId) return;
    setLoading(true);
    getEmployee(employeeId)
      .then(res => { if (res.success) setEmployee(res.data); })
      .catch(() => toast({ title: "Erreur", description: "Impossible de charger l'historique", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [employeeId]);

  function getDiff(current: EmployeeVersion, previous: EmployeeVersion) {
    const diffs: { field: string; old: string; new: string }[] = [];
    const check = (label: string, key: keyof EmployeeVersion) => {
      const o = String(previous[key] ?? "");
      const n = String(current[key] ?? "");
      if (o !== n) diffs.push({ field: label, old: o, new: n });
    };
    check("Fonction", "fonction");
    check("N° titre", "nDeTitre");
    check("Division", "division");
    check("Service", "service");
    check("Équipe", "equipe");
    check("Validation", "dateValidation");
    check("Expiration", "dateExpiration");
    const oldST = (previous.stCodes ?? []).join(",");
    const newST = (current.stCodes ?? []).join(",");
    if (oldST !== newST) diffs.push({ field: "ST codes", old: oldST || "—", new: newST || "—" });
    const oldHT = (previous.htCodes ?? []).join(",");
    const newHT = (current.htCodes ?? []).join(",");
    if (oldHT !== newHT) diffs.push({ field: "HT codes", old: oldHT || "—", new: newHT || "—" });
    return diffs;
  }

  const exportHistory = () => {
    if (!employee) return;
    const data = {
      matricule: employee.matricule,
      nom: employee.nom,
      prenom: employee.prenom,
      exportedAt: new Date().toISOString(),
      versions: employee.versions ?? [],
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historique_${employee.matricule}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return (
    <Layout>
      <div className="p-6 space-y-4 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-64" />
        <div className="flex gap-4">
          {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-16 flex-1" />)}
        </div>
        {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-32" />)}
      </div>
    </Layout>
  );

  if (!employee) return (
    <Layout>
      <div className="p-6">
        <EmptyState title="Employé introuvable" description="Impossible de charger l'historique de cet employé." />
      </div>
    </Layout>
  );

  // Chronological order: V1 → V2 → ... → latest
  const sortedVersions = [...(employee.versions ?? [])].sort((a, b) => a.versionNumber - b.versionNumber);

  // Filter by creation date range
  const filtered = sortedVersions.filter(v => {
    if (filterFrom && v.createdAt.slice(0, 10) < filterFrom) return false;
    if (filterTo && v.createdAt.slice(0, 10) > filterTo) return false;
    return true;
  });

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/employees/${employeeId}`}><ArrowLeft className="w-4 h-4" /></Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Historique — {employee.prenom} {employee.nom}</h1>
              <p className="text-sm text-muted-foreground font-mono">{employee.matricule}</p>
            </div>
            {employee.deleted && <Badge variant="destructive">Supprimé</Badge>}
          </div>
          <Button variant="outline" size="sm" onClick={exportHistory}>
            <Download className="w-4 h-4 mr-1" />Exporter JSON
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Versions totales</p>
            <p className="text-3xl font-bold">{sortedVersions.length}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Version actuelle</p>
            <p className="text-3xl font-bold">V{employee.currentVersion?.versionNumber ?? "—"}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-xs text-muted-foreground">Créé le</p>
            <p className="text-sm font-semibold mt-2">{new Date(employee.createdAt).toLocaleDateString("fr-FR")}</p>
          </Card>
        </div>

        {/* Date filters */}
        <div className="flex gap-3 items-end flex-wrap">
          <div>
            <p className="text-xs text-muted-foreground mb-1">De</p>
            <Input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} className="h-8 text-sm w-36" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">À</p>
            <Input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} className="h-8 text-sm w-36" />
          </div>
          {(filterFrom || filterTo) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterFrom(""); setFilterTo(""); }}>
              Réinitialiser
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto self-center">
            {filtered.length} / {sortedVersions.length} version(s)
          </span>
        </div>

        {/* Timeline */}
        {filtered.length === 0 ? (
          <EmptyState title="Aucune version" description="Aucune version ne correspond aux filtres sélectionnés." />
        ) : (
          <div className="relative space-y-0">
            {/* Vertical connector line */}
            <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-border" aria-hidden />

            {filtered.map((v, idx) => {
              const isCurrent = v.id === employee.currentVersion?.id;
              const isExpanded = expandedId === v.id;
              const prevVersion = idx > 0 ? filtered[idx - 1] : undefined;
              const diffs = isExpanded && prevVersion ? getDiff(v, prevVersion) : [];
              const status = getExpirationStatus(v.dateExpiration);
              const config = EXPIRATION_COLOR_CONFIG[status];

              return (
                <div key={v.id} className="relative flex gap-4 pb-4">
                  {/* Timeline node */}
                  <div className={cn(
                    "relative z-10 flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold",
                    isCurrent
                      ? "bg-primary border-primary text-primary-foreground"
                      : "bg-background border-border text-muted-foreground"
                  )}>
                    {v.versionNumber}
                  </div>

                  {/* Version card */}
                  <Card className={cn("flex-1", isCurrent && "border-primary")}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between flex-wrap gap-1">
                        <div className="flex items-center gap-2">
                          <span>Version {v.versionNumber}</span>
                          {isCurrent && <Badge variant="default" className="text-xs">Actuelle</Badge>}
                          <Badge className={cn("text-xs", config.textColor)}>{config.name}</Badge>
                        </div>
                        <span className="text-xs font-normal text-muted-foreground">
                          Créée le {new Date(v.createdAt).toLocaleDateString("fr-FR")}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-xs space-y-3">
                      {/* Version data grid */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <span className="text-muted-foreground">N° titre</span>
                        <span className="font-mono">{v.nDeTitre}</span>

                        <span className="text-muted-foreground">Fonction</span>
                        <span>{v.fonction}</span>

                        <span className="text-muted-foreground">Division</span>
                        <span>{v.division}</span>

                        {v.service && <>
                          <span className="text-muted-foreground">Service</span>
                          <span>{v.service}</span>
                        </>}

                        {v.equipe && <>
                          <span className="text-muted-foreground">Équipe</span>
                          <span>{v.equipe}</span>
                        </>}

                        <span className="text-muted-foreground">ST codes</span>
                        <span className="font-mono">{v.stCodes.length > 0 ? v.stCodes.join(", ") : "—"}</span>

                        <span className="text-muted-foreground">HT codes</span>
                        <span className="font-mono">{v.htCodes.length > 0 ? v.htCodes.join(", ") : "—"}</span>

                        <span className="text-muted-foreground">Validation</span>
                        <span>{new Date(v.dateValidation).toLocaleDateString("fr-FR")}</span>

                        <span className="text-muted-foreground">Expiration</span>
                        <span className={cn("font-medium", config.textColor)}>
                          {new Date(v.dateExpiration).toLocaleDateString("fr-FR")}
                        </span>

                        <span className="text-muted-foreground">PDF</span>
                        <span className={v.pdfPath ? "text-green-600" : "text-muted-foreground"}>
                          {v.pdfPath
                            ? <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{v.pdfPath}</span>
                            : "—"}
                        </span>
                      </div>

                      {/* Diff toggle / initial label */}
                      {idx === 0 ? (
                        <p className="text-muted-foreground italic">Version initiale</p>
                      ) : prevVersion && (
                        <Button
                          variant="ghost" size="sm" className="h-6 text-xs px-1"
                          onClick={() => setExpandedId(isExpanded ? null : v.id)}
                        >
                          {isExpanded
                            ? <><ChevronUp className="w-3 h-3 mr-1" />Masquer les changements</>
                            : <><ChevronDown className="w-3 h-3 mr-1" />Voir les changements vs V{prevVersion.versionNumber}</>
                          }
                        </Button>
                      )}

                      {/* Diff panel */}
                      {isExpanded && (
                        <div className="pt-2 border-t space-y-1.5">
                          {diffs.length === 0 ? (
                            <p className="text-muted-foreground">Aucun changement détecté</p>
                          ) : diffs.map(d => (
                            <div key={d.field}>
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
                    </CardContent>
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
