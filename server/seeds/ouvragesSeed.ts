import { db } from "../db";
import { ouvrages, divisions, services } from "../schema";
import { count, eq } from "drizzle-orm";

/**
 * Ouvrages (electrical installations) seed data
 *
 * Generates a small set of sample ouvrages per division/service so the
 * "Demande d'habilitation" module has real data to search and select from.
 * Idempotent: safe to run multiple times, only runs on an empty table.
 */

const OUVRAGE_TEMPLATES: Array<{ name: string; type: string; tensionDomain: string }> = [
  { name: "Poste HTB", type: "Poste", tensionDomain: "HTB" },
  { name: "Poste HTA", type: "Poste", tensionDomain: "HTA" },
  { name: "Ligne HTA", type: "Ligne", tensionDomain: "HTA" },
  { name: "Réseau BT", type: "Réseau", tensionDomain: "BT" },
];

export async function seedOuvrages(): Promise<void> {
  try {
    const existing = await db.select({ count: count() }).from(ouvrages);
    if (existing[0].count > 0) {
      console.log("✓ Ouvrages already seeded, skipping...");
      return;
    }

    const allServices = await db
      .select({ id: services.id, name: services.name, divisionId: services.divisionId })
      .from(services);

    if (allServices.length === 0) {
      console.log("✓ No services found yet, skipping ouvrages seed");
      return;
    }

    console.log("🌱 Seeding ouvrages...");

    let createdCount = 0;
    for (const service of allServices) {
      for (const template of OUVRAGE_TEMPLATES) {
        await db.insert(ouvrages).values({
          name: `${template.name} - ${service.name}`,
          type: template.type,
          tensionDomain: template.tensionDomain,
          divisionId: service.divisionId,
          serviceId: service.id,
        });
        createdCount++;
      }
    }

    console.log(`✓ Ouvrages seeded successfully! (${createdCount} ouvrages)`);
  } catch (error) {
    console.error("✗ Failed to seed ouvrages:", error);
    throw error;
  }
}

export async function initializeOuvragesOnce(): Promise<void> {
  try {
    await seedOuvrages();
  } catch (error) {
    console.error("Failed to initialize ouvrages:", error);
    // Don't throw - allow server to continue even if seeding fails
  }
}
