import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import { Download, Eye, RefreshCw, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

type Period = "3m" | "6m" | "9m" | "annual";

interface ReportEmployee {
  matricule: string;
  nom: string;
  prenom: string;
  fonction: string;
  division: string;
  service: string;
  stCodes: string[];
  htCodes: string[];
  dateValidation: string;
  dateExpiration: string;
  nDeTitre: string;
  daysUntilExpiration: number;
}

interface ReportData {
  period: Period;
  generatedAt: string;
  summary: { total: number; expired: number; expiring: number };
  employees: ReportEmployee[];
}

const PERIODS: { value: Period; label: string; color: string }[] = [
  { value: "3m",     label: "3 mois",   color: "text-red-600 border-red-300 bg-red-50" },
  { value: "6m",     label: "6 mois",   color: "text-orange-600 border-orange-300 bg-orange-50" },
  { value: "9m",     label: "9 mois",   color: "text-yellow-600 border-yellow-300 bg-yellow-50" },
  { value: "annual", label: "Annuel",   color: "text-blue-600 border-blue-300 bg-blue-50" },
];

function rowColor(days: number) {
  if (days < 0) return "bg-red-50 text-red-700";
  if (days <= 90) return "bg-orange-50 text-orange-700";
  if (days <= 180) return "bg-yellow-50 text-yellow-800";
  return "";
}

function daysBadge(days: number) {
  if (days < 0) return <Badge variant="destructive">{Math.abs(days)}j exp.</Badge>;
  if (days <= 90) return <Badge className="bg-orange-500">{days}j</Badge>;
  if (days <= 180) return <Badge className="bg-yellow-500 text-yellow-900">{days}j</Badge>;
  return <Badge variant="secondary">{days}j</Badge>;
}

export default function Reports() {
  const [period, setPeriod] = useState<Period>("3m");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [viewingPdf, setViewingPdf] = useState(false);
  const token = localStorage.getItem("token");

  async function load(p: Period) {
    setLoading(true);
    setError(false);
    setViewingPdf(false);
    try {
      const res = await fetch(`/api/reports/expiration?period=${p}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.success) setData(json.data);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(period); }, [period]);

  async function handleDownloadPdf() {
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/reports/expiration/pdf?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rapport_habilitation_${period}_${new Date().toISOString().slice(0,10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* silent */
    } finally {
      setPdfLoading(false);
    }
  }

  function handleViewPdf() {
    setViewingPdf(v => !v);
  }

  const pdfUrl = `/api/reports/expiration/pdf?period=${period}&token=${token}`;

  return (
    <Layout>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Rapports d'habilitation</h1>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => load(period)} disabled={loading}>
              <RefreshCw className={cn("w-4 h-4 mr-1", loading && "animate-spin")} />Actualiser
            </Button>
            <Button variant="outline" size="sm" onClick={handleViewPdf} disabled={loading}>
              <Eye className="w-4 h-4 mr-1" />{viewingPdf ? "Masquer PDF" : "Voir PDF"}
            </Button>
            <Button size="sm" onClick={handleDownloadPdf} disabled={pdfLoading || loading}>
              <Download className={cn("w-4 h-4 mr-1", pdfLoading && "animate-spin")} />
              {pdfLoading ? "Génération..." : "Télécharger PDF"}
            </Button>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex gap-3">
          {PERIODS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={cn(
                "px-4 py-2 rounded-lg border-2 font-medium text-sm transition-colors",
                period === p.value ? p.color : "border-border text-muted-foreground hover:border-primary/40"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* PDF viewer */}
        {viewingPdf && (
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Aperçu PDF — {PERIODS.find(p => p.value === period)?.label}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setViewingPdf(false)}>✕</Button>
            </CardHeader>
            <CardContent className="p-0">
              <iframe
                src={pdfUrl}
                className="w-full rounded-b-lg"
                style={{ height: "70vh" }}
                title="Rapport PDF"
              />
            </CardContent>
          </Card>
        )}

        {/* Summary cards */}
        {loading ? (
          <div className="grid grid-cols-3 gap-4">
            {[0,1,2].map(i => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : data && (
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total concernés</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-bold">{data.summary.total}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Expirés</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-bold text-red-600">{data.summary.expired}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">À renouveler</CardTitle></CardHeader>
              <CardContent><p className="text-3xl font-bold text-orange-600">{data.summary.expiring}</p></CardContent>
            </Card>
          </div>
        )}

        {/* Employee table */}
        {loading ? (
          <Card>
            <CardContent className="p-4 space-y-2">
              {Array(8).fill(0).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </CardContent>
          </Card>
        ) : error ? (
          <EmptyState
            title="Erreur de chargement"
            description="Impossible de charger le rapport. Vérifiez la connexion."
          />
        ) : !data || data.employees.length === 0 ? (
          <EmptyState
            title="Aucun employé concerné"
            description={`Aucun employé n'expire dans les ${PERIODS.find(p => p.value === period)?.label}.`}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Employés — {PERIODS.find(p => p.value === period)?.label}
                <Badge variant="outline" className="ml-1">{data.employees.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[90px]">Matricule</TableHead>
                    <TableHead>Nom Prénom</TableHead>
                    <TableHead>Fonction</TableHead>
                    <TableHead>Division</TableHead>
                    <TableHead>ST / HT</TableHead>
                    <TableHead>Expiration</TableHead>
                    <TableHead className="text-right">Jours</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.employees.map(emp => (
                    <TableRow key={emp.matricule} className={rowColor(emp.daysUntilExpiration)}>
                      <TableCell className="font-mono text-xs">{emp.matricule}</TableCell>
                      <TableCell className="font-medium">{emp.prenom} {emp.nom}</TableCell>
                      <TableCell className="text-sm">{emp.fonction}</TableCell>
                      <TableCell className="text-sm truncate max-w-[150px]">{emp.division}</TableCell>
                      <TableCell className="text-xs font-mono">
                        {emp.stCodes.length > 0 ? emp.stCodes.join(",") : "—"} / {emp.htCodes.length > 0 ? emp.htCodes.join(",") : "—"}
                      </TableCell>
                      <TableCell className="text-sm">{new Date(emp.dateExpiration).toLocaleDateString("fr-FR")}</TableCell>
                      <TableCell className="text-right">{daysBadge(emp.daysUntilExpiration)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
