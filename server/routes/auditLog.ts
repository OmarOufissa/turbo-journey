import { RequestHandler } from "express";
import { db } from "../db-pg";
import * as schema from "../schema";
import { eq, desc, asc, sql } from "drizzle-orm";

// GET /api/audit-logs
export const getAuditLogs_Handler: RequestHandler = async (req, res) => {
  try {
    const limit = Math.min(200, parseInt(req.query.limit as string) || 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const entityId = req.query.entityId ? parseInt(req.query.entityId as string) : undefined;
    const action = req.query.action as string | undefined;

    let query = db.select().from(schema.auditLogs).$dynamic();
    if (entityId) query = query.where(eq(schema.auditLogs.entityId, entityId)) as any;
    if (action) query = query.where(eq(schema.auditLogs.action, action)) as any;

    const logs = await db
      .select()
      .from(schema.auditLogs)
      .orderBy(desc(schema.auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    res.json({ success: true, data: logs, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};

// GET /api/audit-logs/:id
export const getAuditLogEntry_Handler: RequestHandler = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, data: null, error: "ID invalide" });

    const [log] = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.id, id));
    if (!log) return res.status(404).json({ success: false, data: null, error: "Entrée non trouvée" });

    res.json({ success: true, data: log, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};

// GET /api/audit-logs/export
export const exportAuditLogs_Handler: RequestHandler = async (req, res) => {
  try {
    const logs = await db.select().from(schema.auditLogs).orderBy(desc(schema.auditLogs.createdAt)).limit(10000);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="audit-logs-${new Date().toISOString().split("T")[0]}.json"`);
    res.send(JSON.stringify(logs, null, 2));
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};

// GET /api/audit-logs/employee/:employeeId
export const getEmployeeAuditHistory_Handler: RequestHandler = async (req, res) => {
  try {
    const empId = parseInt(req.params.employeeId);
    if (isNaN(empId)) return res.status(400).json({ success: false, data: null, error: "ID invalide" });

    const logs = await db
      .select()
      .from(schema.auditLogs)
      .where(eq(schema.auditLogs.entityId, empId))
      .orderBy(desc(schema.auditLogs.createdAt));

    res.json({ success: true, data: logs, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};

// POST /api/audit-logs/:id/revert — undo: read snapshotOld → new version → update currentVersionId
export const revertAuditLog_Handler: RequestHandler = async (req, res) => {
  try {
    const logId = parseInt(req.params.id ?? req.params.logId);
    if (isNaN(logId)) return res.status(400).json({ success: false, data: null, error: "ID invalide" });

    const [log] = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.id, logId));
    if (!log) return res.status(404).json({ success: false, data: null, error: "Entrée d'audit non trouvée" });

    const snap = log.snapshotOld as Record<string, any> | null;
    if (!snap) {
      return res.status(400).json({ success: false, data: null, error: "Pas de snapshot ancien à restaurer" });
    }

    const employeeId = log.entityId;
    const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
    if (!emp) return res.status(404).json({ success: false, data: null, error: "Employé non trouvé" });

    const result = await db.transaction(async (tx) => {
      const [{ maxVer }] = await tx
        .select({ maxVer: sql<number>`coalesce(max(version_number), 0)` })
        .from(schema.employeeVersions)
        .where(eq(schema.employeeVersions.employeeId, employeeId));

      const [newVersion] = await tx.insert(schema.employeeVersions).values({
        employeeId,
        versionNumber: Number(maxVer) + 1,
        stCodes: snap.stCodes ?? [],
        htCodes: snap.htCodes ?? [],
        nDeTitre: snap.nDeTitre ?? snap.numero ?? "",
        fonction: snap.fonction ?? "",
        divisionId: parseInt(snap.divisionId ?? snap.division_id),
        serviceId: parseInt(snap.serviceId ?? snap.service_id),
        equipeId: snap.equipeId ?? snap.equipe_id ? parseInt(snap.equipeId ?? snap.equipe_id) : null,
        dateValidation: snap.dateValidation ?? snap.date_validation,
        dateExpiration: snap.dateExpiration ?? snap.date_expiration,
      }).returning();

      await tx.update(schema.employees).set({ currentVersionId: newVersion.id }).where(eq(schema.employees.id, employeeId));

      const [newAuditLog] = await tx.insert(schema.auditLogs).values({
        action: "REVERT_VERSION",
        entityId: employeeId,
        snapshotOld: { currentVersionId: emp.currentVersionId } as any,
        snapshotNew: { revertedFromAuditLogId: logId, newVersionId: newVersion.id } as any,
      }).returning();

      return { newAuditLogId: newAuditLog.id, newVersionId: newVersion.id };
    });

    res.json({ success: true, data: result, error: null });
  } catch (err) {
    console.error("revertAuditLog error:", err);
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};
