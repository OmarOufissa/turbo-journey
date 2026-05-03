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
import { RefreshCw, AlertCircle, Calendar, Archive, Download } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { exportRenewalsToExcel } from "@/utils/exportToExcel";
import { Employee, Habilitation, HT_CODES, ST_CODES } from "@/types";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

interface RenewalHabilitation extends Habilitation {
  employee: Employee;
  daysUntilExpiry: number;
  expirationCategory: "1month" | "2months" | "3months";
}

interface RenewalData {
  codes: string[];
  newValidationDate: string;
  newNumero: string;
  newType?: "HT" | "ST";
}

function getExpirationCategory(
  daysUntilExpiry: number
): "1month" | "2months" | "3months" {
  if (daysUntilExpiry <= 30) return "1month";
  if (daysUntilExpiry <= 60) return "2months";
  return "3months";
}

function getCategoryColor(category: "1month" | "2months" | "3months") {
  switch (category) {
    case "1month":
      return "border-red-500 bg-red-50 dark:bg-red-950/30";
    case "2months":
      return "border-orange-500 bg-orange-50 dark:bg-orange-950/30";
    case "3months":
      return "border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30";
  }
}

function getCategoryLabel(category: "1month" | "2months" | "3months") {
  switch (category) {
    case "1month":
      return "Expire dans 1 mois";
    case "2months":
      return "Expire dans 2 mois";
    case "3months":
      return "Expire dans 3 mois";
  }
}

export default function Renewals() {
  const { toast } = useToast();
  const [habilitations, setHabilitations] = useState<RenewalHabilitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<
    "all" | "1month" | "2months" | "3months"
  >("all");
  const [renewalData, setRenewalData] = useState<{
    [key: number]: RenewalData;
  }>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

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
        const thirtyDaysFromNow = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
        const ninetyDaysFromNow = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

        const expiring: RenewalHabilitation[] = [];

        employees.forEach((emp: any) => {
          if (emp.habilitations) {
            emp.habilitations.forEach((hab: any) => {
              const expDate = new Date(hab.date_expiration);

              // Only include if expiring within 90 days but not expired
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
                  expirationCategory: getExpirationCategory(daysUntilExpiry),
                });
              }
            });
          }
        });

        setHabilitations(
          expiring.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry)
        );

        // Initialize renewal data
        const initData: { [key: number]: RenewalData } = {};
        expiring.forEach((hab) => {
          initData[hab.id] = {
            codes: [...hab.codes],
            newValidationDate: "",
            newNumero: hab.numero || "",
            newType: hab.type,
          };
        });
        setRenewalData(initData);
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

  const filtered = filterCategory === "all" 
    ? habilitations
    : habilitations.filter((h) => h.expirationCategory === filterCategory);

  const getAvailableCodes = (type: "HT" | "ST") => {
    return type === "HT" ? HT_CODES : ST_CODES;
  };

  const handleCodeToggle = (habId: number, code: string) => {
    setRenewalData((prev) => {
      const hab = prev[habId];
      const codes = hab?.codes || [];
      const newCodes = codes.includes(code)
        ? codes.filter((c) => c !== code)
        : [...codes, code];
      return {
        ...prev,
        [habId]: {
          ...hab,
          codes: newCodes,
        },
      };
    });
  };

  const handleRenewal = async (hab: RenewalHabilitation) => {
    const data = renewalData[hab.id];
    if (!data?.newValidationDate) {
      toast({
        title: "Erreur",
        description: "Veuillez sélectionner une date de validation",
        variant: "destructive",
      });
      return;
    }

    if (!data.codes || data.codes.length === 0) {
      toast({
        title: "Erreur",
        description: "Veuillez sélectionner au moins un code d'habilitation",
        variant: "destructive",
      });
      return;
    }

    setSavingId(hab.id);

    try {
      const response = await fetch(`/api/habilitations/${hab.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          codes: data.codes,
          numero: data.newNumero || hab.numero,
          date_validation: data.newValidationDate,
        }),
      });

      if (!response.ok) throw new Error("Erreur lors du renouvellement");

      toast({
        title: "Habilitation renouvelée",
        description: "La date d'expiration a été mise à jour",
      });

      setHabilitations((prev) => prev.filter((h) => h.id !== hab.id));

      setEditingId(null);
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

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto" />
            <p className="text-muted-foreground">
              Chargement des habilitations à renouveler...
            </p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold gradient-text">
              Renouvellement des Habilitations
            </h1>
            <p className="text-muted-foreground mt-1">
              {filtered.length} habilitation(s) à renouveler dans les 90 prochains jours
            </p>
          </div>
          {filtered.length > 0 && (
            <Button
              variant="outline"
              className="gap-2 w-full sm:w-auto"
              onClick={() => {
                exportRenewalsToExcel(
                  filtered,
                  `renouvellements_${new Date().toISOString().split('T')[0]}.xlsx`
                );
                toast({
                  title: "Export réussi",
                  description: "Les données de renouvellement ont été exportées",
                });
              }}
            >
              <Download className="w-4 h-4" />
              Exporter
            </Button>
          )}
        </div>

        {/* Filter */}
        <div className="glass p-4 rounded-xl">
          <Select
            value={filterCategory}
            onValueChange={(value: any) => setFilterCategory(value)}
          >
            <SelectTrigger className="w-full md:w-64 glass-input">
              <SelectValue placeholder="Filtrer par catégorie" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les catégories</SelectItem>
              <SelectItem value="1month">Expire dans 1 mois</SelectItem>
              <SelectItem value="2months">Expire dans 2 mois</SelectItem>
              <SelectItem value="3months">Expire dans 3 mois</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <div className="glass p-8 rounded-xl text-center space-y-4">
            <div className="text-success text-4xl">✓</div>
            <h2 className="text-lg font-semibold">
              Aucune habilitation à renouveler
            </h2>
            <p className="text-muted-foreground">
              {filterCategory === "all"
                ? "Toutes les habilitations sont à jour pour les 90 prochains jours"
                : `Aucune habilitation n'expire ${getCategoryLabel(filterCategory as any).toLowerCase()}`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((hab) => {
              const isEditing = editingId === hab.id;
              const data = renewalData[hab.id];
              const availableCodes = getAvailableCodes(hab.type);

              return (
                <div
                  key={hab.id}
                  className={cn(
                    "glass p-6 rounded-xl space-y-4 border-l-4 transition-all",
                    getCategoryColor(hab.expirationCategory)
                  )}
                >
                  {/* Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-foreground">
                        {hab.employee.nom} {hab.employee.prenom}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Matricule: {hab.employee.matricule}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Service: {hab.employee.service} • Équipe: {hab.employee.equipe}
                      </p>
                      <div className="flex gap-2 mt-3 flex-wrap">
                        <span className="inline-block px-3 py-1 rounded-lg text-sm font-semibold bg-blue-500/20 text-blue-600 dark:text-blue-400">
                          {hab.type === "HT" ? "Habilitation HT" : "Habilitation ST"}
                        </span>
                        <span className="inline-block px-3 py-1 rounded-lg text-sm font-medium">
                          <Calendar className="w-3 h-3 mr-1 inline" />
                          {hab.daysUntilExpiry} jours restants
                        </span>
                      </div>
                    </div>
                  </div>

                  {!isEditing ? (
                    <>
                      {/* Codes Display */}
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">
                          Codes d'habilitation actuels:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {hab.codes.map((code) => (
                            <span
                              key={code}
                              className="inline-block px-3 py-1 rounded-lg text-xs font-mono bg-white/10 border border-white/20"
                            >
                              {code}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Renewal Button */}
                      <Button
                        onClick={() => setEditingId(hab.id)}
                        className="glass-button w-full gap-2 mt-2"
                      >
                        <RefreshCw className="w-4 h-4" />
                        Renouveler
                      </Button>
                    </>
                  ) : (
                    <div className="space-y-4 pt-4 border-t border-white/20">
                      <h4 className="font-semibold text-sm flex items-center gap-2">
                        <RefreshCw className="w-4 h-4" />
                        Renouveler l'habilitation
                      </h4>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor={`renewal-date-${hab.id}`}>
                            Nouvelle date de validation *
                          </Label>
                          <Input
                            id={`renewal-date-${hab.id}`}
                            type="date"
                            value={data?.newValidationDate || ""}
                            onChange={(e) =>
                              setRenewalData((prev) => ({
                                ...prev,
                                [hab.id]: {
                                  ...prev[hab.id],
                                  newValidationDate: e.target.value,
                                },
                              }))
                            }
                            className="glass-input"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor={`renewal-numero-${hab.id}`}>
                            Nouveau N° de titre
                          </Label>
                          <Input
                            id={`renewal-numero-${hab.id}`}
                            type="text"
                            placeholder={hab.numero || "ex: DTC/XC/37-02/24"}
                            value={data?.newNumero || ""}
                            onChange={(e) =>
                              setRenewalData((prev) => ({
                                ...prev,
                                [hab.id]: {
                                  ...prev[hab.id],
                                  newNumero: e.target.value,
                                },
                              }))
                            }
                            className="glass-input"
                          />
                        </div>
                      </div>

                      {/* Codes Selection */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">
                          Codes d'habilitation {hab.type}
                        </Label>
                        <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
                          {availableCodes.map((code) => (
                            <button
                              key={code}
                              type="button"
                              onClick={() => handleCodeToggle(hab.id, code)}
                              className={cn(
                                "px-3 py-2 rounded-lg text-sm font-mono transition-all",
                                data?.codes?.includes(code)
                                  ? "bg-blue-500 text-white border border-blue-600"
                                  : "bg-white/10 border border-white/20 text-muted-foreground hover:border-white/40"
                              )}
                            >
                              {code}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 pt-2">
                        <Button
                          onClick={() => {
                            setEditingId(null);
                            setRenewalData((prev) => ({
                              ...prev,
                              [hab.id]: {
                                codes: [...hab.codes],
                                newValidationDate: "",
                                newNumero: hab.numero || "",
                                newType: hab.type,
                              },
                            }));
                          }}
                          variant="outline"
                          className="rounded-lg"
                        >
                          Annuler
                        </Button>
                        <Button
                          onClick={() => handleRenewal(hab)}
                          disabled={savingId === hab.id}
                          className="glass-button gap-2 flex-1"
                        >
                          {savingId === hab.id ? (
                            <span className="flex items-center gap-2">
                              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Renouvellement...
                            </span>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4" />
                              Renouveler
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
