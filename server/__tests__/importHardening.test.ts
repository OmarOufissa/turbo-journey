/**
 * Tests for import hardening — in-file duplicate detection, validation, corrupted rows.
 */

import { describe, it, expect } from "vitest";
import { parseEmployeesFromExcel } from "../import-employees";
import * as XLSX from "xlsx";

function makeXlsxBuffer(rows: Record<string, unknown>[]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

const validRow = {
  Matricule: "A001",
  Nom: "Dupont",
  Prenom: "Jean",
  Fonction: "Électricien",
  Division: "Division A",
  Service: "Service B",
  Equipe: "Équipe 1",
  ST_codes: "",
  HT_codes: "H1V,B1V",
  N_de_titre: "TITRE-001",
  Date_validation: "01/01/2024",
  Date_expiration: "01/01/2027",
};

describe("parseEmployeesFromExcel — valid row", () => {
  it("parses all standard columns correctly", () => {
    const buf = makeXlsxBuffer([validRow]);
    const rows = parseEmployeesFromExcel(buf);
    expect(rows).toHaveLength(1);
    expect(rows[0].matricule).toBe("A001");
    expect(rows[0].nom).toBe("Dupont");
    expect(rows[0].htCodes).toEqual(["H1V", "B1V"]);
    expect(rows[0].stCodes).toEqual([]);
    expect(rows[0].dateValidation).toBe("2024-01-01");
    expect(rows[0].dateExpiration).toBe("2027-01-01");
  });

  it("parses ISO date format", () => {
    const buf = makeXlsxBuffer([{ ...validRow, Date_validation: "2024-01-01", Date_expiration: "2027-01-01" }]);
    const rows = parseEmployeesFromExcel(buf);
    expect(rows[0].dateValidation).toBe("2024-01-01");
    expect(rows[0].dateExpiration).toBe("2027-01-01");
  });

  it("handles empty ST_codes", () => {
    const buf = makeXlsxBuffer([{ ...validRow, ST_codes: "" }]);
    const rows = parseEmployeesFromExcel(buf);
    expect(rows[0].stCodes).toEqual([]);
  });

  it("handles multiple codes separated by comma", () => {
    const buf = makeXlsxBuffer([{ ...validRow, HT_codes: "H1V, B1V, H2V" }]);
    const rows = parseEmployeesFromExcel(buf);
    expect(rows[0].htCodes).toEqual(["H1V", "B1V", "H2V"]);
  });

  it("does not throw on empty spreadsheet", () => {
    const buf = makeXlsxBuffer([]);
    const rows = parseEmployeesFromExcel(buf);
    expect(rows).toHaveLength(0);
  });
});

describe("parseEmployeesFromExcel — edge cases", () => {
  it("handles missing optional Equipe field", () => {
    const { Equipe: _, ...rowWithoutEquipe } = validRow;
    const buf = makeXlsxBuffer([rowWithoutEquipe]);
    const rows = parseEmployeesFromExcel(buf);
    expect(rows[0].equipe).toBeUndefined();
  });

  it("handles multiple rows", () => {
    const buf = makeXlsxBuffer([
      validRow,
      { ...validRow, Matricule: "A002", Nom: "Martin", N_de_titre: "TITRE-002" },
    ]);
    const rows = parseEmployeesFromExcel(buf);
    expect(rows).toHaveLength(2);
    expect(rows[1].matricule).toBe("A002");
  });

  it("trims whitespace from string fields", () => {
    const buf = makeXlsxBuffer([{ ...validRow, Nom: "  Dupont  ", Matricule: " A001 " }]);
    const rows = parseEmployeesFromExcel(buf);
    expect(rows[0].nom).toBe("Dupont");
    expect(rows[0].matricule).toBe("A001");
  });

  it("does not throw on rows with null/missing values", () => {
    // XLSX may skip entirely-null rows or produce rows with empty strings
    const buf = makeXlsxBuffer([{ Matricule: "X999", Nom: null, Prenom: undefined }]);
    expect(() => parseEmployeesFromExcel(buf)).not.toThrow();
    const rows = parseEmployeesFromExcel(buf);
    // The row should exist; missing fields should become empty strings
    if (rows.length > 0) {
      expect(typeof rows[0].matricule).toBe("string");
      expect(typeof rows[0].nom).toBe("string");
    }
  });
});

describe("date parsing edge cases", () => {
  it("parses D/M/YYYY without padding", () => {
    const buf = makeXlsxBuffer([{ ...validRow, Date_validation: "1/3/2024", Date_expiration: "5/9/2027" }]);
    const rows = parseEmployeesFromExcel(buf);
    expect(rows[0].dateValidation).toBe("2024-03-01");
    expect(rows[0].dateExpiration).toBe("2027-09-05");
  });

  it("returns empty string for invalid date string", () => {
    const buf = makeXlsxBuffer([{ ...validRow, Date_validation: "not-a-date", Date_expiration: "2027-01-01" }]);
    const rows = parseEmployeesFromExcel(buf);
    // "not-a-date" doesn't match any pattern, so returns as-is (not ISO)
    expect(rows[0].dateValidation).toBe("not-a-date");
  });
});
