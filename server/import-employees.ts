import { dbRun, dbGet, dbAll, getDatabase } from "./db";
import { findMatchingDivision, findMatchingService, findMatchingEquipe } from "./org-structure";

interface RawEmployee {
  matricule: string;
  nom: string;
  prenom: string;
  division: string;
  service: string;
  equipe: string;
  habilitations: Array<{
    type: "HT" | "ST";
    codes: string[];
    numero: string;
    dateValidation: string;
    dateExpiration: string;
  }>;
}

// Parse and clean date - handles multiple formats
function parseDate(dateStr: string): string | null {
  if (!dateStr || dateStr.trim() === "") return null;

  dateStr = dateStr.trim();

  // Handle text-based dates like "AOUT -2024", "DECEMBRE 2023"
  const monthMap: { [key: string]: number } = {
    janvier: 1, january: 1, "01": 1,
    février: 2, fevrier: 2, february: 2, "02": 2,
    mars: 3, march: 3, "03": 3,
    avril: 4, april: 4, "04": 4,
    mai: 5, may: 5, "05": 5,
    juin: 6, june: 6, "06": 6,
    juillet: 7, july: 7, "07": 7,
    aout: 8, août: 8, "08": 8,
    septembre: 9, september: 9, "09": 9,
    octobre: 10, october: 10, "10": 10,
    novembre: 11, november: 11, "11": 11,
    décembre: 12, decembre: 12, december: 12, "12": 12,
  };

  const lowerDate = dateStr.toLowerCase();

  // Match text format: "AOUT -2024" or "DECEMBRE 2023"
  for (const [monthName, monthNum] of Object.entries(monthMap)) {
    if (lowerDate.includes(monthName)) {
      const yearMatch = dateStr.match(/\d{4}/);
      if (yearMatch) {
        const year = yearMatch[0];
        return `${year}-${String(monthNum).padStart(2, "0")}-01`;
      }
    }
  }

  // Handle numeric format: "1/7/2022" (day/month/year)
  if (dateStr.includes("/")) {
    const parts = dateStr.split("/");
    if (parts.length === 3) {
      let day = parseInt(parts[0]);
      let month = parseInt(parts[1]);
      let year = parseInt(parts[2]);

      // Fix invalid dates like 30/02/2025
      const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) {
        daysInMonth[1] = 29;
      }

      if (day > daysInMonth[month - 1]) {
        day = daysInMonth[month - 1];
      }

      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
        2,
        "0"
      )}`;
    }
  }

  return null;
}

// Clean and normalize text
function cleanText(text: string): string {
  return text
    ?.trim()
    ?.replace(/\s+/g, " ")
    ?.toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ") || "";
}

// Map division and find correct IDs using shared org-structure mapping
function findOrganizationalIds(
  division: string,
  service: string,
  equipe: string
): {
  division_id: number;
  service_id: number;
  equipe_id: number;
} | null {
  const canonicalDivision = findMatchingDivision(division || "");
  if (!canonicalDivision) {
    console.warn(`Division not matched: ${division}`);
    return null;
  }

  const canonicalService = findMatchingService(service || "", canonicalDivision);
  if (!canonicalService) {
    console.warn(`Service not matched: ${service} in ${canonicalDivision}`);
    return null;
  }

  const canonicalEquipe = findMatchingEquipe(equipe || "", canonicalDivision, canonicalService);
  if (!canonicalEquipe) {
    console.warn(`Equipe not matched: ${equipe} in ${canonicalService}`);
    return null;
  }

  const div = dbGet(
    `SELECT id FROM divisions WHERE name = ?`,
    [canonicalDivision]
  ) as any;
  if (!div) {
    console.warn(`Division not found in DB: ${canonicalDivision}`);
    return null;
  }

  const svc = dbGet(
    `SELECT id FROM services WHERE name = ? AND division_id = ?`,
    [canonicalService, div.id]
  ) as any;
  if (!svc) {
    console.warn(`Service not found in DB: ${canonicalService} in ${canonicalDivision}`);
    return null;
  }

  const eq = dbGet(
    `SELECT id FROM equipes WHERE name = ? AND service_id = ?`,
    [canonicalEquipe, svc.id]
  ) as any;
  if (!eq) {
    console.warn(`Equipe not found in DB: ${canonicalEquipe} in ${canonicalService}`);
    return null;
  }

  return {
    division_id: div.id,
    service_id: svc.id,
    equipe_id: eq.id,
  };
}

// Extract habilitation codes from columns
function extractHabilitations(row: any): Array<{
  type: "HT" | "ST";
  codes: string[];
  numero: string;
  dateValidation: string;
  dateExpiration: string;
}> {
  const hts: string[] = [];
  const sts: string[] = [];

  // HT codes from columns: HE1HT, HE2HT, HEC, HER (B variants), BR variants
  const htColumns = [
    "HE1HT",
    "HE2HT",
    "HEC",
    "HER",
  ];
  const stColumns = ["HE1ST", "HE2ST", "HSF6"];

  // Map Excel columns to actual codes
  const codeMapping: { [key: string]: string } = {
    "HNE": "H1V",
    "HE1HT": "H1V",
    "HE2HT": "H2V",
    "HEC": "HC",
    "HER": "BR",
    "HE1ST": "H1N",
    "HE2ST": "H2N",
    "HSF6": "SF6",
  };

  // First row columns (for B variants)
  const colNames = Object.keys(row);
  for (const col of colNames) {
    const val = row[col];
    if (!val || val === "") continue;

    // H0V, B0V, H1V, B1V, H2V, B2V, HC, BR, BC
    if (val.includes("H0V") || val === "H0V") hts.push("H0V");
    if (val.includes("B0V") || val === "B0V") hts.push("B0V");
    if (val.includes("H1V") || val === "H1V") hts.push("H1V");
    if (val.includes("B1V") || val === "B1V") hts.push("B1V");
    if (val.includes("H2V") || val === "H2V") hts.push("H2V");
    if (val.includes("B2V") || val === "B2V") hts.push("B2V");
    if (val.includes("HC") || val === "HC") hts.push("HC");
    if (val.includes("BR") || val === "BR") hts.push("BR");
    if (val.includes("BC") || val === "BC") hts.push("BC");

    if (val.includes("H1N") || val === "H1N") sts.push("H1N");
    if (val.includes("H1T") || val === "H1T") sts.push("H1T");
    if (val.includes("H2N") || val === "H2N") sts.push("H2N");
    if (val.includes("H2T") || val === "H2T") sts.push("H2T");
    if (val.includes("SF6") || val === "SF6") {
      hts.push("SF6");
    }
  }

  const habs: Array<{
    type: "HT" | "ST";
    codes: string[];
    numero: string;
    dateValidation: string;
    dateExpiration: string;
  }> = [];

  const numero = row["N° du titre"] || row["N° du titre"] || "";
  const dateValidation = parseDate(row["Date Validation"] || "");
  const dateExpiration = parseDate(row["Date Expiration"] || "");

  if (hts.length > 0 && dateValidation && dateExpiration) {
    habs.push({
      type: "HT",
      codes: [...new Set(hts)],
      numero,
      dateValidation,
      dateExpiration,
    });
  }

  if (sts.length > 0 && dateValidation && dateExpiration) {
    habs.push({
      type: "ST",
      codes: [...new Set(sts)],
      numero,
      dateValidation,
      dateExpiration,
    });
  }

  return habs;
}

// Parse TSV data
export function parseEmployeesFromTSV(tsvData: string): RawEmployee[] {
  const lines = tsvData.split("\n");
  const headers = lines[0].split("\t");

  const employees: RawEmployee[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split("\t");
    const row: any = {};

    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || "";
    }

    const matricule = row["MATRICULE"]?.trim();
    const nom = cleanText(row["Nom"] || "");
    const prenom = cleanText(row["Prénom"] || "");
    const division = cleanText(row["DIVISION"] || "");
    const service = cleanText(row["SERVICE"] || "");
    const equipe = cleanText(row["EQUIPE"] || "");

    if (!matricule || !nom || !prenom) {
      console.warn(`Skipping row ${i}: missing required fields`);
      continue;
    }

    const habilitations = extractHabilitations(row);

    employees.push({
      matricule,
      nom,
      prenom,
      division,
      service,
      equipe,
      habilitations,
    });
  }

  return employees;
}

// Import employees into database
export async function importEmployees(employees: RawEmployee[]) {
  await getDatabase();

  let imported = 0;
  let skipped = 0;
  let corrected = 0;
  const issues: { matricule: string; division: string; service: string; equipe: string; reason: string }[] = [];

  for (const emp of employees) {
    try {
      const existing = dbGet(
        `SELECT id FROM employees WHERE matricule = ?`,
        [emp.matricule]
      );

      if (existing) {
        skipped++;
        issues.push({
          matricule: emp.matricule,
          division: emp.division,
          service: emp.service,
          equipe: emp.equipe,
          reason: "Matricule déjà existant",
        });
        continue;
      }

      const ids = findOrganizationalIds(
        emp.division,
        emp.service,
        emp.equipe
      );

      if (!ids) {
        skipped++;
        issues.push({
          matricule: emp.matricule,
          division: emp.division,
          service: emp.service,
          equipe: emp.equipe,
          reason: "Division / service / équipe introuvable",
        });
        continue;
      }

      const divClean = cleanText(emp.division);
      const svcClean = cleanText(emp.service);
      const eqClean = cleanText(emp.equipe);
      const divDb = dbGet(`SELECT name FROM divisions WHERE id = ?`, [ids.division_id]) as { name: string } | null;
      const svcDb = dbGet(`SELECT name FROM services WHERE id = ?`, [ids.service_id]) as { name: string } | null;
      const eqDb = dbGet(`SELECT name FROM equipes WHERE id = ?`, [ids.equipe_id]) as { name: string } | null;

      if (
        divDb && svcDb && eqDb &&
        (cleanText(divDb.name) !== divClean ||
          cleanText(svcDb.name) !== svcClean ||
          cleanText(eqDb.name) !== eqClean)
      ) {
        corrected++;
      }

      const result = dbRun(
        `INSERT INTO employees (matricule, prenom, nom, division_id, service_id, equipe_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          emp.matricule,
          emp.prenom,
          emp.nom,
          ids.division_id,
          ids.service_id,
          ids.equipe_id,
        ]
      );

      const employeeId = (result as any).lastInsertRowid;

      for (const hab of emp.habilitations) {
        dbRun(
          `INSERT INTO habilitations (employee_id, type, codes, numero, date_validation, date_expiration)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            employeeId,
            hab.type,
            JSON.stringify(hab.codes),
            hab.numero || null,
            hab.dateValidation,
            hab.dateExpiration,
          ]
        );
      }

      imported++;
    } catch (err) {
      console.error(`Error importing employee ${emp.matricule}:`, err);
      skipped++;
      issues.push({
        matricule: emp.matricule,
        division: emp.division,
        service: emp.service,
        equipe: emp.equipe,
        reason: "Erreur lors de l'import",
      });
    }
  }

  console.log(`Import complete: ${imported} imported, ${skipped} skipped, ${corrected} corrected`);
  return { imported, skipped, corrected, issues };
}
