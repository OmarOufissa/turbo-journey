import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download } from "lucide-react";
import { Employee, Division, getHabilitationStatus } from "@/types";
import { exportEmployeesToExcel } from "@/utils/exportToExcel";
import { useToast } from "@/hooks/use-toast";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employees: Employee[];
  divisions: Division[];
}

export function ExportDialog({
  open,
  onOpenChange,
  employees,
  divisions,
}: ExportDialogProps) {
  const { toast } = useToast();
  const [exportFilters, setExportFilters] = useState({
    status: "all",
    division: "all",
  });

  const handleFilteredExport = () => {
    let filteredEmps = employees;

    if (exportFilters.division !== "all") {
      filteredEmps = filteredEmps.filter(
        (emp) => emp.division === exportFilters.division
      );
    }

    if (exportFilters.status !== "all") {
      filteredEmps = filteredEmps.map((emp) => ({
        ...emp,
        habilitations: emp.habilitations?.filter((hab) => {
          const status = getHabilitationStatus(hab);
          return status === exportFilters.status;
        }),
      }));
    }

    const filename = `habilitations_${
      exportFilters.division !== "all" ? exportFilters.division : "toutes"
    }_${new Date().toISOString().split("T")[0]}.xlsx`;
    
    exportEmployeesToExcel(filteredEmps, filename);

    toast({
      title: "Export réussi",
      description: "Les données filtrées ont été exportées",
    });

    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Exporter les habilitations</DialogTitle>
          <DialogDescription>
            Sélectionnez les filtres pour l'export
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="export-status">Statut</Label>
            <Select
              value={exportFilters.status}
              onValueChange={(value) =>
                setExportFilters({ ...exportFilters, status: value })
              }
            >
              <SelectTrigger id="export-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="expired">Expiré</SelectItem>
                <SelectItem value="expiringSoon1Month">
                  Expire dans 1 mois
                </SelectItem>
                <SelectItem value="expiringSoon2Months">
                  Expire dans 2 mois
                </SelectItem>
                <SelectItem value="expiringSoon3Months">
                  Expire dans 3 mois
                </SelectItem>
                <SelectItem value="valid">Valide</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="export-division">Division</Label>
            <Select
              value={exportFilters.division}
              onValueChange={(value) =>
                setExportFilters({ ...exportFilters, division: value })
              }
            >
              <SelectTrigger id="export-division">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les divisions</SelectItem>
                {divisions.map((div) => (
                  <SelectItem key={div.id} value={div.name}>
                    {div.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleFilteredExport} className="gap-2">
            <Download className="w-4 h-4" />
            Exporter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
