import { db } from "../db-pg";
import * as schema from "../schema";

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
    entityId,
    userId,
    snapshotOld: snapshotOld ?? null,
    snapshotNew: snapshotNew ?? null,
  }).returning({ id: schema.auditLogs.id });

  return result.id;
}
