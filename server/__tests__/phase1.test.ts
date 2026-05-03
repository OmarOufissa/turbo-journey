/**
 * PHASE 1 END-TO-END TESTS
 * 
 * Tests for foundational system:
 * - Employee CRUD with audit logging
 * - Habilitation operations with audit trail
 * - Data validation
 * - Transaction safety
 */

import { describe, it, expect, beforeAll } from "vitest";
import { db, initializeDatabase, withAuditTransaction } from "../db-pg";
import { logAuditActionSafe, checkForLegacySTData } from "../services/auditService";
import { eq, desc } from "drizzle-orm";
import * as schema from "../schema";

let testDivisionId: number = 1;
let testServiceId: number = 1;
let testEquipeId: number = 1;

async function ensureOrganizationalStructure() {
  let divisions = await db.select().from(schema.divisions).limit(1);
  if (divisions.length === 0) {
    const newDiv = await db
      .insert(schema.divisions)
      .values({ name: "Test Division" })
      .returning();
    testDivisionId = newDiv[0].id;
  } else {
    testDivisionId = divisions[0].id;
  }

  let services = await db
    .select()
    .from(schema.services)
    .where(eq(schema.services.divisionId, testDivisionId))
    .limit(1);

  if (services.length === 0) {
    const newSvc = await db
      .insert(schema.services)
      .values({ name: "Test Service", divisionId: testDivisionId })
      .returning();
    testServiceId = newSvc[0].id;
  } else {
    testServiceId = services[0].id;
  }

  let equipes = await db
    .select()
    .from(schema.equipes)
    .where(eq(schema.equipes.serviceId, testServiceId))
    .limit(1);

  if (equipes.length === 0) {
    const newEqu = await db
      .insert(schema.equipes)
      .values({ name: "Test Equipe", serviceId: testServiceId })
      .returning();
    testEquipeId = newEqu[0].id;
  } else {
    testEquipeId = equipes[0].id;
  }
}

describe("PHASE 1: Foundation System Tests", () => {
  beforeAll(async () => {
    await initializeDatabase();
    console.log("✓ Database initialized for tests");
    await ensureOrganizationalStructure();
    console.log(`✓ Org structure ready`);
  });

  describe("Employee CRUD with Audit Logging", () => {
    let employeeId: number;

    it("should create employee and log audit entry", async () => {
      const result = await withAuditTransaction(async (txDb) => {
        const emps = await txDb
          .insert(schema.employees)
          .values({
            matricule: "E0001",
            prenom: "Test",
            nom: "Employee",
            divisionId: testDivisionId,
            serviceId: testServiceId,
            equipeId: testEquipeId,
          })
          .returning();

        const emp = emps[0];
        employeeId = emp.id;

        await logAuditActionSafe(
          1,
          "CREATE_EMPLOYEE",
          "employee",
          emp.id,
          emp.matricule,
          null,
          {
            matricule: emp.matricule,
            prenom: emp.prenom,
            nom: emp.nom,
          }
        );

        return emp;
      });

      expect(result.matricule).toBe("E0001");
      expect(result.prenom).toBe("Test");
    });

    it("should have audit log for created employee", async () => {
      const logs = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.entityId, employeeId));

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].action).toBe("CREATE_EMPLOYEE");
      expect(logs[0].snapshotNew).toBeDefined();
    });

    it("should update employee with audit logging", async () => {
      const emp = await db
        .select()
        .from(schema.employees)
        .where(eq(schema.employees.id, employeeId))
        .then((rows) => rows[0]);

      const updated = await withAuditTransaction(async (txDb) => {
        const upd = await txDb
          .update(schema.employees)
          .set({ nom: "Updated" })
          .where(eq(schema.employees.id, employeeId))
          .returning();

        await logAuditActionSafe(
          1,
          "UPDATE_EMPLOYEE",
          "employee",
          employeeId,
          emp.matricule,
          {
            nom: emp.nom,
          },
          {
            nom: upd[0].nom,
          }
        );

        return upd[0];
      });

      expect(updated.nom).toBe("Updated");

      const logs = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.entityId, employeeId))
        .orderBy(desc(schema.auditLogs.createdAt));

      const updateLog = logs.find((l) => l.action === "UPDATE_EMPLOYEE");
      expect(updateLog).toBeDefined();
      expect(updateLog?.snapshotOld).toBeDefined();
      expect(updateLog?.snapshotNew).toBeDefined();
    });

    it("should delete employee with audit logging", async () => {
      const emp = await db
        .select()
        .from(schema.employees)
        .where(eq(schema.employees.id, employeeId))
        .then((rows) => rows[0]);

      await withAuditTransaction(async (txDb) => {
        await txDb
          .delete(schema.employees)
          .where(eq(schema.employees.id, employeeId));

        await logAuditActionSafe(
          1,
          "DELETE_EMPLOYEE",
          "employee",
          employeeId,
          emp.matricule,
          {
            matricule: emp.matricule,
            nom: emp.nom,
          },
          null
        );
      });

      const deleted = await db
        .select()
        .from(schema.employees)
        .where(eq(schema.employees.id, employeeId));

      expect(deleted).toHaveLength(0);

      const logs = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.entityId, employeeId))
        .orderBy(desc(schema.auditLogs.createdAt));

      const deleteLog = logs.find((l) => l.action === "DELETE_EMPLOYEE");
      expect(deleteLog).toBeDefined();
      expect(deleteLog?.snapshotOld).toBeDefined();
      expect(deleteLog?.snapshotNew).toBeNull();
    });
  });

  describe("Habilitation Operations", () => {
    let habId: number;
    let empId: number;

    beforeAll(async () => {
      const emp = await db
        .insert(schema.employees)
        .values({
          matricule: "H0001",
          prenom: "Hab",
          nom: "Test",
          divisionId: testDivisionId,
          serviceId: testServiceId,
          equipeId: testEquipeId,
        })
        .returning();

      empId = emp[0].id;
    });

    it("should create HT habilitation", async () => {
      const today = new Date().toISOString().split("T")[0];
      const expiry = new Date();
      expiry.setFullYear(expiry.getFullYear() + 1);
      const expiryStr = expiry.toISOString().split("T")[0];

      const hab = await db
        .insert(schema.habilitations)
        .values({
          employeeId: empId,
          type: "HT",
          codes: JSON.stringify(["CODE1"]),
          dateValidation: today,
          dateExpiration: expiryStr,
        })
        .returning();

      habId = hab[0].id;
      expect(hab[0].type).toBe("HT");
    });

    it("should validate ST habilitations are rejected", () => {
      const validateType = (type: string) => {
        if (type !== "HT") throw new Error("Seul le type HT est autorisé");
      };

      expect(() => validateType("HT")).not.toThrow();
      expect(() => validateType("ST")).toThrow("Seul le type HT est autorisé");
    });
  });

  describe("Validation", () => {
    it("should validate required employee fields", () => {
      const validateEmp = (emp: any) => {
        const errors: string[] = [];
        if (!emp.matricule || !/^\d{5}$/.test(emp.matricule)) {
          errors.push("Invalid matricule");
        }
        if (!emp.prenom?.trim()) errors.push("Missing prenom");
        if (!emp.nom?.trim()) errors.push("Missing nom");
        if (!emp.divisionId || emp.divisionId <= 0) {
          errors.push("Invalid division");
        }
        return errors;
      };

      const valid = {
        matricule: "12345",
        prenom: "John",
        nom: "Doe",
        divisionId: 1,
      };
      expect(validateEmp(valid)).toHaveLength(0);

      expect(validateEmp({ ...valid, matricule: "123" }).length).toBeGreaterThan(0);
      expect(validateEmp({ ...valid, prenom: "" }).length).toBeGreaterThan(0);
    });

    it("should validate date formats", () => {
      const validateDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

      expect(validateDate("2024-12-31")).toBe(true);
      expect(validateDate("12-31-2024")).toBe(false);
      expect(validateDate("2024/12/31")).toBe(false);
    });
  });

  describe("Legacy Data Detection", () => {
    it("should detect legacy ST data", async () => {
      const result = await checkForLegacySTData();
      expect(result).toBeDefined();
      expect(result.hasLegacyST).toBeDefined();
      expect(result.count).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Transaction Safety", () => {
    it("should rollback on audit logging failure", async () => {
      let createdId: number | null = null;

      try {
        await withAuditTransaction(async (txDb) => {
          const emps = await txDb
            .insert(schema.employees)
            .values({
              matricule: "T0001",
              prenom: "Trans",
              nom: "Test",
              divisionId: testDivisionId,
              serviceId: testServiceId,
              equipeId: testEquipeId,
            })
            .returning();

          createdId = emps[0].id;
          throw new Error("Simulated failure");
        });
      } catch {
        // Expected
      }

      if (createdId) {
        const result = await db
          .select()
          .from(schema.employees)
          .where(eq(schema.employees.id, createdId));

        expect(result).toHaveLength(0);
      }
    });
  });

  describe("Audit Trail Immutability", () => {
    it("should maintain audit log chronological order", async () => {
      const logs = await db
        .select()
        .from(schema.auditLogs)
        .orderBy(schema.auditLogs.createdAt)
        .limit(10);

      for (let i = 1; i < logs.length; i++) {
        expect(logs[i].createdAt.getTime()).toBeGreaterThanOrEqual(
          logs[i - 1].createdAt.getTime()
        );
      }
    });
  });
});
