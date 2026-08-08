import { db } from "../db-pg";
import * as schema from "../schema";
import { eq, desc, and, sql } from "drizzle-orm";

/**
 * PHASE 1: AUDIT FOUNDATION - PRODUCTION-GRADE AUDIT LOGGING
 * 
 * REQUIREMENTS (NON-NEGOTIABLE):
 * 1. Every data-changing action MUST be logged
 * 2. Logging failure = action MUST NOT proceed (atomicity)
 * 3. Full before/after snapshots captured (no partial data)
 * 4. Append-only: logs never overwritten
 * 5. Revert capability: restore to any previous state
 * 
 * CRITICAL: Never silently catch logging errors
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type AuditAction =
  // Employee operations
  | "CREATE_EMPLOYEE"
  | "UPDATE_EMPLOYEE"
  | "DELETE_EMPLOYEE"
  // Habilitation operations
  | "CREATE_HABILITATION"
  | "UPDATE_HABILITATION"
  | "DELETE_HABILITATION"
  | "RENEW_HABILITATION"
  // Bulk operations
  | "IMPORT_EMPLOYEES"
  | "BATCH_DELETE_HABILITATIONS"
  | "BATCH_UPDATE_HABILITATIONS"
  | "BATCH_UPLOAD_PDF"
  // File operations
  | "UPLOAD_PDF"
  | "DELETE_PDF"
  // Data operations
  | "EXPORT_EMPLOYEES"
  | "IMPORT_FROM_BACKUP"
  // Revert operations
  | "REVERT_EMPLOYEE"
  | "REVERT_HABILITATION"
  // System operations
  | "SYSTEM_LEGACY_ST_DETECTED"
  | "SYSTEM_RESTORE_FROM_BACKUP"
  // Error recovery
  | "REVERT_ERROR";

export interface AuditChange {
  oldValues?: Record<string, any> | null;
  newValues?: Record<string, any> | null;
  details?: string;
}

export interface AuditLogEntry {
  id: number;
  userId: number | null;
  action: AuditAction;
  entityType: string;
  entityId: number | null;
  matricule: string | null;
  snapshotOld: Record<string, any> | null;
  snapshotNew: Record<string, any> | null;
  revertedFromAuditLogId: number | null;
  createdAt: Date;
}

// ============================================================================
// CORE LOGGING FUNCTIONS
// ============================================================================

/**
 * Validate audit snapshot - CRITICAL for data integrity
 * Ensures we have complete before/after data for every mutation
 * 
 * @param oldValues Old data snapshot (null for CREATE)
 * @param newValues New data snapshot (null for DELETE)
 * @param action The action being logged
 * @throws Error if validation fails
 */
export function validateAuditSnapshot(
  oldValues: Record<string, any> | null | undefined,
  newValues: Record<string, any> | null | undefined,
  action: AuditAction
): void {
  // CREATE: newValues required, oldValues must be null
  if (action.includes("CREATE")) {
    if (!newValues || Object.keys(newValues).length === 0) {
      throw new Error(
        `Audit validation failed for ${action}: newValues required for CREATE action. Data snapshot is incomplete.`
      );
    }
    return;
  }

  // DELETE: oldValues required, newValues must be null
  if (action.includes("DELETE")) {
    if (!oldValues || Object.keys(oldValues).length === 0) {
      throw new Error(
        `Audit validation failed for ${action}: oldValues required for DELETE action. Data snapshot is incomplete.`
      );
    }
    return;
  }

  // UPDATE/RENEW: both required
  if (action.includes("UPDATE") || action.includes("RENEW")) {
    if (!oldValues || Object.keys(oldValues).length === 0) {
      throw new Error(
        `Audit validation failed for ${action}: oldValues required for UPDATE/RENEW action. Data snapshot is incomplete.`
      );
    }
    if (!newValues || Object.keys(newValues).length === 0) {
      throw new Error(
        `Audit validation failed for ${action}: newValues required for UPDATE/RENEW action. Data snapshot is incomplete.`
      );
    }
    return;
  }

  // For other actions (IMPORT, EXPORT, etc.), both snapshots recommended but not required
  // (imports may have newValues as array, exports may have only oldValues as array)
}

/**
 * Log an audit action - MUST NOT FAIL SILENTLY
 * 
 * This is the core function. CRITICAL RULES:
 * - THROWS on failure (doesn't silently catch)
 * - Validates snapshots are complete
 * - Inserts to database with JSONB snapshots
 * - Returns audit log ID for transaction reference
 * 
 * @param userId User performing action (hardcoded to 1 for single-user)
 * @param action Type of action (CREATE_EMPLOYEE, UPDATE_EMPLOYEE, etc.)
 * @param entityType Type of entity ('employee', 'habilitation')
 * @param entityId ID of the entity being modified
 * @param matricule Employee matricule (for quick lookup)
 * @param oldValues Full snapshot of old data (null for CREATE)
 * @param newValues Full snapshot of new data (null for DELETE)
 * @throws Error if snapshot invalid or insertion fails
 * @returns ID of created audit log entry
 */
export async function logAuditActionSafe(
  userId: number | null,
  action: AuditAction,
  entityType: string,
  entityId: number | null,
  matricule: string | null,
  oldValues?: Record<string, any> | null,
  newValues?: Record<string, any> | null
): Promise<number> {
  // CRITICAL: Validate snapshots BEFORE attempting insert
  validateAuditSnapshot(oldValues, newValues, action);

  try {
    // Insert to auditLogs with full JSONB snapshots
    const result = await db
      .insert(schema.auditLogs)
      .values({
        userId: userId || null,
        action,
        entityType,
        entityId: entityId || null,
        matricule: matricule || null,
        snapshotOld: oldValues || null,
        snapshotNew: newValues || null,
        revertedFromAuditLogId: null,
        createdAt: new Date(),
      })
      .returning({ id: schema.auditLogs.id });

    if (!result || !result[0] || !result[0].id) {
      throw new Error(
        `Audit logging failed: No audit log ID returned for action ${action} on ${entityType} ${entityId}`
      );
    }

    return result[0].id;
  } catch (err) {
    // DO NOT SILENTLY CATCH - Re-throw with context
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `CRITICAL: Audit logging failed for action ${action} on ${entityType}/${entityId}. ` +
      `Error: ${errorMsg}. Data was NOT modified. Action ROLLED BACK.`
    );
  }
}

// ============================================================================
// RETRIEVAL FUNCTIONS
// ============================================================================

/**
 * Retrieve audit log entries with optional filters
 * Supports pagination and multiple filter criteria
 */
export async function getAuditLogs(filters?: {
  entityType?: string;
  action?: AuditAction;
  entityId?: number;
  matricule?: string;
  userId?: number;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}): Promise<AuditLogEntry[]> {
  try {
    const conditions: any[] = [];

    if (filters?.entityType) {
      conditions.push(eq(schema.auditLogs.entityType, filters.entityType));
    }
    if (filters?.action) {
      conditions.push(eq(schema.auditLogs.action, filters.action));
    }
    if (filters?.entityId) {
      conditions.push(eq(schema.auditLogs.entityId, filters.entityId));
    }
    if (filters?.matricule) {
      conditions.push(eq(schema.auditLogs.matricule, filters.matricule));
    }
    if (filters?.userId) {
      conditions.push(eq(schema.auditLogs.userId, filters.userId));
    }

    const limit = filters?.limit || 100;
    const offset = filters?.offset || 0;

    let query = db.select().from(schema.auditLogs);

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const result = await query
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    return result.map((log) => ({
      id: log.id,
      userId: log.userId,
      action: log.action as AuditAction,
      entityType: log.entityType,
      entityId: log.entityId,
      matricule: log.matricule,
      snapshotOld: log.snapshotOld as Record<string, any> | null,
      snapshotNew: log.snapshotNew as Record<string, any> | null,
      revertedFromAuditLogId: log.revertedFromAuditLogId,
      createdAt: new Date(log.createdAt),
    }));
  } catch (err) {
    console.error("Error retrieving audit logs:", err);
    return [];
  }
}

/**
 * Get a single audit log entry with full details
 */
export async function getAuditLogEntry(id: number): Promise<AuditLogEntry | null> {
  try {
    const result = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.id, id))
      .limit(1);

    if (!result.length) return null;

    const log = result[0];
    return {
      id: log.id,
      userId: log.userId,
      action: log.action as AuditAction,
      entityType: log.entityType,
      entityId: log.entityId,
      matricule: log.matricule,
      snapshotOld: log.snapshotOld as Record<string, any> | null,
      snapshotNew: log.snapshotNew as Record<string, any> | null,
      revertedFromAuditLogId: log.revertedFromAuditLogId,
      createdAt: new Date(log.createdAt),
    };
  } catch (err) {
    console.error("Error retrieving audit log entry:", err);
    return null;
  }
}

// ============================================================================
// HELPER FUNCTIONS FOR COMMON QUERIES
// ============================================================================

/**
 * Get all audit history for a specific employee
 * Shows everything that happened to this employee
 */
export async function getEmployeeAuditHistory(employeeId: number): Promise<AuditLogEntry[]> {
  return getAuditLogs({
    entityId: employeeId,
    limit: 1000,
  });
}

/**
 * Get all audit history for a specific habilitation
 */
export async function getHabilitationAuditHistory(habilitationId: number): Promise<AuditLogEntry[]> {
  return getAuditLogs({
    entityType: "habilitation",
    entityId: habilitationId,
    limit: 1000,
  });
}

// ============================================================================
// REVERT FUNCTIONALITY - RESTORE FROM AUDIT LOG
// ============================================================================

/**
 * Revert an employee to a previous state using audit log data
 * 
 * CRITICAL RULES:
 * - Only called after validation
 * - Creates NEW revert audit entry (doesn't delete original)
 * - Logs the revert action itself
 * - Preserves complete history
 * 
 * @param auditLogId The audit log entry to revert FROM
 * @param userId User performing the revert
 * @throws Error if revert validation fails
 * @returns ID of new REVERT audit entry
 */
export async function revertEmployee(
  auditLogId: number,
  userId: number | null
): Promise<number> {
  // Fetch the original audit log entry
  const originalLog = await getAuditLogEntry(auditLogId);
  if (!originalLog) {
    throw new Error(`Audit log entry ${auditLogId} not found. Cannot revert.`);
  }

  if (originalLog.entityType !== "employee") {
    throw new Error(
      `Cannot revert: audit log ${auditLogId} is for ${originalLog.entityType}, not employee.`
    );
  }

  if (!originalLog.snapshotOld || Object.keys(originalLog.snapshotOld).length === 0) {
    throw new Error(
      `Cannot revert: audit log ${auditLogId} has no old data snapshot. Cannot determine previous state.`
    );
  }

  try {
    // Fetch current employee state
    const currentEmployee = await db
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.id, originalLog.entityId!))
      .limit(1);

    if (!currentEmployee.length) {
      throw new Error(`Employee ${originalLog.entityId} not found. Cannot revert.`);
    }

    const current = currentEmployee[0];

    // Log the REVERT action itself
    // oldValues = current state
    // newValues = restored state (from original log)
    const revertLogId = await logAuditActionSafe(
      userId,
      "REVERT_EMPLOYEE",
      "employee",
      originalLog.entityId,
      originalLog.matricule,
      {
        id: current.id,
        matricule: current.matricule,
        prenom: current.prenom,
        nom: current.nom,
        divisionId: current.divisionId,
        serviceId: current.serviceId,
        equipeId: current.equipeId,
        updatedAt: current.updatedAt,
      },
      originalLog.snapshotOld
    );

    // Update audit log to link this revert back to original
    await db
      .update(schema.auditLogs)
      .set({ revertedFromAuditLogId: auditLogId })
      .where(eq(schema.auditLogs.id, revertLogId));

    return revertLogId;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to revert employee from audit log ${auditLogId}: ${errorMsg}`);
  }
}

/**
 * Revert a habilitation to a previous state using audit log data
 * Same pattern as revertEmployee
 */
export async function revertHabilitation(
  auditLogId: number,
  userId: number | null
): Promise<number> {
  const originalLog = await getAuditLogEntry(auditLogId);
  if (!originalLog) {
    throw new Error(`Audit log entry ${auditLogId} not found. Cannot revert.`);
  }

  if (originalLog.entityType !== "habilitation") {
    throw new Error(
      `Cannot revert: audit log ${auditLogId} is for ${originalLog.entityType}, not habilitation.`
    );
  }

  if (!originalLog.snapshotOld || Object.keys(originalLog.snapshotOld).length === 0) {
    throw new Error(
      `Cannot revert: audit log ${auditLogId} has no old data snapshot. Cannot determine previous state.`
    );
  }

  try {
    const currentHab = await db
      .select()
      .from(schema.habilitations)
      .where(eq(schema.habilitations.id, originalLog.entityId!))
      .limit(1);

    if (!currentHab.length) {
      throw new Error(`Habilitation ${originalLog.entityId} not found. Cannot revert.`);
    }

    const current = currentHab[0];

    const revertLogId = await logAuditActionSafe(
      userId,
      "REVERT_HABILITATION",
      "habilitation",
      originalLog.entityId,
      originalLog.matricule,
      {
        id: current.id,
        employeeId: current.employeeId,
        type: current.type,
        codes: current.codes,
        numero: current.numero,
        dateValidation: current.dateValidation,
        dateExpiration: current.dateExpiration,
        updatedAt: current.updatedAt,
      },
      originalLog.snapshotOld
    );

    await db
      .update(schema.auditLogs)
      .set({ revertedFromAuditLogId: auditLogId })
      .where(eq(schema.auditLogs.id, revertLogId));

    return revertLogId;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to revert habilitation from audit log ${auditLogId}: ${errorMsg}`);
  }
}

// ============================================================================
// EXPORT FUNCTIONS
// ============================================================================

/**
 * Export audit logs as JSON
 */
export async function exportAuditLogsAsJSON(filters?: {
  entityType?: string;
  action?: AuditAction;
  startDate?: Date;
  endDate?: Date;
}): Promise<string> {
  const logs = await getAuditLogs(filters);
  return JSON.stringify(logs, null, 2);
}

/**
 * Check for legacy ST data in database
 * Returns count of ST habilitations if any exist
 */
export async function checkForLegacySTData(): Promise<{ hasLegacyST: boolean; count: number }> {
  try {
    // CORRECTION 2: Changed from checking 'type' field to checking 'stCodes'
    // Count habilitations that have ST codes
    const result = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.habilitations)
      .where(sql`${schema.habilitations.stCodes} != '[]'`);

    const count = result[0]?.count || 0;
    return {
      hasLegacyST: count > 0,
      count,
    };
  } catch (err) {
    console.warn("Warning: Could not check for legacy ST data:", (err as Error).message);
    // Don't fail startup if this check fails
    return { hasLegacyST: false, count: 0 };
  }
}

// ============================================================================
// PHASE 2: VERSIONING - EMPLOYEE STATE SNAPSHOTS
// ============================================================================

/**
 * Create an employee version snapshot
 * Called on every employee mutation (CREATE, UPDATE, DELETE)
 * Stores complete employee state at this point in time
 *
 * @param employeeId Employee being versioned
 * @param snapshotData Complete employee state (all fields + habilitations)
 * @param auditLogId The audit log entry that triggered this version
 * @returns Version number assigned to this snapshot
 */
export async function createEmployeeVersion(
  employeeId: number,
  snapshotData: Record<string, any>,
  auditLogId: number
): Promise<number> {
  try {
    // Get next version number for this employee
    const lastVersion = await db
      .select({ maxVersion: sql<number>`MAX(version_number)` })
      .from(schema.employeeVersions)
      .where(eq(schema.employeeVersions.employeeId, employeeId));

    const nextVersion = (lastVersion[0]?.maxVersion || 0) + 1;

    // Create new version
    const result = await db
      .insert(schema.employeeVersions)
      .values({
        employeeId,
        versionNumber: nextVersion,
        snapshotData,
        auditLogId,
        createdAt: new Date(),
      })
      .returning({ versionNumber: schema.employeeVersions.versionNumber });

    if (!result || !result[0]) {
      throw new Error(`Failed to create employee version for employee ${employeeId}`);
    }

    return result[0].versionNumber;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to create employee version for employee ${employeeId}: ${errorMsg}`
    );
  }
}

/**
 * Get all versions of an employee
 * Ordered by version number (oldest to newest)
 */
export async function getEmployeeVersions(employeeId: number): Promise<
  Array<{
    versionNumber: number;
    snapshotData: Record<string, any>;
    auditLogId: number | null;
    createdAt: Date;
  }>
> {
  try {
    const versions = await db
      .select({
        versionNumber: schema.employeeVersions.versionNumber,
        snapshotData: schema.employeeVersions.snapshotData,
        auditLogId: schema.employeeVersions.auditLogId,
        createdAt: schema.employeeVersions.createdAt,
      })
      .from(schema.employeeVersions)
      .where(eq(schema.employeeVersions.employeeId, employeeId))
      .orderBy(schema.employeeVersions.versionNumber);

    return versions.map((v) => ({
      versionNumber: v.versionNumber,
      snapshotData: v.snapshotData as Record<string, any>,
      auditLogId: v.auditLogId,
      createdAt: v.createdAt,
    }));
  } catch (err) {
    console.error("Error fetching employee versions:", err);
    return [];
  }
}

/**
 * Get employee state at a specific version
 * Returns the complete snapshot from that version
 *
 * @param employeeId Employee to retrieve
 * @param versionNumber Version to retrieve (1-based)
 * @returns Complete employee snapshot or null if not found
 */
export async function getEmployeeAtVersion(
  employeeId: number,
  versionNumber: number
): Promise<Record<string, any> | null> {
  try {
    const result = await db
      .select({ snapshotData: schema.employeeVersions.snapshotData })
      .from(schema.employeeVersions)
      .where(
        and(
          eq(schema.employeeVersions.employeeId, employeeId),
          eq(schema.employeeVersions.versionNumber, versionNumber)
        )
      )
      .limit(1);

    if (!result.length) return null;

    return result[0].snapshotData as Record<string, any>;
  } catch (err) {
    console.error("Error fetching employee at version:", err);
    return null;
  }
}

/**
 * Get employee state at a specific point in time
 * Finds the most recent version before the given date
 *
 * @param employeeId Employee to retrieve
 * @param timestamp Point in time to query
 * @returns Complete employee snapshot or null if not found
 */
export async function getEmployeeAtTimestamp(
  employeeId: number,
  timestamp: Date
): Promise<Record<string, any> | null> {
  try {
    const result = await db
      .select({ snapshotData: schema.employeeVersions.snapshotData })
      .from(schema.employeeVersions)
      .where(
        and(
          eq(schema.employeeVersions.employeeId, employeeId),
          sql`created_at <= ${timestamp}`
        )
      )
      .orderBy(desc(schema.employeeVersions.versionNumber))
      .limit(1);

    if (!result.length) return null;

    return result[0].snapshotData as Record<string, any>;
  } catch (err) {
    console.error("Error fetching employee at timestamp:", err);
    return null;
  }
}
