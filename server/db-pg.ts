import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import bcrypt from "bcrypt";
import { eq, sql } from "drizzle-orm";
import path from "path";

// Database path: set by Electron main before server loads, or fall back to cwd
// Ignore PostgreSQL URLs — only accept file: or relative paths without protocol
function getDbUrl(): string {
  const envUrl = process.env.DATABASE_URL;
  if (envUrl && !envUrl.startsWith("postgres")) {
    return envUrl.startsWith("file:") ? envUrl : `file:${envUrl}`;
  }
  return `file:${path.join(process.cwd(), "habilitations.db")}`;
}

const client = createClient({ url: getDbUrl() });
export const db = drizzle(client, { schema });

async function createTablesIfNotExist() {
  const statements = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS divisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      division_id INTEGER NOT NULL REFERENCES divisions(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(name, division_id)
    )`,
    `CREATE TABLE IF NOT EXISTS equipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(name, service_id)
    )`,
    `CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      matricule TEXT NOT NULL UNIQUE,
      nom TEXT NOT NULL,
      prenom TEXT NOT NULL,
      current_version_id INTEGER,
      deleted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS employee_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      st_codes TEXT NOT NULL DEFAULT '[]',
      ht_codes TEXT NOT NULL DEFAULT '[]',
      n_de_titre TEXT NOT NULL,
      fonction TEXT NOT NULL,
      division_id INTEGER NOT NULL REFERENCES divisions(id),
      service_id INTEGER NOT NULL REFERENCES services(id),
      equipe_id INTEGER REFERENCES equipes(id),
      date_validation TEXT NOT NULL,
      date_expiration TEXT NOT NULL,
      pdf_path TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by INTEGER REFERENCES users(id),
      audit_log_id INTEGER,
      UNIQUE(employee_id, version_number)
    )`,
    `CREATE TABLE IF NOT EXISTS pending_renewals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      snapshot TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      user_id INTEGER REFERENCES users(id),
      snapshot_old TEXT,
      snapshot_new TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS users_email_idx ON users(email)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS divisions_name_idx ON divisions(name)`,
    `CREATE INDEX IF NOT EXISTS services_division_idx ON services(division_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS services_name_division_idx ON services(name, division_id)`,
    `CREATE INDEX IF NOT EXISTS equipes_service_idx ON equipes(service_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS equipes_name_service_idx ON equipes(name, service_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS employees_matricule_idx ON employees(matricule)`,
    `CREATE INDEX IF NOT EXISTS idx_emp_versions_emp ON employee_versions(employee_id)`,
    `CREATE INDEX IF NOT EXISTS idx_expiration ON employee_versions(date_expiration)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS employee_versions_employee_version_idx ON employee_versions(employee_id, version_number)`,
    `CREATE INDEX IF NOT EXISTS pending_renewals_employee_id_idx ON pending_renewals(employee_id)`,
    `CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_id)`,
    `CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action)`,
    `CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at)`,
  ];

  await client.batch(statements, "write");
}

export async function initializeDatabase() {
  try {
    console.log("Initializing SQLite database...");
    await createTablesIfNotExist();

    const existingUser = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, "admin@example.com"))
      .limit(1);

    if (existingUser.length === 0) {
      const hashedPassword = bcrypt.hashSync("admin123", 10);
      await db.insert(schema.users).values({
        email: "admin@example.com",
        password: hashedPassword,
      });
      console.log("Demo user created: admin@example.com / admin123");
    } else {
      console.log("Demo user already exists");
    }

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.divisions);

    if (Number(count) === 0) {
      console.log("Seeding organizational structure...");
      const { seedDatabasePG } = await import("./seed-pg");
      await seedDatabasePG();
    } else {
      console.log("Database already seeded");
    }

    console.log("Database initialized successfully");
  } catch (err) {
    console.error("Database initialization error:", err);
    console.warn("Server will continue, but database operations may fail.");
  }
}

export async function withAuditTransaction<T>(
  callback: (txDb: typeof db) => Promise<T>
): Promise<T> {
  return db.transaction(callback);
}

export function validateDataIntegrity(
  data: Record<string, any>,
  requiredFields: string[]
): void {
  const missing = requiredFields.filter((field) => !data[field]);
  if (missing.length > 0) {
    throw new Error(`Data integrity check failed: Missing required fields: ${missing.join(", ")}`);
  }
}

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
}

export function validateHabilitationData(hab: Record<string, any>): void {
  let stCodes = hab.stCodes || [];
  let htCodes = hab.htCodes || [];
  if (!Array.isArray(stCodes)) stCodes = [];
  if (!Array.isArray(htCodes)) htCodes = [];
  if (stCodes.length === 0 && htCodes.length === 0) {
    throw new Error(`Invalid habilitation: at least one code (ST or HT) is required`);
  }
}

export async function getDatabase() {
  return db;
}

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
