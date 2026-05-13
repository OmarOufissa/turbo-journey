import { db } from "../db-pg";
import * as schema from "../schema";
import { count, eq } from "drizzle-orm";

interface DemoEmployee {
  matricule: string;
  nom: string;
  prenom: string;
  fonction: string;
  divisionId: number;
  serviceId: number;
  equipeId: number;
  htCodes: string[];
  stCodes: string[];
  dateValidation: string;
  dateExpiration: string;
}

const FONCTIONS = [
  "Électricien", "Technicien", "Ingénieur", "Opérateur", "Chef d'équipe",
  "Assistant", "Superviseur", "Coordinateur", "Spécialiste", "Agent",
];

const HT_CODES_POOL = ["H1V", "H2V", "B1V", "B2V", "HC", "H1N"];

function generateDemoEmployees(): DemoEmployee[] {
  const result: DemoEmployee[] = [];

  const noms = [
    "DUBOIS", "MARTIN", "BERNARD", "THOMAS", "ROBERT", "RICHARD", "PETIT",
    "DURAND", "LEFEVRE", "MOREAU", "SIMON", "LAURENT", "LEFEBVRE", "MICHEL",
    "GARCIA", "DAVID", "BERTRAND", "ROUX", "VINCENT", "FOURNIER", "MOREL",
    "GIRARD", "ANDRE", "LEROY", "BONNET", "FONTAINE", "CHESSEX", "PERRIN",
    "TESSIER", "CARON", "JOUBERT", "NAVARRO", "BLANC", "GUERIN", "BOYER",
    "HUBERT", "DESCHAMPS", "RENAULT", "GAILLARD", "LOMBARD", "ARNOULD",
    "POULAIN", "MARTEL", "ROYER", "FABRY", "CLEMENT", "PELLETIER", "MASSE", "PERRON", "DUPONT",
  ];

  const prenoms = [
    "Jean", "Marie", "Pierre", "Paul", "Marc", "Andre", "Philippe", "Brigitte",
    "Claude", "Francoise", "Christiane", "Laurent", "Bernard", "Anne", "Christine",
    "Michel", "Nicole", "Alain", "Valerie", "Sylvie", "Didier", "Veronique",
    "Christian", "Monique", "Thierry", "Micheline", "Eric", "Colette", "Dominique",
    "Christophe", "Helene", "Pauline", "Serge", "Ghislaine", "Yannick",
    "Sandrine", "Joel", "Jacqueline", "Olivier", "Vincent", "Stephanie",
    "Nicolas", "Celine", "Francois", "Carole", "Jerome", "Martine", "Louis", "Sophie", "Thomas",
  ];

  let index = 0;

  // Division 1: 20 employees
  for (let i = 0; i < 20; i++) {
    result.push({
      matricule: String(81628 + index),
      nom: noms[index % noms.length],
      prenom: prenoms[index % prenoms.length],
      fonction: FONCTIONS[index % FONCTIONS.length],
      divisionId: 1,
      serviceId: Math.min(3, 1 + Math.floor(i / 7)),
      equipeId: 1 + (i % 6),
      htCodes: [HT_CODES_POOL[index % 3], HT_CODES_POOL[(index + 1) % 3]],
      stCodes: [],
      dateValidation: "2023-03-15",
      dateExpiration: generateExpirationDate(i),
    });
    index++;
  }

  // Division 2: 15 employees
  for (let i = 0; i < 15; i++) {
    result.push({
      matricule: String(81628 + index),
      nom: noms[index % noms.length],
      prenom: prenoms[index % prenoms.length],
      fonction: FONCTIONS[index % FONCTIONS.length],
      divisionId: 2,
      serviceId: Math.min(6, 4 + Math.floor(i / 5)),
      equipeId: 7 + (i % 6),
      htCodes: [HT_CODES_POOL[index % 3], HT_CODES_POOL[(index + 1) % 3]],
      stCodes: [],
      dateValidation: "2023-06-20",
      dateExpiration: generateExpirationDate(i),
    });
    index++;
  }

  // Division 3: 15 employees
  for (let i = 0; i < 15; i++) {
    result.push({
      matricule: String(81628 + index),
      nom: noms[index % noms.length],
      prenom: prenoms[index % prenoms.length],
      fonction: FONCTIONS[index % FONCTIONS.length],
      divisionId: 3,
      serviceId: Math.min(9, 7 + Math.floor(i / 5)),
      equipeId: 13 + (i % 6),
      htCodes: [HT_CODES_POOL[index % 3], HT_CODES_POOL[(index + 1) % 3]],
      stCodes: [],
      dateValidation: "2023-09-10",
      dateExpiration: generateExpirationDate(i),
    });
    index++;
  }

  return result;
}

function generateExpirationDate(index: number): string {
  const today = new Date();
  const offsets = [-60, 45, 150, 220, 400];
  const daysOffset = offsets[index % 5];
  const d = new Date(today);
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split("T")[0];
}

export async function seedDemoEmployees(): Promise<void> {
  try {
    const employeeCount = await db.select({ count: count() }).from(schema.employees);
    if (employeeCount[0].count > 0) {
      console.log("✓ Demo employees already seeded, skipping...");
      return;
    }

    console.log("Seeding 50 demo employees...");
    const demoEmployees = generateDemoEmployees();

    for (const empData of demoEmployees) {
      const [insertedEmployee] = await db
        .insert(schema.employees)
        .values({
          matricule: empData.matricule,
          nom: empData.nom,
          prenom: empData.prenom,
          deleted: false,
        })
        .returning({ id: schema.employees.id });

      if (!insertedEmployee) {
        throw new Error(`Failed to create employee: ${empData.matricule}`);
      }

      const [insertedVersion] = await db
        .insert(schema.employeeVersions)
        .values({
          employeeId: insertedEmployee.id,
          versionNumber: 1,
          stCodes: empData.stCodes,
          htCodes: empData.htCodes,
          nDeTitre: `${empData.matricule}_01`,
          fonction: empData.fonction,
          divisionId: empData.divisionId,
          serviceId: empData.serviceId,
          equipeId: empData.equipeId,
          dateValidation: empData.dateValidation,
          dateExpiration: empData.dateExpiration,
        })
        .returning({ id: schema.employeeVersions.id });

      if (!insertedVersion) {
        throw new Error(`Failed to create version for employee: ${empData.matricule}`);
      }

      await db
        .update(schema.employees)
        .set({ currentVersionId: insertedVersion.id })
        .where(eq(schema.employees.id, insertedEmployee.id));

      await db.insert(schema.auditLogs).values({
        action: "CREATE_EMPLOYEE",
        entityId: insertedEmployee.id,
        snapshotNew: {
          matricule: empData.matricule,
          nom: empData.nom,
          prenom: empData.prenom,
          fonction: empData.fonction,
        },
      });
    }

    console.log("✓ 50 demo employees seeded successfully!");
  } catch (error) {
    console.error("✗ Failed to seed demo employees:", error);
    throw error;
  }
}

export async function initializeDemoEmployeesOnce(): Promise<void> {
  try {
    await seedDemoEmployees();
  } catch (err) {
    console.error("[DEMO SEED] Error:", err);
  }
}
