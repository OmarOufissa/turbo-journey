import * as XLSX from "xlsx-js-style";
import { Employee } from "@/types";

export function exportEmployeesToExcel(employees: Employee[], filename: string = "employees.xlsx") {
  const data = employees.map((emp) => ({
    Matricule: emp.matricule,
    Prénom: emp.prenom,
    Nom: emp.nom,
    Division: emp.division,
    Service: emp.service,
    Équipe: emp.equipe,
    "Habilitations HT": emp.habilitations
      ?.filter((h) => h.type === "HT")
      .map((h) => h.codes.join(", "))
      .join(" | ") || "",
    "Habilitations ST": emp.habilitations
      ?.filter((h) => h.type === "ST")
      .map((h) => h.codes.join(", "))
      .join(" | ") || "",
    "Total Habilitations": emp.habilitations?.length || 0,
  }));

  const ws = XLSX.utils.json_to_sheet(data);

  // Set column widths
  const wscols = [
    { wch: 12 }, // Matricule
    { wch: 15 }, // Prénom
    { wch: 15 }, // Nom
    { wch: 25 }, // Division
    { wch: 30 }, // Service
    { wch: 30 }, // Équipe
    { wch: 30 }, // HT
    { wch: 30 }, // ST
    { wch: 12 }, // Total
  ];
  ws["!cols"] = wscols;

  // Create workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Employés");

  // Save file
  XLSX.writeFile(wb, filename);
}

export function exportAnalyticsToExcel(data: any, filename: string = "analytics.xlsx") {
  // Create sheets for different analytics
  const wb = XLSX.utils.book_new();

  // Overview sheet
  const overviewData = [
    { Métrique: "Total Employés", Valeur: data.totalEmployees },
    { Métrique: "Total Habilitations", Valeur: data.totalHabilitations },
    { Métrique: "Expirées", Valeur: data.expirationStats?.expired || 0 },
    { Métrique: "Expirant sous 30j", Valeur: data.expirationStats?.expiring30 || 0 },
    { Métrique: "Valides", Valeur: data.expirationStats?.valid || 0 },
  ];
  const wsOverview = XLSX.utils.json_to_sheet(overviewData);
  XLSX.utils.book_append_sheet(wb, wsOverview, "Vue d'ensemble");

  // Division breakdown
  if (data.byDivision) {
    const wsDivision = XLSX.utils.json_to_sheet(
      data.byDivision.map((d: any) => ({
        Division: d.name,
        "Nombre d'employés": d.count,
      }))
    );
    XLSX.utils.book_append_sheet(wb, wsDivision, "Par Division");
  }

  XLSX.writeFile(wb, filename);
}

export function exportRenewalsToExcel(renewalHabilitations: any[], filename: string = "renewals.xlsx") {
  const data = renewalHabilitations.map((hab) => ({
    Matricule: hab.employee.matricule,
    Nom: hab.employee.nom,
    Prénom: hab.employee.prenom,
    Division: hab.employee.division,
    Service: hab.employee.service,
    Équipe: hab.employee.equipe,
    Type: hab.type === "HT" ? "Habilitation HT" : "Habilitation ST",
    Codes: hab.codes.join(", "),
    "N° Titre": hab.numero || "",
    "Date Validation": hab.date_validation,
    "Date Expiration": hab.date_expiration,
    "Jours Restants": hab.daysUntilExpiry,
    Catégorie: hab.expirationCategory === "1month" ? "Expire dans 1 mois" : hab.expirationCategory === "2months" ? "Expire dans 2 mois" : "Expire dans 3 mois",
  }));

  const ws = XLSX.utils.json_to_sheet(data);

  const wscols = [
    { wch: 12 },
    { wch: 15 },
    { wch: 15 },
    { wch: 25 },
    { wch: 30 },
    { wch: 30 },
    { wch: 20 },
    { wch: 25 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 20 },
  ];
  ws["!cols"] = wscols;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Renouvellements");

  XLSX.writeFile(wb, filename);
}
