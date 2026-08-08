import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  FileText,
  Clock,
  AlertCircle,
  Download,
  Eye,
  Edit2,
  Plus,
  History,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

interface Employee {
  id: number;
  matricule: string;
  nom: string;
  prenom: string;
  fonction: string;
  divisionId: number;
  divisionName?: string;
  serviceId: number;
  serviceName?: string;
  equipeId: number;
  equipeName?: string;
  status: string;
  createdAt: string;
}

interface Habilitation {
  id: number;
  stCodes: string[];
  htCodes: string[];
  numero: string;
  dateValidation: string;
  dateExpiration: string;
  pdfPath?: string;
}

interface VersionEntry {
  id: number;
  version: number;
  createdAt: string;
  action: string;
  createdBy: string;
  snapshot: any;
}

export default function EmployeeCard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [habilitations, setHabilitations] = useState<Habilitation[]>([]);
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedVersions, setExpandedVersions] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchData();
  }, [id]);

  async function fetchData() {
    try {
      setIsLoading(true);

      // Fetch employee
      const empRes = await fetch(`/api/employees/${id}`);
      if (!empRes.ok) throw new Error("Failed to fetch employee");
      const empData = await empRes.json();

      // Fetch divisions
      const divRes = await fetch("/api/divisions");
      const divData = await divRes.json();

      // Fetch services
      const svcRes = await fetch("/api/services");
      const svcData = await svcRes.json();

      // Fetch equipes
      const eqpRes = await fetch("/api/equipes");
      const eqpData = await eqpRes.json();

      // Enrich employee with org names
      const enrichedEmployee = {
        ...empData,
        divisionName: divData.find((d: any) => d.id === empData.divisionId)?.name,
        serviceName: svcData.find((s: any) => s.id === empData.serviceId)?.name,
        equipeName: eqpData.find((e: any) => e.id === empData.equipeId)?.name,
      };

      // Parse habilitations
      const habs = (empData.habilitations || []).map((h: any) => ({
        ...h,
        stCodes: typeof h.stCodes === "string" ? JSON.parse(h.stCodes) : h.stCodes || [],
        htCodes: typeof h.htCodes === "string" ? JSON.parse(h.htCodes) : h.htCodes || [],
      }));

      setEmployee(enrichedEmployee);
      setHabilitations(habs);

      // Fetch version history
      const versRes = await fetch(`/api/employees/${id}/versions`);
      if (versRes.ok) {
        const versData = await versRes.json();
        setVersions(versData);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast({
        title: "Error",
        description: "Failed to load employee",
        variant: "destructive",
      });
      navigate("/employees");
    } finally {
      setIsLoading(false);
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case "ACTIVE":
        return "bg-green-100 text-green-900";
      case "EXPIRED":
        return "bg-red-100 text-red-900";
      case "PENDING_RENEWAL":
        return "bg-yellow-100 text-yellow-900";
      default:
        return "bg-gray-100 text-gray-900";
    }
  }

  function getExpirationColor(dateExpiration: string | undefined): string {
    if (!dateExpiration) return "";

    const today = new Date();
    const expirationDate = new Date(dateExpiration);
    const daysUntilExpiration = Math.floor(
      (expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (expirationDate < today) return "text-red-900 bg-red-100";
    if (daysUntilExpiration < 90) return "text-red-700 bg-red-50";
    if (daysUntilExpiration < 180) return "text-orange-700 bg-orange-50";
    if (daysUntilExpiration < 270) return "text-yellow-700 bg-yellow-50";

    return "";
  }

  function formatDate(dateStr: string | undefined): string {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  function formatHabilitations(hab: Habilitation): string {
    const parts: string[] = [];

    if (hab.stCodes && hab.stCodes.length > 0) {
      parts.push(`ST: ${hab.stCodes.join(", ")}`);
    }

    if (hab.htCodes && hab.htCodes.length > 0) {
      parts.push(`HT: ${hab.htCodes.join(", ")}`);
    }

    return parts.join(" / ");
  }

  function toggleVersionExpand(versionId: number) {
    const newExpanded = new Set(expandedVersions);
    if (newExpanded.has(versionId)) {
      newExpanded.delete(versionId);
    } else {
      newExpanded.add(versionId);
    }
    setExpandedVersions(newExpanded);
  }

  if (isLoading || !employee) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <LoadingSpinner />
        </div>
      </Layout>
    );
  }

  const currentHab = habilitations[0];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link to="/employees">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold">
                {employee.prenom} {employee.nom}
              </h1>
              <p className="text-gray-600">{employee.matricule}</p>
            </div>
          </div>

          <Badge className={getStatusColor(employee.status)}>
            {employee.status}
          </Badge>
        </div>

        {/* Current Data Section */}
        <Card>
          <CardHeader>
            <CardTitle>Information Actuelle</CardTitle>
            <CardDescription>Current employee data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-gray-600">Fonction</p>
                <p className="font-semibold">{employee.fonction}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Division</p>
                <p className="font-semibold">{employee.divisionName || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Service</p>
                <p className="font-semibold">{employee.serviceName || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Équipe</p>
                <p className="font-semibold">{employee.equipeName || "-"}</p>
              </div>
            </div>

            {currentHab && (
              <>
                <div className="border-t pt-4">
                  <p className="text-sm text-gray-600 mb-2">Habilitations</p>
                  <p className="font-semibold">{formatHabilitations(currentHab)}</p>
                  {currentHab.numero && (
                    <p className="text-sm text-gray-600">N°: {currentHab.numero}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Date Validation</p>
                    <p className="font-semibold">
                      {formatDate(currentHab.dateValidation)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Date Expiration</p>
                    <p
                      className={`font-semibold rounded px-2 py-1 inline-block ${getExpirationColor(currentHab.dateExpiration)}`}
                    >
                      {formatDate(currentHab.dateExpiration)}
                    </p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* PDF Section */}
        {currentHab && (
          <Card>
            <CardHeader>
              <CardTitle>Document PDF</CardTitle>
              <CardDescription>Habilitation certificate</CardDescription>
            </CardHeader>
            <CardContent>
              {currentHab.pdfPath ? (
                <div className="flex items-center gap-3">
                  <FileText className="h-8 w-8 text-blue-600" />
                  <div className="flex-1">
                    <p className="font-semibold">{currentHab.numero || "PDF"}</p>
                    <p className="text-sm text-gray-600">PDF attached</p>
                  </div>
                  <Button variant="outline" size="sm">
                    <Eye className="mr-2 h-4 w-4" />
                    View
                  </Button>
                  <Button variant="outline" size="sm">
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </Button>
                </div>
              ) : (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No PDF Attached</AlertTitle>
                  <AlertDescription>
                    Upload or generate a PDF for this habilitation
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Link to={`/employee/${employee.id}/edit`}>
            <Button>
              <Edit2 className="mr-2 h-4 w-4" />
              Edit
            </Button>
          </Link>

          {employee.status !== "ACTIVE" && (
            <Button variant="outline">
              <Plus className="mr-2 h-4 w-4" />
              Create Renewal
            </Button>
          )}

          <Link to={`/employees/${employee.id}/history`}>
            <Button variant="outline">
              <History className="mr-2 h-4 w-4" />
              View History
            </Button>
          </Link>
        </div>

        {/* Version Timeline */}
        {versions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Version History</CardTitle>
              <CardDescription>All changes made to this employee</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {versions.map((version, index) => (
                  <div
                    key={version.id}
                    className="border rounded-lg p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleVersionExpand(version.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">v{version.version}</Badge>
                          <p className="font-semibold text-sm">{version.action}</p>
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {formatDate(version.createdAt)} by {version.createdBy}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm">
                        {expandedVersions.has(version.id) ? "Hide" : "Show"}
                      </Button>
                    </div>

                    {expandedVersions.has(version.id) && (
                      <div className="mt-4 p-3 bg-gray-50 rounded text-sm font-mono">
                        <pre>{JSON.stringify(version.snapshot, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
