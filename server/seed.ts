import { dbRun, dbGet, getDatabase } from "./db";
import { format } from "date-fns";
import { loadExcelRows, ExcelRow } from "./excel-loader";
import {
  ORGANIZATIONAL_STRUCTURE,
  fixCasing,
  findMatchingDivision,
  findMatchingService,
  findMatchingEquipe,
  calculateExpirationDate,
  DivisionStructure,
} from "./org-structure";

interface ServiceStructure {
  name: string;
  equipes: string[];
}

interface EmployeeData {
  matricule: string;
  nom: string;
  prenom: string;
  division: string;
  service: string;
  equipe: string;
  htCodes: string[];
  stCodes: string[];
  nTitre: string;
  dateValidation: string;
  dateExpiration?: string;
}

const ORGANIZATIONAL_STRUCTURE: DivisionStructure[] = ORGANIZATIONAL_STRUCTURE;

const MATRICULE_KEYS = ["matricule", "MATRICULE"];
const NOM_KEYS = ["nom", "Nom", "NOM"];
const PRENOM_KEYS = ["prenom", "Prénom", "PRENOM", "Prénom"];
const DIVISION_KEYS = ["division", "DIVISION", "Division"];
const SERVICE_KEYS = ["service", "SERVICE", "Service", "section", "SECTION", "Section"];
const EQUIPE_KEYS = ["equipe", "ÉQUIPE", "Equipe", "EQUIPE", "Section", "SECTION", "cellule", "CELLULE"];
const NUM_TITRE_KEYS = ["n° du titre", "n° titre", "numero titre", "N° du titre", "N° titre", "N Titre"];
const DATE_VALIDATION_KEYS = [
  "date validation",
  "date de validation",
  "Date Validation",
  "DATE VALIDATION",
  "date_validation",
  "DATE VALIDATION HT",
  "Date Validation HT"
];
const DATE_EXPIRATION_KEYS = [
  "date expiration",
  "date d'expiration",
  "Date Expiration",
  "DATE EXPIRATION",
  "date_expiration"
];

const KNOWN_HT_CODES = new Set(["H0V", "B0V", "H1V", "B1V", "H2V", "B2V", "HC", "BR", "BC", "SF6"]);
const KNOWN_ST_CODES = new Set(["H1N", "H1T", "H2N", "H2T", "SF6"]);
const CODE_TOKEN_REGEX = /(H0V|B0V|H1V|B1V|H2V|B2V|HC|BR|BC|SF6|H1N|H1T|H2N|H2T)/gi;

const COLUMN_CODE_MAP: Record<string, { type: "HT" | "ST"; code: string }> = {
  // HT codes (case-insensitive matching)
  "h0v": { type: "HT", code: "H0V" },
  "b0v": { type: "HT", code: "B0V" },
  "h1v": { type: "HT", code: "H1V" },
  "b1v": { type: "HT", code: "B1V" },
  "h2v": { type: "HT", code: "H2V" },
  "b2v": { type: "HT", code: "B2V" },
  "hc": { type: "HT", code: "HC" },
  "bc": { type: "HT", code: "BC" },
  "br": { type: "HT", code: "BR" },
  "sf6": { type: "HT", code: "SF6" },
  // ST codes
  "h1n": { type: "ST", code: "H1N" },
  "h1t": { type: "ST", code: "H1T" },
  "h2n": { type: "ST", code: "H2N" },
  "h2t": { type: "ST", code: "H2T" }
};



function getFirstMatchingValue(row: ExcelRow, candidates: string[]): unknown {
  const entries = Object.entries(row);
  for (const candidate of candidates) {
    const candidateKey = candidate.toLowerCase();
    for (const [key, value] of entries) {
      if (key && key.toLowerCase() === candidateKey) {
        if (value !== undefined && value !== null && `${value}`.toString().trim() !== "") {
          return value;
        }
      }
    }
  }
  return undefined;
}

function getRowValue(row: ExcelRow, candidates: string[]): string {
  const value = getFirstMatchingValue(row, candidates);
  if (value === undefined || value === null) return "";
  return typeof value === "string" ? value.trim() : String(value).trim();
}

function normalizeDateValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;

  if (value instanceof Date) {
    return format(value, "yyyy-MM-dd");
  }

  if (typeof value === "number" && !Number.isNaN(value)) {
    const excelEpoch = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!Number.isNaN(excelEpoch.getTime())) {
      return format(excelEpoch, "yyyy-MM-dd");
    }
  }

  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return null;

    if (!Number.isNaN(Date.parse(text))) {
      return format(new Date(text), "yyyy-MM-dd");
    }

    if (text.includes("/")) {
      const [dayStr, monthStr, yearStr] = text.split("/");
      const day = parseInt(dayStr, 10) || 1;
      const month = (parseInt(monthStr, 10) || 1) - 1;
      const year = parseInt(yearStr, 10);
      if (!Number.isNaN(year)) {
        const parsed = new Date(year, month, day);
        if (!Number.isNaN(parsed.getTime())) {
          return format(parsed, "yyyy-MM-dd");
        }
      }
    }
  }

  return null;
}

function hasTruthyValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "number") return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (!text) return false;
  return !["non", "no", "false", "0"].includes(text);
}

function extractCodes(row: ExcelRow): { htCodes: string[]; stCodes: string[] } {
  const ht = new Set<string>();
  const st = new Set<string>();

  for (const [key, rawValue] of Object.entries(row)) {
    const normalizedKey = key?.toLowerCase()?.trim();
    if (normalizedKey && COLUMN_CODE_MAP[normalizedKey] && hasTruthyValue(rawValue)) {
      const mapping = COLUMN_CODE_MAP[normalizedKey];
      if (mapping.type === "HT") {
        ht.add(mapping.code);
      } else {
        st.add(mapping.code);
      }
    }

    if (typeof rawValue === "string" && rawValue.trim()) {
      const matches = rawValue.toUpperCase().match(CODE_TOKEN_REGEX);
      if (matches) {
        matches.forEach((match) => {
          if (KNOWN_HT_CODES.has(match)) {
            ht.add(match);
          }
          if (KNOWN_ST_CODES.has(match)) {
            st.add(match);
          }
        });
      }
    }
  }

  return {
    htCodes: Array.from(ht),
    stCodes: Array.from(st)
  };
}

async function parseExcelData(): Promise<EmployeeData[]> {
  const excelRows = await loadExcelRows();
  console.log(`Loaded ${excelRows.length} rows from Excel source`);

  const employees: EmployeeData[] = [];

  for (const row of excelRows) {
    const matricule = getRowValue(row, MATRICULE_KEYS);
    const nom = fixCasing(getRowValue(row, NOM_KEYS));
    const prenom = fixCasing(getRowValue(row, PRENOM_KEYS));

    if (!matricule || !nom || !prenom) {
      continue;
    }

    const divisionText = getRowValue(row, DIVISION_KEYS);
    const serviceText = getRowValue(row, SERVICE_KEYS);
    const equipeText = getRowValue(row, EQUIPE_KEYS);

    const division = findMatchingDivision(divisionText || "") || ORGANIZATIONAL_STRUCTURE[0].name;
    const service = findMatchingService(serviceText || "", division) || ORGANIZATIONAL_STRUCTURE.find((d) => d.name === division)?.services[0]?.name || "";
    const equipe = findMatchingEquipe(equipeText || "", division, service) || "";

    const nTitre = getRowValue(row, NUM_TITRE_KEYS);
    const rawDateValue = getFirstMatchingValue(row, DATE_VALIDATION_KEYS);
    const normalizedDate = normalizeDateValue(rawDateValue) || format(new Date(), "yyyy-MM-dd");

    const rawExpValue = getFirstMatchingValue(row, DATE_EXPIRATION_KEYS);
    const normalizedExpDate = normalizeDateValue(rawExpValue) || undefined;

    const { htCodes, stCodes } = extractCodes(row);

    if (htCodes.length === 0 && stCodes.length === 0) {
      continue;
    }

    employees.push({
      matricule,
      nom,
      prenom,
      division,
      service,
      equipe,
      htCodes,
      stCodes,
      nTitre,
      dateValidation: normalizedDate,
      dateExpiration: normalizedExpDate
    });
  }

  return employees;
}

async function seedDatabase() {
  console.log("Starting database seeding...");

  try {
    await getDatabase();

    dbRun("DELETE FROM habilitations");
    dbRun("DELETE FROM employees");
    dbRun("DELETE FROM equipes");
    dbRun("DELETE FROM services");
    dbRun("DELETE FROM divisions");
    console.log("Cleared existing data");

    const divisions: { [key: string]: number } = {};
    const services: { [key: string]: number } = {};
    const equipes: { [key: string]: number } = {};

    for (const division of ORGANIZATIONAL_STRUCTURE) {
      const result = dbRun(
        `INSERT INTO divisions (name) VALUES (?)`,
        [division.name]
      );
      const divisionId = (result as any).lastInsertRowid;
      divisions[division.name] = divisionId;

      for (const service of division.services) {
        const serviceKey = `${division.name}|${service.name}`;
        const serviceResult = dbRun(
          `INSERT INTO services (name, division_id) VALUES (?, ?)`,
          [service.name, divisionId]
        );
        const serviceId = (serviceResult as any).lastInsertRowid;
        services[serviceKey] = serviceId;

        for (const equipe of service.equipes) {
          const equipeKey = `${serviceKey}|${equipe}`;
          const equipeResult = dbRun(
            `INSERT INTO equipes (name, service_id) VALUES (?, ?)`,
            [equipe, serviceId]
          );
          const equipeId = (equipeResult as any).lastInsertRowid;
          equipes[equipeKey] = equipeId;
        }
      }
    }

    console.log("✓ Organizational structure seeded successfully!");
    console.log(`✓ Created ${Object.keys(divisions).length} divisions`);
    console.log(`✓ Created ${Object.keys(services).length} services`);
    console.log(`✓ Created ${Object.keys(equipes).length} équipes`);

    const employees = await parseExcelData();
    let employeeCount = 0;
    let habilitationCount = 0;

    for (const employee of employees) {
      const divisionId = divisions[employee.division];
      const serviceKey = `${employee.division}|${employee.service}`;
      const serviceId = services[serviceKey];
      const equipeKey = `${serviceKey}|${employee.equipe}`;
      const equipeId = equipes[equipeKey];

      const existingEmployee = dbGet(
        `SELECT id FROM employees WHERE matricule = ?`,
        [employee.matricule]
      );

      let employeeId: number;

      if (!existingEmployee) {
        const empResult = dbRun(
          `INSERT INTO employees (matricule, prenom, nom, division_id, service_id, equipe_id)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            employee.matricule,
            employee.prenom,
            employee.nom,
            divisionId,
            serviceId,
            equipeId
          ]
        );
        employeeId = (empResult as any).lastInsertRowid;
        employeeCount++;
      } else {
        employeeId = (existingEmployee as any).id;
      }

      if (employeeId) {
        if (employee.htCodes.length > 0) {
          const dateExpHT = employee.dateExpiration || calculateExpirationDate(employee.dateValidation, "HT");
          dbRun(
            `INSERT INTO habilitations (employee_id, type, codes, numero, date_validation, date_expiration)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              employeeId,
              "HT",
              JSON.stringify(employee.htCodes),
              employee.nTitre,
              employee.dateValidation,
              dateExpHT
            ]
          );
          habilitationCount++;
        }

        if (employee.stCodes.length > 0) {
          const dateExpST = employee.dateExpiration || calculateExpirationDate(employee.dateValidation, "ST");
          dbRun(
            `INSERT INTO habilitations (employee_id, type, codes, numero, date_validation, date_expiration)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              employeeId,
              "ST",
              JSON.stringify(employee.stCodes),
              employee.nTitre,
              employee.dateValidation,
              dateExpST
            ]
          );
          habilitationCount++;
        }
      }
    }

    console.log(`✓ Created ${employeeCount} employees`);
    console.log(`✓ Created ${habilitationCount} habilitations`);
    console.log("\n✅ Database seeding completed successfully!");
  } catch (err) {
    console.error("Error seeding database:", err);
    throw err;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { seedDatabase };
