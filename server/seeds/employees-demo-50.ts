import { db } from "../db";
import { employees, habilitations, auditLogs } from "../schema";
import { count, eq } from "drizzle-orm";

/**
 * Demo Employee Data - 50 realistic French-named employees
 * Distributed across all divisions and equipes
 * Includes varied expiration dates for testing alert levels
 */

interface DemoEmployee {
  matricule: string;
  nom: string;
  prenom: string;
  fonction: string;
  divisionId: number;
  serviceId: number;
  equipeId: number;
  htCodes: string[];
  dateValidation: string;
  dateExpiration: string;
}

const FONCTIONS = [
  "Électricien",
  "Technicien",
  "Ingénieur",
  "Opérateur",
  "Chef d'équipe",
  "Assistant",
  "Superviseur",
  "Coordinateur",
  "Spécialiste",
  "Agent",
];

const HT_CODES_POOL = ["H1V", "H2V", "B1V", "B2V", "HC", "H1N"];

/**
 * Generate 50 demo employees with realistic French names
 * Matricules: 81628 through 81677
 * Distributed across org structure
 */
function generateDemoEmployees(): DemoEmployee[] {
  const employees: DemoEmployee[] = [];
  
  // French names data
  const noms = [
    "DUBOIS", "MARTIN", "BERNARD", "THOMAS", "ROBERT", "RICHARD", "PETIT",
    "DURAND", "LEFEVRE", "MOREAU", "SIMON", "LAURENT", "LEFEBVRE", "MICHEL",
    "GARCIA", "DAVID", "BERTRAND", "ROUX", "VINCENT", "FOURNIER", "MOREL",
    "GIRARD", "ANDRE", "LEROY", "BONNET", "FONTAINE", "CHESSEX", "PERRIN",
    "TESSIER", "CARON", "JOUBERT", "NAVARRO", "BLANC", "GUERIN", "BOYER",
    "HUBERT", "DESCHAMPS", "RENAULT", "GAILLARD", "LOMBARD", "ARNOULD",
    "POULAIN", "LEFEVRE", "MARTEL", "ROYER", "FABRY", "CLEMENT", "PELLETIER",
    "MASSE", "PERRON"
  ];

  const prenoms = [
    "Jean", "Marie", "Pierre", "Paul", "Marc", "Andre", "Philippe", "Brigitte",
    "Claude", "Francoise", "Christiane", "Laurent", "Bernard", "Anne", "Christine",
    "Michel", "Nicole", "Alain", "Valerie", "Sylvie", "Didier", "Veronique",
    "Christian", "Monique", "Thierry", "Micheline", "Eric", "Colette", "Dominique",
    "Christophe", "Helene", "Michel", "Pauline", "Serge", "Ghislaine", "Yannick",
    "Sandrine", "Joel", "Jacqueline", "Olivier", "Sylvie", "Vincent", "Stephanie",
    "Nicolas", "Celine", "Francois", "Carole", "Jerome", "Martine"
  ];

  // Distribute 50 employees across divisions
  // Division 1: Operations (services 1-3, equipes 1-6) - 20 employees
  // Division 2: Support (services 4-6, equipes 7-12) - 15 employees
  // Division 3: Administration (services 7-9, equipes 13-18) - 15 employees

  let index = 0;

  // Division 1: Operations
  for (let i = 0; i < 20; i++) {
    const divisionId = 1;
    const serviceId = 1 + Math.floor(i / 7); // Services 1-3
    const equipeId = 1 + (i % 6); // Equipes 1-6
    
    employees.push({
      matricule: String(81628 + index),
      nom: noms[index % noms.length],
      prenom: prenoms[index % prenoms.length],
      fonction: FONCTIONS[index % FONCTIONS.length],
      divisionId,
      serviceId: Math.min(3, serviceId),
      equipeId,
      htCodes: [HT_CODES_POOL[index % 3], HT_CODES_POOL[(index + 1) % 3]],
      dateValidation: "2023-03-15",
      dateExpiration: generateExpirationDate(i), // Varied dates for testing
    });
    index++;
  }

  // Division 2: Support
  for (let i = 0; i < 15; i++) {
    const divisionId = 2;
    const serviceId = 4 + Math.floor(i / 5); // Services 4-6
    const equipeId = 7 + (i % 6); // Equipes 7-12
    
    employees.push({
      matricule: String(81628 + index),
      nom: noms[index % noms.length],
      prenom: prenoms[index % prenoms.length],
      fonction: FONCTIONS[index % FONCTIONS.length],
      divisionId,
      serviceId: Math.min(6, serviceId),
      equipeId,
      htCodes: [HT_CODES_POOL[index % 3], HT_CODES_POOL[(index + 1) % 3]],
      dateValidation: "2023-06-20",
      dateExpiration: generateExpirationDate(i),
    });
    index++;
  }

  // Division 3: Administration
  for (let i = 0; i < 15; i++) {
    const divisionId = 3;
    const serviceId = 7 + Math.floor(i / 5); // Services 7-9
    const equipeId = 13 + (i % 6); // Equipes 13-18
    
    employees.push({
      matricule: String(81628 + index),
      nom: noms[index % noms.length],
      prenom: prenoms[index % prenoms.length],
      fonction: FONCTIONS[index % FONCTIONS.length],
      divisionId,
      serviceId: Math.min(9, serviceId),
      equipeId,
      htCodes: [HT_CODES_POOL[index % 3], HT_CODES_POOL[(index + 1) % 3]],
      dateValidation: "2023-09-10",
      dateExpiration: generateExpirationDate(i),
    });
    index++;
  }

  return employees;
}

/**
 * Generate varied expiration dates for testing alert levels
 * - Some expired (past date)
 * - Some < 3 months (critical)
 * - Some < 6 months (warning)
 * - Some < 9 months (caution)
 * - Some > 12 months (normal)
 */
function generateExpirationDate(index: number): string {
  const today = new Date();
  let daysOffset: number;

  const category = index % 5;
  
  switch (category) {
    case 0: // Expired (30-90 days ago)
      daysOffset = -60;
      break;
    case 1: // Critical (< 3 months)
      daysOffset = 30 + Math.floor(Math.random() * 30);
      break;
    case 2: // Warning (< 6 months)
      daysOffset = 120 + Math.floor(Math.random() * 60);
      break;
    case 3: // Caution (< 9 months)
      daysOffset = 200 + Math.floor(Math.random() * 60);
      break;
    default: // Normal (> 12 months)
      daysOffset = 365 + Math.floor(Math.random() * 180);
  }

  const expirationDate = new Date(today);
  expirationDate.setDate(expirationDate.getDate() + daysOffset);
  
  return expirationDate.toISOString().split("T")[0]; // YYYY-MM-DD format
}

/**
 * Seeds 50 demo employees with habilitations
 * Idempotent: only seeds if no employees exist
 */
export async function seedDemoEmployees(): Promise<void> {
  try {
    // Check if employees already exist
    const employeeCount = await db
      .select({ count: count() })
      .from(employees);
    
    if (employeeCount[0].count > 0) {
      console.log("✓ Demo employees already seeded, skipping...");
      return;
    }

    console.log("🌱 Seeding 50 demo employees...");

    const demoEmployees = generateDemoEmployees();

    for (const empData of demoEmployees) {
      // Insert employee
      const [insertedEmployee] = await db
        .insert(employees)
        .values({
          matricule: empData.matricule,
          nom: empData.nom,
          prenom: empData.prenom,
          fonction: empData.fonction,
          divisionId: empData.divisionId,
          serviceId: empData.serviceId,
          equipeId: empData.equipeId,
          status: calculateStatus(empData.dateExpiration),
        })
        .returning({ id: employees.id });

      if (!insertedEmployee) {
        throw new Error(`Failed to create employee: ${empData.matricule}`);
      }

      // Insert habilitation
      const [insertedHab] = await db
        .insert(habilitations)
        .values({
          employeeId: insertedEmployee.id,
          htCodes: JSON.stringify(empData.htCodes),
          stCodes: "[]",
          numero: `${empData.matricule}_01`,
          dateValidation: empData.dateValidation,
          dateExpiration: empData.dateExpiration,
        })
        .returning({ id: habilitations.id });

      if (!insertedHab) {
        throw new Error(
          `Failed to create habilitation for employee: ${empData.matricule}`
        );
      }

      // Log CREATE_EMPLOYEE audit entry
      await db.insert(auditLogs).values({
        userId: 1, // Hardcoded admin user
        action: "CREATE_EMPLOYEE",
        entityType: "employee",
        entityId: insertedEmployee.id,
        matricule: empData.matricule,
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

/**
 * Calculate employee status based on expiration date
 */
function calculateStatus(dateExpiration: string): string {
  const today = new Date();
  const expirationDate = new Date(dateExpiration);
  
  if (expirationDate < today) {
    return "EXPIRED";
  }
  
  const daysUntilExpiration = Math.floor(
    (expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  if (daysUntilExpiration <= 365) {
    return "PENDING_RENEWAL";
  }
  
  return "ACTIVE";
}

/**
 * Initialize demo employees once on server startup
 */
export async function initializeDemoEmployeesOnce(): Promise<void> {
  try {
    await seedDemoEmployees();
  } catch (error) {
    console.error("Failed to initialize demo employees:", error);
    // Don't throw - allow server to continue
  }
}
