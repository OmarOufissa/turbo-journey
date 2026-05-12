import { RequestHandler } from "express";
import { db } from "../db-pg";
import * as schema from "../schema";
import { eq, desc, asc, sql, and, or, like, gte, lte, isNull, isNotNull } from "drizzle-orm";
import { z } from "zod";

const ST_CODES = ["H0V", "H1V", "BR", "H2V", "HC", "SF6"] as const;
const HT_CODES = ["B0V", "B1V", "BR", "B2V", "BC", "SF6"] as const;

const versionFields = z.object({
  stCodes: z.array(z.string()).default([]),
  htCodes: z.array(z.string()).default([]),
  nDeTitre: z.string().min(1, "N° de titre requis"),
  fonction: z.string().min(1, "Fonction requise"),
  divisionId: z.coerce.number().positive("Division requise"),
  serviceId: z.coerce.number().positive("Service requis"),
  equipeId: z.coerce.number().positive().nullable().optional(),
  dateValidation: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (YYYY-MM-DD)"),
  dateExpiration: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format de date invalide (YYYY-MM-DD)"),
}).refine((d) => (d.stCodes.length > 0 || d.htCodes.length > 0), {
  message: "Au moins un code ST ou HT requis",
}).refine((d) => d.dateExpiration > d.dateValidation, {
  message: "Date d'expiration doit être après date de validation",
});

const createEmployeeSchema = versionFields.extend({
  matricule: z.string().regex(/^\d{5}$/, "Matricule doit être 5 chiffres"),
  nom: z.string().min(1, "Nom requis"),
  prenom: z.string().min(1, "Prénom requis"),
});

const updateEmployeeSchema = versionFields.extend({
  nom: z.string().min(1).optional(),
  prenom: z.string().min(1).optional(),
});

// ============================================================================
// AUTH MIDDLEWARE
// ============================================================================

export const authMiddleware: RequestHandler = (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const expected = process.env.AUTH_TOKEN;
  if (expected && token !== expected) {
    return res.status(401).json({ success: false, error: "Unauthorized", data: null });
  }
  next();
};

// ============================================================================
// HELPERS
// ============================================================================

async function buildVersionResponse(version: typeof schema.employeeVersions.$inferSelect) {
  const [div] = await db.select({ name: schema.divisions.name }).from(schema.divisions).where(eq(schema.divisions.id, version.divisionId));
  const [svc] = await db.select({ name: schema.services.name }).from(schema.services).where(eq(schema.services.id, version.serviceId));
  const equipe = version.equipeId
    ? (await db.select({ name: schema.equipes.name }).from(schema.equipes).where(eq(schema.equipes.id, version.equipeId)))[0]
    : null;

  return {
    id: version.id,
    versionNumber: version.versionNumber,
    stCodes: version.stCodes ?? [],
    htCodes: version.htCodes ?? [],
    nDeTitre: version.nDeTitre,
    fonction: version.fonction,
    divisionId: version.divisionId,
    serviceId: version.serviceId,
    equipeId: version.equipeId,
    division: div?.name ?? "",
    service: svc?.name ?? "",
    equipe: equipe?.name ?? null,
    dateValidation: version.dateValidation,
    dateExpiration: version.dateExpiration,
    pdfPath: version.pdfPath ?? null,
    createdAt: version.createdAt,
  };
}

async function buildEmployeeResponse(employeeId: number) {
  const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
  if (!emp) return null;

  const currentVersion = emp.currentVersionId
    ? (await db.select().from(schema.employeeVersions).where(eq(schema.employeeVersions.id, emp.currentVersionId)))[0]
    : null;

  return {
    id: emp.id,
    matricule: emp.matricule,
    nom: emp.nom,
    prenom: emp.prenom,
    deleted: emp.deleted,
    createdAt: emp.createdAt,
    currentVersion: currentVersion ? await buildVersionResponse(currentVersion) : null,
  };
}

// ============================================================================
// ORG STRUCTURE
// ============================================================================

export const getDivisions: RequestHandler = async (_req, res) => {
  try {
    const divs = await db.select().from(schema.divisions).orderBy(asc(schema.divisions.name));
    res.json({ success: true, data: divs, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};

export const getServicesByDivision: RequestHandler = async (req, res) => {
  try {
    const divisionId = parseInt(req.params.divisionId);
    const svcs = await db.select().from(schema.services).where(eq(schema.services.divisionId, divisionId)).orderBy(asc(schema.services.name));
    res.json({ success: true, data: svcs, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};

export const getEquipesByService: RequestHandler = async (req, res) => {
  try {
    const serviceId = parseInt(req.params.serviceId);
    const eqs = await db.select().from(schema.equipes).where(eq(schema.equipes.serviceId, serviceId)).orderBy(asc(schema.equipes.name));
    res.json({ success: true, data: eqs, error: null });
  } catch (err) {
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};

// ============================================================================
// GET EMPLOYEES (paginated)
// ============================================================================

export const getEmployees: RequestHandler = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
    const offset = (page - 1) * limit;
    const showDeleted = req.query.deleted === "true";
    const search = req.query.search as string | undefined;
    const expirationFrom = req.query.expirationFrom as string | undefined;
    const expirationTo = req.query.expirationTo as string | undefined;
    const hasPdf = req.query.hasPdf as string | undefined;
    const stCode = req.query.stCode as string | undefined;
    const htCode = req.query.htCode as string | undefined;

    // Build base query with join to current version for filtering
    let query = db
      .select({
        id: schema.employees.id,
        matricule: schema.employees.matricule,
        nom: schema.employees.nom,
        prenom: schema.employees.prenom,
        deleted: schema.employees.deleted,
        createdAt: schema.employees.createdAt,
        currentVersionId: schema.employees.currentVersionId,
        dateExpiration: schema.employeeVersions.dateExpiration,
        pdfPath: schema.employeeVersions.pdfPath,
        stCodes: schema.employeeVersions.stCodes,
        htCodes: schema.employeeVersions.htCodes,
      })
      .from(schema.employees)
      .leftJoin(schema.employeeVersions, eq(schema.employees.currentVersionId, schema.employeeVersions.id));

    const conditions: any[] = [eq(schema.employees.deleted, showDeleted)];

    if (search) {
      const pat = `%${search}%`;
      conditions.push(or(
        like(schema.employees.matricule, pat),
        like(schema.employees.nom, pat),
        like(schema.employees.prenom, pat)
      ));
    }
    if (expirationFrom) conditions.push(gte(schema.employeeVersions.dateExpiration, expirationFrom));
    if (expirationTo) conditions.push(lte(schema.employeeVersions.dateExpiration, expirationTo));
    if (hasPdf === "true") conditions.push(isNotNull(schema.employeeVersions.pdfPath));
    if (hasPdf === "false") conditions.push(isNull(schema.employeeVersions.pdfPath));
    if (stCode) conditions.push(like(schema.employeeVersions.stCodes, `%"${stCode}"%`));
    if (htCode) conditions.push(like(schema.employeeVersions.htCodes, `%"${htCode}"%`));

    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);

    const sortField = req.query.sort === "expiration" ? schema.employeeVersions.dateExpiration : schema.employees.matricule;
    const sortDir = req.query.sortDir === "desc" ? desc(sortField) : asc(sortField);

    const rows = await (query as any).where(whereClause).orderBy(sortDir).limit(limit).offset(offset);

    const countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(schema.employees)
      .leftJoin(schema.employeeVersions, eq(schema.employees.currentVersionId, schema.employeeVersions.id))
      .where(whereClause);

    const [{ count }] = await countQuery;

    const data = await Promise.all(rows.map(async (row: any) => {
      const currentVersion = row.currentVersionId
        ? (await db.select().from(schema.employeeVersions).where(eq(schema.employeeVersions.id, row.currentVersionId)))[0]
        : null;
      return {
        id: row.id,
        matricule: row.matricule,
        nom: row.nom,
        prenom: row.prenom,
        deleted: row.deleted,
        createdAt: row.createdAt,
        currentVersion: currentVersion ? await buildVersionResponse(currentVersion) : null,
      };
    }));

    res.json({ success: true, data: { employees: data, total: Number(count), page, limit }, error: null });
  } catch (err) {
    console.error("getEmployees error:", err);
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};

// ============================================================================
// GET EMPLOYEE BY ID
// ============================================================================

export const getEmployee: RequestHandler = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, data: null, error: "ID invalide" });

    const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, id));
    if (!emp) return res.status(404).json({ success: false, data: null, error: "Employé non trouvé" });

    const versions = await db
      .select()
      .from(schema.employeeVersions)
      .where(eq(schema.employeeVersions.employeeId, id))
      .orderBy(desc(schema.employeeVersions.versionNumber));

    const currentVersion = emp.currentVersionId
      ? versions.find(v => v.id === emp.currentVersionId) ?? null
      : null;

    const versionsFormatted = await Promise.all(versions.map(buildVersionResponse));

    res.json({
      success: true,
      data: {
        id: emp.id,
        matricule: emp.matricule,
        nom: emp.nom,
        prenom: emp.prenom,
        deleted: emp.deleted,
        createdAt: emp.createdAt,
        currentVersion: currentVersion ? await buildVersionResponse(currentVersion) : null,
        versions: versionsFormatted,
      },
      error: null,
    });
  } catch (err) {
    console.error("getEmployee error:", err);
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};

// ============================================================================
// CREATE EMPLOYEE + V1
// ============================================================================

export const createEmployee: RequestHandler = async (req, res) => {
  try {
    const parsed = createEmployeeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, data: null, error: parsed.error.errors[0]?.message ?? "Données invalides" });
    }
    const { matricule, nom, prenom, stCodes, htCodes, nDeTitre, fonction, divisionId, serviceId, equipeId, dateValidation, dateExpiration } = parsed.data;

    const existing = await db.select({ id: schema.employees.id }).from(schema.employees).where(eq(schema.employees.matricule, matricule));
    if (existing.length > 0) {
      return res.status(409).json({ success: false, data: null, error: "Matricule déjà existant" });
    }

    const result = await db.transaction(async (tx) => {
      const [emp] = await tx.insert(schema.employees).values({ matricule, nom, prenom }).returning();

      const [version] = await tx.insert(schema.employeeVersions).values({
        employeeId: emp.id,
        versionNumber: 1,
        stCodes: stCodes ?? [],
        htCodes: htCodes ?? [],
        nDeTitre,
        fonction,
        divisionId,
        serviceId,
        equipeId: equipeId ?? null,
        dateValidation,
        dateExpiration,
      }).returning();

      await tx.update(schema.employees).set({ currentVersionId: version.id }).where(eq(schema.employees.id, emp.id));

      const [auditLog] = await tx.insert(schema.auditLogs).values({
        action: "CREATE_EMPLOYEE",
        entityId: emp.id,
        snapshotOld: null,
        snapshotNew: { matricule, nom, prenom, versionId: version.id } as any,
      }).returning();

      await tx.update(schema.employeeVersions).set({ auditLogId: auditLog.id }).where(eq(schema.employeeVersions.id, version.id));

      return { empId: emp.id, auditLogId: auditLog.id };
    });

    const employee = await buildEmployeeResponse(result.empId);
    res.status(201).json({ success: true, data: { employee, auditLogId: result.auditLogId }, error: null });
  } catch (err) {
    console.error("createEmployee error:", err);
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};

// ============================================================================
// UPDATE EMPLOYEE → new version
// ============================================================================

export const updateEmployee: RequestHandler = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, data: null, error: "ID invalide" });

    const parsed = updateEmployeeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, data: null, error: parsed.error.errors[0]?.message ?? "Données invalides" });
    }
    const { stCodes, htCodes, nDeTitre, fonction, divisionId, serviceId, equipeId, dateValidation, dateExpiration, nom, prenom } = parsed.data;

    const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, id));
    if (!emp) return res.status(404).json({ success: false, data: null, error: "Employé non trouvé" });

    const oldVersion = emp.currentVersionId
      ? (await db.select().from(schema.employeeVersions).where(eq(schema.employeeVersions.id, emp.currentVersionId)))[0]
      : null;

    const result = await db.transaction(async (tx) => {
      const [{ maxVer }] = await tx
        .select({ maxVer: sql<number>`coalesce(max(version_number), 0)` })
        .from(schema.employeeVersions)
        .where(eq(schema.employeeVersions.employeeId, id));

      const newVersionNum = Number(maxVer) + 1;

      const empUpdate: Record<string, unknown> = {};
      if (nom) empUpdate.nom = nom;
      if (prenom) empUpdate.prenom = prenom;
      if (Object.keys(empUpdate).length > 0) {
        await tx.update(schema.employees).set(empUpdate as any).where(eq(schema.employees.id, id));
      }

      const [version] = await tx.insert(schema.employeeVersions).values({
        employeeId: id,
        versionNumber: newVersionNum,
        stCodes: stCodes ?? [],
        htCodes: htCodes ?? [],
        nDeTitre,
        fonction,
        divisionId,
        serviceId,
        equipeId: equipeId ?? null,
        dateValidation,
        dateExpiration,
      }).returning();

      await tx.update(schema.employees).set({ currentVersionId: version.id }).where(eq(schema.employees.id, id));

      const [auditLog] = await tx.insert(schema.auditLogs).values({
        action: "UPDATE_EMPLOYEE",
        entityId: id,
        snapshotOld: oldVersion as any ?? null,
        snapshotNew: { versionId: version.id, versionNumber: newVersionNum } as any,
      }).returning();

      await tx.update(schema.employeeVersions).set({ auditLogId: auditLog.id }).where(eq(schema.employeeVersions.id, version.id));

      return { auditLogId: auditLog.id };
    });

    const employee = await buildEmployeeResponse(id);
    res.json({ success: true, data: { employee, auditLogId: result.auditLogId }, error: null });
  } catch (err) {
    console.error("updateEmployee error:", err);
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};

// ============================================================================
// DELETE EMPLOYEE (soft)
// ============================================================================

export const deleteEmployee: RequestHandler = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, data: null, error: "ID invalide" });

    const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, id));
    if (!emp) return res.status(404).json({ success: false, data: null, error: "Employé non trouvé" });

    const result = await db.transaction(async (tx) => {
      await tx.update(schema.employees).set({ deleted: true }).where(eq(schema.employees.id, id));

      const [auditLog] = await tx.insert(schema.auditLogs).values({
        action: "DELETE_EMPLOYEE",
        entityId: id,
        snapshotOld: { matricule: emp.matricule, nom: emp.nom, prenom: emp.prenom } as any,
        snapshotNew: { deleted: true } as any,
      }).returning();

      return { auditLogId: auditLog.id };
    });

    res.json({ success: true, data: { auditLogId: result.auditLogId }, error: null });
  } catch (err) {
    console.error("deleteEmployee error:", err);
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};

// ============================================================================
// RESTORE EMPLOYEE
// ============================================================================

export const restoreEmployee: RequestHandler = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, data: null, error: "ID invalide" });

    const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, id));
    if (!emp) return res.status(404).json({ success: false, data: null, error: "Employé non trouvé" });

    const result = await db.transaction(async (tx) => {
      await tx.update(schema.employees).set({ deleted: false }).where(eq(schema.employees.id, id));

      const [auditLog] = await tx.insert(schema.auditLogs).values({
        action: "RESTORE_EMPLOYEE",
        entityId: id,
        snapshotOld: { deleted: true } as any,
        snapshotNew: { deleted: false } as any,
      }).returning();

      return { auditLogId: auditLog.id };
    });

    const employee = await buildEmployeeResponse(id);
    res.json({ success: true, data: { employee, auditLogId: result.auditLogId }, error: null });
  } catch (err) {
    console.error("restoreEmployee error:", err);
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};

// ============================================================================
// PERMANENT DELETE (2-step: requires matricule confirmation)
// ============================================================================

export const permanentDeleteEmployee: RequestHandler = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ success: false, data: null, error: "ID invalide" });

    const { confirmMatricule } = req.body;
    if (!confirmMatricule) {
      return res.status(400).json({ success: false, data: null, error: "Confirmation matricule requise" });
    }

    const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, id));
    if (!emp) return res.status(404).json({ success: false, data: null, error: "Employé non trouvé" });
    if (emp.matricule !== confirmMatricule) {
      return res.status(400).json({ success: false, data: null, error: "Matricule de confirmation incorrect" });
    }

    await db.transaction(async (tx) => {
      await tx.insert(schema.auditLogs).values({
        action: "PERMANENT_DELETE_EMPLOYEE",
        entityId: id,
        snapshotOld: { matricule: emp.matricule, nom: emp.nom, prenom: emp.prenom } as any,
        snapshotNew: null,
      });
      await tx.delete(schema.employees).where(eq(schema.employees.id, id));
    });

    res.json({ success: true, data: { deleted: true }, error: null });
  } catch (err) {
    console.error("permanentDeleteEmployee error:", err);
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};

// ============================================================================
// REVERT TO VERSION
// ============================================================================

export const revertToVersion: RequestHandler = async (req, res) => {
  try {
    const employeeId = parseInt(req.params.id);
    const versionId = parseInt(req.params.versionId);
    if (isNaN(employeeId) || isNaN(versionId)) {
      return res.status(400).json({ success: false, data: null, error: "ID invalide" });
    }

    const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
    if (!emp) return res.status(404).json({ success: false, data: null, error: "Employé non trouvé" });

    const [sourceVersion] = await db.select().from(schema.employeeVersions).where(eq(schema.employeeVersions.id, versionId));
    if (!sourceVersion || sourceVersion.employeeId !== employeeId) {
      return res.status(404).json({ success: false, data: null, error: "Version non trouvée" });
    }

    const result = await db.transaction(async (tx) => {
      const [{ maxVer }] = await tx
        .select({ maxVer: sql<number>`coalesce(max(version_number), 0)` })
        .from(schema.employeeVersions)
        .where(eq(schema.employeeVersions.employeeId, employeeId));

      const [newVersion] = await tx.insert(schema.employeeVersions).values({
        employeeId,
        versionNumber: Number(maxVer) + 1,
        stCodes: sourceVersion.stCodes,
        htCodes: sourceVersion.htCodes,
        nDeTitre: sourceVersion.nDeTitre,
        fonction: sourceVersion.fonction,
        divisionId: sourceVersion.divisionId,
        serviceId: sourceVersion.serviceId,
        equipeId: sourceVersion.equipeId,
        dateValidation: sourceVersion.dateValidation,
        dateExpiration: sourceVersion.dateExpiration,
      }).returning();

      await tx.update(schema.employees).set({ currentVersionId: newVersion.id }).where(eq(schema.employees.id, employeeId));

      const [auditLog] = await tx.insert(schema.auditLogs).values({
        action: "REVERT_VERSION",
        entityId: employeeId,
        snapshotOld: { currentVersionId: emp.currentVersionId } as any,
        snapshotNew: { revertedFromVersionId: versionId, newVersionId: newVersion.id } as any,
      }).returning();

      return { auditLogId: auditLog.id };
    });

    const employee = await buildEmployeeResponse(employeeId);
    res.json({ success: true, data: { employee, auditLogId: result.auditLogId }, error: null });
  } catch (err) {
    console.error("revertToVersion error:", err);
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};

// ============================================================================
// STATS
// ============================================================================

export const getStats: RequestHandler = async (_req, res) => {
  try {
    const now = new Date().toISOString().split("T")[0];
    const in3m = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const in6m = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const in9m = new Date(Date.now() + 270 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const rows = await db
      .select({
        empId: schema.employees.id,
        dateExpiration: schema.employeeVersions.dateExpiration,
        stCodes: schema.employeeVersions.stCodes,
        htCodes: schema.employeeVersions.htCodes,
        pdfPath: schema.employeeVersions.pdfPath,
        divisionName: schema.divisions.name,
        serviceName: schema.services.name,
      })
      .from(schema.employees)
      .innerJoin(schema.employeeVersions, eq(schema.employees.currentVersionId, schema.employeeVersions.id))
      .leftJoin(schema.divisions, eq(schema.employeeVersions.divisionId, schema.divisions.id))
      .leftJoin(schema.services, eq(schema.employeeVersions.serviceId, schema.services.id))
      .where(eq(schema.employees.deleted, false));

    let expired = 0, lessThan3m = 0, lessThan6m = 0, lessThan9m = 0;
    let stOnly = 0, htOnly = 0, both = 0, missingPdf = 0;
    const byDivision: Record<string, { total: number; expired: number; critical: number }> = {};
    const byService: Record<string, number> = {};
    const codeCounts: Record<string, number> = {};
    const monthlyForecast: Record<string, number> = {};

    for (const r of rows) {
      const exp = r.dateExpiration;
      if (exp < now) expired++;
      else if (exp <= in3m) lessThan3m++;
      else if (exp <= in6m) lessThan6m++;
      else if (exp <= in9m) lessThan9m++;

      const hasSt = (r.stCodes ?? []).length > 0;
      const hasHt = (r.htCodes ?? []).length > 0;
      if (hasSt && hasHt) both++;
      else if (hasSt) stOnly++;
      else if (hasHt) htOnly++;

      if (!r.pdfPath) missingPdf++;

      const div = r.divisionName ?? "Unknown";
      if (!byDivision[div]) byDivision[div] = { total: 0, expired: 0, critical: 0 };
      byDivision[div].total++;
      if (exp < now) byDivision[div].expired++;
      else if (exp <= in3m) byDivision[div].critical++;

      const svc = r.serviceName ?? "Unknown";
      byService[svc] = (byService[svc] ?? 0) + 1;

      for (const c of [...(r.stCodes ?? []), ...(r.htCodes ?? [])]) {
        codeCounts[c] = (codeCounts[c] ?? 0) + 1;
      }

      // Monthly forecast: group expirations by YYYY-MM
      const ym = exp.substring(0, 7);
      monthlyForecast[ym] = (monthlyForecast[ym] ?? 0) + 1;
    }

    // Pending renewals count
    const [{ pendingCount }] = await db
      .select({ pendingCount: sql<number>`count(*)` })
      .from(schema.pendingRenewals);

    const mostCommonCodes = Object.entries(codeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([code, count]) => ({ code, count }));

    const forecastSorted = Object.entries(monthlyForecast)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, 12)
      .map(([month, count]) => ({ month, count }));

    res.json({
      success: true,
      data: {
        total: rows.length,
        expired,
        lessThan3Months: lessThan3m,
        lessThan6Months: lessThan6m,
        lessThan9Months: lessThan9m,
        stOnly,
        htOnly,
        both,
        missingPdf,
        pendingRenewals: Number(pendingCount),
        mostCommonCodes,
        monthlyForecast: forecastSorted,
        byDivision: Object.entries(byDivision).map(([name, v]) => ({ name, ...v })),
        byService: Object.entries(byService).map(([name, count]) => ({ name, count })),
      },
      error: null,
    });
  } catch (err) {
    console.error("getStats error:", err);
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};

// ============================================================================
// DELETE PDF
// ============================================================================

export const deletePdf: RequestHandler = async (req, res) => {
  try {
    const empId = parseInt(req.params.employeeId);
    if (isNaN(empId)) return res.status(400).json({ success: false, data: null, error: "ID invalide" });

    const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, empId));
    if (!emp || !emp.currentVersionId) {
      return res.status(404).json({ success: false, data: null, error: "Employé ou version introuvable" });
    }
    const [ver] = await db.select().from(schema.employeeVersions).where(eq(schema.employeeVersions.id, emp.currentVersionId));
    if (!ver) return res.status(404).json({ success: false, data: null, error: "Version introuvable" });

    if (ver.pdfPath) {
      const { deletePdf: deletePdfFile } = await import("../services/pdfService");
      deletePdfFile(ver.pdfPath);
      await db.update(schema.employeeVersions).set({ pdfPath: null }).where(eq(schema.employeeVersions.id, ver.id));
    }

    res.json({ success: true, data: { deleted: true }, error: null });
  } catch (err) {
    console.error("deletePdf error:", err);
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};

// ============================================================================
// EXCEL EXPORT
// ============================================================================

export const exportEmployees: RequestHandler = async (_req, res) => {
  try {
    const rows = await db
      .select({
        matricule: schema.employees.matricule,
        nom: schema.employees.nom,
        prenom: schema.employees.prenom,
        stCodes: schema.employeeVersions.stCodes,
        htCodes: schema.employeeVersions.htCodes,
        nDeTitre: schema.employeeVersions.nDeTitre,
        fonction: schema.employeeVersions.fonction,
        divisionName: schema.divisions.name,
        serviceName: schema.services.name,
        equipeName: schema.equipes.name,
        dateValidation: schema.employeeVersions.dateValidation,
        dateExpiration: schema.employeeVersions.dateExpiration,
        pdfPath: schema.employeeVersions.pdfPath,
        versionNumber: schema.employeeVersions.versionNumber,
      })
      .from(schema.employees)
      .innerJoin(schema.employeeVersions, eq(schema.employees.currentVersionId, schema.employeeVersions.id))
      .leftJoin(schema.divisions, eq(schema.employeeVersions.divisionId, schema.divisions.id))
      .leftJoin(schema.services, eq(schema.employeeVersions.serviceId, schema.services.id))
      .leftJoin(schema.equipes, eq(schema.employeeVersions.equipeId, schema.equipes.id))
      .where(eq(schema.employees.deleted, false))
      .orderBy(asc(schema.employees.matricule));

    const XLSX = await import("xlsx");

    const now = new Date().toISOString().split("T")[0];
    const in3m = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const in6m = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const in9m = new Date(Date.now() + 270 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    function expirationColor(exp: string): string {
      if (exp < now) return "EXPIRÉ";
      if (exp <= in3m) return "< 3 mois";
      if (exp <= in6m) return "< 6 mois";
      if (exp <= in9m) return "< 9 mois";
      return "Valide";
    }

    const wsData = rows.map((r) => ({
      Matricule: r.matricule,
      Nom: r.nom,
      Prenom: r.prenom,
      Fonction: r.fonction,
      Division: r.divisionName ?? "",
      Service: r.serviceName ?? "",
      Equipe: r.equipeName ?? "",
      ST_codes: (r.stCodes ?? []).join(", "),
      HT_codes: (r.htCodes ?? []).join(", "),
      N_de_titre: r.nDeTitre,
      Date_validation: r.dateValidation,
      Date_expiration: r.dateExpiration,
      Statut_expiration: expirationColor(r.dateExpiration),
      PDF: r.pdfPath ? "Oui" : "Non",
      Version: r.versionNumber,
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Habilitations");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="habilitations_${now}.xlsx"`);
    res.send(buf);
  } catch (err) {
    console.error("exportEmployees error:", err);
    res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
  }
};
