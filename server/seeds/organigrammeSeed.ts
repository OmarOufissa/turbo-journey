import { db } from "../db";
import { divisions, services, equipes, employees } from "../schema";
import { count, eq, and } from "drizzle-orm";
import { ORGANIGRAMME_EMPLOYEES } from "./organigrammeData";

/**
 * Seeds the real Direction Transport Centre Casa organizational data
 * (divisions, services, equipes, employees) from the Organigramme
 * Affectation Nominative, replacing the generic placeholder org structure.
 * Idempotent: only runs on an empty employees table.
 */
export async function seedOrganigramme(): Promise<void> {
  const existing = await db.select({ count: count() }).from(employees);
  if (existing[0].count > 0) {
    console.log("✓ Employees already seeded, skipping organigramme seed...");
    return;
  }

  console.log("🌱 Seeding organigramme (Direction Transport Centre Casa)...");

  const divisionIds = new Map<string, number>();
  const serviceIds = new Map<string, number>(); // key: division|service
  const equipeIds = new Map<string, number>(); // key: division|service|equipe

  for (const emp of ORGANIGRAMME_EMPLOYEES) {
    if (!divisionIds.has(emp.division)) {
      const [row] = await db.insert(divisions).values({ name: emp.division }).returning({ id: divisions.id });
      divisionIds.set(emp.division, row.id);
    }

    if (emp.service !== "-") {
      const serviceKey = `${emp.division}|${emp.service}`;
      if (!serviceIds.has(serviceKey)) {
        const [row] = await db
          .insert(services)
          .values({ name: emp.service, divisionId: divisionIds.get(emp.division)! })
          .returning({ id: services.id });
        serviceIds.set(serviceKey, row.id);
      }

      if (emp.equipe !== "-") {
        const equipeKey = `${serviceKey}|${emp.equipe}`;
        if (!equipeIds.has(equipeKey)) {
          const [row] = await db
            .insert(equipes)
            .values({ name: emp.equipe, serviceId: serviceIds.get(serviceKey)! })
            .returning({ id: equipes.id });
          equipeIds.set(equipeKey, row.id);
        }
      }
    }
  }

  let inserted = 0;
  for (const emp of ORGANIGRAMME_EMPLOYEES) {
    const divisionId = divisionIds.get(emp.division)!;
    const serviceKey = `${emp.division}|${emp.service}`;
    const equipeKey = `${serviceKey}|${emp.equipe}`;
    const serviceId = emp.service !== "-" ? serviceIds.get(serviceKey) ?? null : null;
    const equipeId = emp.service !== "-" && emp.equipe !== "-" ? equipeIds.get(equipeKey) ?? null : null;

    await db.insert(employees).values({
      matricule: emp.matricule,
      nom: emp.nom,
      prenom: emp.prenom,
      fonction: emp.fonction,
      divisionId,
      serviceId,
      equipeId,
      status: "ACTIVE",
    });
    inserted++;
  }

  console.log(
    `✓ Organigramme seeded successfully! (${divisionIds.size} divisions, ${serviceIds.size} services, ${equipeIds.size} equipes, ${inserted} employees)`,
  );
}

export async function initializeOrganigrammeOnce(): Promise<void> {
  try {
    await seedOrganigramme();
  } catch (error) {
    console.error("Failed to initialize organigramme:", error);
  }
}

/**
 * The single "Chef de Division" for a given division, used to auto-fill the
 * "Je soussigné" (proposer) block on habilitation request forms.
 */
export async function getChefDeDivision(divisionId: number) {
  const rows = await db
    .select()
    .from(employees)
    .where(and(eq(employees.divisionId, divisionId), eq(employees.fonction, "Chef de Division")))
    .limit(1);
  return rows[0] ?? null;
}
