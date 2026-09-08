import { db, initializeDatabase as initDb, rawDb } from "./db-pg";

// Re-export the database instance
export { db, initializeDatabase } from "./db-pg";

/**
 * Compatibility layer for existing code using dbRun, dbGet, dbAll with
 * native SQLite `?` placeholders. node:sqlite is synchronous; these still
 * return Promises so existing `await dbGet(...)` call sites keep working
 * unchanged.
 */
export function dbRun(query: string, params: any[] = []): Promise<{ changes: number; lastInsertRowid: any }> {
  try {
    const result = rawDb.prepare(query).run(...params);
    return Promise.resolve({
      // node:sqlite types changes/lastInsertRowid as number | bigint (for
      // very large values); this app's tables are small, so normalize to
      // number for existing call sites that expect that.
      changes: Number(result.changes),
      lastInsertRowid: result.lastInsertRowid,
    });
  } catch (err) {
    console.error("Database run error:", err);
    return Promise.reject(err);
  }
}

export function dbGet(query: string, params: any[] = []): Promise<any> {
  try {
    const row = rawDb.prepare(query).get(...params);
    return Promise.resolve(row ?? null);
  } catch (err) {
    console.error("Database get error:", err);
    return Promise.reject(err);
  }
}

export function dbAll(query: string, params: any[] = []): Promise<any[]> {
  try {
    const rows = rawDb.prepare(query).all(...params);
    return Promise.resolve(rows);
  } catch (err) {
    console.error("Database all error:", err);
    return Promise.reject(err);
  }
}

// Lazy load database
export async function getDatabase() {
  await initDb();
  return db;
}

export default {
  initialize: getDatabase,
  getDatabase,
};
