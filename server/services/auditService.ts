import { db } from "../db-pg";
import * as schema from "../schema";
import { eq, desc, sql } from "drizzle-orm";

export type AuditAction =
  | "CREATE_EMPLOYEE"
  | "UPDATE_EMPLOYEE"
  | "DELETE_EMPLOYEE"
  | "RESTORE_EMPLOYEE"
  | "PERMANENT_DELETE_EMPLOYEE"
  | "REVERT_VERSION"
  | "IMPORT_EMPLOYEES"
  | "ACTIVATE_RENEWAL"
  | "CANCEL_RENEWAL"
  | "UPLOAD_PDF"
  | "GENERATE_PDF"
  | "DELETE_PDF"
  | "EXPORT_EMPLOYEES"
  | "RESTORE_DATABASE"
  | "LOGIN"
  | "LOGOUT"
  | "CREATE_RENEWAL"
  | "CREATE_DIVISION"
  | "DELETE_DIVISION"
  | "CREATE_SERVICE"
  | "DELETE_SERVICE"
  | "CREATE_EQUIPE"
  | "DELETE_EQUIPE";

export async function logAuditActionSafe(
  userId: number | null,
  action: string,
  entityId: number | null,
  snapshotOld?: Record<string, any> | null,
  snapshotNew?: Record<string, any> | null
): Promise<number> {
  const [result] = await db.insert(schema.auditLogs).values({
    action,
    entityId: entityId ?? 0,
    userId,
    snapshotOld: snapshotOld ?? null,
    snapshotNew: snapshotNew ?? null,
  }).returning({ id: schema.auditLogs.id });

  return result.id;
}

export async function getAuditLogs(filters?: {
  entityId?: number;
  action?: string;
  limit?: number;
  offset?: number;
}): Promise<typeof schema.auditLogs.$inferSelect[]> {
  const limit = filters?.limit ?? 100;
  const offset = filters?.offset ?? 0;
  return db.select().from(schema.auditLogs).orderBy(desc(schema.auditLogs.createdAt)).limit(limit).offset(offset);
}

export async function getAuditLogEntry(id: number) {
  const [log] = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.id, id));
  return log ?? null;
}

export async function exportAuditLogsAsJSON(): Promise<string> {
  const logs = await db.select().from(schema.auditLogs).orderBy(desc(schema.auditLogs.createdAt)).limit(10000);
  return JSON.stringify(logs, null, 2);
}
