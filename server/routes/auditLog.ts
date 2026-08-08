import { RequestHandler } from "express";
import {
  getAuditLogs,
  getAuditLogEntry,
  exportAuditLogsAsJSON,
  getEmployeeAuditHistory,
  getHabilitationAuditHistory,
  revertEmployee,
  revertHabilitation,
  AuditAction,
} from "../services/auditService";
import { db } from "../db-pg";
import * as schema from "../schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/audit-logs
 * Retrieve audit log entries with optional filters and pagination
 * Query parameters:
 *   - entityType: string (employee, habilitation, etc.)
 *   - action: string (CREATE_EMPLOYEE, UPDATE_EMPLOYEE, etc.)
 *   - entityId: number
 *   - matricule: string (employee matricule for quick lookup)
 *   - userId: number
 *   - startDate: ISO date string
 *   - endDate: ISO date string
 *   - limit: number (default 100)
 *   - offset: number (default 0)
 */
export const getAuditLogs_Handler: RequestHandler = async (req, res) => {
  try {
    const {
      entityType,
      action,
      entityId,
      matricule,
      userId,
      startDate,
      endDate,
      limit,
      offset,
    } = req.query;

    const filters = {
      entityType: entityType as string | undefined,
      action: action as AuditAction | undefined,
      entityId: entityId ? parseInt(entityId as string) : undefined,
      matricule: matricule as string | undefined,
      userId: userId ? parseInt(userId as string) : undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: limit ? parseInt(limit as string) : 100,
      offset: offset ? parseInt(offset as string) : 0,
    };

    const logs = await getAuditLogs(filters);
    res.json(logs);
  } catch (err) {
    console.error("Error fetching audit logs:", err);
    res.status(500).json({ message: "Erreur lors de la récupération des journaux d'audit" });
  }
};

/**
 * GET /api/audit-logs/:id
 * Retrieve a single audit log entry
 */
export const getAuditLogEntry_Handler: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const logId = parseInt(id);

    if (isNaN(logId)) {
      return res.status(400).json({ message: "ID d'audit invalide" });
    }

    const log = await getAuditLogEntry(logId);
    if (!log) {
      return res.status(404).json({ message: "Entrée d'audit non trouvée" });
    }

    res.json(log);
  } catch (err) {
    console.error("Error fetching audit log entry:", err);
    res.status(500).json({ message: "Erreur lors de la récupération de l'entrée d'audit" });
  }
};

/**
 * GET /api/audit-logs/export
 * Export audit logs as JSON with optional filters
 */
export const exportAuditLogs_Handler: RequestHandler = async (req, res) => {
  try {
    const { entityType, action, startDate, endDate } = req.query;

    const filters = {
      entityType: entityType as string | undefined,
      action: action as AuditAction | undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    };

    const json = await exportAuditLogsAsJSON(filters);

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="audit-logs-${new Date().toISOString().split("T")[0]}.json"`
    );
    res.send(json);
  } catch (err) {
    console.error("Error exporting audit logs:", err);
    res.status(500).json({ message: "Erreur lors de l'export des journaux d'audit" });
  }
};

/**
 * GET /api/audit-logs/employee/:employeeId
 * Get all audit history for a specific employee
 */
export const getEmployeeAuditHistory_Handler: RequestHandler = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const empId = parseInt(employeeId);

    if (isNaN(empId)) {
      return res.status(400).json({ message: "ID d'employé invalide" });
    }

    const history = await getEmployeeAuditHistory(empId);
    res.json(history);
  } catch (err) {
    console.error("Error fetching employee audit history:", err);
    res.status(500).json({ message: "Erreur lors de la récupération de l'historique de l'employé" });
  }
};

/**
 * GET /api/audit-logs/habilitation/:habilitationId
 * Get all audit history for a specific habilitation
 */
export const getHabilitationAuditHistory_Handler: RequestHandler = async (req, res) => {
  try {
    const { habilitationId } = req.params;
    const habId = parseInt(habilitationId);

    if (isNaN(habId)) {
      return res.status(400).json({ message: "ID d'habilitation invalide" });
    }

    const history = await getHabilitationAuditHistory(habId);
    res.json(history);
  } catch (err) {
    console.error("Error fetching habilitation audit history:", err);
    res.status(500).json({ message: "Erreur lors de la récupération de l'historique de l'habilitation" });
  }
};

/**
 * POST /api/audit-logs/:logId/revert
 * PHASE 1: REVERT FUNCTIONALITY
 * Restore an employee or habilitation to a previous state from audit log
 *
 * CRITICAL RULES:
 * - Only reverts to state captured in oldValues
 * - Creates NEW audit entry (doesn't delete original)
 * - Preserves complete history
 * - Validates data before reverting
 *
 * Response:
 * {
 *   success: bool,
 *   newAuditLogId: number,
 *   message: string,
 *   revertedEntity: {entity data restored to}
 * }
 */
export const revertAuditLog_Handler: RequestHandler = async (req, res) => {
  try {
    const { logId } = req.params;
    const auditLogId = parseInt(logId);

    if (isNaN(auditLogId)) {
      return res.status(400).json({
        success: false,
        message: "ID d'audit invalide",
      });
    }

    // Fetch the audit log entry
    const auditEntry = await getAuditLogEntry(auditLogId);
    if (!auditEntry) {
      return res.status(404).json({
        success: false,
        message: `Entrée d'audit ${auditLogId} non trouvée`,
      });
    }

    // Determine if reverting employee or habilitation
    if (auditEntry.entityType === "employee") {
      try {
        // Revert employee
        const newAuditLogId = await revertEmployee(auditLogId, 1); // hardcoded to user 1

        // Fetch the reverted employee for response
        const revertedEmployee = await db
          .select()
          .from(schema.employees)
          .where(eq(schema.employees.id, auditEntry.entityId!))
          .limit(1);

        return res.json({
          success: true,
          newAuditLogId,
          message: `Employé ${auditEntry.matricule} revenu à l'état du ${auditEntry.createdAt.toLocaleDateString()}`,
          revertedEntity: revertedEmployee[0] || null,
        });
      } catch (revertErr) {
        const errMsg = revertErr instanceof Error ? revertErr.message : String(revertErr);
        return res.status(400).json({
          success: false,
          message: `Erreur lors de la réversion: ${errMsg}`,
        });
      }
    } else if (auditEntry.entityType === "habilitation") {
      try {
        // Revert habilitation
        const newAuditLogId = await revertHabilitation(auditLogId, 1);

        const revertedHab = await db
          .select()
          .from(schema.habilitations)
          .where(eq(schema.habilitations.id, auditEntry.entityId!))
          .limit(1);

        return res.json({
          success: true,
          newAuditLogId,
          message: `Habilitation revenue à l'état du ${auditEntry.createdAt.toLocaleDateString()}`,
          revertedEntity: revertedHab[0] || null,
        });
      } catch (revertErr) {
        const errMsg = revertErr instanceof Error ? revertErr.message : String(revertErr);
        return res.status(400).json({
          success: false,
          message: `Erreur lors de la réversion: ${errMsg}`,
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: `Impossible de revenir en arrière: type d'entité non reconnu (${auditEntry.entityType})`,
      });
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("Error reverting audit log:", err);
    res.status(500).json({
      success: false,
      message: `Erreur serveur lors de la réversion: ${errMsg}`,
    });
  }
};
