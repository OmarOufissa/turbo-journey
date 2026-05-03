import { Layout } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RefreshCw, AlertCircle, Calendar, CheckCircle2, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Employee, Habilitation } from "@/types";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

interface RenewalHabilitation extends Habilitation {
  employee: Employee;
  daysUntilExpiry: number;
  severityLevel: "critical" | "warning" | "upcoming";
}

function getSeverityLevel(
  daysUntilExpiry: number
): "critical" | "warning" | "upcoming" {
  if (daysUntilExpiry <= 7) return "critical";
  if (daysUntilExpiry <= 30) return "warning";
  return "upcoming";
}

function getSeverityColor(severity: "critical" | "warning" | "upcoming") {
  switch (severity) {
    case "critical":
      return "border-red-500 bg-red-50 dark:bg-red-950/30";
    case "warning":
      return "border-orange-500 bg-orange-50 dark:bg-orange-950/30";
    case "upcoming":
      return "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30";
  }
}

function getSeverityBadgeColor(severity: "critical" | "warning" | "upcoming") {
  switch (severity) {
    case "critical":
      return "bg-red-500/20 text-red-700 dark:text-red-400";
    case "warning":
      return "bg-orange-500/20 text-orange-700 dark:text-orange-400";
    case "upcoming":
      return "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400";
  }
}

interface RenewalDialogState {
  habId: number;
  open: boolean;
}

export default function RenewalsImproved() {
  const { toast } = useToast();
  const [habilitations, setHabilitations] = useState<RenewalHabilitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState<
    "all" | "critical" | "warning" | "upcoming"
  >("all");
  const [renewalDialog, setRenewalDialog] = useState<RenewalDialogState>({
    habId: 0,
    open: false,
  });
  const [newValidationDate, setNewValidationDate] = useState("");
  const [savingId, setSavingId] = useState<number | null>(null);
  const [selectedForBulk, setSelectedForBulk] = useState<Set<number>>(new Set());

  // Get current year for display
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const fetchExpiringHabilitations = async () => {
      try {
        const response = await fetch("/api/employees", {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("token")}`,
          },
        });

        if (!response.ok) throw new Error("Failed to fetch data");

        const employees = await response.json();

        const today = new Date();
        const ninetyDaysFromNow = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

        const expiring: RenewalHabilitation[] = [];

        employees.forEach((emp: any) => {
          if (emp.habilitations) {
            emp.habilitations.forEach((hab: any) => {
              const expDate = new Date(hab.date_expiration);

              if (expDate > today && expDate <= ninetyDaysFromNow) {
                const daysUntilExpiry = Math.ceil(
                  (expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
                );

                expiring.push({
                  ...hab,
                  employee: {
                    id: emp.id,
                    matricule: emp.matricule,
                    nom: emp.nom,
                    prenom: emp.prenom,
                    division: emp.division,
                    service: emp.service,
                    equipe: emp.equipe,
                  },
                  daysUntilExpiry,
                  severityLevel: getSeverityLevel(daysUntilExpiry),
                });
              }
            });
          }
        });

        setHabilitations(
          expiring.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Erreur de chargement";
        toast({
          title: "Erreur",
          description: message,
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchExpiringHabilitations();
  }, []);

  const filtered =
    filterSeverity === "all"
      ? habilitations
      : habilitations.filter((h) => h.severityLevel === filterSeverity);

  const handleOpenRenewalDialog = (habId: number) => {
    // Auto-fill with one year from expiration date
    const hab = habilitations.find((h) => h.id === habId);
    if (hab) {
      const expDate = new Date(hab.date_expiration);
      const nextYear = new Date(expDate.getFullYear() + 1, expDate.getMonth(), expDate.getDate());
      setNewValidationDate(nextYear.toISOString().split("T")[0]);
    }
    setRenewalDialog({ habId, open: true });
  };

  const handleRenewal = async () => {
    if (!newValidationDate) {
      toast({
        title: "Erreur",
        description: "Veuillez sélectionner une date de validation",
        variant: "destructive",
      });
      return;
    }

    setSavingId(renewalDialog.habId);

    try {
      const response = await fetch(`/api/habilitations/${renewalDialog.habId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          date_validation: newValidationDate,
        }),
      });

      if (!response.ok) throw new Error("Erreur lors du renouvellement");

      toast({
        title: "Succès",
        description: "Habilitation renouvelée avec succès",
      });

      setHabilitations((prev) =>
        prev.filter((h) => h.id !== renewalDialog.habId)
      );
      setRenewalDialog({ habId: 0, open: false });
      setNewValidationDate("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Erreur lors du renouvellement";
      toast({
        title: "Erreur",
        description: message,
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  const handleBulkRenewal = () => {
    if (selectedForBulk.size === 0) {
      toast({
        title: "Aucune sélection",
        description: "Veuillez sélectionner au moins une habilitation",
      });
      return;
    }
    // Implement bulk renewal logic
    toast({
      title: "Renouvellement en masse",
      description: `${selectedForBulk.size} habilitation(s) en cours de renouvellement...`,
    });
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <LoadingSpinner />
        </div>
      </Layout>
    );
  }

  const stats = {
    critical: filtered.filter((h) => h.severityLevel === "critical").length,
    warning: filtered.filter((h) => h.severityLevel === "warning").length,
    upcoming: filtered.filter((h) => h.severityLevel === "upcoming").length,
  };

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-3xl font-bold gradient-text">
              Renouvellement des Habilitations {currentYear}
            </h1>
            <p className="text-muted-foreground mt-2">
              Gérez le renouvellement des habilitations expirant dans les 90 prochains jours
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass p-4 rounded-lg border-l-4 border-red-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase">Critique</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                  {stats.critical}
                </p>
              </div>
              <AlertCircle className="w-8 h-8 text-red-500/40" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Expire dans 7 jours</p>
          </div>

          <div className="glass p-4 rounded-lg border-l-4 border-orange-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase">Attention</p>
                <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">
                  {stats.warning}
                </p>
              </div>
              <Clock className="w-8 h-8 text-orange-500/40" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Expire dans 30 jours</p>
          </div>

          <div className="glass p-4 rounded-lg border-l-4 border-yellow-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase">À venir</p>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">
                  {stats.upcoming}
                </p>
              </div>
              <Calendar className="w-8 h-8 text-yellow-500/40" />
            </div>
            <p className="text-xs text-muted-foreground mt-2">Expire dans 90 jours</p>
          </div>
        </div>

        {/* Filter and Bulk Actions */}
        <div className="glass p-4 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex-1">
            <Select
              value={filterSeverity}
              onValueChange={(value: any) => setFilterSeverity(value)}
            >
              <SelectTrigger className="w-full sm:w-64 glass-input">
                <SelectValue placeholder="Filtrer par priorité" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les priorités</SelectItem>
                <SelectItem value="critical">Critique (≤ 7 jours)</SelectItem>
                <SelectItem value="warning">Attention (≤ 30 jours)</SelectItem>
                <SelectItem value="upcoming">À venir (≤ 90 jours)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedForBulk.size > 0 && (
            <Button
              onClick={handleBulkRenewal}
              className="gap-2 w-full sm:w-auto"
            >
              <RefreshCw className="w-4 h-4" />
              Renouveler {selectedForBulk.size} sélectionné(s)
            </Button>
          )}
        </div>

        {/* Cards Grid */}
        {filtered.length === 0 ? (
          <div className="glass p-12 rounded-lg text-center space-y-4">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
            <h2 className="text-lg font-semibold">
              Aucune habilitation à renouveler
            </h2>
            <p className="text-muted-foreground">
              {filterSeverity === "all"
                ? "Toutes les habilitations sont à jour pour les 90 prochains jours"
                : "Aucune habilitation ne correspond à ce filtre"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((hab) => (
              <div
                key={hab.id}
                className={cn(
                  "glass p-6 rounded-lg border-l-4 transition-all hover:shadow-lg",
                  getSeverityColor(hab.severityLevel),
                  selectedForBulk.has(hab.id) && "ring-2 ring-blue-500"
                )}
              >
                {/* Checkbox for bulk selection */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <input
                      type="checkbox"
                      checked={selectedForBulk.has(hab.id)}
                      onChange={(e) => {
                        const newSelected = new Set(selectedForBulk);
                        if (e.target.checked) {
                          newSelected.add(hab.id);
                        } else {
                          newSelected.delete(hab.id);
                        }
                        setSelectedForBulk(newSelected);
                      }}
                      className="mr-3 w-4 h-4 cursor-pointer"
                    />
                  </div>
                  <span
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-semibold",
                      getSeverityBadgeColor(hab.severityLevel)
                    )}
                  >
                    {hab.daysUntilExpiry} jours
                  </span>
                </div>

                {/* Employee Info */}
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-foreground">
                    {hab.employee.nom} {hab.employee.prenom}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {hab.employee.matricule}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {hab.employee.service} • {hab.employee.equipe}
                  </p>
                </div>

                {/* Habilitation Details */}
                <div className="mb-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Type:</span>
                    <span className="text-sm font-mono bg-blue-500/20 px-2 py-1 rounded">
                      {hab.type === "HT" ? "Habilitation HT" : "Habilitation ST"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">Codes:</span>
                    <div className="flex flex-wrap gap-1">
                      {hab.codes.slice(0, 3).map((code) => (
                        <span
                          key={code}
                          className="text-xs font-mono bg-white/10 px-2 py-1 rounded"
                        >
                          {code}
                        </span>
                      ))}
                      {hab.codes.length > 3 && (
                        <span className="text-xs text-muted-foreground px-2 py-1">
                          +{hab.codes.length - 3} plus
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm">
                      Expire le{" "}
                      <span className="font-semibold">
                        {new Date(hab.date_expiration).toLocaleDateString("fr-FR")}
                      </span>
                    </span>
                  </div>
                </div>

                {/* Action Button */}
                <Button
                  onClick={() => handleOpenRenewalDialog(hab.id)}
                  disabled={savingId === hab.id}
                  className="w-full gap-2"
                >
                  {savingId === hab.id ? (
                    <>Renouvellement...</>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      Renouveler
                    </>
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Renewal Dialog */}
      <AlertDialog
        open={renewalDialog.open}
        onOpenChange={(open) =>
          setRenewalDialog({ ...renewalDialog, open })
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Renouveler l'habilitation</AlertDialogTitle>
            <AlertDialogDescription>
              Entrez la nouvelle date de validation. La date d'expiration sera automatiquement
              calculée pour 1 an.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-date">Nouvelle date de validation</Label>
              <Input
                id="new-date"
                type="date"
                value={newValidationDate}
                onChange={(e) => setNewValidationDate(e.target.value)}
                className="glass-input"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <AlertDialogCancel
              onClick={() => {
                setNewValidationDate("");
              }}
            >
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRenewal}
              disabled={!newValidationDate || savingId === renewalDialog.habId}
            >
              {savingId === renewalDialog.habId ? "Renouvellement..." : "Renouveler"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
