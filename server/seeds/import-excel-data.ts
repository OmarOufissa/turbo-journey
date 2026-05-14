/**
 * One-time importer: reads seeds/data/employees.xlsx and populates the DB.
 * Run: npx ts-node server/seeds/import-excel-data.ts
 *   or: pnpm tsx server/seeds/import-excel-data.ts
 *
 * Normalizations applied:
 *   - All org strings: trim + collapse multiple spaces
 *   - Fonctions: mapped to canonical VALID_FONCTIONS list
 *   - H0V/B0V → stCodes ; H1V/B1V/H2V/B2V/HC/BC/BR/SF6 → htCodes
 *   - "xxx" values → treated as absent
 *   - Excel serial dates → ISO YYYY-MM-DD
 *   - Names: NOT case-changed (kept as-is), split at first mixed-case word;
 *     if all-caps → last word = prenom, rest = nom
 *
 * Skipped rows (logged):
 *   - service === "xxx"
 *   - equipe === division name (data error in source file)
 */

import path from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import { db } from "../db-pg";
import * as schema from "../schema";
import { eq, sql } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXCEL_PATH = path.join(__dirname, "data", "employees.xlsx");

const CODE_MAP: Record<string, "st" | "ht"> = {
  H0V: "st",
  B0V: "st",
  H1V: "ht",
  B1V: "ht",
  H2V: "ht",
  B2V: "ht",
  HC: "ht",
  BC: "ht",
  BR: "ht",
  SF6: "ht",
};
const ALL_CODE_COLS = Object.keys(CODE_MAP);

// Canonical fonction values (normalized)
const FONCTION_CANONICAL: Record<string, string> = {
  "cadre contrôle commande rt": "Cadre Contrôle Commande RT",
  "cadre exploitation réseau": "Cadre Exploitation Réseau",
  "cadre lignes tht&ht": "Cadre Lignes THT&HT",
  "cadre postes tht/ht": "Cadre Postes THT/HT",
  "cadre tst lignes tht&ht": "Cadre TST Lignes THT&HT",
  "cadre technique": "Cadre Technique",
  "cadre télécom": "Cadre Télécom",
  "chef d'equipe electromécanicien": "Chef d'Equipe Electromécanicien",
  "chef d'equipe isolation thermique": "Chef d'Equipe Isolation Thermique",
  "chef d'equipe lignes tht&ht": "Chef d'Equipe Lignes THT&HT",
  "chef d'equipe postes tht/ht": "Chef d'Equipe Postes THT/HT",
  "chef de division": "Chef de Division",
  "chef de service": "Chef de Service",
  "conducteur engins spéciaux": "Conducteur Engins Spéciaux",
  "conducteur principal de direction": "Conducteur Principal de Direction",
  "conducteur travaux génie civil": "Conducteur Travaux Génie Civil",
  "conducteur mécanicien": "Conducteur Mécanicien",
  "contremaître lignes tht&ht": "Contremaître Lignes THT&HT",
  "contremaître postes tht/ht": "Contremaître Postes THT/HT",
  "contremaître tst postes tht/ht": "Contremaître TST Postes THT/HT",
  "contrôleur travaux génie civil": "Contrôleur Travaux Génie Civil",
  "monteur de lignes tht&ht": "Monteur de Lignes THT&HT",
  "opérateur tst lignes tht&ht": "Opérateur TST Lignes THT&HT",
  "opérateur tst postes tht/ht": "Opérateur TST Postes THT/HT",
  "ouvrier professionnel réseau": "Ouvrier Professionnel Réseau",
  "projeteur lignes tht&ht": "Projeteur Lignes THT&HT",
  "surveillant travaux génie civil": "Surveillant Travaux Génie Civil",
  "technicien contrôle commande rt": "Technicien Contrôle Commande RT",
  "technicien exploitation réseau": "Technicien Exploitation Réseau",
  "technicien lignes tht&ht": "Technicien Lignes THT&HT",
  "technicien principal contrôle commande rt": "Technicien Principal Contrôle Commande RT",
  "technicien principal exploitation réseau": "Technicien Principal Exploitation Réseau",
  "technicien spécialisé télécom": "Technicien Spécialisé Télécom",
};

function normalizeString(s: unknown): string {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

function normalizeOrg(s: unknown): string {
  const normalized = normalizeString(s);
  return normalized === "xxx" ? "" : normalized;
}

function normalizeFonction(raw: unknown): string {
  const s = normalizeString(raw);
  const key = s.toLowerCase();
  return FONCTION_CANONICAL[key] ?? s;
}

// Particles that appear at the START of a Moroccan/Arabic family name (compound nom)
const FAMILY_PREFIX = new Set(["EL", "AL", "BEN", "AIT", "BENI", "BENT", "BNOU", "IBN", "ECH", "ABI"]);
// Particles that appear in the MIDDLE before the actual given name (compound prenom)
const PRENOM_PARTICLE = new Set(["EL", "AL"]);

function splitName(full: string): { nom: string; prenom: string } {
  const clean = full.trim().replace(/\s+/g, " ");
  const parts = clean.split(" ");
  if (parts.length === 1) return { nom: clean, prenom: "" };

  // Mixed-case present → split at first word with lowercase (reliable)
  for (let i = 1; i < parts.length; i++) {
    if (/[a-z]/.test(parts[i])) {
      return {
        nom: parts.slice(0, i).join(" "),
        prenom: parts.slice(i).join(" "),
      };
    }
  }

  // All-caps name: apply positional heuristics
  if (parts.length >= 3) {
    // Rule 1: first word is a known family-name prefix → nom = first 2 words, prenom = rest
    // e.g. "EL KARFI TARIQ" → "EL KARFI" / "TARIQ"
    // e.g. "AIT LABSIR AYMAN" → "AIT LABSIR" / "AYMAN"
    if (FAMILY_PREFIX.has(parts[0])) {
      return {
        nom: parts.slice(0, 2).join(" "),
        prenom: parts.slice(2).join(" "),
      };
    }

    // Rule 2: second-to-last word is a given-name particle → nom = all before it, prenom = particle + last
    // e.g. "DERRICH EL MEHDI" → "DERRICH" / "EL MEHDI"
    // e.g. "ZERIAT EL MAHDI"  → "ZERIAT"  / "EL MAHDI"
    const secondToLast = parts[parts.length - 2];
    if (PRENOM_PARTICLE.has(secondToLast)) {
      return {
        nom: parts.slice(0, -2).join(" "),
        prenom: parts.slice(-2).join(" "),
      };
    }
  }

  // Default: first word = nom, rest = prenom
  // e.g. "RACHIDI SAID" → "RACHIDI" / "SAID"
  // e.g. "AIACHI MOHAMMED AMINE" → "AIACHI" / "MOHAMMED AMINE"
  return {
    nom: parts[0],
    prenom: parts.slice(1).join(" "),
  };
}

function excelDateToISO(val: unknown): string {
  if (!val) return "";
  if (typeof val === "number") {
    const d = new Date((val - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
}

function parseCodes(row: Record<string, unknown>): { stCodes: string[]; htCodes: string[] } {
  const stCodes: string[] = [];
  const htCodes: string[] = [];
  for (const col of ALL_CODE_COLS) {
    const val = normalizeString(row[col]);
    if (val === col) {
      // Present: column contains its own name
      if (CODE_MAP[col] === "st") stCodes.push(col);
      else htCodes.push(col);
    }
  }
  return { stCodes, htCodes };
}

// Upsert helpers — return id
async function upsertDivision(name: string): Promise<number> {
  const existing = await db
    .select({ id: schema.divisions.id })
    .from(schema.divisions)
    .where(eq(schema.divisions.name, name))
    .limit(1);
  if (existing.length > 0) return existing[0].id;
  const [ins] = await db.insert(schema.divisions).values({ name }).returning({ id: schema.divisions.id });
  return ins.id;
}

async function upsertService(name: string, divisionId: number): Promise<number> {
  const existing = await db
    .select({ id: schema.services.id })
    .from(schema.services)
    .where(eq(schema.services.name, name))
    .limit(1);
  if (existing.length > 0) return existing[0].id;
  const [ins] = await db.insert(schema.services).values({ name, divisionId }).returning({ id: schema.services.id });
  return ins.id;
}

async function upsertEquipe(name: string, serviceId: number): Promise<number> {
  const existing = await db
    .select({ id: schema.equipes.id })
    .from(schema.equipes)
    .where(eq(schema.equipes.name, name))
    .limit(1);
  if (existing.length > 0) return existing[0].id;
  const [ins] = await db.insert(schema.equipes).values({ name, serviceId }).returning({ id: schema.equipes.id });
  return ins.id;
}

async function importEmployee(
  matricule: string,
  nom: string,
  prenom: string,
  fonction: string,
  divisionId: number,
  serviceId: number,
  equipeId: number | null,
  stCodes: string[],
  htCodes: string[],
  nDeTitre: string,
  dateValidation: string,
  dateExpiration: string,
): Promise<void> {
  const existing = await db
    .select({ id: schema.employees.id })
    .from(schema.employees)
    .where(eq(schema.employees.matricule, matricule))
    .limit(1);

  let empId: number;
  if (existing.length > 0) {
    empId = existing[0].id;
    await db.update(schema.employees).set({ nom, prenom }).where(eq(schema.employees.id, empId));
  } else {
    const [emp] = await db
      .insert(schema.employees)
      .values({ matricule, nom, prenom, deleted: false })
      .returning({ id: schema.employees.id });
    empId = emp.id;
  }

  const [{ maxVer }] = await db
    .select({ maxVer: sql<number>`coalesce(max(version_number), 0)` })
    .from(schema.employeeVersions)
    .where(eq(schema.employeeVersions.employeeId, empId));

  const [version] = await db
    .insert(schema.employeeVersions)
    .values({
      employeeId: empId,
      versionNumber: Number(maxVer) + 1,
      stCodes,
      htCodes,
      nDeTitre,
      fonction,
      divisionId,
      serviceId,
      equipeId,
      dateValidation,
      dateExpiration,
    })
    .returning({ id: schema.employeeVersions.id });

  await db
    .update(schema.employees)
    .set({ currentVersionId: version.id })
    .where(eq(schema.employees.id, empId));

  await db.insert(schema.auditLogs).values({
    action: "IMPORT_EMPLOYEES",
    entityId: empId,
    snapshotOld: null,
    snapshotNew: { matricule, versionId: version.id, source: "excel_import" } as any,
  });
}

export async function runExcelImport(): Promise<void> {
  console.log("Reading:", EXCEL_PATH);
  const wb = XLSX.readFile(EXCEL_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  console.log(`Found ${rows.length} rows`);

  // Pre-build division/service/equipe ID caches
  const divCache = new Map<string, number>();
  const svcCache = new Map<string, number>();
  const eqpCache = new Map<string, number>();

  let imported = 0;
  let skipped = 0;
  const skippedLog: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNum = i + 2;

    const matricule = normalizeString(r["MATRICULE"]);
    if (!matricule) {
      skippedLog.push(`Row ${rowNum}: no matricule`);
      skipped++;
      continue;
    }

    const divName = normalizeOrg(r["DIVISION"]);
    const svcName = normalizeOrg(r["SERVICE"]);
    const eqpRaw = normalizeOrg(r["EQUIPE"]);

    if (!divName) {
      skippedLog.push(`Row ${rowNum} (${matricule}): no division`);
      skipped++;
      continue;
    }
    if (!svcName) {
      skippedLog.push(`Row ${rowNum} (${matricule}): service=xxx — skipped (no service assigned)`);
      skipped++;
      continue;
    }

    const fullName = normalizeString(r["Nom & Prénom "]);
    const { nom, prenom } = splitName(fullName);
    const fonction = normalizeFonction(r["fonction RH"]) || "Non spécifié";
    const { stCodes, htCodes } = parseCodes(r);
    const dateValidation = excelDateToISO(r["Date Validation"]);
    const dateExpiration = excelDateToISO(r["Date Expiration"]);

    let nDeTitre = normalizeString(r["N° du titre"]);
    if (!nDeTitre) nDeTitre = `H0B0-${matricule}`;

    if (stCodes.length === 0 && htCodes.length === 0) {
      skippedLog.push(`Row ${rowNum} (${matricule}): no habilitation codes`);
      skipped++;
      continue;
    }

    try {
      // Upsert division
      if (!divCache.has(divName)) divCache.set(divName, await upsertDivision(divName));
      const divisionId = divCache.get(divName)!;

      // Upsert service
      const svcKey = `${divisionId}::${svcName}`;
      if (!svcCache.has(svcKey)) svcCache.set(svcKey, await upsertService(svcName, divisionId));
      const serviceId = svcCache.get(svcKey)!;

      // Upsert equipe (if valid: not empty, not equal to division name)
      let equipeId: number | null = null;
      if (eqpRaw && eqpRaw !== divName) {
        const eqpKey = `${serviceId}::${eqpRaw}`;
        if (!eqpCache.has(eqpKey)) eqpCache.set(eqpKey, await upsertEquipe(eqpRaw, serviceId));
        equipeId = eqpCache.get(eqpKey)!;
      }

      await importEmployee(
        matricule, nom, prenom, fonction,
        divisionId, serviceId, equipeId,
        stCodes, htCodes, nDeTitre,
        dateValidation, dateExpiration,
      );

      imported++;
      if (imported % 50 === 0) console.log(`  ...${imported} imported`);
    } catch (err) {
      skippedLog.push(`Row ${rowNum} (${matricule}): ERROR — ${(err as Error).message}`);
      skipped++;
    }
  }

  console.log(`\nImport complete: ${imported} imported, ${skipped} skipped`);
  if (skippedLog.length > 0) {
    console.log("Skipped rows:");
    skippedLog.forEach((l) => console.log(" ", l));
  }
}

async function main() {
  // Create tables without seeding employees
  const { createTablesIfNotExist } = await import("../db-pg.js");
  await createTablesIfNotExist();
  console.log("Tables ready");
  await runExcelImport();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Import failed:", err);
    process.exit(1);
  });
