import { Pool } from "pg";
import { db, initializeDatabase as initPG } from "./db-pg";
import { sql } from "drizzle-orm";

// Re-export the database instance
export { db, initializeDatabase } from "./db-pg";

// Create PostgreSQL connection pool for raw queries
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false },
});

// Convert SQLite-style ? placeholders to PostgreSQL $1, $2 format
function convertQueryParams(query: string): string {
  let paramIndex = 1;
  return query.replace(/\?/g, () => `$${paramIndex++}`);
}

// Compatibility layer for existing code using dbRun, dbGet, dbAll
export function dbRun(query: string, params?: any[]): Promise<any> {
  const pgQuery = convertQueryParams(query);
  return pool.query(pgQuery, params).then((result) => {
    let lastInsertRowid: any = null;

    // For INSERT statements, try to get the inserted ID
    if (query.trim().toUpperCase().startsWith("INSERT")) {
      // If the query has RETURNING clause, use that
      if (query.toUpperCase().includes("RETURNING")) {
        lastInsertRowid = result.rows[0]?.id;
      } else {
        // Try to get last inserted ID from sequence
        const tableName = query.match(/INSERT\s+INTO\s+(\w+)/i)?.[1];
        if (tableName) {
          return pool.query(
            `SELECT currval(pg_get_serial_sequence($1, 'id')) as id`,
            [tableName]
          ).then((seqResult) => {
            if (seqResult.rows[0]) {
              lastInsertRowid = seqResult.rows[0].id;
            }
            return {
              changes: result.rowCount || 0,
              lastInsertRowid: lastInsertRowid
            };
          });
        }
      }
    }

    return {
      changes: result.rowCount || 0,
      lastInsertRowid: lastInsertRowid
    };
  }).catch((err) => {
    console.error("Database run error:", err);
    throw err;
  });
}

export function dbGet(query: string, params?: any[]): Promise<any> {
  const pgQuery = convertQueryParams(query);
  return pool.query(pgQuery, params).then((result) => {
    return result.rows[0] || null;
  }).catch((err) => {
    console.error("Database get error:", err);
    throw err;
  });
}

export function dbAll(query: string, params?: any[]): Promise<any[]> {
  const pgQuery = convertQueryParams(query);
  return pool.query(pgQuery, params).then((result) => {
    return result.rows;
  }).catch((err) => {
    console.error("Database all error:", err);
    throw err;
  });
}

// Lazy load database
export async function getDatabase() {
  await initPG();
  return db;
}

export default {
  initialize: getDatabase,
  getDatabase,
};
