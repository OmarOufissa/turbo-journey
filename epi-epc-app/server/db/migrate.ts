import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { db } from "./index";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Applique les migrations Drizzle versionnées (idempotent — ne rejoue jamais une migration déjà appliquée). */
export function runMigrations() {
  migrate(db, { migrationsFolder: path.join(__dirname, "migrations") });
}
