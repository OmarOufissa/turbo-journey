import * as XLSX from "xlsx-js-style";

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
