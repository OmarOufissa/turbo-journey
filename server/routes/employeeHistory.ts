/**
 * PHASE 2: EMPLOYEE HISTORY & VERSIONING
 * 
 * Provides complete history of employee state changes over time.
 * Enables compliance auditing and state restoration.
 * 
 * Endpoints:
 * - GET /api/employees/:empId/history - timeline of all changes
 * - GET /api/employees/:empId/history/:version - specific version state
 */

import { RequestHandler } from "express";
import { db } from "../db-pg";
import * as schema from "../schema";
import { eq, and, desc } from "drizzle-orm";

// ============================================================================
// TYPES
// ============================================================================

export interface HistoryEvent {
  id: number;
  action: string;
  entityType: string;
  entityId: number;
  matricule: string | null;
  snapshotOld: Record<string, any> | null;
  snapshotNew: Record<string, any> | null;
  createdAt: Date;
  userId: number | null;
  revertedFromAuditLogId: number | null;
  changes?: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
}

export interface EmployeeVersionState {
  version: number;
  snapshotData: Record<string, any>;
  createdAt: Date;
  action: string;
  userId: number | null;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract changed fields from before/after snapshots
 */
function extractChanges(
  oldValues: Record<string, any> | null,
  newValues: Record<string, any> | null
): { field: string; oldValue: any; newValue: any }[] {
  const changes = [];

  if (!oldValues || !newValues) {
    return changes;
  }

  const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);

  for (const field of allKeys) {
    const oldValue = oldValues[field];
    const newValue = newValues[field];

    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push({
        field,
        oldValue,
        newValue,
      });
    }
  }

  return changes;
}

/**
 * Get all versions for an employee from audit trail
 */
async function getEmployeeVersions(employeeId: number): Promise<HistoryEvent[]> {
  const logs = await db
    .select()
    .from(schema.auditLogs)
    .where(
      and(
        eq(schema.auditLogs.entityType, "employee"),
        eq(schema.auditLogs.entityId, employeeId)
      )
    )
    .orderBy(desc(schema.auditLogs.createdAt));

  return logs.map((log) => ({
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId || 0,
    matricule: log.matricule,
    snapshotOld: log.snapshotOld,
    snapshotNew: log.snapshotNew,
    createdAt: log.createdAt,
    userId: log.userId,
    revertedFromAuditLogId: log.revertedFromAuditLogId,
    changes: extractChanges(log.snapshotOld, log.snapshotNew),
  }));
}

/**
 * Get complete history including habilitation changes for an employee
 */
async function getCompleteEmployeeHistory(employeeId: number) {
  // Get all employee mutations
  const employeeHistory = await getEmployeeVersions(employeeId);

  // Get all habilitation mutations for this employee
  const habLogs = await db
    .select()
    .from(schema.auditLogs)
    .where(
      and(
        eq(schema.auditLogs.entityType, "habilitation"),
        // Filter by habilitations belonging to this employee via matricule or entityId
      )
    )
    .orderBy(desc(schema.auditLogs.createdAt));

  // Get habilitations for this employee
  const habs = await db
    .select()
    .from(schema.habilitations)
    .where(eq(schema.habilitations.employeeId, employeeId))
    .orderBy(schema.habilitations.id);

  // Filter hab logs to only those related to this employee's habs
  const habIds = new Set(habs.map((h) => h.id));
  const relevantHabLogs = habLogs.filter((log) => {
    if (log.entityId && habIds.has(log.entityId)) {
      return true;
    }
    // Also check if matricule matches
    return log.matricule ? employeeHistory.some((eh) => eh.matricule === log.matricule) : false;
  });

  // Combine and sort by date
  const allEvents = [
    ...employeeHistory.map((e) => ({
      ...e,
      type: "employee" as const,
    })),
    ...relevantHabLogs.map((log) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId || 0,
      matricule: log.matricule,
      snapshotOld: log.snapshotOld,
      snapshotNew: log.snapshotNew,
      createdAt: log.createdAt,
      userId: log.userId,
      revertedFromAuditLogId: log.revertedFromAuditLogId,
      type: "habilitation" as const,
      changes: extractChanges(log.snapshotOld, log.snapshotNew),
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return allEvents;
}

/**
 * Reconstruct employee state at a specific point in time
 */
async function getEmployeeStateAtVersion(
  employeeId: number,
  versionIndex: number
): Promise<Record<string, any> | null> {
  const history = await getEmployeeVersions(employeeId);

  if (versionIndex < 0 || versionIndex >= history.length) {
    return null;
  }

  const targetEvent = history[versionIndex];

  if (targetEvent.snapshotNew) {
    return targetEvent.snapshotNew;
  }

  return null;
}

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * GET /api/employees/:empId/history
 * Get complete timeline of employee changes
 */
export const getEmployeeHistory: RequestHandler = async (req, res) => {
  try {
    const { empId } = req.params;
    const employeeId = parseInt(empId);

    if (isNaN(employeeId)) {
      return res.status(400).json({ message: "Invalid employee ID" });
    }

    // Verify employee exists
    const employee = await db
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(eq(schema.employees.id, employeeId))
      .limit(1);

    if (!employee.length) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const history = await getCompleteEmployeeHistory(employeeId);

    res.json({
      employeeId,
      totalEvents: history.length,
      events: history.map((event) => ({
        id: event.id,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        timestamp: event.createdAt,
        changes: event.changes || [],
        userId: event.userId,
        revertedFromAuditLogId: event.revertedFromAuditLogId,
        snapshotOld: event.snapshotOld,
        snapshotNew: event.snapshotNew,
      })),
    });
  } catch (err) {
    console.error("Error fetching employee history:", err);
    res.status(500).json({ message: "Error fetching employee history" });
  }
};

/**
 * GET /api/employees/:empId/history/:version
 * Get employee state at a specific version (by index in history)
 * version=0 is most recent, version=n is nth most recent
 */
export const getEmployeeHistoryVersion: RequestHandler = async (req, res) => {
  try {
    const { empId, version } = req.params;
    const employeeId = parseInt(empId);
    const versionIndex = parseInt(version);

    if (isNaN(employeeId) || isNaN(versionIndex)) {
      return res.status(400).json({ message: "Invalid employee ID or version" });
    }

    if (versionIndex < 0) {
      return res.status(400).json({ message: "Version index must be >= 0" });
    }

    // Verify employee exists
    const employee = await db
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(eq(schema.employees.id, employeeId))
      .limit(1);

    if (!employee.length) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const state = await getEmployeeStateAtVersion(employeeId, versionIndex);

    if (!state) {
      return res.status(404).json({
        message: `Version ${versionIndex} not found for this employee`,
      });
    }

    res.json({
      employeeId,
      versionIndex,
      state,
      timestamp: new Date(state.createdAt || new Date()).toISOString(),
    });
  } catch (err) {
    console.error("Error fetching employee history version:", err);
    res.status(500).json({ message: "Error fetching employee history version" });
  }
};

/**
 * GET /api/employees/:empId/history/timeline
 * Get simplified timeline for UI display
 * Returns array of events with change summaries
 */
export const getEmployeeHistoryTimeline: RequestHandler = async (req, res) => {
  try {
    const { empId } = req.params;
    const employeeId = parseInt(empId);

    if (isNaN(employeeId)) {
      return res.status(400).json({ message: "Invalid employee ID" });
    }

    const employee = await db
      .select()
      .from(schema.employees)
      .where(eq(schema.employees.id, employeeId))
      .limit(1);

    if (!employee.length) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const history = await getCompleteEmployeeHistory(employeeId);

    const timeline = history.map((event, index) => {
      const changeSummary = event.changes
        ?.map((c) => `${c.field}: ${JSON.stringify(c.oldValue)} → ${JSON.stringify(c.newValue)}`)
        .join("; ");

      return {
        index,
        id: event.id,
        action: event.action,
        entityType: event.entityType,
        timestamp: event.createdAt,
        changeSummary: changeSummary || "No changes tracked",
        userId: event.userId,
        canRevert: true,
      };
    });

    res.json({
      employeeId,
      matricule: employee[0].matricule,
      totalEvents: timeline.length,
      timeline,
    });
  } catch (err) {
    console.error("Error fetching employee history timeline:", err);
    res.status(500).json({ message: "Error fetching employee history timeline" });
  }
};

export default {
  getEmployeeHistory,
  getEmployeeHistoryVersion,
  getEmployeeHistoryTimeline,
};
