/**
 * PHASE 1: AUDIT-INTEGRATED EMPLOYEE ROUTES
 * 
 * All mutations are wrapped in transactions with mandatory audit logging.
 * Pattern: Validate → Transaction → Mutate → Audit → Commit/Rollback
 * 
 * If audit logging fails, entire transaction rolls back and user gets error.
 * Zero silent failures.
 */

import { RequestHandler } from "express";
import { db, withAuditTransaction, validateEmployeeData, validateHabilitationData } from "../db-pg";
import * as schema from "../schema";
import { eq, and } from "drizzle-orm";
import { logAuditActionSafe, createEmployeeVersion } from "../services/auditService";
import { addYears, format } from "date-fns";

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate habilitation expiration date
 * HT = +3 years (no ST allowed)
 */
function calculateExpirationDate(validationDate: string): string {
  const date = new Date(validationDate);
  const expirationDate = addYears(date, 3);
  return format(expirationDate, "yyyy-MM-dd");
}

/**
 * Format employee response with relations
 */
async function formatEmployeeResponse(employeeId: number, txDb = db) {
  const employee = await txDb
    .select({
      id: schema.employees.id,
      matricule: schema.employees.matricule,
      prenom: schema.employees.prenom,
      nom: schema.employees.nom,
      fonction: schema.employees.fonction,
      divisionId: schema.employees.divisionId,
      serviceId: schema.employees.serviceId,
      equipeId: schema.employees.equipeId,
      division: schema.divisions.name,
      service: schema.services.name,
      equipe: schema.equipes.name,
      createdAt: schema.employees.createdAt,
      updatedAt: schema.employees.updatedAt,
    })
    .from(schema.employees)
    .leftJoin(schema.divisions, eq(schema.employees.divisionId, schema.divisions.id))
    .leftJoin(schema.services, eq(schema.employees.serviceId, schema.services.id))
    .leftJoin(schema.equipes, eq(schema.employees.equipeId, schema.equipes.id))
    .where(eq(schema.employees.id, employeeId))
    .limit(1);

  if (!employee.length) return null;

  const habilitations = await txDb
    .select()
    .from(schema.habilitations)
    .where(eq(schema.habilitations.employeeId, employeeId))
    .orderBy(schema.habilitations.dateExpiration);

  return {
    ...employee[0],
    habilitations: habilitations.map((h) => ({
      id: h.id,
      employee_id: h.employeeId,
      // Both stCodes and htCodes always present in schema (can be empty arrays)
      stCodes: h.stCodes ? JSON.parse(h.stCodes) : [],
      htCodes: h.htCodes ? JSON.parse(h.htCodes) : [],
      numero: h.numero,
      date_validation: h.dateValidation,
      date_expiration: h.dateExpiration,
      pdf_path: h.pdfPath,
    })),
  };
}

// ============================================================================
// EMPLOYEE CRUD ENDPOINTS WITH AUDIT LOGGING
// ============================================================================

/**
 * GET /api/employees
 * Retrieve all employees with their habilitations
 * (Read-only, no audit logging needed)
 */
export const getEmployees: RequestHandler = async (_req, res) => {
  try {
    const employees = await db
      .select({
        id: schema.employees.id,
        matricule: schema.employees.matricule,
        prenom: schema.employees.prenom,
        nom: schema.employees.nom,
        fonction: schema.employees.fonction,
        divisionId: schema.employees.divisionId,
        serviceId: schema.employees.serviceId,
        equipeId: schema.employees.equipeId,
        division: schema.divisions.name,
        service: schema.services.name,
        equipe: schema.equipes.name,
        createdAt: schema.employees.createdAt,
        updatedAt: schema.employees.updatedAt,
      })
      .from(schema.employees)
      .leftJoin(schema.divisions, eq(schema.employees.divisionId, schema.divisions.id))
      .leftJoin(schema.services, eq(schema.employees.serviceId, schema.services.id))
      .leftJoin(schema.equipes, eq(schema.employees.equipeId, schema.equipes.id))
      .orderBy(schema.employees.matricule);

    // Fetch habilitations for each employee
    const result = await Promise.all(
      employees.map(async (emp) => {
        const habs = await db
          .select()
          .from(schema.habilitations)
          .where(eq(schema.habilitations.employeeId, emp.id))
          .orderBy(schema.habilitations.dateExpiration);

        return {
          ...emp,
          habilitations: habs.map((h) => ({
            id: h.id,
            employee_id: h.employeeId,
            stCodes: h.stCodes ? JSON.parse(h.stCodes) : [],
            htCodes: h.htCodes ? JSON.parse(h.htCodes) : [],
            numero: h.numero,
            date_validation: h.dateValidation,
            date_expiration: h.dateExpiration,
            pdf_path: h.pdfPath,
          })),
        };
      })
    );

    res.json(result);
  } catch (err) {
    console.error("Error fetching employees:", err);
    res.status(500).json({ message: "Erreur lors de la récupération des employés" });
  }
};

/**
 * GET /api/employees/:id
 * Retrieve a single employee with habilitations
 */
export const getEmployee: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const employeeId = parseInt(id);

    if (isNaN(employeeId)) {
      return res.status(400).json({ message: "ID employé invalide" });
    }

    const employee = await formatEmployeeResponse(employeeId);
    if (!employee) {
      return res.status(404).json({ message: "Employé non trouvé" });
    }

    res.json(employee);
  } catch (err) {
    console.error("Error fetching employee:", err);
    res.status(500).json({ message: "Erreur lors de la récupération de l'employé" });
  }
};

/**
 * POST /api/employees
 * Create employee with habilitations
 * PHASE 1: AUDIT LOGGED - Full snapshots captured, transaction-safe
 */
export const createEmployee: RequestHandler = async (req, res) => {
  try {
    const { matricule, prenom, nom, division_id, service_id, equipe_id, habilitations } =
      req.body;

    // Validate required fields
    if (!matricule || !prenom || !nom || !division_id || !service_id || !equipe_id) {
      return res.status(400).json({ message: "Champs requis manquants" });
    }

    // Validate data format
    try {
      validateEmployeeData({
        matricule,
        prenom,
        nom,
        divisionId: division_id,
        serviceId: service_id,
        equipeId: equipe_id,
      });
    } catch (validationErr) {
      return res.status(400).json({ message: (validationErr as Error).message });
    }

    // Check if matricule already exists
    const existing = await db
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(eq(schema.employees.matricule, matricule))
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({ message: "Ce matricule existe déjà" });
    }

    // Execute in transaction with mandatory audit logging
    const newEmployee = await withAuditTransaction(async (txDb) => {
      // INSERT employee
      const insertResult = await txDb
        .insert(schema.employees)
        .values({
          matricule,
          prenom,
          nom,
          divisionId: division_id,
          serviceId: service_id,
          equipeId: equipe_id,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: schema.employees.id });

      const employeeId = insertResult[0].id;

      // INSERT habilitations if provided
      if (habilitations && Array.isArray(habilitations)) {
        for (const hab of habilitations) {
          // Normalize codes: ensure both arrays exist
          const stCodes = hab.stCodes || [];
          const htCodes = hab.htCodes || [];

          // Validate at least one code is present
          if (stCodes.length === 0 && htCodes.length === 0) {
            throw new Error(
              `Habilitation validation failed: At least one habilitation code (ST or HT) is required`
            );
          }

          const expirationDate = hab.dateExpiration || calculateExpirationDate(hab.dateValidation);

          await txDb.insert(schema.habilitations).values({
            employeeId,
            stCodes: JSON.stringify(stCodes),
            htCodes: JSON.stringify(htCodes),
            numero: hab.numero || null,
            dateValidation: hab.dateValidation,
            dateExpiration: expirationDate,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }

      // Fetch complete new record for snapshot
      const employee = await formatEmployeeResponse(employeeId, txDb);
      if (!employee) {
        throw new Error(`Failed to fetch created employee ${employeeId}`);
      }

      // Log audit action: CREATE_EMPLOYEE
      // oldValues = null (new record)
      // newValues = full employee record with habilitations
      const auditLogId = await logAuditActionSafe(
        1, // hardcoded to single-user for now
        "CREATE_EMPLOYEE",
        "employee",
        employeeId,
        matricule,
        null, // oldValues
        {
          id: employee.id,
          matricule: employee.matricule,
          prenom: employee.prenom,
          nom: employee.nom,
          divisionId: employee.divisionId,
          serviceId: employee.serviceId,
          equipeId: employee.equipeId,
          division: employee.division,
          service: employee.service,
          equipe: employee.equipe,
          habilitations: employee.habilitations,
        } // newValues
      );

      // PHASE 2: Create version snapshot
      await createEmployeeVersion(
        employeeId,
        {
          id: employee.id,
          matricule: employee.matricule,
          prenom: employee.prenom,
          nom: employee.nom,
          divisionId: employee.divisionId,
          serviceId: employee.serviceId,
          equipeId: employee.equipeId,
          division: employee.division,
          service: employee.service,
          equipe: employee.equipe,
          habilitations: employee.habilitations,
          createdAt: new Date().toISOString(),
        },
        auditLogId
      );

      return employee;
    });

    res.status(201).json(newEmployee);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Error creating employee:", err);

    // If transaction rolled back, error will include "rolled back" message
    if (errorMsg.includes("rolled back")) {
      res.status(500).json({
        message: `Erreur lors de la création: ${errorMsg}. Aucune donnée n'a été modifiée.`,
      });
    } else {
      res.status(500).json({ message: errorMsg || "Erreur serveur" });
    }
  }
};

/**
 * PUT /api/employees/:id
 * Update employee data
 * PHASE 1: AUDIT LOGGED - Before/after snapshots captured
 */
export const updateEmployee: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const { matricule, prenom, nom, division_id, service_id, equipe_id } = req.body;
    const employeeId = parseInt(id);

    if (isNaN(employeeId)) {
      return res.status(400).json({ message: "ID employé invalide" });
    }

    // Validate required fields
    if (!matricule || !prenom || !nom || !division_id || !service_id || !equipe_id) {
      return res.status(400).json({ message: "Champs requis manquants" });
    }

    // Validate data format
    try {
      validateEmployeeData({
        matricule,
        prenom,
        nom,
        divisionId: division_id,
        serviceId: service_id,
        equipeId: equipe_id,
      });
    } catch (validationErr) {
      return res.status(400).json({ message: (validationErr as Error).message });
    }

    // Check if another employee has this matricule
    const existing = await db
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.matricule, matricule),
          // Don't match the same employee
          // @ts-ignore
          sql`id != ${employeeId}`
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({ message: "Ce matricule existe déjà" });
    }

    // Execute in transaction with audit logging
    const updatedEmployee = await withAuditTransaction(async (txDb) => {
      // Fetch old data BEFORE update
      const oldEmployee = await formatEmployeeResponse(employeeId, txDb);
      if (!oldEmployee) {
        throw new Error(`Employé ${employeeId} non trouvé`);
      }

      // UPDATE employee
      await txDb
        .update(schema.employees)
        .set({
          matricule,
          prenom,
          nom,
          divisionId: division_id,
          serviceId: service_id,
          equipeId: equipe_id,
          updatedAt: new Date(),
        })
        .where(eq(schema.employees.id, employeeId));

      // Fetch new data AFTER update
      const newEmployee = await formatEmployeeResponse(employeeId, txDb);
      if (!newEmployee) {
        throw new Error(`Failed to fetch updated employee ${employeeId}`);
      }

      // Log audit action: UPDATE_EMPLOYEE
      const auditLogId = await logAuditActionSafe(
        1,
        "UPDATE_EMPLOYEE",
        "employee",
        employeeId,
        matricule,
        {
          id: oldEmployee.id,
          matricule: oldEmployee.matricule,
          prenom: oldEmployee.prenom,
          nom: oldEmployee.nom,
          divisionId: oldEmployee.divisionId,
          serviceId: oldEmployee.serviceId,
          equipeId: oldEmployee.equipeId,
        }, // oldValues
        {
          id: newEmployee.id,
          matricule: newEmployee.matricule,
          prenom: newEmployee.prenom,
          nom: newEmployee.nom,
          divisionId: newEmployee.divisionId,
          serviceId: newEmployee.serviceId,
          equipeId: newEmployee.equipeId,
        } // newValues
      );

      // PHASE 2: Create version snapshot
      await createEmployeeVersion(
        employeeId,
        {
          id: newEmployee.id,
          matricule: newEmployee.matricule,
          prenom: newEmployee.prenom,
          nom: newEmployee.nom,
          divisionId: newEmployee.divisionId,
          serviceId: newEmployee.serviceId,
          equipeId: newEmployee.equipeId,
          division: newEmployee.division,
          service: newEmployee.service,
          equipe: newEmployee.equipe,
          updatedAt: new Date().toISOString(),
        },
        auditLogId
      );

      return newEmployee;
    });

    res.json(updatedEmployee);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Error updating employee:", err);

    if (errorMsg.includes("rolled back")) {
      res.status(500).json({
        message: `Erreur lors de la mise à jour: ${errorMsg}. Aucune donnée n'a été modifiée.`,
      });
    } else {
      res.status(500).json({ message: errorMsg || "Erreur serveur" });
    }
  }
};

/**
 * DELETE /api/employees/:id
 * Delete employee and all habilitations
 * PHASE 1: AUDIT LOGGED - Full snapshot of deleted data preserved
 */
export const deleteEmployee: RequestHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const employeeId = parseInt(id);

    if (isNaN(employeeId)) {
      return res.status(400).json({ message: "ID employé invalide" });
    }

    // Execute in transaction with audit logging
    await withAuditTransaction(async (txDb) => {
      // Fetch full employee data BEFORE delete
      const employee = await formatEmployeeResponse(employeeId, txDb);
      if (!employee) {
        throw new Error(`Employé ${employeeId} non trouvé`);
      }

      // DELETE habilitations (cascade will handle this, but we log them separately)
      // DELETE employee (cascade deletes habilitations)
      await txDb.delete(schema.employees).where(eq(schema.employees.id, employeeId));

      // Log audit action: DELETE_EMPLOYEE
      // oldValues = full employee with all habilitations
      // newValues = null (deleted)
      const auditLogId = await logAuditActionSafe(
        1,
        "DELETE_EMPLOYEE",
        "employee",
        employeeId,
        employee.matricule,
        {
          id: employee.id,
          matricule: employee.matricule,
          prenom: employee.prenom,
          nom: employee.nom,
          divisionId: employee.divisionId,
          serviceId: employee.serviceId,
          equipeId: employee.equipeId,
          habilitations: employee.habilitations,
        }, // oldValues
        null // newValues
      );

      // PHASE 2: Create version snapshot (full deleted data for restoration)
      await createEmployeeVersion(
        employeeId,
        {
          id: employee.id,
          matricule: employee.matricule,
          prenom: employee.prenom,
          nom: employee.nom,
          divisionId: employee.divisionId,
          serviceId: employee.serviceId,
          equipeId: employee.equipeId,
          habilitations: employee.habilitations,
          deletedAt: new Date().toISOString(),
        },
        auditLogId
      );
    });

    res.json({ message: "Employé supprimé avec succès" });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Error deleting employee:", err);

    if (errorMsg.includes("rolled back")) {
      res.status(500).json({
        message: `Erreur lors de la suppression: ${errorMsg}. Aucune donnée n'a été modifiée.`,
      });
    } else {
      res.status(500).json({ message: errorMsg || "Erreur serveur" });
    }
  }
};

// ============================================================================
// ORGANIZATIONAL STRUCTURE ENDPOINTS (READ-ONLY)
// ============================================================================

export const getDivisions: RequestHandler = async (_req, res) => {
  try {
    const divisions = await db
      .select({ id: schema.divisions.id, name: schema.divisions.name })
      .from(schema.divisions)
      .orderBy(schema.divisions.name);
    res.json(divisions);
  } catch (err) {
    console.error("Error fetching divisions:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const getServicesByDivision: RequestHandler = async (req, res) => {
  try {
    const { divisionId } = req.params;
    const did = parseInt(divisionId);

    if (isNaN(did)) {
      return res.status(400).json({ message: "Division ID invalide" });
    }

    const services = await db
      .select({ id: schema.services.id, name: schema.services.name })
      .from(schema.services)
      .where(eq(schema.services.divisionId, did))
      .orderBy(schema.services.name);

    res.json(services);
  } catch (err) {
    console.error("Error fetching services:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

export const getEquipesByService: RequestHandler = async (req, res) => {
  try {
    const { serviceId } = req.params;
    const sid = parseInt(serviceId);

    if (isNaN(sid)) {
      return res.status(400).json({ message: "Service ID invalide" });
    }

    const equipes = await db
      .select({ id: schema.equipes.id, name: schema.equipes.name })
      .from(schema.equipes)
      .where(eq(schema.equipes.serviceId, sid))
      .orderBy(schema.equipes.name);

    res.json(equipes);
  } catch (err) {
    console.error("Error fetching equipes:", err);
    res.status(500).json({ message: "Erreur serveur" });
  }
};

// ============================================================================
// HABILITATION CRUD ENDPOINTS WITH AUDIT LOGGING
// ============================================================================

/**
 * POST /api/habilitations
 * Create new habilitation for employee
 * CORRECTION 2: Supports both stCodes and htCodes independently
 */
export const createHabilitation: RequestHandler = async (req, res) => {
  try {
    const { employee_id, stCodes, htCodes, numero, date_validation, date_expiration } = req.body;

    if (!employee_id || !date_validation) {
      return res.status(400).json({ message: "Employee ID and date_validation required" });
    }

    // Normalize codes: ensure both arrays exist
    const normalizedSTCodes = stCodes || [];
    const normalizedHTCodes = htCodes || [];

    // Validate at least one code is present
    try {
      validateHabilitationData({
        stCodes: normalizedSTCodes,
        htCodes: normalizedHTCodes,
        dateValidation: date_validation,
      });
    } catch (validationErr) {
      return res.status(400).json({ message: (validationErr as Error).message });
    }

    // Check if employee exists
    const employee = await db
      .select({ id: schema.employees.id, matricule: schema.employees.matricule })
      .from(schema.employees)
      .where(eq(schema.employees.id, employee_id))
      .limit(1);

    if (!employee.length) {
      return res.status(404).json({ message: "Employee not found" });
    }

    // Execute in transaction
    const newHab = await withAuditTransaction(async (txDb) => {
      const expirationDate = date_expiration || calculateExpirationDate(date_validation);

      const result = await txDb
        .insert(schema.habilitations)
        .values({
          employeeId: employee_id,
          stCodes: JSON.stringify(normalizedSTCodes),
          htCodes: JSON.stringify(normalizedHTCodes),
          numero: numero || null,
          dateValidation: date_validation,
          dateExpiration: expirationDate,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: schema.habilitations.id });

      const habId = result[0].id;
      const newRecord = await txDb
        .select()
        .from(schema.habilitations)
        .where(eq(schema.habilitations.id, habId))
        .limit(1);

      const hab = newRecord[0];

      // Log audit
      await logAuditActionSafe(
        1,
        "CREATE_HABILITATION",
        "habilitation",
        habId,
        employee[0].matricule,
        null,
        {
          id: hab.id,
          employeeId: hab.employeeId,
          stCodes: JSON.parse(hab.stCodes),
          htCodes: JSON.parse(hab.htCodes),
          numero: hab.numero,
          dateValidation: hab.dateValidation,
          dateExpiration: hab.dateExpiration,
        }
      );

      return hab;
    });

    res.status(201).json({
      ...newHab,
      stCodes: JSON.parse(newHab.stCodes),
      htCodes: JSON.parse(newHab.htCodes),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Error creating habilitation:", err);

    if (errorMsg.includes("rolled back")) {
      res.status(500).json({
        message: `Erreur lors de la création: ${errorMsg}. Aucune donnée n'a été modifiée.`,
      });
    } else {
      res.status(500).json({ message: errorMsg || "Erreur serveur" });
    }
  }
};

/**
 * PUT /api/habilitations/:habId
 * Update habilitation
 * CORRECTION 2: Supports both stCodes and htCodes independently
 */
export const updateHabilitation: RequestHandler = async (req, res) => {
  try {
    const { habId } = req.params;
    const { stCodes, htCodes, numero, date_validation, date_expiration } = req.body;
    const habilitationId = parseInt(habId);

    if (isNaN(habilitationId)) {
      return res.status(400).json({ message: "ID habilitation invalide" });
    }

    if (!date_validation) {
      return res.status(400).json({ message: "date_validation required" });
    }

    // Normalize codes
    const normalizedSTCodes = stCodes || [];
    const normalizedHTCodes = htCodes || [];

    try {
      validateHabilitationData({
        stCodes: normalizedSTCodes,
        htCodes: normalizedHTCodes,
        dateValidation: date_validation,
      });
    } catch (validationErr) {
      return res.status(400).json({ message: (validationErr as Error).message });
    }

    const updatedHab = await withAuditTransaction(async (txDb) => {
      // Fetch old data
      const oldRecord = await txDb
        .select()
        .from(schema.habilitations)
        .where(eq(schema.habilitations.id, habilitationId))
        .limit(1);

      if (!oldRecord.length) {
        throw new Error("Habilitation non trouvée");
      }

      const old = oldRecord[0];
      const expirationDate = date_expiration || calculateExpirationDate(date_validation);

      await txDb
        .update(schema.habilitations)
        .set({
          stCodes: JSON.stringify(normalizedSTCodes),
          htCodes: JSON.stringify(normalizedHTCodes),
          numero: numero || null,
          dateValidation: date_validation,
          dateExpiration: expirationDate,
          updatedAt: new Date(),
        })
        .where(eq(schema.habilitations.id, habilitationId));

      const newRecord = await txDb
        .select()
        .from(schema.habilitations)
        .where(eq(schema.habilitations.id, habilitationId))
        .limit(1);

      const hab = newRecord[0];

      // Get employee matricule for audit
      const emp = await txDb
        .select({ matricule: schema.employees.matricule })
        .from(schema.employees)
        .where(eq(schema.employees.id, hab.employeeId))
        .limit(1);

      await logAuditActionSafe(
        1,
        "UPDATE_HABILITATION",
        "habilitation",
        habilitationId,
        emp[0]?.matricule || null,
        {
          id: old.id,
          stCodes: JSON.parse(old.stCodes),
          htCodes: JSON.parse(old.htCodes),
          numero: old.numero,
          dateValidation: old.dateValidation,
        },
        {
          id: hab.id,
          stCodes: JSON.parse(hab.stCodes),
          htCodes: JSON.parse(hab.htCodes),
          numero: hab.numero,
          dateValidation: hab.dateValidation,
          dateExpiration: hab.dateExpiration,
        }
      );

      return hab;
    });

    res.json({
      ...updatedHab,
      stCodes: JSON.parse(updatedHab.stCodes),
      htCodes: JSON.parse(updatedHab.htCodes),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Error updating habilitation:", err);

    if (errorMsg.includes("rolled back")) {
      res.status(500).json({
        message: `Erreur lors de la mise à jour: ${errorMsg}. Aucune donnée n'a été modifiée.`,
      });
    } else {
      res.status(500).json({ message: errorMsg || "Erreur serveur" });
    }
  }
};

/**
 * DELETE /api/habilitations/:habId
 * Delete habilitation
 */
export const deleteHabilitation: RequestHandler = async (req, res) => {
  try {
    const { habId } = req.params;
    const habilitationId = parseInt(habId);

    if (isNaN(habilitationId)) {
      return res.status(400).json({ message: "ID habilitation invalide" });
    }

    await withAuditTransaction(async (txDb) => {
      const record = await txDb
        .select()
        .from(schema.habilitations)
        .where(eq(schema.habilitations.id, habilitationId))
        .limit(1);

      if (!record.length) {
        throw new Error("Habilitation non trouvée");
      }

      const hab = record[0];

      await txDb
        .delete(schema.habilitations)
        .where(eq(schema.habilitations.id, habilitationId));

      const emp = await txDb
        .select({ matricule: schema.employees.matricule })
        .from(schema.employees)
        .where(eq(schema.employees.id, hab.employeeId))
        .limit(1);

      await logAuditActionSafe(
        1,
        "DELETE_HABILITATION",
        "habilitation",
        habilitationId,
        emp[0]?.matricule || null,
        {
          id: hab.id,
          employeeId: hab.employeeId,
          stCodes: hab.stCodes ? JSON.parse(hab.stCodes) : [],
          htCodes: hab.htCodes ? JSON.parse(hab.htCodes) : [],
          numero: hab.numero,
          dateValidation: hab.dateValidation,
          dateExpiration: hab.dateExpiration,
        },
        null
      );
    });

    res.json({ message: "Habilitation supprimée avec succès" });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Error deleting habilitation:", err);

    if (errorMsg.includes("rolled back")) {
      res.status(500).json({
        message: `Erreur lors de la suppression: ${errorMsg}. Aucune donnée n'a été modifiée.`,
      });
    } else {
      res.status(500).json({ message: errorMsg || "Erreur serveur" });
    }
  }
};

/**
 * POST /api/habilitations/:habId/renew
 * Renew a habilitation with new validation date
 * Archives old, creates new record
 */
export const renewHabilitation: RequestHandler = async (req, res) => {
  try {
    const { habId } = req.params;
    const { date_validation, stCodes, htCodes, numero } = req.body;
    const habilitationId = parseInt(habId);

    if (isNaN(habilitationId)) {
      return res.status(400).json({ message: "ID habilitation invalide" });
    }

    if (!date_validation) {
      return res.status(400).json({ message: "Date de validation requise" });
    }

    const renewedHab = await withAuditTransaction(async (txDb) => {
      const oldRecord = await txDb
        .select()
        .from(schema.habilitations)
        .where(eq(schema.habilitations.id, habilitationId))
        .limit(1);

      if (!oldRecord.length) {
        throw new Error("Habilitation non trouvée");
      }

      const old = oldRecord[0];
      const expirationDate = calculateExpirationDate(date_validation);

      // Use provided codes or fall back to old codes
      const newSTCodes = stCodes || (old.stCodes ? JSON.parse(old.stCodes) : []);
      const newHTCodes = htCodes || (old.htCodes ? JSON.parse(old.htCodes) : []);

      try {
        validateHabilitationData({
          stCodes: Array.isArray(newSTCodes) ? newSTCodes : [],
          htCodes: Array.isArray(newHTCodes) ? newHTCodes : [],
          dateValidation: date_validation,
        });
      } catch (validationErr) {
        throw new Error(
          `Habilitation validation failed: ${(validationErr as Error).message}`
        );
      }

      // Archive old habilitation
      await txDb.insert(schema.habilitationArchive).values({
        habilitationId: old.id,
        employeeId: old.employeeId,
        snapshotData: {
          id: old.id,
          stCodes: old.stCodes ? JSON.parse(old.stCodes) : [],
          htCodes: old.htCodes ? JSON.parse(old.htCodes) : [],
          numero: old.numero,
          dateValidation: old.dateValidation,
          dateExpiration: old.dateExpiration,
        },
        reason: "renewal",
        archivedAt: new Date(),
      });

      // Create new habilitation
      const newResult = await txDb
        .insert(schema.habilitations)
        .values({
          employeeId: old.employeeId,
          stCodes: JSON.stringify(Array.isArray(newSTCodes) ? newSTCodes : []),
          htCodes: JSON.stringify(Array.isArray(newHTCodes) ? newHTCodes : []),
          numero: numero || old.numero || null,
          dateValidation: date_validation,
          dateExpiration: expirationDate,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: schema.habilitations.id });

      const newHabId = newResult[0].id;

      // Fetch new record
      const newRecord = await txDb
        .select()
        .from(schema.habilitations)
        .where(eq(schema.habilitations.id, newHabId))
        .limit(1);

      const hab = newRecord[0];

      const emp = await txDb
        .select({ matricule: schema.employees.matricule })
        .from(schema.employees)
        .where(eq(schema.employees.id, old.employeeId))
        .limit(1);

      // Log renewal as audit
      await logAuditActionSafe(
        1,
        "RENEW_HABILITATION",
        "habilitation",
        newHabId,
        emp[0]?.matricule || null,
        {
          id: old.id,
          stCodes: old.stCodes ? JSON.parse(old.stCodes) : [],
          htCodes: old.htCodes ? JSON.parse(old.htCodes) : [],
          numero: old.numero,
          dateValidation: old.dateValidation,
          dateExpiration: old.dateExpiration,
        },
        {
          id: hab.id,
          stCodes: hab.stCodes ? JSON.parse(hab.stCodes) : [],
          htCodes: hab.htCodes ? JSON.parse(hab.htCodes) : [],
          numero: hab.numero,
          dateValidation: hab.dateValidation,
          dateExpiration: hab.dateExpiration,
        }
      );

      return hab;
    });

    res.status(201).json({
      id: renewedHab.id,
      stCodes: renewedHab.stCodes ? JSON.parse(renewedHab.stCodes) : [],
      htCodes: renewedHab.htCodes ? JSON.parse(renewedHab.htCodes) : [],
      numero: renewedHab.numero,
      dateValidation: renewedHab.dateValidation,
      dateExpiration: renewedHab.dateExpiration,
      message: "Habilitation renouvelée avec succès",
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Error renewing habilitation:", err);

    if (errorMsg.includes("rolled back")) {
      res.status(500).json({
        message: `Erreur lors du renouvellement: ${errorMsg}. Aucune donnée n'a été modifiée.`,
      });
    } else {
      res.status(500).json({ message: errorMsg || "Erreur serveur" });
    }
  }
};

/**
 * POST /api/habilitations/batch-delete
 * Delete multiple habilitations
 */
export const batchDeleteHabilitations: RequestHandler = async (req, res) => {
  try {
    const { habilitationIds } = req.body;

    if (!Array.isArray(habilitationIds) || habilitationIds.length === 0) {
      return res.status(400).json({ message: "Liste d'habilitations requise" });
    }

    await withAuditTransaction(async (txDb) => {
      for (const habId of habilitationIds) {
        const record = await txDb
          .select()
          .from(schema.habilitations)
          .where(eq(schema.habilitations.id, habId))
          .limit(1);

        if (record.length) {
          const hab = record[0];
          const emp = await txDb
            .select({ matricule: schema.employees.matricule })
            .from(schema.employees)
            .where(eq(schema.employees.id, hab.employeeId))
            .limit(1);

          await logAuditActionSafe(
            1,
            "DELETE_HABILITATION",
            "habilitation",
            habId,
            emp[0]?.matricule || null,
            {
              id: hab.id,
              stCodes: hab.stCodes ? JSON.parse(hab.stCodes) : [],
              htCodes: hab.htCodes ? JSON.parse(hab.htCodes) : [],
              numero: hab.numero,
            },
            null
          );
        }
      }

      await txDb
        .delete(schema.habilitations)
        .where(
          // @ts-ignore
          sql`id IN (${habilitationIds.join(",")})`
        );
    });

    res.json({
      message: "Habilitations supprimées avec succès",
      deleted: habilitationIds.length,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Error batch deleting habilitations:", err);
    res.status(500).json({ message: errorMsg || "Erreur serveur" });
  }
};

/**
 * PUT /api/habilitations/batch-update
 * Update multiple habilitations
 */
export const batchUpdateHabilitations: RequestHandler = async (req, res) => {
  try {
    const { habilitationIds, stCodes, htCodes, date_validation } = req.body;

    if (!Array.isArray(habilitationIds) || habilitationIds.length === 0) {
      return res.status(400).json({ message: "Liste d'habilitations requise" });
    }

    if (!date_validation || (!stCodes && !htCodes)) {
      return res.status(400).json({ message: "Codes et date requise" });
    }

    const updated = await withAuditTransaction(async (txDb) => {
      const expirationDate = calculateExpirationDate(date_validation);
      const result = [];

      for (const habId of habilitationIds) {
        const oldRecord = await txDb
          .select()
          .from(schema.habilitations)
          .where(eq(schema.habilitations.id, habId))
          .limit(1);

        if (oldRecord.length) {
          const old = oldRecord[0];

          await txDb
            .update(schema.habilitations)
            .set({
              stCodes: JSON.stringify(stCodes || []),
              htCodes: JSON.stringify(htCodes || []),
              dateValidation: date_validation,
              dateExpiration: expirationDate,
              updatedAt: new Date(),
            })
            .where(eq(schema.habilitations.id, habId));

          const newRecord = await txDb
            .select()
            .from(schema.habilitations)
            .where(eq(schema.habilitations.id, habId))
            .limit(1);

          const hab = newRecord[0];
          const emp = await txDb
            .select({ matricule: schema.employees.matricule })
            .from(schema.employees)
            .where(eq(schema.employees.id, hab.employeeId))
            .limit(1);

          await logAuditActionSafe(
            1,
            "UPDATE_HABILITATION",
            "habilitation",
            habId,
            emp[0]?.matricule || null,
            {
              id: old.id,
              stCodes: old.stCodes ? JSON.parse(old.stCodes) : [],
              htCodes: old.htCodes ? JSON.parse(old.htCodes) : [],
              dateValidation: old.dateValidation,
            },
            {
              id: hab.id,
              stCodes: hab.stCodes ? JSON.parse(hab.stCodes) : [],
              htCodes: hab.htCodes ? JSON.parse(hab.htCodes) : [],
              dateValidation: hab.dateValidation,
              dateExpiration: hab.dateExpiration,
            }
          );

          result.push(hab);
        }
      }

      return result;
    });

    res.json({
      message: "Habilitations mises à jour avec succès",
      updated: updated.length,
      habilitations: updated.map((h) => ({
        id: h.id,
        stCodes: h.stCodes ? JSON.parse(h.stCodes) : [],
        htCodes: h.htCodes ? JSON.parse(h.htCodes) : [],
        numero: h.numero,
        dateValidation: h.dateValidation,
        dateExpiration: h.dateExpiration,
      })),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Error batch updating habilitations:", err);
    res.status(500).json({ message: errorMsg || "Erreur serveur" });
  }
};

// Export auth middleware
import { authMiddleware } from "./auth";
export { authMiddleware };
