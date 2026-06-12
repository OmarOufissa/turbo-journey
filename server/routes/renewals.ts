import { RequestHandler } from "express";
import { db } from "../db-pg";
import * as schema from "../schema";
import { eq, desc, asc, sql } from "drizzle-orm";
import { resetNotificationLogsForEmployee } from "../jobs/notificationJobs";
import { logAuditActionSafe } from "../services/auditService";

// POST /api/renewals — store snapshot for pending renewal
export const createPendingRenewal: RequestHandler = async (req, res) => {
  try {
    const { employeeId, snapshot } = req.body;
    if (!employeeId || !snapshot) {
      return res.status(400).json({ success: false, data: null, error: "employeeId et snapshot requis" });
    }

    const empIdInt = parseInt(employeeId);
    const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, empIdInt));
    if (!emp) return res.status(404).json({ success: false, data: null, error: "Employé non trouvé" });

    // Enforce ONE pending renewal per employee
    const existing = await db.select({ id: schema.pendingRenewals.id }).from(schema.pendingRenewals).where(eq(schema.pendingRenewals.employeeId, empIdInt));
    if (existing.length > 0) {
      return res.status(409).json({ success: false, data: null, error: "Un renouvellement est déjà en attente pour cet employé" });
    }

    const [renewal] = await db.insert(schema.pendingRenewals).values({
      employeeId: empIdInt,
      snapshot,
    }).returning();

    const userId = (req as any).user?.id ?? null;
    await logAuditActionSafe(userId, "CREATE_RENEWAL", empIdInt, null, { renewalId: renewal.id, snapshot });

    res.status(201).json({ success: true, data: renewal, error: null });
  } catch (err) {
    console.error("createPendingRenewal error:", err);
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};

// GET /api/renewals — list pending renewals with employee name/matricule + division/service names
export const listPendingRenewals: RequestHandler = async (_req, res) => {
  try {
    const renewals = await db
      .select({
        id: schema.pendingRenewals.id,
        employeeId: schema.pendingRenewals.employeeId,
        snapshot: schema.pendingRenewals.snapshot,
        createdAt: schema.pendingRenewals.createdAt,
        matricule: schema.employees.matricule,
        nom: schema.employees.nom,
        prenom: schema.employees.prenom,
      })
      .from(schema.pendingRenewals)
      .leftJoin(schema.employees, eq(schema.pendingRenewals.employeeId, schema.employees.id))
      .orderBy(desc(schema.pendingRenewals.createdAt));

    // Resolve division/service names from snapshot IDs in a single batch query
    const divIds = [...new Set(renewals.map(r => (r.snapshot as any)?.divisionId).filter(Boolean))];
    const svcIds = [...new Set(renewals.map(r => (r.snapshot as any)?.serviceId).filter(Boolean))];

    const [divRows, svcRows] = await Promise.all([
      divIds.length ? db.select({ id: schema.divisions.id, name: schema.divisions.name }).from(schema.divisions) : Promise.resolve([]),
      svcIds.length ? db.select({ id: schema.services.id, name: schema.services.name }).from(schema.services) : Promise.resolve([]),
    ]);
    const divMap = Object.fromEntries(divRows.map(d => [d.id, d.name]));
    const svcMap = Object.fromEntries(svcRows.map(s => [s.id, s.name]));

    const enriched = renewals.map(r => {
      const snap = r.snapshot as any;
      return {
        ...r,
        divisionName: snap?.divisionId ? (divMap[snap.divisionId] ?? null) : null,
        serviceName: snap?.serviceId ? (svcMap[snap.serviceId] ?? null) : null,
      };
    });

    res.json({ success: true, data: enriched, error: null });
  } catch (err) {
    console.error("listPendingRenewals error:", err);
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};

// POST /api/renewals/:id/activate — read snapshot → INSERT version → UPDATE currentVersionId → DELETE renewal → log audit
export const activatePendingRenewal: RequestHandler = async (req, res) => {
  try {
    const renewalId = parseInt(req.params.renewalId ?? req.params.id);
    if (isNaN(renewalId)) return res.status(400).json({ success: false, data: null, error: "ID invalide" });

    const [renewal] = await db.select().from(schema.pendingRenewals).where(eq(schema.pendingRenewals.id, renewalId));
    if (!renewal) return res.status(404).json({ success: false, data: null, error: "Renouvellement non trouvé" });

    const snap = renewal.snapshot as Record<string, any>;

    const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, renewal.employeeId));
    if (!emp) return res.status(404).json({ success: false, data: null, error: "Employé non trouvé" });

    const result = await db.transaction(async (tx) => {
      const [{ maxVer }] = await tx
        .select({ maxVer: sql<number>`coalesce(max(version_number), 0)` })
        .from(schema.employeeVersions)
        .where(eq(schema.employeeVersions.employeeId, renewal.employeeId));

      const [version] = await tx.insert(schema.employeeVersions).values({
        employeeId: renewal.employeeId,
        versionNumber: Number(maxVer) + 1,
        stCodes: snap.stCodes ?? [],
        htCodes: snap.htCodes ?? [],
        nDeTitre: snap.nDeTitre ?? "",
        fonction: snap.fonction ?? "",
        divisionId: parseInt(snap.divisionId),
        serviceId: parseInt(snap.serviceId),
        equipeId: snap.equipeId ? parseInt(snap.equipeId) : null,
        habRows: snap.habRows ?? null,
        dateValidation: snap.dateValidation,
        dateExpiration: snap.dateExpiration,
        pdfPath: null,
      }).returning();

      await tx.update(schema.employees).set({ currentVersionId: version.id }).where(eq(schema.employees.id, renewal.employeeId));

      const [auditLog] = await tx.insert(schema.auditLogs).values({
        action: "ACTIVATE_RENEWAL",
        entityId: renewal.employeeId,
        snapshotOld: { renewalId, snapshot: snap } as any,
        snapshotNew: { versionId: version.id, versionNumber: version.versionNumber } as any,
      }).returning();

      await tx.delete(schema.pendingRenewals).where(eq(schema.pendingRenewals.id, renewalId));

      return { auditLogId: auditLog.id, versionId: version.id };
    });

    await resetNotificationLogsForEmployee(renewal.employeeId);

    res.json({ success: true, data: result, error: null });
  } catch (err) {
    console.error("activatePendingRenewal error:", err);
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};

// DELETE /api/renewals/:id — cancel renewal
export const deletePendingRenewal: RequestHandler = async (req, res) => {
  try {
    const renewalId = parseInt(req.params.renewalId ?? req.params.id);
    if (isNaN(renewalId)) return res.status(400).json({ success: false, data: null, error: "ID invalide" });

    const [renewal] = await db.select().from(schema.pendingRenewals).where(eq(schema.pendingRenewals.id, renewalId));
    if (!renewal) return res.status(404).json({ success: false, data: null, error: "Renouvellement non trouvé" });

    await db.transaction(async (tx) => {
      await tx.insert(schema.auditLogs).values({
        action: "CANCEL_RENEWAL",
        entityId: renewal.employeeId,
        snapshotOld: { renewalId, snapshot: renewal.snapshot } as any,
        snapshotNew: null,
      });
      await tx.delete(schema.pendingRenewals).where(eq(schema.pendingRenewals.id, renewalId));
    });

    res.json({ success: true, data: { cancelled: true }, error: null });
  } catch (err) {
    console.error("deletePendingRenewal error:", err);
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};
