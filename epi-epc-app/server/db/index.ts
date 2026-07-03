import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import "dotenv/config";
import * as schema from "./schema";

// En Electron, main.cjs positionne DATA_DIR sur app.getPath('userData') avant
// d'importer le serveur, pour que la base et les uploads vivent dans un
// répertoire inscriptible propre à l'utilisateur plutôt que dans le dossier
// d'installation (souvent en lecture seule). En dev/CLI, on reste sur ./data.
const baseDir = process.env.DATA_DIR || process.cwd();
const dataDir = path.join(baseDir, "data");
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = process.env.DATABASE_FILE || path.join(dataDir, "gepi.db");

export const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
