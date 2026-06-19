import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import bcrypt from "bcrypt";
import { eq, sql } from "drizzle-orm";
import path from "path";
import crypto from "crypto";

// Database path: set by Electron main before server loads, or fall back to cwd
// Ignore PostgreSQL URLs — only accept file: or relative paths without protocol
function getDbUrl(): string {
  const envUrl = process.env.DATABASE_URL;
  if (envUrl && !envUrl.startsWith("postgres")) {
    return envUrl.startsWith("file:") ? envUrl : `file:${envUrl}`;
  }
  return `file:${path.join(process.cwd(), "app.db")}`;
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
      current_version_id INTEGER REFERENCES employee_versions(id) ON DELETE SET NULL,
      deleted INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
    `CREATE TABLE IF NOT EXISTS notification_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      threshold TEXT NOT NULL,
      sent_at TEXT NOT NULL DEFAULT (datetime('now')),
      version_id INTEGER REFERENCES employee_versions(id),
      UNIQUE(employee_id, threshold)
    )`,
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_id INTEGER,
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
    `CREATE INDEX IF NOT EXISTS idx_emp_versions_division ON employee_versions(division_id)`,
    `CREATE INDEX IF NOT EXISTS idx_emp_versions_service ON employee_versions(service_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS employee_versions_employee_version_idx ON employee_versions(employee_id, version_number)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS pending_renewals_employee_id_idx ON pending_renewals(employee_id)`,
    `CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_id)`,
    `CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action)`,
    `CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS notif_logs_emp_threshold_idx ON notification_logs(employee_id, threshold)`,
    `CREATE TABLE IF NOT EXISTS fonctions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS fonctions_name_idx ON fonctions(name)`,
    `CREATE TABLE IF NOT EXISTS ouvrages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS ouvrages_name_idx ON ouvrages(name)`,
    `CREATE TABLE IF NOT EXISTS domaines_tension (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS domaines_tension_name_idx ON domaines_tension(name)`,
    `CREATE TABLE IF NOT EXISTS indications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS indications_name_idx ON indications(name)`,
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
  ];

  await client.batch(statements, "write");

  // Migrations for columns added after initial creation (safe on existing DBs)
  const migrations = [
    `ALTER TABLE employees ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))`,
    `ALTER TABLE employee_versions ADD COLUMN hab_rows TEXT`,
    `ALTER TABLE employee_versions ADD COLUMN autorisation_speciales_verso TEXT`,
  ];
  for (const m of migrations) {
    try { await client.execute(m); } catch { /* column already exists */ }
  }

  await addEmployeesCurrentVersionForeignKey();
  await uniquifyPendingRenewalsIndex();
  await makeAuditLogsEntityIdNullable();
}

// pending_renewals_employee_id_idx was originally created as a non-unique index;
// CREATE UNIQUE INDEX IF NOT EXISTS above is a no-op on existing DBs since the
// name already exists, so drop and recreate it explicitly once duplicates (if any)
// are resolved by keeping only the most recent pending renewal per employee.
async function uniquifyPendingRenewalsIndex() {
  const { rows } = await client.execute(
    `SELECT name, sql FROM sqlite_master WHERE type='index' AND name='pending_renewals_employee_id_idx'`
  );
  const sql = (rows[0] as any)?.sql as string | undefined;
  if (sql && /UNIQUE/i.test(sql)) return;

  await client.execute(`
    DELETE FROM pending_renewals
    WHERE id NOT IN (
      SELECT MAX(id) FROM pending_renewals GROUP BY employee_id
    )
  `);
  await client.execute(`DROP INDEX IF EXISTS pending_renewals_employee_id_idx`);
  await client.execute(`CREATE UNIQUE INDEX pending_renewals_employee_id_idx ON pending_renewals(employee_id)`);
}

// employees.current_version_id had no FK constraint in databases created before this
// migration. SQLite can't ALTER a column's constraints, so rebuild the table.
// employee_versions.employee_id REFERENCES employees(id), so the old table is dropped
// (not renamed) and the new one renamed into place — that way employee_versions' FK
// definition (which still says "employees") resolves to the rebuilt table afterwards.
async function addEmployeesCurrentVersionForeignKey() {
  const { rows } = await client.execute(`PRAGMA foreign_key_list(employees)`);
  const hasFk = rows.some((r: any) => r.from === "current_version_id" && r.table === "employee_versions");
  if (hasFk) return;

  await client.execute("PRAGMA foreign_keys=OFF");
  try {
    await client.batch([
      `CREATE TABLE employees_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        matricule TEXT NOT NULL UNIQUE,
        nom TEXT NOT NULL,
        prenom TEXT NOT NULL,
        current_version_id INTEGER REFERENCES employee_versions(id) ON DELETE SET NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        deleted_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `INSERT INTO employees_new (id, matricule, nom, prenom, current_version_id, deleted, deleted_at, created_at, updated_at)
       SELECT id, matricule, nom, prenom, current_version_id, deleted, deleted_at, created_at, updated_at FROM employees`,
      `DROP TABLE employees`,
      `ALTER TABLE employees_new RENAME TO employees`,
      `CREATE UNIQUE INDEX IF NOT EXISTS employees_matricule_idx ON employees(matricule)`,
      `CREATE INDEX IF NOT EXISTS idx_employees_current_version ON employees(current_version_id)`,
      `CREATE INDEX IF NOT EXISTS idx_employees_deleted ON employees(deleted)`,
    ], "write");
  } finally {
    await client.execute("PRAGMA foreign_keys=ON");
  }
}

// audit_logs.entity_id was NOT NULL with 0 used as a "no entity" sentinel in
// databases created before this migration. SQLite can't ALTER a column's
// constraints, so rebuild the table with a nullable entity_id.
async function makeAuditLogsEntityIdNullable() {
  const { rows } = await client.execute(`PRAGMA table_info(audit_logs)`);
  const entityIdCol = rows.find((r: any) => r.name === "entity_id") as any;
  if (!entityIdCol || entityIdCol.notnull === 0) return;

  await client.batch([
    `CREATE TABLE audit_logs_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_id INTEGER,
      user_id INTEGER REFERENCES users(id),
      snapshot_old TEXT,
      snapshot_new TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `INSERT INTO audit_logs_new (id, action, entity_id, user_id, snapshot_old, snapshot_new, created_at)
     SELECT id, action, NULLIF(entity_id, 0), user_id, snapshot_old, snapshot_new, created_at FROM audit_logs`,
    `DROP TABLE audit_logs`,
    `ALTER TABLE audit_logs_new RENAME TO audit_logs`,
    `CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_id)`,
    `CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action)`,
    `CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at)`,
  ], "write");
}

export { createTablesIfNotExist };

const SEED_FONCTIONS = [
  "Acheteur-Approvisionneur", "Acheteur-Approvisionneur Principal", "Agent Administratif",
  "Assistant Administratif", "Assistant Support Informatique", "Cadre Administratif et de Gestion",
  "Cadre Contrôle Commande RT", "Cadre Exploitation Réseau", "Cadre HC",
  "Cadre Lignes THT&HT", "Cadre Postes THT/HT", "Cadre TST Lignes THT&HT",
  "Cadre Technique", "Cadre Télécom", "Chef d'Equipe Electromécanicien",
  "Chef d'Equipe Isolation Thermique", "Chef d'Equipe Lignes THT&HT", "Chef d'Equipe Postes THT/HT",
  "Chef de Division", "Chef de Service", "Conducteur Engins Spéciaux",
  "Conducteur Mécanicien", "Conducteur Principal de Direction", "Conducteur Travaux Génie Civil",
  "Contremaître Lignes THT&HT", "Contremaître Postes THT/HT", "Contremaître TST Lignes THT&HT",
  "Contremaître TST Postes THT/HT", "Contrôleur Travaux Génie Civil", "Documentaliste",
  "Employé de Bureau Principal", "Gestionnaire Ressources Humaines", "Monteur de Lignes THT&HT",
  "Opérateur TST Lignes THT&HT", "Opérateur TST Postes THT/HT", "Ouvrier Professionnel Réseau",
  "Préparateur Lignes MT&BT", "Projeteur Lignes THT&HT", "Secrétaire Principale",
  "Surveillant Travaux Génie Civil", "Technicien Contrôle Commande RT", "Technicien Exploitation Réseau",
  "Technicien Lignes THT&HT", "Technicien Ppal Contrôle Commande RT",
  "Technicien Principal Contrôle Commande RT", "Technicien Principal Exploitation Réseau",
  "Technicien Spécialisé Télécom",
];

const SEED_OUVRAGES = [
  "Lignes relevant de la DTC",
  "Ouvrages électriques Lignes relevant de la DTC",
  "Ouvrages électriques Postes 60/22 kV relevant de la XJ/XJ",
  "Ouvrages électriques Postes 60/22 kV relevant de la XJ/XS",
  "Ouvrages électriques Postes et Lignes relevant de la DTC",
  "Ouvrages électriques Postes et Lignes relevant de la DTC et ouvrages tiers sous contrat avec la DTC.",
  "Ouvrages électriques Postes et Lignes relevant de la XA",
  "Ouvrages électriques Postes et Lignes relevant de la XC",
  "Ouvrages électriques Postes et Lignes relevant de la XJ",
  "Ouvrages électriques Postes relevant de la DTC",
  "Ouvrages électriques Postes relevant de la XA",
  "Ouvrages électriques Postes relevant de la XC",
  "Ouvrages électriques Postes relevant de la XJ",
  "Poste 225/60 kV CTM",
  "Poste 225/60/22 kV LAAWAMER",
  "Poste 225/60/22 kV TIT MELLIL",
  "Poste 400/225 kV CHEMAIA",
  "Poste 400/225 kV JORF LASFAR",
  "Poste 400/225 kV MEDIOUNA",
  "Poste 60/20/5,5kV CTC",
  "Postes SETTAT et CHIKER",
];

const SEED_DOMAINES = ["BT TBT", "BTA TBT", "HT BT TBT", "HTB"];

const SEED_INDICATIONS = [
  "Compris les travaux entre le pylône d'arrêt et le portique d'ancrage des postes HTB",
  "Etude de construction et d'aménagement des ouvrages",
  "La première étape uniquement",
  "Manipule les engins de manutention dans la zone de travail et au voisinage de PNST",
  "Postes non gardés; condamnation de départs Lignes",
  "Suivi et contrôle des travaux de construction et d'aménagement des ouvrages",
];

async function seedRefDataIfEmpty() {
  const [{ c: fCount }] = await db.select({ c: sql<number>`count(*)` }).from(schema.fonctions);
  if (Number(fCount) === 0 && SEED_FONCTIONS.length > 0) {
    console.log("Seeding fonctions...");
    await db.insert(schema.fonctions).values(SEED_FONCTIONS.map(name => ({ name })));
  }
  const [{ c: oCount }] = await db.select({ c: sql<number>`count(*)` }).from(schema.ouvrages);
  if (Number(oCount) === 0 && SEED_OUVRAGES.length > 0) {
    console.log("Seeding ouvrages...");
    await db.insert(schema.ouvrages).values(SEED_OUVRAGES.map(name => ({ name })));
  }
  const [{ c: dCount }] = await db.select({ c: sql<number>`count(*)` }).from(schema.domainesTension);
  if (Number(dCount) === 0 && SEED_DOMAINES.length > 0) {
    console.log("Seeding domaines de tension...");
    await db.insert(schema.domainesTension).values(SEED_DOMAINES.map(name => ({ name })));
  }
  const [{ c: iCount }] = await db.select({ c: sql<number>`count(*)` }).from(schema.indications);
  if (Number(iCount) === 0 && SEED_INDICATIONS.length > 0) {
    console.log("Seeding indications...");
    await db.insert(schema.indications).values(SEED_INDICATIONS.map(name => ({ name })));
  }
}

export async function initializeDatabase() {
  try {
    console.log("Initializing SQLite database...");
    await createTablesIfNotExist();

    const [{ userCount }] = await db
      .select({ userCount: sql<number>`count(*)` })
      .from(schema.users);

    if (Number(userCount) === 0) {
      const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
      const adminPassword = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString("base64url");
      const hashedPassword = bcrypt.hashSync(adminPassword, 10);
      await db.insert(schema.users).values({
        email: adminEmail,
        password: hashedPassword,
      });
      console.log("============================================================");
      console.log("Admin account created — save these credentials now:");
      console.log(`  Email:    ${adminEmail}`);
      console.log(`  Password: ${adminPassword}`);
      console.log("============================================================");
    }

    await seedRefDataIfEmpty();

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
  callback: (txDb: any) => Promise<T>
): Promise<T> {
  return db.transaction(callback as any);
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
};
