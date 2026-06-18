import { db } from "./db-pg";
import * as schema from "./schema";
import { format } from "date-fns";
import * as XLSX from "xlsx";
import { loadExcelRows, ExcelRow } from "./excel-loader";
import {
  ORGANIZATIONAL_STRUCTURE,
  fixCasing,
  findMatchingDivision,
  findMatchingService,
  findMatchingEquipe,
  calculateExpirationDate,
} from "./org-structure";
import { eq } from "drizzle-orm";
import type { HabRows, HabRowData } from "./schema";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolvePdfPath } from "./utils/pathUtils";

function findExistingPdf(matricule: string, versionNumber: number): string | null {
  const candidates = [
    `hab${matricule}_v${versionNumber}.pdf`,
    `hab${matricule}_seed.pdf`,
  ];
  for (const candidate of candidates) {
    const fullPath = resolvePdfPath(candidate);
    if (fs.existsSync(fullPath)) return candidate;
  }
  return null;
}

interface EmployeeData {
  matricule: string;
  nom: string;
  prenom: string;
  fonction: string;
  division: string;
  service: string;
  equipe: string;
  htCodes: string[];
  stCodes: string[];
  nTitre: string;
  dateValidation: string;
  dateExpiration?: string;
  habRows?: HabRows | null;
}

const MATRICULE_KEYS = ["matricule", "MATRICULE"];
const NOM_KEYS = ["nom", "Nom", "NOM"];
const PRENOM_KEYS = ["prenom", "Prénom", "PRENOM", "Prénom"];
const NOM_PRENOM_KEYS = ["nom & prénom", "nom & prenom", "nom et prénom", "nom prénom", "name"];
const FONCTION_KEYS = ["fonction", "Fonction", "FONCTION", "fonction rh", "Fonction RH", "poste", "Poste"];
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

const FONCTION_NORMALIZE: Record<string, string> = {
  "Cadre technique": "Cadre Technique",
  "Conducteur mécanicien": "Conducteur Mécanicien",
  "Technicien principal contrôle Commande RT": "Technicien Principal Contrôle Commande RT",
};

const KNOWN_HT_CODES = new Set(["H0V", "B0V", "H1V", "B1V", "H2V", "B2V", "HC", "BR", "BC", "SF6"]);
const KNOWN_ST_CODES = new Set(["H1N", "H1T", "H2N", "H2T", "SF6"]);
const CODE_TOKEN_REGEX = /(H0V|B0V|H1V|B1V|H2V|B2V|HC|BR|BC|SF6|H1N|H1T|H2N|H2T)/gi;

const COLUMN_CODE_MAP: Record<string, { type: "HT" | "ST"; code: string }> = {
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
      if (key && key.trim().toLowerCase() === candidateKey) {
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
  return !["non", "no", "false", "0", "xxx", "x", "-", "n/a", "na", "néant"].includes(text);
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

const HAB_COLUMN_GROUPS: { suffix: string; rowKey: keyof NonNullable<HabRows> }[] = [
  { suffix: "",   rowKey: "H0V_B0V" },
  { suffix: "_1", rowKey: "H1V_B1V" },
  { suffix: "_2", rowKey: "H2V_B2V" },
  { suffix: "_3", rowKey: "HC_BC"   },
  { suffix: "_4", rowKey: "BR"      },
];

function extractHabRows(row: ExcelRow): HabRows | null {
  const result: HabRows = {};
  let hasAny = false;

  for (const { suffix, rowKey } of HAB_COLUMN_GROUPS) {
    const domaine = getRowValue(row, [`domaine de tension${suffix}`, `Domaine de tension${suffix}`]);
    const ouvrage = getRowValue(row, [`ouvrages concernés${suffix}`, `Ouvrages concernés${suffix}`, `ouvrages concernes${suffix}`]);
    const indication = getRowValue(row, [`indications${suffix}`, `Indications${suffix}`]);

    const d = hasTruthyValue(domaine) ? domaine : "";
    const o = hasTruthyValue(ouvrage) ? ouvrage : "";
    const i = hasTruthyValue(indication) ? indication : "";

    if (d || o || i) {
      result[rowKey] = { domaine: d, ouvrage: o, indication: i };
      hasAny = true;
    }
  }

  return hasAny ? result : null;
}

export async function parseExcelData(): Promise<EmployeeData[]> {
  const excelRows = await loadExcelRows();
  console.log(`Loaded ${excelRows.length} rows from Excel source`);

  const employees: EmployeeData[] = [];

  for (const row of excelRows) {
    const matricule = getRowValue(row, MATRICULE_KEYS);
    let nom = fixCasing(getRowValue(row, NOM_KEYS));
    let prenom = fixCasing(getRowValue(row, PRENOM_KEYS));

    // Fallback: "Nom & Prénom" combined column
    // Moroccan names: NOM (all-caps, may be multi-word) followed by Prenom (mixed-case, may be multi-word)
    // Strategy: find first mixed-case token → everything before is nom, everything from it is prenom
    // If all uppercase → last token is prenom
    if (!nom || !prenom) {
      const combined = getRowValue(row, NOM_PRENOM_KEYS).trim();
      if (combined) {
        const tokens = combined.split(/\s+/).filter(Boolean);
        if (tokens.length === 1) {
          nom = fixCasing(tokens[0]);
        } else {
          // Find first token that contains a lowercase letter (mixed case = prenom start)
          const mixedIdx = tokens.findIndex(t => t.length > 1 && /[a-z]/.test(t));
          if (mixedIdx > 0) {
            nom = fixCasing(tokens.slice(0, mixedIdx).join(" "));
            prenom = fixCasing(tokens.slice(mixedIdx).join(" "));
          } else {
            // All uppercase: detect "SURNAME EL/EZ/ECH PRENOM" pattern
            const PRENOM_PREFIXES = new Set(["EL", "EZ", "ECH"]);
            if (tokens.length === 3 && PRENOM_PREFIXES.has(tokens[1].toUpperCase())) {
              nom = fixCasing(tokens[0]);
              prenom = fixCasing(tokens.slice(1).join(" "));
            } else {
              // General fallback: last token is prenom
              nom = fixCasing(tokens.slice(0, tokens.length - 1).join(" "));
              prenom = fixCasing(tokens[tokens.length - 1]);
            }
          }
        }
      }
    }

    if (!matricule || !nom || !prenom) {
      continue;
    }

    const rawFonction = getRowValue(row, FONCTION_KEYS).trim() || "Non spécifié";
    const fonction = FONCTION_NORMALIZE[rawFonction] ?? rawFonction;
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
    const habRows = extractHabRows(row);

    if (htCodes.length === 0 && stCodes.length === 0) {
      continue;
    }

    employees.push({
      matricule,
      nom,
      prenom,
      fonction,
      division,
      service,
      equipe,
      htCodes,
      stCodes,
      nTitre,
      dateValidation: normalizedDate,
      dateExpiration: normalizedExpDate,
      habRows,
    });
  }

  return employees;
}

export async function seedDatabasePG() {
  console.log("Starting PostgreSQL database seeding...");

  try {
    await db.delete(schema.employeeVersions);
    await db.delete(schema.employees);
    await db.delete(schema.equipes);
    await db.delete(schema.services);
    await db.delete(schema.divisions);
    console.log("Cleared existing data");

    const divisions: { [key: string]: number } = {};
    const services: { [key: string]: number } = {};
    const equipes: { [key: string]: number } = {};

    for (const division of ORGANIZATIONAL_STRUCTURE) {
      const [result] = await db.insert(schema.divisions)
        .values({ name: division.name })
        .returning({ id: schema.divisions.id });
      const divisionId = result.id;
      divisions[division.name] = divisionId;

      for (const service of division.services) {
        const serviceKey = `${division.name}|${service.name}`;
        const [serviceResult] = await db.insert(schema.services)
          .values({
            name: service.name,
            divisionId: divisionId
          })
          .returning({ id: schema.services.id });
        const serviceId = serviceResult.id;
        services[serviceKey] = serviceId;

        for (const equipe of service.equipes) {
          const equipeKey = `${serviceKey}|${equipe}`;
          const [equipeResult] = await db.insert(schema.equipes)
            .values({
              name: equipe,
              serviceId: serviceId
            })
            .returning({ id: schema.equipes.id });
          const equipeId = equipeResult.id;
          equipes[equipeKey] = equipeId;
        }
      }
    }

    console.log("✓ Organizational structure seeded successfully!");
    console.log(`✓ Created ${Object.keys(divisions).length} divisions`);
    console.log(`✓ Created ${Object.keys(services).length} services`);
    console.log(`✓ Created ${Object.keys(equipes).length} équipes`);

    const employeeDataList = await parseExcelData();
    let employeeCount = 0;
    let versionCount = 0;
    let pdfLinked = 0;

    for (const empData of employeeDataList) {
      const divisionId = divisions[empData.division];
      const serviceKey = `${empData.division}|${empData.service}`;
      const serviceId = services[serviceKey];
      let equipeId: number | undefined;
      if (empData.equipe) {
        const directKey = `${serviceKey}|${empData.equipe}`;
        equipeId = equipes[directKey];
        if (!equipeId) {
          for (const [key, id] of Object.entries(equipes)) {
            if (key.startsWith(`${empData.division}|`) && key.endsWith(`|${empData.equipe}`)) {
              equipeId = id;
              break;
            }
          }
        }
      }

      if (!divisionId || !serviceId) {
        console.warn(`Skipping ${empData.matricule}: missing divisionId or serviceId`);
        continue;
      }

      const existing = await db.select()
        .from(schema.employees)
        .where(eq(schema.employees.matricule, empData.matricule))
        .limit(1);

      let employeeId: number;
      let versionNumber = 1;

      if (existing.length === 0) {
        const [empResult] = await db.insert(schema.employees)
          .values({
            matricule: empData.matricule,
            prenom: empData.prenom,
            nom: empData.nom,
          })
          .returning({ id: schema.employees.id });
        employeeId = empResult.id;
        employeeCount++;
      } else {
        employeeId = existing[0].id;
        // Fix truncated names and missing fonctions from previous imports
        await db.update(schema.employees)
          .set({ nom: empData.nom, prenom: empData.prenom })
          .where(eq(schema.employees.id, employeeId));
        if (empData.fonction) {
          await db.update(schema.employeeVersions)
            .set({ fonction: empData.fonction })
            .where(eq(schema.employeeVersions.employeeId, employeeId));
        }

        const existingVersions = await db.select({ versionNumber: schema.employeeVersions.versionNumber })
          .from(schema.employeeVersions)
          .where(eq(schema.employeeVersions.employeeId, employeeId));
        if (existingVersions.length > 0) {
          versionNumber = Math.max(...existingVersions.map(v => v.versionNumber)) + 1;
        }
      }

      const dateExp = empData.dateExpiration || calculateExpirationDate(empData.dateValidation, "HT");
      const nDeTitre = empData.nTitre || "INCONNU";
      const stCodes = empData.stCodes.length > 0 ? empData.stCodes : [];
      const htCodes = empData.htCodes.length > 0 ? empData.htCodes : [];

      const existingPdf = findExistingPdf(empData.matricule, versionNumber);

      const [ver] = await db.insert(schema.employeeVersions)
        .values({
          employeeId,
          versionNumber,
          stCodes,
          htCodes,
          nDeTitre,
          fonction: empData.fonction || "Non spécifié",
          divisionId,
          serviceId,
          equipeId: equipeId || null,
          dateValidation: empData.dateValidation,
          dateExpiration: dateExp,
          habRows: empData.habRows ?? null,
          pdfPath: existingPdf,
        })
        .returning({ id: schema.employeeVersions.id });

      await db.update(schema.employees)
        .set({ currentVersionId: ver.id })
        .where(eq(schema.employees.id, employeeId));

      if (existingPdf) pdfLinked++;
      versionCount++;
    }

    console.log(`✓ Created ${employeeCount} employees`);
    console.log(`✓ Created ${versionCount} employee versions`);
    console.log(`✓ Linked ${pdfLinked} existing PDFs`);

    // Merge TST (ST habilitation) data into existing employees
    await mergeTstData();

    // Generate PDFs for employees without an existing one (query DB for fresh data after TST merge)
    const { generateHabilitationPdf } = await import("./services/pdfService");
    const [allDivs, allSvcs, allEquipesMap] = await Promise.all([
      db.select({ id: schema.divisions.id, name: schema.divisions.name }).from(schema.divisions),
      db.select({ id: schema.services.id, name: schema.services.name }).from(schema.services),
      db.select({ id: schema.equipes.id, name: schema.equipes.name }).from(schema.equipes),
    ]);
    const divMap = Object.fromEntries(allDivs.map(d => [d.id, d.name]));
    const svcMap = Object.fromEntries(allSvcs.map(s => [s.id, s.name]));
    const eqMap = Object.fromEntries(allEquipesMap.map(e => [e.id, e.name]));

    const versionsNeedingPdf = await db
      .select({
        verId: schema.employeeVersions.id,
        versionNumber: schema.employeeVersions.versionNumber,
        matricule: schema.employees.matricule,
        nom: schema.employees.nom,
        prenom: schema.employees.prenom,
        nDeTitre: schema.employeeVersions.nDeTitre,
        fonction: schema.employeeVersions.fonction,
        divisionId: schema.employeeVersions.divisionId,
        serviceId: schema.employeeVersions.serviceId,
        equipeId: schema.employeeVersions.equipeId,
        stCodes: schema.employeeVersions.stCodes,
        htCodes: schema.employeeVersions.htCodes,
        habRows: schema.employeeVersions.habRows,
        autorisationSpecialesVerso: schema.employeeVersions.autorisationSpecialesVerso,
        dateValidation: schema.employeeVersions.dateValidation,
        dateExpiration: schema.employeeVersions.dateExpiration,
        pdfPath: schema.employeeVersions.pdfPath,
      })
      .from(schema.employeeVersions)
      .innerJoin(schema.employees, eq(schema.employees.currentVersionId, schema.employeeVersions.id));

    const toGenerate = versionsNeedingPdf.filter(v => !v.pdfPath);
    let pdfGenerated = 0;
    let pdfFailed = 0;

    for (const row of toGenerate) {
      try {
        const result = await generateHabilitationPdf({
          matricule: row.matricule,
          nom: row.nom,
          prenom: row.prenom,
          nDeTitre: row.nDeTitre,
          fonction: row.fonction,
          division: divMap[row.divisionId] ?? "",
          service: svcMap[row.serviceId] ?? null,
          equipe: row.equipeId ? (eqMap[row.equipeId] ?? null) : null,
          stCodes: (row.stCodes as string[]) ?? [],
          htCodes: (row.htCodes as string[]) ?? [],
          habRows: (row.habRows as any) ?? null,
          autorisationSpecialesVerso: row.autorisationSpecialesVerso ?? null,
          dateValidation: row.dateValidation,
          dateExpiration: row.dateExpiration,
        }, row.versionNumber);

        await db.update(schema.employeeVersions)
          .set({ pdfPath: result.pdfPath })
          .where(eq(schema.employeeVersions.id, row.verId));
        pdfGenerated++;
      } catch (err) {
        pdfFailed++;
        console.warn(`PDF generation failed for ${row.matricule}: ${(err as Error).message}`);
      }
    }

    console.log(`✓ Generated ${pdfGenerated} new PDFs (${pdfFailed} failed)`);
    console.log("\n✅ PostgreSQL database seeding completed successfully!");
  } catch (err) {
    console.error("Error seeding PostgreSQL database:", err);
    throw err;
  }
}

// Merge TST Excel data (ST habilitation info) into existing employee versions
async function mergeTstData() {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const tstPath = path.join(dir, "seeds", "data", "employees_tst.xlsx");
  if (!fs.existsSync(tstPath)) {
    console.log("⚠ No TST Excel file found, skipping ST merge");
    return;
  }

  const wb = XLSX.read(fs.readFileSync(tstPath), { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws) as Record<string, any>[];
  let merged = 0;

  const ST_CODE_KEYS = ["H1N", "H1T", "H2N", "H2T"] as const;

  for (const row of rows) {
    const matricule = String(row["MATRICULE"] ?? "").trim();
    if (!matricule) continue;

    const [emp] = await db.select({ id: schema.employees.id, currentVersionId: schema.employees.currentVersionId })
      .from(schema.employees)
      .where(eq(schema.employees.matricule, matricule))
      .limit(1);
    if (!emp || !emp.currentVersionId) continue;

    const [ver] = await db.select()
      .from(schema.employeeVersions)
      .where(eq(schema.employeeVersions.id, emp.currentVersionId))
      .limit(1);
    if (!ver) continue;

    // Extract ST codes
    const newStCodes: string[] = [...((ver.stCodes as string[]) ?? [])];
    for (const code of ST_CODE_KEYS) {
      const val = String(row[code] ?? "").trim();
      if (val && val.toUpperCase() === code && !newStCodes.includes(code)) {
        newStCodes.push(code);
      }
    }

    // Build ST-specific habRows
    const existingHabRows = (ver.habRows as HabRows) ?? {};
    const domaine = String(row["DOMAINE DE TENSION"] ?? "").trim();
    const ouvrage = String(row["OUVRAGES CONCERNES"] ?? "").trim();

    for (const code of ST_CODE_KEYS) {
      if (!newStCodes.includes(code)) continue;
      const rawIndication = String(row[`INDICATIONS COMPLEMENTAIRES ${code}`] ?? "").trim();
      const indication = (rawIndication && rawIndication !== "***") ? rawIndication : "";
      existingHabRows[code] = { domaine, ouvrage, indication };
    }

    // Autorisation speciales verso
    const autorisation = String(row["AUTORISATION SPECIALES VERSO"] ?? "").trim() || null;

    await db.update(schema.employeeVersions)
      .set({
        stCodes: newStCodes,
        habRows: existingHabRows,
        autorisationSpecialesVerso: autorisation,
      })
      .where(eq(schema.employeeVersions.id, ver.id));

    merged++;
  }

  console.log(`✓ Merged TST data for ${merged}/${rows.length} employees`);
}

// Resync only names + fonctions from Excel without touching versions or org structure
export async function resyncEmployeeNames(): Promise<{ updated: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let updated = 0;
  let skipped = 0;

  const employees = await parseExcelData();

  for (const emp of employees) {
    try {
      const existing = await db
        .select({ id: schema.employees.id })
        .from(schema.employees)
        .where(eq(schema.employees.matricule, emp.matricule))
        .limit(1);

      if (existing.length === 0) {
        skipped++;
        continue;
      }

      const empId = existing[0].id;
      await db
        .update(schema.employees)
        .set({ nom: emp.nom, prenom: emp.prenom })
        .where(eq(schema.employees.id, empId));

      if (emp.fonction) {
        await db
          .update(schema.employeeVersions)
          .set({ fonction: emp.fonction })
          .where(eq(schema.employeeVersions.employeeId, empId));
      }

      updated++;
    } catch (err) {
      errors.push(`${emp.matricule}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`[resyncEmployeeNames] updated=${updated} skipped=${skipped} errors=${errors.length}`);
  return { updated, skipped, errors };
}

// Create employees present in the Excel source but missing from the database,
// without touching existing employees (use resyncEmployeeNames for that).
export async function syncNewEmployeesFromExcel(): Promise<{ created: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;
  let skipped = 0;

  const employeesData = await parseExcelData();

  const existingRows = await db.select({ matricule: schema.employees.matricule }).from(schema.employees);
  const existingMatricules = new Set(existingRows.map((r) => r.matricule));

  const divisionRows = await db.select().from(schema.divisions);
  const serviceRows = await db.select().from(schema.services);
  const equipeRows = await db.select().from(schema.equipes);

  for (const emp of employeesData) {
    if (existingMatricules.has(emp.matricule)) continue;

    if (!/^\d{5}$/.test(emp.matricule)) {
      skipped++;
      errors.push(`${emp.matricule}: format de matricule invalide (5 chiffres attendus)`);
      continue;
    }

    const division = divisionRows.find((d) => d.name === emp.division);
    if (!division) {
      skipped++;
      errors.push(`${emp.matricule}: division "${emp.division}" introuvable`);
      continue;
    }

    const service = serviceRows.find((s) => s.name === emp.service && s.divisionId === division.id);
    if (!service) {
      skipped++;
      errors.push(`${emp.matricule}: service "${emp.service}" introuvable`);
      continue;
    }

    const divServiceIds = serviceRows.filter((s) => s.divisionId === division.id).map((s) => s.id);
    const equipe = emp.equipe ? equipeRows.find((e) => e.name === emp.equipe && divServiceIds.includes(e.serviceId)) : undefined;

    try {
      const dateExpiration = emp.dateExpiration || calculateExpirationDate(emp.dateValidation, "HT");
      const nDeTitre = emp.nTitre || "INCONNU";

      await db.transaction(async (tx) => {
        const [newEmp] = await tx.insert(schema.employees)
          .values({ matricule: emp.matricule, nom: emp.nom, prenom: emp.prenom })
          .returning();

        const [version] = await tx.insert(schema.employeeVersions).values({
          employeeId: newEmp.id,
          versionNumber: 1,
          stCodes: emp.stCodes,
          htCodes: emp.htCodes,
          nDeTitre,
          fonction: emp.fonction,
          divisionId: division.id,
          serviceId: service.id,
          equipeId: equipe?.id ?? null,
          dateValidation: emp.dateValidation,
          dateExpiration,
        }).returning();

        await tx.update(schema.employees).set({ currentVersionId: version.id }).where(eq(schema.employees.id, newEmp.id));

        const [auditLog] = await tx.insert(schema.auditLogs).values({
          action: "CREATE_EMPLOYEE",
          entityId: newEmp.id,
          snapshotOld: null,
          snapshotNew: { matricule: emp.matricule, nom: emp.nom, prenom: emp.prenom, versionId: version.id, source: "excel-sync" } as any,
        }).returning();

        await tx.update(schema.employeeVersions).set({ auditLogId: auditLog.id }).where(eq(schema.employeeVersions.id, version.id));
      });

      existingMatricules.add(emp.matricule);
      created++;
    } catch (err) {
      errors.push(`${emp.matricule}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`[syncNewEmployeesFromExcel] created=${created} skipped=${skipped} errors=${errors.length}`);
  return { created, skipped, errors };
}
