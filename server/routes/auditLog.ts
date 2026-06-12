import { RequestHandler } from "express";
import { db } from "../db-pg";
import * as schema from "../schema";
import { eq, desc, sql, and, gte, lte, gt, like, inArray, notInArray } from "drizzle-orm";

const RENEWAL_ACTIONS = ["ACTIVATE_RENEWAL", "CANCEL_RENEWAL"];

function buildFilterConditions(query: Record<string, any>) {
  const conditions: any[] = [];

  const entityId = query.entityId ? parseInt(query.entityId as string) : undefined;
  if (entityId !== undefined && !isNaN(entityId)) conditions.push(eq(schema.auditLogs.entityId, entityId));

  const action = query.action as string | undefined;
  if (action) conditions.push(eq(schema.auditLogs.action, action));

  const entityType = query.entityType as string | undefined;
  if (entityType === "renewal") conditions.push(inArray(schema.auditLogs.action, RENEWAL_ACTIONS));
  else if (entityType === "employee") conditions.push(notInArray(schema.auditLogs.action, RENEWAL_ACTIONS));

  const matricule = query.matricule as string | undefined;
  if (matricule) conditions.push(like(schema.employees.matricule, `%${matricule}%`));

  const startDate = query.startDate as string | undefined;
  if (startDate) conditions.push(gte(schema.auditLogs.createdAt, startDate));

  const endDate = query.endDate as string | undefined;
  if (endDate) conditions.push(lte(schema.auditLogs.createdAt, `${endDate} 23:59:59`));

  return conditions;
}

function selectWithMatricule() {
  return db
    .select({
      id: schema.auditLogs.id,
      userId: schema.auditLogs.userId,
      action: schema.auditLogs.action,
      entityId: schema.auditLogs.entityId,
      snapshotOld: schema.auditLogs.snapshotOld,
      snapshotNew: schema.auditLogs.snapshotNew,
      createdAt: schema.auditLogs.createdAt,
      matricule: schema.employees.matricule,
    })
    .from(schema.auditLogs)
    .leftJoin(schema.employees, eq(schema.employees.id, schema.auditLogs.entityId));
}

function withEntityType<T extends { action: string }>(rows: T[]) {
  return rows.map((r) => ({
    ...r,
    entityType: RENEWAL_ACTIONS.includes(r.action) ? "renewal" : "employee",
  }));
}

// GET /api/audit-logs
export const getAuditLogs_Handler: RequestHandler = async (req, res) => {
  try {
    const limit = Math.min(200, parseInt(req.query.limit as string) || 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const conditions = buildFilterConditions(req.query as Record<string, any>);

    let query = selectWithMatricule().$dynamic();
    if (conditions.length) query = query.where(and(...conditions));

    const rows = await query.orderBy(desc(schema.auditLogs.createdAt)).limit(limit).offset(offset);

    res.json({ success: true, data: withEntityType(rows), error: null });
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

    res.json({ success: true, data: withEntityType([log])[0], error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};

// GET /api/audit-logs/export
export const exportAuditLogs_Handler: RequestHandler = async (req, res) => {
  try {
    const conditions = buildFilterConditions(req.query as Record<string, any>);

    let query = selectWithMatricule().$dynamic();
    if (conditions.length) query = query.where(and(...conditions));

    const rows = await query.orderBy(desc(schema.auditLogs.createdAt)).limit(10000);

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="audit-logs-${new Date().toISOString().split("T")[0]}.json"`);
    res.send(JSON.stringify(withEntityType(rows), null, 2));
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

    res.json({ success: true, data: withEntityType(logs), error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};

// POST /api/audit-logs/:id/revert — undo: read snapshotOld → new version → update currentVersionId
export const revertAuditLog_Handler: RequestHandler = async (req, res) => {
  try {
    const logId = parseInt(req.params.id);
    if (isNaN(logId)) return res.status(400).json({ success: false, data: null, error: "ID invalide" });

    const [log] = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.id, logId));
    if (!log) return res.status(404).json({ success: false, data: null, error: "Entrée d'audit non trouvée" });

    if (log.action !== "UPDATE_EMPLOYEE") {
      return res.status(400).json({ success: false, data: null, error: "Seules les modifications d'employé peuvent être annulées" });
    }

    const snap = log.snapshotOld as Record<string, any> | null;
    if (!snap) {
      return res.status(400).json({ success: false, data: null, error: "Pas de snapshot ancien à restaurer" });
    }

    const divisionId = parseInt(snap.divisionId ?? snap.division_id);
    const serviceId = parseInt(snap.serviceId ?? snap.service_id);
    const rawEquipeId = snap.equipeId ?? snap.equipe_id;
    const equipeId = rawEquipeId !== null && rawEquipeId !== undefined ? parseInt(rawEquipeId) : null;
    if (isNaN(divisionId) || isNaN(serviceId) || (equipeId !== null && isNaN(equipeId))) {
      return res.status(400).json({ success: false, data: null, error: "Snapshot invalide : données incomplètes" });
    }

    const employeeId = log.entityId;
    const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
    if (!emp) return res.status(404).json({ success: false, data: null, error: "Employé non trouvé" });

    if (req.query.confirm !== "true") {
      const [intervening] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.auditLogs)
        .where(and(
          eq(schema.auditLogs.entityId, employeeId),
          gt(schema.auditLogs.id, logId),
          inArray(schema.auditLogs.action, ["UPDATE_EMPLOYEE", "ACTIVATE_RENEWAL", "REVERT_VERSION"])
        ));
      if (Number(intervening.count) > 0) {
        return res.status(409).json({
          success: false,
          data: { requiresConfirmation: true },
          error: "Des modifications ont été effectuées sur cet employé depuis cette action. Confirmez pour les écraser.",
        });
      }
    }

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
        habRows: snap.habRows ?? null,
        nDeTitre: snap.nDeTitre ?? snap.numero ?? "",
        fonction: snap.fonction ?? "",
        divisionId,
        serviceId,
        equipeId,
        dateValidation: snap.dateValidation ?? snap.date_validation,
        dateExpiration: snap.dateExpiration ?? snap.date_expiration,
        pdfPath: snap.pdfPath ?? null,
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
