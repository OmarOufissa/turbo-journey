export { db, initializeDatabase, withAuditTransaction } from "./db-pg";
import { db } from "./db-pg";

// Compatibility shims for old code using raw SQL helpers
// Used by: server/routes/auth.ts, server/routes/employees.ts, server/seed.ts

function getClient(): any {
  // drizzle-orm/libsql exposes the underlying client via $client
  return (db as any).$client;
}

export async function dbRun(query: string, params?: any[]): Promise<{ changes: number; lastInsertRowid: any }> {
  const result = await getClient().execute({ sql: query, args: params ?? [] });
  return { changes: result.rowsAffected ?? 0, lastInsertRowid: result.lastInsertRowid ?? null };
}

export async function dbGet(query: string, params?: any[]): Promise<any> {
  const result = await getClient().execute({ sql: query, args: params ?? [] });
  if (!result.rows || result.rows.length === 0) return null;
  // libsql rows can be array-style or object-style depending on version
  const row = result.rows[0];
  if (result.columns && Array.isArray(row)) {
    const obj: Record<string, any> = {};
    result.columns.forEach((col: string, i: number) => { obj[col] = (row as any[])[i]; });
    return obj;
  }
  return row;
}

export async function dbAll(query: string, params?: any[]): Promise<any[]> {
  const result = await getClient().execute({ sql: query, args: params ?? [] });
  if (!result.rows || result.rows.length === 0) return [];
  if (result.columns && Array.isArray(result.rows[0])) {
    return result.rows.map((row: any[]) => {
      const obj: Record<string, any> = {};
      result.columns.forEach((col: string, i: number) => { obj[col] = row[i]; });
      return obj;
    });
  }
  return result.rows;
}

export async function getDatabase() {
  return db;
}

export default {
  initialize: getDatabase,
  getDatabase,
};
