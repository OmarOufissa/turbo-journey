/**
 * Database connection layer.
 *
 * Kept as "db-pg.ts" for historical reasons (this file used to wrap
 * PostgreSQL) even though it now talks to an embedded SQLite database via
 * better-sqlite3 - every other server file imports from this exact path, so
 * renaming it would touch ~20 files for no functional benefit.
 *
 * The database file lives at SQLITE_DB_PATH if set (the Electron main
 * process sets this to a file inside the user's app-data directory so data
 * survives app updates), otherwise next to the project for local/dev use.
 */
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import * as schema from "./schema";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";

const dbPath = process.env.SQLITE_DB_PATH || path.join(process.cwd(), "data", "habilitations.sqlite");

import fs from "fs";
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

// Initialize Drizzle ORM
export const db = drizzle(sqlite, { schema });

// Exposed for server/db.ts's raw-SQL compatibility layer (dbRun/dbGet/dbAll)
export const rawDb = sqlite;

// Initialize database with demo user
export async function initializeDatabase() {
  try {
    console.log("Checking database connection...");

    // Test connection
    sqlite.prepare("SELECT 1").get();
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

    // Organizational structure and employee data are seeded from the real
    // Direction Transport Centre Casa organigramme by
    // seeds/organigrammeSeed.ts (called from index.ts's startup sequence,
    // right after this function returns) - not from here, so the app never
    // needs a network call just to start up.

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
 * better-sqlite3 is synchronous under the hood, so the `txDb` passed to the
 * callback is the same shared `db` instance - the manual BEGIN/COMMIT/
 * ROLLBACK below scopes the transaction around whatever the (effectively
 * synchronous) callback does.
 *
 * @param callback Function to execute within transaction
 * @throws Error if transaction fails or callback throws
 * @returns Result of callback
 */
export async function withAuditTransaction<T>(
  callback: (txDb: typeof db) => Promise<T>
): Promise<T> {
  sqlite.exec("BEGIN");
  try {
    const result = await callback(db);
    sqlite.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      sqlite.exec("ROLLBACK");
    } catch (rollbackErr) {
      console.error("Error during rollback:", rollbackErr);
    }

    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Transaction failed and rolled back. No data was modified. Details: ${errorMsg}`
    );
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
