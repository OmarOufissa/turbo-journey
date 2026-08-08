import { db } from "../db";
import { divisions, services, equipes } from "../schema";
import { eq, count } from "drizzle-orm";

/**
 * Organization Structure Seed Data
 * 
 * Structure:
 * - 3 Divisions: Operations, Support, Administration
 * - 9 Services: 3 per division
 * - 18 Équipes: 2 per service
 */

const ORG_STRUCTURE = {
  divisions: [
    {
      name: "Operations",
      services: [
        {
          name: "Électricité",
          equipes: ["Installation", "Maintenance"],
        },
        {
          name: "Hydraulique",
          equipes: ["Installation", "Maintenance"],
        },
        {
          name: "Contrôle",
          equipes: ["Tests", "Inspection"],
        },
      ],
    },
    {
      name: "Support",
      services: [
        {
          name: "Maintenance",
          equipes: ["Préventive", "Corrective"],
        },
        {
          name: "Documentation",
          equipes: ["Techniques", "Utilisateur"],
        },
        {
          name: "Formation",
          equipes: ["Interne", "Externe"],
        },
      ],
    },
    {
      name: "Administration",
      services: [
        {
          name: "Ressources Humaines",
          equipes: ["Recrutement", "Paie"],
        },
        {
          name: "Finances",
          equipes: ["Comptabilité", "Budget"],
        },
        {
          name: "Qualité",
          equipes: ["Assurance", "Amélioration"],
        },
      ],
    },
  ],
};

/**
 * Seeds organization structure into database if not already present
 * Idempotent: safe to run multiple times
 */
export async function seedOrganizationStructure(): Promise<void> {
  try {
    // Check if divisions already exist
    const divisionCount = await db
      .select({ count: count() })
      .from(divisions);
    
    if (divisionCount[0].count > 0) {
      console.log("✓ Organization structure already seeded, skipping...");
      return;
    }

    console.log("🌱 Seeding organization structure...");

    // Insert divisions, services, and equipes in transaction
    for (const divisionData of ORG_STRUCTURE.divisions) {
      // Insert division
      const [division] = await db
        .insert(divisions)
        .values({ name: divisionData.name })
        .returning({ id: divisions.id });

      if (!division) {
        throw new Error(`Failed to create division: ${divisionData.name}`);
      }

      // Insert services for this division
      for (const serviceData of divisionData.services) {
        const [service] = await db
          .insert(services)
          .values({
            name: serviceData.name,
            divisionId: division.id,
          })
          .returning({ id: services.id });

        if (!service) {
          throw new Error(`Failed to create service: ${serviceData.name}`);
        }

        // Insert equipes for this service
        for (const equipeName of serviceData.equipes) {
          await db.insert(equipes).values({
            name: equipeName,
            serviceId: service.id,
          });
        }
      }
    }

    console.log(
      "✓ Organization structure seeded successfully! (3 divisions, 9 services, 18 equipes)"
    );
  } catch (error) {
    console.error("✗ Failed to seed organization structure:", error);
    throw error;
  }
}

/**
 * Initialize organization structure once on server startup
 * Wraps seedOrganizationStructure with error handling
 */
export async function initializeOrgStructureOnce(): Promise<void> {
  try {
    await seedOrganizationStructure();
  } catch (error) {
    console.error("Failed to initialize organization structure:", error);
    // Don't throw - allow server to continue even if seeding fails
    // This prevents startup failures on subsequent runs
  }
}
