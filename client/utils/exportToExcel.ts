import * as XLSX from "xlsx-js-style";
import { Employee } from "@/types";

export function exportEmployeesToExcel(employees: Employee[], filename: string = "employees.xlsx") {
  const data = employees.map((emp) => {
    const ver = emp.currentVersion;
    return {
      Matricule: emp.matricule,
      Prénom: emp.prenom,
      Nom: emp.nom,
      Fonction: ver?.fonction ?? "",
      Division: ver?.division ?? "",
      Service: ver?.service ?? "",
      Équipe: ver?.equipe ?? "",
      "Codes ST": (ver?.stCodes ?? []).join(", "),
      "Codes HT": (ver?.htCodes ?? []).join(", "),
      "N° Titre": ver?.nDeTitre ?? "",
      "Date Validation": ver?.dateValidation ?? "",
      "Date Expiration": ver?.dateExpiration ?? "",
    };
  });

  const ws = XLSX.utils.json_to_sheet(data);

  ws["!cols"] = [
    { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 25 },
    { wch: 25 }, { wch: 30 }, { wch: 30 },
    { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Employés");
  XLSX.writeFile(wb, filename);
}

export function exportAnalyticsToExcel(data: any, filename: string = "analytics.xlsx") {
  const wb = XLSX.utils.book_new();

  const overviewData = [
    { Métrique: "Total Employés", Valeur: data.total ?? 0 },
    { Métrique: "Expirées", Valeur: data.expired ?? 0 },
    { Métrique: "< 3 mois", Valeur: data.lessThan3Months ?? 0 },
    { Métrique: "< 6 mois", Valeur: data.lessThan6Months ?? 0 },
    { Métrique: "< 9 mois", Valeur: data.lessThan9Months ?? 0 },
    { Métrique: "Valides", Valeur: (data.total ?? 0) - (data.expired ?? 0) - (data.lessThan3Months ?? 0) - (data.lessThan6Months ?? 0) - (data.lessThan9Months ?? 0) },
    { Métrique: "ST uniquement", Valeur: data.stOnly ?? 0 },
    { Métrique: "HT uniquement", Valeur: data.htOnly ?? 0 },
    { Métrique: "ST + HT", Valeur: data.both ?? 0 },
  ];
  const wsOverview = XLSX.utils.json_to_sheet(overviewData);
  XLSX.utils.book_append_sheet(wb, wsOverview, "Vue d'ensemble");

  if (data.byDivision) {
    const wsDivision = XLSX.utils.json_to_sheet(
      data.byDivision.map((d: any) => ({
        Division: d.name,
        Total: d.total,
        Expirées: d.expired,
        Critiques: d.critical,
      }))
    );
    XLSX.utils.book_append_sheet(wb, wsDivision, "Par Division");
  }

  if (data.byService) {
    const wsService = XLSX.utils.json_to_sheet(
      data.byService.map((d: any) => ({ Service: d.name, Total: d.count }))
    );
    XLSX.utils.book_append_sheet(wb, wsService, "Par Service");
  }

  XLSX.writeFile(wb, filename);
}

export function exportRenewalsToExcel(renewals: any[], filename: string = "renewals.xlsx") {
  const data = renewals.map((r) => ({
    Matricule: r.matricule ?? r.employee?.matricule ?? "",
    Nom: r.nom ?? r.employee?.nom ?? "",
    Prénom: r.prenom ?? r.employee?.prenom ?? "",
    "Codes ST": (r.snapshot?.stCodes ?? []).join(", "),
    "Codes HT": (r.snapshot?.htCodes ?? []).join(", "),
    "N° Titre": r.snapshot?.nDeTitre ?? "",
    "Date Validation": r.snapshot?.dateValidation ?? "",
    "Date Expiration": r.snapshot?.dateExpiration ?? "",
    "Créé le": r.createdAt ?? "",
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  ws["!cols"] = [
    { wch: 12 }, { wch: 15 }, { wch: 15 },
    { wch: 20 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Renouvellements");
  XLSX.writeFile(wb, filename);
}
