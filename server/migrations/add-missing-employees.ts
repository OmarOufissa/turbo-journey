import { db } from "../db-pg";
import * as schema from "../schema";
import { eq } from "drizzle-orm";
import { logger } from "../utils/logger";
import { parseExcelData } from "../seed-pg";
import { calculateExpirationDate } from "../org-structure";
import { VALID_MATRICULES } from "./remove-demo-employees";

export async function addMissingEmployees(): Promise<void> {
  try {
    const excelEmployees = await parseExcelData();
    if (excelEmployees.length === 0) return;

    // Load org structure IDs once
    const divisions = await db.select().from(schema.divisions);
    const services = await db.select().from(schema.services);
    const equipes = await db.select().from(schema.equipes);

    const divisionMap = new Map(divisions.map(d => [d.name, d.id]));
    const serviceMap = new Map(services.map(s => [`${s.divisionId}|${s.name}`, s.id]));
    const equipeMap = new Map(equipes.map(e => [`${e.serviceId}|${e.name}`, e.id]));

    let inserted = 0;
    let skipped = 0;

    for (const emp of excelEmployees) {
      try {
        if (!VALID_MATRICULES.has(emp.matricule)) { skipped++; continue; }

        const existing = await db.select({ id: schema.employees.id })
          .from(schema.employees)
          .where(eq(schema.employees.matricule, emp.matricule))
          .limit(1);

        if (existing.length > 0) { skipped++; continue; }

        const divisionId = divisionMap.get(emp.division);
        if (!divisionId) { skipped++; continue; }

        const serviceId = serviceMap.get(`${divisionId}|${emp.service}`);
        if (!serviceId) { skipped++; continue; }

        const equipeId = emp.equipe ? equipeMap.get(`${serviceId}|${emp.equipe}`) ?? null : null;

        const [newEmp] = await db.insert(schema.employees)
          .values({ matricule: emp.matricule, nom: emp.nom, prenom: emp.prenom, deleted: false })
          .returning({ id: schema.employees.id });

        const [ver] = await db.insert(schema.employeeVersions)
          .values({
            employeeId: newEmp.id,
            versionNumber: 1,
            stCodes: emp.stCodes,
            htCodes: emp.htCodes,
            nDeTitre: emp.nTitre || "INCONNU",
            fonction: emp.fonction || "Non spécifié",
            divisionId,
            serviceId,
            equipeId,
            dateValidation: emp.dateValidation,
            dateExpiration: emp.dateExpiration || calculateExpirationDate(emp.dateValidation, "HT"),
          })
          .returning({ id: schema.employeeVersions.id });

        await db.update(schema.employees)
          .set({ currentVersionId: ver.id })
          .where(eq(schema.employees.id, newEmp.id));

        inserted++;
      } catch (err) {
        logger.error("app", `addMissingEmployees: failed for ${emp.matricule}`, { error: String(err) });
      }
    }

    if (inserted > 0) {
      logger.info("app", `addMissingEmployees: inserted ${inserted} new employees from Excel (${skipped} already existed)`);
    }
  } catch (err) {
    logger.error("app", "addMissingEmployees: fatal error", { error: String(err) });
  }
}
