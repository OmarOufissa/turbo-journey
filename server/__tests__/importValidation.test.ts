/**
 * Tests for import validation — in-file duplicate detection, row validation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseEmployeesFromExcel } from "../import-employees";
import * as XLSX from "xlsx";

// Helper: create a minimal .xlsx buffer from rows
function makeXlsxBuffer(rows: Record<string, unknown>[]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

describe("parseEmployeesFromExcel", () => {
  it("parses standard columns correctly", () => {
    const buf = makeXlsxBuffer([
      {
        Matricule: "A001",
        Nom: "Dupont",
        Prenom: "Jean",
        Fonction: "Électricien",
        Division: "Division A",
        Service: "Service B",
        Equipe: "Équipe 1",
        ST_codes: "H1N,H1T",
        HT_codes: "H0V,B0V",
        N_de_titre: "TITRE-001",
        Date_validation: "01/01/2024",
        Date_expiration: "01/01/2027",
      },
    ]);

    const rows = parseEmployeesFromExcel(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0].matricule).toBe("A001");
    expect(rows[0].nom).toBe("Dupont");
    expect(rows[0].stCodes).toEqual(["H1N", "H1T"]);
    expect(rows[0].htCodes).toEqual(["H0V", "B0V"]);
    expect(rows[0].dateValidation).toBe("2024-01-01");
    expect(rows[0].dateExpiration).toBe("2027-01-01");
  });

  it("handles empty codes gracefully", () => {
    const buf = makeXlsxBuffer([
      {
        Matricule: "A002",
        Nom: "Martin",
        Prenom: "Sophie",
        Fonction: "Technicien",
        Division: "Division A",
        Service: "Service B",
        ST_codes: "",
        HT_codes: "H1V",
        N_de_titre: "",
        Date_validation: "01/01/2024",
        Date_expiration: "01/01/2027",
      },
    ]);

    const rows = parseEmployeesFromExcel(buf);
    expect(rows[0].stCodes).toEqual([]);
    expect(rows[0].htCodes).toEqual(["H1V"]);
  });

  it("parses ISO date format", () => {
    const buf = makeXlsxBuffer([
      {
        Matricule: "A003",
        Nom: "Test",
        Prenom: "User",
        Fonction: "F",
        Division: "D",
        Service: "S",
        ST_codes: "",
        HT_codes: "H0V",
        N_de_titre: "T",
        Date_validation: "2024-01-01",
        Date_expiration: "2027-01-01",
      },
    ]);

    const rows = parseEmployeesFromExcel(buf);
    expect(rows[0].dateValidation).toBe("2024-01-01");
    expect(rows[0].dateExpiration).toBe("2027-01-01");
  });
});
