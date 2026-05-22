import { db } from "../db-pg";
import * as schema from "../schema";
import { eq } from "drizzle-orm";

interface EmployeeSeedData {
  matricule: string;
  nom: string;
  prenom: string;
  fonction: string;
  divisionId: number;
  serviceId: number;
  equipeId?: number;
  stCodes?: string[];
  htCodes?: string[];
  nDeTitre?: string;
  dateValidation?: string;
  dateExpiration?: string;
}

const EMPLOYEES_SEED_DATA: EmployeeSeedData[] = [
  {
    matricule: "81628",
    nom: "DUBOIS",
    prenom: "Jean",
    fonction: "Électricien",
    divisionId: 1,
    serviceId: 1,
    equipeId: 1,
    stCodes: [],
    htCodes: ["H1V", "B1V"],
    nDeTitre: "81628_001",
    dateValidation: "2023-01-01",
    dateExpiration: "2026-01-01",
  },
  {
    matricule: "81629",
    nom: "MARTIN",
    prenom: "Marie",
    fonction: "Technicien",
    divisionId: 1,
    serviceId: 1,
    equipeId: 1,
    stCodes: [],
    htCodes: ["H2V"],
    nDeTitre: "81629_001",
    dateValidation: "2023-06-01",
    dateExpiration: "2026-06-01",
  },
];

export async function seedEmployees(): Promise<{
  success: boolean;
  inserted: number;
  skipped: number;
  errors: string[];
}> {
  const result = { success: true, inserted: 0, skipped: 0, errors: [] as string[] };

  try {
    let existingCount: any[] = [];
    try {
      existingCount = await db.select().from(schema.employees).limit(1);
    } catch (checkErr) {
      result.success = false;
      result.errors.push("Could not check database schema - seed skipped. Run: pnpm db:push");
      return result;
    }

    if (existingCount.length > 0) {
      console.log("[SEED] Employees already exist. Skipping seed.");
      result.skipped = 1;
      return result;
    }

    const divisions = await db.select().from(schema.divisions).limit(1);
    if (divisions.length === 0) {
      result.success = false;
      result.errors.push("Organization structure (divisions) not found. Seed aborted.");
      return result;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const empData of EMPLOYEES_SEED_DATA) {
      try {
        if (!empData.matricule || !empData.nom || !empData.prenom || !empData.fonction) {
          throw new Error("Missing required fields");
        }

        const existing = await db
          .select()
          .from(schema.employees)
          .where(eq(schema.employees.matricule, empData.matricule));

        if (existing.length > 0) {
          console.warn(`[SEED] Employee ${empData.matricule} already exists. Skipping.`);
          continue;
        }

        const today = new Date().toISOString().split("T")[0];
        const expiry = new Date(new Date().getFullYear() + 3, new Date().getMonth(), new Date().getDate())
          .toISOString().split("T")[0];

        const insertedEmp = await db
          .insert(schema.employees)
          .values({
            matricule: empData.matricule,
            nom: empData.nom,
            prenom: empData.prenom,
            deleted: false,
          })
          .returning();

        if (insertedEmp.length === 0) throw new Error("Insert failed");
        const empId = insertedEmp[0].id;

        const hasCodes = (empData.stCodes && empData.stCodes.length > 0) ||
          (empData.htCodes && empData.htCodes.length > 0);

        const insertedVersion = await db
          .insert(schema.employeeVersions)
          .values({
            employeeId: empId,
            versionNumber: 1,
            stCodes: empData.stCodes || [],
            htCodes: empData.htCodes || [],
            nDeTitre: empData.nDeTitre || `${empData.matricule}_001`,
            fonction: empData.fonction,
            divisionId: empData.divisionId,
            serviceId: empData.serviceId,
            equipeId: empData.equipeId || null,
            dateValidation: empData.dateValidation || today,
            dateExpiration: empData.dateExpiration || expiry,
          })
          .returning();

        if (insertedVersion.length === 0) throw new Error("Version insert failed");

        await db
          .update(schema.employees)
          .set({ currentVersionId: insertedVersion[0].id })
          .where(eq(schema.employees.id, empId));

        successCount++;
        console.log(`[SEED] ✓ Created employee ${empData.matricule} (${successCount}/${EMPLOYEES_SEED_DATA.length})`);
      } catch (err) {
        errorCount++;
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[SEED] ✗ Failed to seed ${empData.matricule}: ${errorMsg}`);
        result.errors.push(`${empData.matricule}: ${errorMsg}`);
      }
    }

    result.inserted = successCount;
    if (errorCount > 0) {
      result.success = false;
      console.warn(`[SEED] Completed with ${errorCount} errors`);
    } else {
      console.log(`[SEED] ✓ Successfully seeded ${successCount} employees`);
    }

    return result;
  } catch (err) {
    result.success = false;
    const errorMsg = err instanceof Error ? err.message : String(err);
    result.errors.push(errorMsg);
    console.error("[SEED] Fatal error during seed:", err);
    return result;
  }
}

let seedInitialized = false;

export async function initializeSeedOnce(): Promise<void> {
  if (seedInitialized) return;

  try {
    const result = await seedEmployees();
    if (result.success) {
      console.log(`[SEED] ✓ Initialization complete: ${result.inserted} employees inserted`);
    } else {
      console.warn("[SEED] Seed completed with errors:", result.errors);
    }
    seedInitialized = true;
  } catch (err) {
    console.error("[SEED] Fatal error initializing seed:", err);
    seedInitialized = true;
  }
}

export default { seedEmployees, initializeSeedOnce };
