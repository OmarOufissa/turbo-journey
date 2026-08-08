import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import bcrypt from "bcrypt";
import { eq, sql } from "drizzle-orm";

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

// Initialize Drizzle ORM
export const db = drizzle(pool, { schema });

// Initialize database with demo user
export async function initializeDatabase() {
  try {
    console.log("Checking database connection...");

    // Test connection
    await pool.query("SELECT NOW()");
    console.log("Database connection successful");

    // Check if demo user exists
    const existingUser = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "admin@example.com"))
      .limit(1);

    if (existingUser.length === 0) {
      // Create demo user (password: admin123)
      const hashedPassword = bcrypt.hashSync("admin123", 10);
      await db.insert(schema.users).values({
        email: "admin@example.com",
        password: hashedPassword,
      });
      console.log("Demo user created: admin@example.com / admin123");
    } else {
      console.log("Demo user already exists");
    }

    // Check if organizational structure is already seeded
    const divisionsCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.divisions);

    if (!divisionsCount[0] || divisionsCount[0].count === 0) {
      console.log("Seeding organizational structure and employee data...");
      const { seedDatabasePG } = await import("./seed-pg");
      await seedDatabasePG();
    } else {
      console.log("Database already seeded");
    }

    console.log("Database initialized successfully");
  } catch (err) {
    console.error("Database initialization error:", err);
    console.warn("WARNING: Database connection failed. The server will continue running, but database operations will fail.");
    // Don't throw - allow server to continue running
  }
}

// Helper function to get database instance
export async function getDatabase() {
  return db;
}

// ============================================================================
// PHASE 1: TRANSACTION SUPPORT FOR ATOMIC OPERATIONS
// ============================================================================

/**
 * Execute a callback within a database transaction
 * CRITICAL: If callback throws, entire transaction rolls back
 * Used for: mutation + audit logging together
 *
 * Pattern:
 *   try {
 *     const result = await withAuditTransaction(async (txDb) => {
 *       // mutation 1
 *       // mutation 2
 *       // audit logging
 *       return { success: true, data };
 *     });
 *   } catch (err) {
 *     // Transaction rolled back, error returned
 *   }
 *
 * @param callback Function to execute within transaction
 * @throws Error if transaction fails or callback throws
 * @returns Result of callback
 */
export async function withAuditTransaction<T>(
  callback: (txDb: typeof db) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    // Begin transaction
    await client.query("BEGIN TRANSACTION");

    // Create transaction-scoped Drizzle instance
    const txDb = drizzle(client, { schema });

    // Execute callback
    const result = await callback(txDb);

    // Commit on success
    await client.query("COMMIT");
    return result;
  } catch (err) {
    // Rollback on any error
    try {
      await client.query("ROLLBACK");
    } catch (rollbackErr) {
      console.error("Error during rollback:", rollbackErr);
    }

    // Re-throw original error with context
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Transaction failed and rolled back. No data was modified. Details: ${errorMsg}`
    );
  } finally {
    // Always release client back to pool
    client.release();
  }
}

/**
 * Validate data against schema before mutation
 * Prevents invalid data from being inserted/updated
 *
 * @param data Data to validate
 * @param schema Validation schema object
 * @throws Error if validation fails
 */
export function validateDataIntegrity(
  data: Record<string, any>,
  requiredFields: string[]
): void {
  const missing = requiredFields.filter((field) => !data[field]);
  if (missing.length > 0) {
    throw new Error(`Data integrity check failed: Missing required fields: ${missing.join(", ")}`);
  }
}

/**
 * Validate employee data format and constraints
 */
export function validateEmployeeData(employee: Record<string, any>): void {
  if (!employee.matricule || !/^\d{5}$/.test(employee.matricule)) {
    throw new Error(`Invalid matricule format: must be 5 digits`);
  }
  if (!employee.prenom || employee.prenom.trim().length === 0) {
    throw new Error(`Invalid prenom: cannot be empty`);
  }
  if (!employee.nom || employee.nom.trim().length === 0) {
    throw new Error(`Invalid nom: cannot be empty`);
  }
  if (!employee.divisionId || employee.divisionId <= 0) {
    throw new Error(`Invalid divisionId: must be positive`);
  }
  if (!employee.serviceId || employee.serviceId <= 0) {
    throw new Error(`Invalid serviceId: must be positive`);
  }
  if (!employee.equipeId || employee.equipeId <= 0) {
    throw new Error(`Invalid equipeId: must be positive`);
  }
}

/**
 * Validate habilitation data format and constraints
 * CORRECTION 2: Supports both stCodes and htCodes (independent fields)
 * Both can be empty independently, but at least ONE must be non-empty
 */
export function validateHabilitationData(hab: Record<string, any>): void {
  // Get codes arrays (normalize from old or new format)
  let stCodes = hab.stCodes || [];
  let htCodes = hab.htCodes || [];

  // Handle legacy format: if codes provided without stCodes/htCodes, treat as HT
  if (!hab.stCodes && !hab.htCodes && hab.codes) {
    htCodes = Array.isArray(hab.codes) ? hab.codes : [];
  }

  // Ensure arrays
  if (!Array.isArray(stCodes)) stCodes = [];
  if (!Array.isArray(htCodes)) htCodes = [];

  // CORRECTION 2: At least one array must be non-empty
  if (stCodes.length === 0 && htCodes.length === 0) {
    throw new Error(`Invalid habilitation: at least one code (ST or HT) is required`);
  }

  // Valid codes for both ST and HT
  const validCodes = ["H0V", "H1V", "H2V", "HC", "B0V", "B1V", "B2V", "BC", "H1N", "H2N", "BR", "SF6"];

  // Check ST codes
  const invalidSTCodes = stCodes.filter((code: string) => !validCodes.includes(code));
  if (invalidSTCodes.length > 0) {
    throw new Error(
      `Invalid ST codes: ${invalidSTCodes.join(", ")}. Valid codes: ${validCodes.join(", ")}`
    );
  }

  // Check HT codes
  const invalidHTCodes = htCodes.filter((code: string) => !validCodes.includes(code));
  if (invalidHTCodes.length > 0) {
    throw new Error(
      `Invalid HT codes: ${invalidHTCodes.join(", ")}. Valid codes: ${validCodes.join(", ")}`
    );
  }

  // Dates must be valid
  if (!hab.dateValidation || isNaN(new Date(hab.dateValidation).getTime())) {
    throw new Error(`Invalid date_validation: must be valid date`);
  }

  // Expiration should be after validation (optional check - can be auto-calculated)
  if (hab.dateExpiration && isNaN(new Date(hab.dateExpiration).getTime())) {
    throw new Error(`Invalid date_expiration: must be valid date`);
  }
}

// Export schema for use in other files
export * from "./schema";

export default {
  initialize: initializeDatabase,
  getDatabase,
  db,
  withAuditTransaction,
  validateDataIntegrity,
  validateEmployeeData,
  validateHabilitationData,
};
