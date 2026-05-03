import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, RefreshCw, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface PendingRenewal {
  id: number;
  employeeId: number;
  matricule: string;
  prenom: string;
  nom: string;
  currentExpirationDate: string;
  renewalExpirationDate: string;
  status: string;
}

export default function PendingRenewals() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [renewals, setRenewals] = useState<PendingRenewal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Confirmation dialogs
  const [activateConfirm, setActivateConfirm] = useState<{
    open: boolean;
    renewalId?: number;
  }>({ open: false });

  const [cancelConfirm, setCancelConfirm] = useState<{
    open: boolean;
    renewalId?: number;
  }>({ open: false });

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setIsLoading(true);
      const res = await fetch("/api/renewals");
      if (!res.ok) throw new Error("Failed to fetch renewals");
      const data = await res.json();
      setRenewals(data);
    } catch (error) {
      console.error("Failed to fetch renewals:", error);
      toast({
        title: "Error",
        description: "Failed to load pending renewals",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  // Filter renewals
  const filteredRenewals = renewals.filter((renewal) => {
    // Search filter
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      renewal.matricule.toLowerCase().includes(searchLower) ||
      renewal.nom.toLowerCase().includes(searchLower) ||
      renewal.prenom.toLowerCase().includes(searchLower);

    if (!matchesSearch) return false;

    // Status filter
    if (filterStatus !== "all" && renewal.status !== filterStatus) return false;

    return true;
  });

  // Calculate days until expiration
  function getDaysUntilExpiration(dateStr: string): number {
    const today = new Date();
    const expirationDate = new Date(dateStr);
    const daysUntilExpiration = Math.floor(
      (expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
    );
    return daysUntilExpiration;
  }

  // Get alert level
  function getAlertLevel(daysUntilExpiration: number): string {
    if (daysUntilExpiration < 0) return "EXPIRED";
    if (daysUntilExpiration < 90) return "CRITICAL";
    if (daysUntilExpiration < 180) return "WARNING";
    if (daysUntilExpiration < 270) return "CAUTION";
    return "NORMAL";
  }

  // Get alert color
  function getAlertColor(alertLevel: string): string {
    switch (alertLevel) {
      case "EXPIRED":
        return "bg-red-100 text-red-900";
      case "CRITICAL":
        return "bg-red-50 text-red-700";
      case "WARNING":
        return "bg-orange-50 text-orange-700";
      case "CAUTION":
        return "bg-yellow-50 text-yellow-700";
      default:
        return "";
    }
  }

  // Format date
  function formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  // Activate renewal
  async function activateRenewal(renewalId: number) {
    try {
      const res = await fetch(`/api/renewals/${renewalId}/activate`, {
        method: "POST",
      });

      if (!res.ok) {
        throw new Error("Failed to activate renewal");
      }

      toast({
        title: "Success",
        description: "Renewal activated successfully",
      });

      setActivateConfirm({ open: false });
      await fetchData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to activate renewal";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    }
  }

  // Cancel renewal
  async function cancelRenewal(renewalId: number) {
    try {
      const res = await fetch(`/api/renewals/${renewalId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to cancel renewal");
      }

      toast({
        title: "Success",
        description: "Renewal cancelled",
      });

      setCancelConfirm({ open: false });
      await fetchData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to cancel renewal";
      toast({
        title: "Error",
        description: message,
        variant: "destructive",
      });
    }
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <LoadingSpinner />
        </div>
      </Layout>
    );
  }

  if (renewals.length === 0) {
    return (
      <Layout>
        <div className="flex items-center gap-2 mb-6">
          <Link to="/employees">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">Pending Renewals</h1>
        </div>

        <EmptyState
          title="No pending renewals"
          description="When employees are due for renewal, they will appear here"
        />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link to="/employees">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
            </Link>
            <h1 className="text-3xl font-bold">Pending Renewals</h1>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <Input
            placeholder="Search matricule, nom, prénom..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 min-w-[300px]"
          />

          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Alert Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="EXPIRED">Expired</SelectItem>
              <SelectItem value="CRITICAL">Critical</SelectItem>
              <SelectItem value="WARNING">Warning</SelectItem>
              <SelectItem value="CAUTION">Caution</SelectItem>
              <SelectItem value="NORMAL">Normal</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Results info */}
        <div className="text-sm text-gray-600">
          Showing {filteredRenewals.length} of {renewals.length} pending renewals
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead className="font-semibold">Matricule</TableHead>
                <TableHead className="font-semibold">Nom</TableHead>
                <TableHead className="font-semibold">Prénom</TableHead>
                <TableHead className="font-semibold">Current Exp.</TableHead>
                <TableHead className="font-semibold">Renewal Exp.</TableHead>
                <TableHead className="font-semibold">Days Left</TableHead>
                <TableHead className="font-semibold">Alert Level</TableHead>
                <TableHead className="font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRenewals.map((renewal) => {
                const daysLeft = getDaysUntilExpiration(
                  renewal.renewalExpirationDate
                );
                const alertLevel = getAlertLevel(daysLeft);
                const alertColor = getAlertColor(alertLevel);

                return (
                  <TableRow
                    key={renewal.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => navigate(`/employee/${renewal.employeeId}`)}
                  >
                    <TableCell>{renewal.matricule}</TableCell>
                    <TableCell>{renewal.nom}</TableCell>
                    <TableCell>{renewal.prenom}</TableCell>
                    <TableCell>{formatDate(renewal.currentExpirationDate)}</TableCell>
                    <TableCell>{formatDate(renewal.renewalExpirationDate)}</TableCell>
                    <TableCell>{Math.max(0, daysLeft)} days</TableCell>
                    <TableCell>
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${alertColor}`}
                      >
                        {alertLevel}
                      </span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setActivateConfirm({
                              open: true,
                              renewalId: renewal.id,
                            });
                          }}
                        >
                          <Check className="mr-2 h-4 w-4" />
                          Activate
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setCancelConfirm({
                              open: true,
                              renewalId: renewal.id,
                            });
                          }}
                        >
                          <X className="mr-2 h-4 w-4" />
                          Cancel
                        </Button>
                        <Link to={`/employee/${renewal.employeeId}`}>
                          <Button variant="ghost" size="sm">
                            View
                          </Button>
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Activate Confirmation */}
      <ConfirmDialog
        open={activateConfirm.open}
        onOpenChange={(open) =>
          setActivateConfirm({ ...activateConfirm, open })
        }
        title="Activate Renewal"
        description="Are you sure you want to activate this renewal? The new habilitation will become effective immediately."
        onConfirm={() => {
          if (activateConfirm.renewalId) {
            activateRenewal(activateConfirm.renewalId);
          }
        }}
      />

      {/* Cancel Confirmation */}
      <ConfirmDialog
        open={cancelConfirm.open}
        onOpenChange={(open) =>
          setCancelConfirm({ ...cancelConfirm, open })
        }
        title="Cancel Renewal"
        description="Are you sure you want to cancel this pending renewal?"
        onConfirm={() => {
          if (cancelConfirm.renewalId) {
            cancelRenewal(cancelConfirm.renewalId);
          }
        }}
      />
    </Layout>
  );
}
