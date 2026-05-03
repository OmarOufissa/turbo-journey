/**
 * RENEWAL MANAGEMENT ROUTES
 * 
 * CORRECTION 1: Manual renewal activation
 * - Admins manually activate pending renewals instead of automatic activation
 * - Removes cron job complexity and timezone issues
 * - Full audit trail with snapshots
 */

import { RequestHandler } from "express";
import { db, withAuditTransaction } from "../db-pg";
import * as schema from "../schema";
import { eq, and } from "drizzle-orm";
import { logAuditActionSafe, createEmployeeVersion } from "../services/auditService";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get pending renewal with employee details
 */
async function getPendingRenewalWithEmployee(renewalId: number, txDb = db) {
  const result = await txDb
    .select({
      renewalId: schema.pendingRenewals.id,
      employeeId: schema.pendingRenewals.employeeId,
      snapshotData: schema.pendingRenewals.snapshotData,
      status: schema.pendingRenewals.status,
      activationDate: schema.pendingRenewals.activationDate,
      createdAt: schema.pendingRenewals.createdAt,
      matricule: schema.employees.matricule,
      currentVersionId: schema.employees.currentVersionId,
    })
    .from(schema.pendingRenewals)
    .leftJoin(schema.employees, eq(schema.employees.id, schema.pendingRenewals.employeeId))
    .where(
      and(
        eq(schema.pendingRenewals.id, renewalId),
        eq(schema.pendingRenewals.status, "pending")
      )
    )
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

// ============================================================================
// CREATE PENDING RENEWAL
// ============================================================================

/**
 * POST /api/renewals/create
 * Create a pending renewal for an employee
 */
export const createPendingRenewal: RequestHandler = async (req, res) => {
  try {
    const { employeeId, snapshotData, activationDate } = req.body;

    // Validation
    if (!employeeId || !snapshotData || !activationDate) {
      return res.status(400).json({
        message: "Missing required fields: employeeId, snapshotData, activationDate",
      });
    }

    const empId = parseInt(employeeId);
    if (isNaN(empId)) {
      return res.status(400).json({ message: "Invalid employee ID" });
    }

    // Check employee exists
    const employee = await db
      .select()
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, empId),
          eq(schema.employees.deleted, false)
        )
      )
      .limit(1);

    if (employee.length === 0) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Execute in transaction
    const result = await withAuditTransaction(async (txDb) => {
      // Create pending renewal
      const renewal = await txDb
        .insert(schema.pendingRenewals)
        .values({
          employeeId: empId,
          snapshotData: snapshotData,
          activationDate: new Date(activationDate),
          status: "pending",
          createdAt: new Date(),
        })
        .returning();

      if (renewal.length === 0) {
        throw new Error("Failed to create pending renewal");
      }

      // Log audit action
      await logAuditActionSafe(
        1,
        "CREATE_PENDING_RENEWAL",
        "employee",
        empId,
        employee[0].matricule,
        null,
        {
          renewalId: renewal[0].id,
          activationDate: new Date(activationDate).toISOString(),
          snapshot: snapshotData,
        }
      );

      return renewal[0];
    });

    res.status(201).json({
      message: "Pending renewal created successfully",
      renewalId: result.id,
      status: result.status,
      activationDate: result.activationDate,
    });
  } catch (err) {
    console.error("Error creating pending renewal:", err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      message: "Error creating pending renewal",
      error: errorMsg,
    });
  }
};

// ============================================================================
// ACTIVATE PENDING RENEWAL (MANUAL)
// ============================================================================

/**
 * POST /api/renewals/:renewalId/activate
 * Manually activate a pending renewal
 * CORRECTION 1: Manual activation instead of automatic
 * - Archives current version to employee_versions
 * - Updates employee to point to new version from renewal snapshot
 * - Marks renewal as activated
 * - Updates employee.status to ACTIVE
 */
export const activatePendingRenewal: RequestHandler = async (req, res) => {
  try {
    const { renewalId } = req.params;

    const renId = parseInt(renewalId);
    if (isNaN(renId)) {
      return res.status(400).json({ message: "Invalid renewal ID" });
    }

    // Fetch renewal data before transaction
    const renewal = await getPendingRenewalWithEmployee(renId);
    if (!renewal) {
      return res.status(404).json({ message: "Pending renewal not found" });
    }

    // Execute in transaction
    await withAuditTransaction(async (txDb) => {
      // Re-fetch to ensure consistency
      const currentRenewal = await getPendingRenewalWithEmployee(renId, txDb);
      if (!currentRenewal || currentRenewal.status !== "pending") {
        throw new Error("Renewal is not in pending status");
      }

      // Get current employee state
      const currentEmployee = await txDb
        .select()
        .from(schema.employees)
        .where(eq(schema.employees.id, currentRenewal.employeeId))
        .limit(1);

      if (currentEmployee.length === 0) {
        throw new Error("Employee not found");
      }

      const employee = currentEmployee[0];

      // Create new version from current employee state (archive old version)
      const oldVersionNumber = employee.version || 1;
      const newVersionNumber = oldVersionNumber + 1;

      // Create version from current employee state
      const oldVersionData = {
        id: employee.id,
        matricule: employee.matricule,
        prenom: employee.prenom,
        nom: employee.nom,
        fonction: employee.fonction,
        divisionId: employee.divisionId,
        serviceId: employee.serviceId,
        equipeId: employee.equipeId,
        status: employee.status,
        version: oldVersionNumber,
        createdAt: employee.createdAt,
        updatedAt: employee.updatedAt,
      };

      const versionRecord = await txDb
        .insert(schema.employeeVersions)
        .values({
          employeeId: employee.id,
          versionNumber: newVersionNumber,
          snapshotData: oldVersionData,
          createdAt: new Date(),
        })
        .returning();

      if (versionRecord.length === 0) {
        throw new Error("Failed to create version record");
      }

      // Update employee with renewal data from snapshot
      const renewalSnapshot = currentRenewal.snapshotData as any;

      const updatedEmployee = await txDb
        .update(schema.employees)
        .set({
          fonction: renewalSnapshot.fonction,
          divisionId: renewalSnapshot.divisionId,
          serviceId: renewalSnapshot.serviceId,
          equipeId: renewalSnapshot.equipeId,
          status: "ACTIVE", // Reset to active after renewal
          currentVersionId: versionRecord[0].id,
          version: newVersionNumber,
          updatedAt: new Date(),
        })
        .where(eq(schema.employees.id, employee.id))
        .returning();

      if (updatedEmployee.length === 0) {
        throw new Error("Failed to update employee");
      }

      // Mark renewal as activated
      await txDb
        .update(schema.pendingRenewals)
        .set({
          status: "activated",
          activatedAt: new Date(),
        })
        .where(eq(schema.pendingRenewals.id, renId));

      // Log audit action: RENEW_EMPLOYEE
      const auditLogResult = await logAuditActionSafe(
        1,
        "RENEW_EMPLOYEE",
        "employee",
        employee.id,
        employee.matricule,
        oldVersionData,
        {
          ...renewalSnapshot,
          version: newVersionNumber,
          status: "ACTIVE",
        }
      );

      // Update pending renewal to link to activation audit log
      if (auditLogResult?.id) {
        await txDb
          .update(schema.pendingRenewals)
          .set({
            activatedByAuditLogId: auditLogResult.id,
          })
          .where(eq(schema.pendingRenewals.id, renId));
      }
    });

    res.json({
      message: "Renewal activated successfully",
      renewalId: renId,
      status: "activated",
    });
  } catch (err) {
    console.error("Error activating renewal:", err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      message: "Error activating renewal",
      error: errorMsg,
    });
  }
};

// ============================================================================
// LIST PENDING RENEWALS
// ============================================================================

/**
 * GET /api/renewals/pending
 * List all pending renewals
 */
export const listPendingRenewals: RequestHandler = async (req, res) => {
  try {
    const renewals = await db
      .select({
        renewalId: schema.pendingRenewals.id,
        employeeId: schema.pendingRenewals.employeeId,
        matricule: schema.employees.matricule,
        prenom: schema.employees.prenom,
        nom: schema.employees.nom,
        status: schema.pendingRenewals.status,
        activationDate: schema.pendingRenewals.activationDate,
        createdAt: schema.pendingRenewals.createdAt,
      })
      .from(schema.pendingRenewals)
      .leftJoin(schema.employees, eq(schema.employees.id, schema.pendingRenewals.employeeId))
      .where(eq(schema.pendingRenewals.status, "pending"))
      .orderBy(schema.pendingRenewals.activationDate);

    res.json({
      message: "Pending renewals retrieved",
      count: renewals.length,
      renewals,
    });
  } catch (err) {
    console.error("Error listing pending renewals:", err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      message: "Error listing pending renewals",
      error: errorMsg,
    });
  }
};

// ============================================================================
// DELETE PENDING RENEWAL
// ============================================================================

/**
 * DELETE /api/renewals/:renewalId
 * Delete a pending renewal (with undo support)
 */
export const deletePendingRenewal: RequestHandler = async (req, res) => {
  try {
    const { renewalId } = req.params;

    const renId = parseInt(renewalId);
    if (isNaN(renId)) {
      return res.status(400).json({ message: "Invalid renewal ID" });
    }

    // Fetch renewal data before transaction
    const renewal = await getPendingRenewalWithEmployee(renId);
    if (!renewal) {
      return res.status(404).json({ message: "Pending renewal not found" });
    }

    if (renewal.status !== "pending") {
      return res.status(400).json({
        message: "Only pending renewals can be deleted",
      });
    }

    // Execute in transaction
    await withAuditTransaction(async (txDb) => {
      // Mark renewal as cancelled (soft delete)
      await txDb
        .update(schema.pendingRenewals)
        .set({
          status: "cancelled",
        })
        .where(eq(schema.pendingRenewals.id, renId));

      // Log audit action
      await logAuditActionSafe(
        1,
        "DELETE_PENDING_RENEWAL",
        "employee",
        renewal.employeeId,
        renewal.matricule || null,
        {
          renewalId: renewal.renewalId,
          status: "pending",
          snapshot: renewal.snapshotData,
        },
        {
          status: "cancelled",
          cancelledAt: new Date().toISOString(),
        }
      );
    });

    res.json({
      message: "Pending renewal deleted successfully",
      renewalId: renId,
    });
  } catch (err) {
    console.error("Error deleting pending renewal:", err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      message: "Error deleting pending renewal",
      error: errorMsg,
    });
  }
};

export default {
  createPendingRenewal,
  activatePendingRenewal,
  listPendingRenewals,
  deletePendingRenewal,
};
