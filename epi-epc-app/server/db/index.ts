import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import "dotenv/config";
import * as schema from "./schema";
import { getDataDir } from "../config";

const dataDir = path.join(getDataDir(), "data");
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = process.env.DATABASE_FILE || path.join(dataDir, "gepi.db");

export const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
