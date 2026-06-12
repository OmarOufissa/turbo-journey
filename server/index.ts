import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import rateLimit from "express-rate-limit";
import { initializeDatabase } from "./db-pg";
import { ensureRequiredDirectories } from "./utils/pathUtils";
import { logger } from "./utils/logger";

// Ensure required directories exist before anything else
ensureRequiredDirectories();

let dbInitialized = false;

async function initializeDbOnce() {
  if (!dbInitialized) {
    try {
      await initializeDatabase();
      dbInitialized = true;
      await initializeSeedOnStartup();
    } catch (err) {
      console.error("Failed to initialize database:", err);
    }
  }
}

async function initializeSeedOnStartup() {
  try {
    const { initializeNotificationJobs } = await import("./jobs/notificationJobs");
    await initializeNotificationJobs();
  } catch (err) {
    logger.error("app", "Error initializing notification jobs", { error: String(err) });
  }
  // Run health checks after DB is ready (non-blocking)
  try {
    const { runHealthChecks } = await import("./utils/healthCheck");
    await runHealthChecks();
  } catch (err) {
    logger.warn("app", "Health checks failed to run", { error: String(err) });
  }
}

export function createServer() {
  const app = express();

  initializeDbOnce();

  app.use(cors());
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Rate limiting
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "Trop de requêtes, réessayez dans quelques minutes", data: null },
  });
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "Trop de tentatives de connexion, réessayez dans 15 minutes", data: null },
  });
  app.use("/api/", apiLimiter);
  app.use("/api/auth/login", authLimiter);

  app.use(async (_req, _res, next) => {
    try { await initializeDbOnce(); } catch { /* non-fatal */ }
    next();
  });


  // Authenticated PDF serving — accepts Bearer header or ?token= query param
  // (direct <a>/<iframe> links can't set headers)
  app.get("/api/pdfs/:filename", async (req, res) => {
    const { verifyToken } = await import("./routes/auth");
    const authHeader = req.headers.authorization;
    const headerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
    const token = headerToken || (req.query.token as string | undefined);
    if (!token || !verifyToken(token)) {
      return res.status(401).json({ success: false, data: null, error: "Non autorisé" });
    }
    try {
      const { resolvePdfPath, fileExists } = await import("./utils/pathUtils");
      const filePath = resolvePdfPath(req.params.filename);
      if (!fileExists(filePath)) {
        return res.status(404).json({ success: false, data: null, error: "Fichier introuvable" });
      }
      res.sendFile(filePath);
    } catch {
      return res.status(400).json({ success: false, data: null, error: "Nom de fichier invalide" });
    }
  });

  app.get("/api/ping", (_req, res) => {
    res.json({ message: process.env.PING_MESSAGE ?? "ping", version: "1.0.0" });
  });

  app.get("/api/health", async (req, res) => {
    const { healthEndpointHandler } = await import("./utils/healthCheck");
    healthEndpointHandler(req, res);
  });

  app.get("/api/search", async (req, res) => {
    const { globalSearch } = await import("./routes/search");
    globalSearch(req, res);
  });

  // ============================================================================
  // AUTH
  // ============================================================================

  app.post("/api/auth/login", async (req, res) => {
    const { handleLogin } = await import("./routes/auth");
    handleLogin(req, res, () => {});
  });

  app.post("/api/auth/logout", async (req, res) => {
    const { handleLogout } = await import("./routes/auth");
    handleLogout(req, res, () => {});
  });

  app.post("/api/auth/refresh", async (req, res) => {
    const { handleRefresh } = await import("./routes/auth");
    handleRefresh(req, res, () => {});
  });

  // ============================================================================
  // STATS
  // ============================================================================

  app.get("/api/stats", async (req, res) => {
    const { authMiddleware, getStats } = await import("./routes/employees-audit");
    authMiddleware(req, res, () => getStats(req, res, () => {}));
  });

  app.get("/api/analytics", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      try {
        const { db } = await import("./db-pg");
        const schema = await import("./schema");
        const { eq, and, gte, sql } = await import("drizzle-orm");

        // Total active employees
        const [{ total }] = await db
          .select({ total: sql<number>`count(*)` })
          .from(schema.employees)
          .where(eq(schema.employees.deleted, false));

        // Total deleted employees
        const [{ totalDeleted }] = await db
          .select({ totalDeleted: sql<number>`count(*)` })
          .from(schema.employees)
          .where(eq(schema.employees.deleted, true));

        // Employees added per month (by createdAt) — last 12 months
        const addedByMonth = await db
          .select({
            month: sql<string>`strftime('%Y-%m', created_at)`,
            count: sql<number>`count(*)`,
          })
          .from(schema.employees)
          .where(gte(schema.employees.createdAt, sql`datetime('now', '-12 months')`))
          .groupBy(sql`strftime('%Y-%m', created_at)`)
          .orderBy(sql`strftime('%Y-%m', created_at)`);

        // Pending renewals
        const [{ pendingRenewals }] = await db
          .select({ pendingRenewals: sql<number>`count(*)` })
          .from(schema.pendingRenewals);

        // Audit log: CREATE_EMPLOYEE counts by month
        const createdByMonth = await db
          .select({
            month: sql<string>`strftime('%Y-%m', created_at)`,
            count: sql<number>`count(*)`,
          })
          .from(schema.auditLogs)
          .where(and(
            eq(schema.auditLogs.action, "CREATE_EMPLOYEE"),
            gte(schema.auditLogs.createdAt, sql`datetime('now', '-12 months')`)
          ))
          .groupBy(sql`strftime('%Y-%m', created_at)`)
          .orderBy(sql`strftime('%Y-%m', created_at)`);

        // Audit log: DELETE_EMPLOYEE counts by month
        const deletedByMonth = await db
          .select({
            month: sql<string>`strftime('%Y-%m', created_at)`,
            count: sql<number>`count(*)`,
          })
          .from(schema.auditLogs)
          .where(and(
            eq(schema.auditLogs.action, "DELETE_EMPLOYEE"),
            gte(schema.auditLogs.createdAt, sql`datetime('now', '-12 months')`)
          ))
          .groupBy(sql`strftime('%Y-%m', created_at)`)
          .orderBy(sql`strftime('%Y-%m', created_at)`);

        // Renewals activated by month
        const activatedByMonth = await db
          .select({
            month: sql<string>`strftime('%Y-%m', created_at)`,
            count: sql<number>`count(*)`,
          })
          .from(schema.auditLogs)
          .where(and(
            eq(schema.auditLogs.action, "ACTIVATE_RENEWAL"),
            gte(schema.auditLogs.createdAt, sql`datetime('now', '-12 months')`)
          ))
          .groupBy(sql`strftime('%Y-%m', created_at)`)
          .orderBy(sql`strftime('%Y-%m', created_at)`);

        res.json({
          success: true,
          data: {
            totalActive: Number(total),
            totalDeleted: Number(totalDeleted),
            pendingRenewals: Number(pendingRenewals),
            addedByMonth,
            deletedByMonth: deletedByMonth,
            activatedByMonth,
          },
          error: null,
        });
      } catch (err) {
        console.error("analytics error:", err);
        res.status(500).json({ success: false, data: null, error: "Erreur serveur" });
      }
    });
  });

  app.get("/api/reports/expiration/pdf", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    const { downloadExpirationReportPdf } = await import("./routes/reports");
    authMiddleware(req, res, () => downloadExpirationReportPdf(req, res, () => {}));
  });

  app.get("/api/reports/expiration", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    const { getExpirationReport } = await import("./routes/reports");
    authMiddleware(req, res, () => getExpirationReport(req, res, () => {}));
  });

  app.get("/api/employees/export", async (req, res) => {
    const { authMiddleware, exportEmployees } = await import("./routes/employees-audit");
    authMiddleware(req, res, () => exportEmployees(req, res, () => {}));
  });

  app.post("/api/employees/bulk-generate-pdf", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      try {
        const { db } = await import("./db-pg");
        const schema = await import("./schema");
        const { eq } = await import("drizzle-orm");
        const { generateHabilitationPdf } = await import("./services/pdfService");

        // Pre-load all divisions, services, equipes in 3 queries (no N+1)
        const [allDivs, allSvcs, allEquipes] = await Promise.all([
          db.select({ id: schema.divisions.id, name: schema.divisions.name }).from(schema.divisions),
          db.select({ id: schema.services.id, name: schema.services.name }).from(schema.services),
          db.select({ id: schema.equipes.id, name: schema.equipes.name }).from(schema.equipes),
        ]);
        const divMap = Object.fromEntries(allDivs.map(d => [d.id, d.name]));
        const svcMap = Object.fromEntries(allSvcs.map(s => [s.id, s.name]));
        const equipeMap = Object.fromEntries(allEquipes.map(e => [e.id, e.name]));

        const allRows = await db
          .select({
            empId: schema.employees.id,
            matricule: schema.employees.matricule,
            nom: schema.employees.nom,
            prenom: schema.employees.prenom,
            verId: schema.employeeVersions.id,
            versionNumber: schema.employeeVersions.versionNumber,
            nDeTitre: schema.employeeVersions.nDeTitre,
            fonction: schema.employeeVersions.fonction,
            divisionId: schema.employeeVersions.divisionId,
            serviceId: schema.employeeVersions.serviceId,
            equipeId: schema.employeeVersions.equipeId,
            stCodes: schema.employeeVersions.stCodes,
            htCodes: schema.employeeVersions.htCodes,
            habRows: schema.employeeVersions.habRows,
            dateValidation: schema.employeeVersions.dateValidation,
            dateExpiration: schema.employeeVersions.dateExpiration,
            pdfPath: schema.employeeVersions.pdfPath,
          })
          .from(schema.employees)
          .innerJoin(schema.employeeVersions, eq(schema.employees.currentVersionId, schema.employeeVersions.id))
          .where(eq(schema.employees.deleted, false) as any);

        const { skipExisting = true } = req.body ?? {};

        // Stream progress via SSE
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");

        const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

        const rows = skipExisting ? allRows.filter(r => !r.pdfPath) : allRows;
        let generated = 0;
        let failed = 0;
        const total = rows.length;
        const errors: string[] = [];

        for (const row of rows) {
          try {
            const result = await generateHabilitationPdf({
              matricule: row.matricule,
              nom: row.nom,
              prenom: row.prenom,
              nDeTitre: row.nDeTitre,
              fonction: row.fonction,
              division: divMap[row.divisionId] ?? "",
              service: svcMap[row.serviceId] ?? null,
              equipe: row.equipeId ? (equipeMap[row.equipeId] ?? null) : null,
              stCodes: (row.stCodes as string[]) ?? [],
              htCodes: (row.htCodes as string[]) ?? [],
              habRows: (row.habRows as any) ?? null,
              dateValidation: row.dateValidation,
              dateExpiration: row.dateExpiration,
            }, row.versionNumber);

            await db.update(schema.employeeVersions).set({ pdfPath: result.pdfPath }).where(eq(schema.employeeVersions.id, row.verId));
            generated++;
          } catch (err) {
            failed++;
            errors.push(`${row.matricule}: ${(err as Error).message}`);
          }
          send({ generated, failed, total, current: row.matricule, finished: false });
        }

        if (generated > 0) {
          const { logAuditActionSafe } = await import("./services/auditService");
          await logAuditActionSafe(null, "GENERATE_PDF", null, null, { generated, failed, total });
        }

        send({ generated, failed, total, finished: true, errors });
        res.end();
      } catch (err) {
        logger.error("app", "bulk-generate-pdf error", { error: String(err) });
        res.write(`data: ${JSON.stringify({ error: (err as Error).message, finished: true })}\n\n`);
        res.end();
      }
    });
  });

  // ============================================================================
  // EMPLOYEES (V4)
  // ============================================================================

  app.get("/api/employees", async (req, res) => {
    const { authMiddleware, getEmployees } = await import("./routes/employees-audit");
    authMiddleware(req, res, () => getEmployees(req, res, () => {}));
  });

  app.post("/api/employees", async (req, res) => {
    const { authMiddleware, createEmployee } = await import("./routes/employees-audit");
    authMiddleware(req, res, () => createEmployee(req, res, () => {}));
  });

  app.get("/api/employees/:id", async (req, res) => {
    const { authMiddleware, getEmployee } = await import("./routes/employees-audit");
    authMiddleware(req, res, () => getEmployee(req, res, () => {}));
  });

  app.put("/api/employees/:id", async (req, res) => {
    const { authMiddleware, updateEmployee } = await import("./routes/employees-audit");
    authMiddleware(req, res, () => updateEmployee(req, res, () => {}));
  });

  app.delete("/api/employees/:id", async (req, res) => {
    const { authMiddleware, deleteEmployee } = await import("./routes/employees-audit");
    authMiddleware(req, res, () => deleteEmployee(req, res, () => {}));
  });

  app.post("/api/employees/:id/restore", async (req, res) => {
    const { authMiddleware, restoreEmployee } = await import("./routes/employees-audit");
    authMiddleware(req, res, () => restoreEmployee(req, res, () => {}));
  });

  app.delete("/api/employees/:id/permanent", async (req, res) => {
    const { authMiddleware, permanentDeleteEmployee } = await import("./routes/employees-audit");
    authMiddleware(req, res, () => permanentDeleteEmployee(req, res, () => {}));
  });

  app.post("/api/employees/:id/revert/:versionId", async (req, res) => {
    const { authMiddleware, revertToVersion } = await import("./routes/employees-audit");
    authMiddleware(req, res, () => revertToVersion(req, res, () => {}));
  });

  app.post("/api/employees/:id/upload-pdf", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      try {
        const employeeId = parseInt(req.params.id);
        const { pdfBase64 } = req.body as { pdfBase64: string };
        if (!pdfBase64) return res.status(400).json({ success: false, error: "pdfBase64 required" });

        const { db } = await import("./db-pg");
        const schema = await import("./schema");
        const { eq, desc } = await import("drizzle-orm");
        const fs = await import("fs");
        const { sanitizeFilename, resolvePdfPath } = await import("./utils/pathUtils");

        const ver = await db.query.employeeVersions.findFirst({
          where: eq(schema.employeeVersions.employeeId, employeeId),
          orderBy: [desc(schema.employeeVersions.versionNumber)],
        });
        if (!ver) return res.status(404).json({ success: false, error: "Employee version not found" });

        const emp = await db.query.employees.findFirst({
          where: eq(schema.employees.id, employeeId),
        });
        if (!emp) return res.status(404).json({ success: false, error: "Employee not found" });

        const filename = sanitizeFilename(`hab${emp.matricule}_v${ver.versionNumber}_uploaded.pdf`);
        const filePath = resolvePdfPath(filename);
        const buffer = Buffer.from(pdfBase64, "base64");
        fs.writeFileSync(filePath, buffer);

        await db.update(schema.employeeVersions).set({ pdfPath: filename }).where(eq(schema.employeeVersions.id, ver.id));

        const { logAuditActionSafe } = await import("./services/auditService");
        await logAuditActionSafe(null, "UPLOAD_PDF", employeeId, null, { pdfPath: filename, versionId: ver.id, versionNumber: ver.versionNumber });

        return res.json({ success: true, data: { pdfPath: filename } });
      } catch (err: any) {
        logger.error("app", "upload-pdf error", { error: String(err) });
        return res.status(500).json({ success: false, error: err.message });
      }
    });
  });

  // ============================================================================
  // ORG STRUCTURE
  // ============================================================================

  app.get("/api/divisions", async (req, res) => {
    const { getDivisions } = await import("./routes/employees-audit");
    getDivisions(req, res, () => {});
  });

  app.get("/api/divisions/:divisionId/services", async (req, res) => {
    const { getServicesByDivision } = await import("./routes/employees-audit");
    getServicesByDivision(req, res, () => {});
  });

  app.get("/api/services/:serviceId/equipes", async (req, res) => {
    const { getEquipesByService } = await import("./routes/employees-audit");
    getEquipesByService(req, res, () => {});
  });

  app.get("/api/services", async (req, res) => {
    const { db } = await import("./db-pg");
    const schema = await import("./schema");
    const { asc } = await import("drizzle-orm");
    const svcs = await db.select().from(schema.services).orderBy(asc(schema.services.name));
    res.json({ success: true, data: svcs, error: null });
  });

  // ============================================================================
  // ORG STRUCTURE MANAGEMENT (CRUD)
  // ============================================================================

  app.post("/api/org/divisions", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      try {
        const { db } = await import("./db-pg");
        const schema = await import("./schema");
        const { name } = req.body;
        if (!name?.trim()) return res.status(400).json({ success: false, error: "Nom requis", data: null });
        const [div] = await db.insert(schema.divisions).values({ name: name.trim() }).returning();

        const { logAuditActionSafe } = await import("./services/auditService");
        await logAuditActionSafe(null, "CREATE_DIVISION", div.id, null, div as any);

        res.json({ success: true, data: div, error: null });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message, data: null });
      }
    });
  });

  app.delete("/api/org/divisions/:id", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      try {
        const { db } = await import("./db-pg");
        const schema = await import("./schema");
        const { eq, count } = await import("drizzle-orm");
        const divId = parseInt(req.params.id);
        // Cascade check: no services under this division
        const [{ total }] = await db.select({ total: count() }).from(schema.services).where(eq(schema.services.divisionId, divId));
        if (Number(total) > 0) {
          return res.status(409).json({ success: false, error: `Impossible de supprimer: cette division contient ${total} service(s). Supprimez d'abord les services.`, data: null });
        }
        // Reference check: no historical employee_versions reference this division
        const [{ total: verTotal }] = await db.select({ total: count() }).from(schema.employeeVersions).where(eq(schema.employeeVersions.divisionId, divId));
        if (Number(verTotal) > 0) {
          return res.status(409).json({ success: false, error: `Impossible de supprimer: ${verTotal} version(s) d'employé référence(nt) cette division.`, data: null });
        }
        const [div] = await db.select().from(schema.divisions).where(eq(schema.divisions.id, divId));
        await db.delete(schema.divisions).where(eq(schema.divisions.id, divId));

        const { logAuditActionSafe } = await import("./services/auditService");
        await logAuditActionSafe(null, "DELETE_DIVISION", divId, div as any, null);

        res.json({ success: true, data: { deleted: true }, error: null });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message, data: null });
      }
    });
  });

  app.post("/api/org/services", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      try {
        const { db } = await import("./db-pg");
        const schema = await import("./schema");
        const { name, divisionId } = req.body;
        if (!name?.trim() || !divisionId) return res.status(400).json({ success: false, error: "Nom et division requis", data: null });
        const [svc] = await db.insert(schema.services).values({ name: name.trim(), divisionId: parseInt(divisionId) }).returning();

        const { logAuditActionSafe } = await import("./services/auditService");
        await logAuditActionSafe(null, "CREATE_SERVICE", svc.id, null, svc as any);

        res.json({ success: true, data: svc, error: null });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message, data: null });
      }
    });
  });

  app.delete("/api/org/services/:id", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      try {
        const { db } = await import("./db-pg");
        const schema = await import("./schema");
        const { eq, count } = await import("drizzle-orm");
        const svcId = parseInt(req.params.id);
        // Cascade check: no equipes under this service
        const [{ total }] = await db.select({ total: count() }).from(schema.equipes).where(eq(schema.equipes.serviceId, svcId));
        if (Number(total) > 0) {
          return res.status(409).json({ success: false, error: `Impossible de supprimer: ce service contient ${total} équipe(s). Supprimez d'abord les équipes.`, data: null });
        }
        // Reference check: no historical employee_versions reference this service
        const [{ total: verTotal }] = await db.select({ total: count() }).from(schema.employeeVersions).where(eq(schema.employeeVersions.serviceId, svcId));
        if (Number(verTotal) > 0) {
          return res.status(409).json({ success: false, error: `Impossible de supprimer: ${verTotal} version(s) d'employé référence(nt) ce service.`, data: null });
        }
        const [svc] = await db.select().from(schema.services).where(eq(schema.services.id, svcId));
        await db.delete(schema.services).where(eq(schema.services.id, svcId));

        const { logAuditActionSafe } = await import("./services/auditService");
        await logAuditActionSafe(null, "DELETE_SERVICE", svcId, svc as any, null);

        res.json({ success: true, data: { deleted: true }, error: null });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message, data: null });
      }
    });
  });

  app.post("/api/org/equipes", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      try {
        const { db } = await import("./db-pg");
        const schema = await import("./schema");
        const { name, serviceId } = req.body;
        if (!name?.trim() || !serviceId) return res.status(400).json({ success: false, error: "Nom et service requis", data: null });
        const [eq_] = await db.insert(schema.equipes).values({ name: name.trim(), serviceId: parseInt(serviceId) }).returning();

        const { logAuditActionSafe } = await import("./services/auditService");
        await logAuditActionSafe(null, "CREATE_EQUIPE", eq_.id, null, eq_ as any);

        res.json({ success: true, data: eq_, error: null });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message, data: null });
      }
    });
  });

  app.delete("/api/org/equipes/:id", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      try {
        const { db } = await import("./db-pg");
        const schema = await import("./schema");
        const { eq, count } = await import("drizzle-orm");
        const equipeId = parseInt(req.params.id);
        // Cascade check: no active employee versions in this equipe
        const [{ total }] = await db
          .select({ total: count() })
          .from(schema.employeeVersions)
          .where(eq(schema.employeeVersions.equipeId, equipeId));
        if (Number(total) > 0) {
          return res.status(409).json({ success: false, error: `Impossible de supprimer: ${total} version(s) d'employé référence(nt) cette équipe.`, data: null });
        }
        const [eq_] = await db.select().from(schema.equipes).where(eq(schema.equipes.id, equipeId));
        await db.delete(schema.equipes).where(eq(schema.equipes.id, equipeId));

        const { logAuditActionSafe } = await import("./services/auditService");
        await logAuditActionSafe(null, "DELETE_EQUIPE", equipeId, eq_ as any, null);

        res.json({ success: true, data: { deleted: true }, error: null });
      } catch (err: any) {
        res.status(500).json({ success: false, error: err.message, data: null });
      }
    });
  });

  // Employee counts for org structure UI
  app.get("/api/org/counts", async (req, res) => {
    try {
      const { db } = await import("./db-pg");
      const schema = await import("./schema");
      const { eq, count, and } = await import("drizzle-orm");
      // Count active employee versions per division/service/equipe
      const divCounts = await db
        .select({ divisionId: schema.employeeVersions.divisionId, total: count() })
        .from(schema.employeeVersions)
        .innerJoin(schema.employees, eq(schema.employees.currentVersionId, schema.employeeVersions.id))
        .where(eq(schema.employees.deleted, false))
        .groupBy(schema.employeeVersions.divisionId);
      const svcCounts = await db
        .select({ serviceId: schema.employeeVersions.serviceId, total: count() })
        .from(schema.employeeVersions)
        .innerJoin(schema.employees, eq(schema.employees.currentVersionId, schema.employeeVersions.id))
        .where(eq(schema.employees.deleted, false))
        .groupBy(schema.employeeVersions.serviceId);
      const eqCounts = await db
        .select({ equipeId: schema.employeeVersions.equipeId, total: count() })
        .from(schema.employeeVersions)
        .innerJoin(schema.employees, eq(schema.employees.currentVersionId, schema.employeeVersions.id))
        .where(eq(schema.employees.deleted, false))
        .groupBy(schema.employeeVersions.equipeId);
      res.json({
        success: true,
        data: {
          byDivision: Object.fromEntries(divCounts.map((r) => [r.divisionId, Number(r.total)])),
          byService: Object.fromEntries(svcCounts.map((r) => [r.serviceId, Number(r.total)])),
          byEquipe: Object.fromEntries(eqCounts.filter((r) => r.equipeId != null).map((r) => [r.equipeId!, Number(r.total)])),
        },
        error: null,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message, data: null });
    }
  });

  // ============================================================================
  // RENEWALS
  // ============================================================================

  app.post("/api/renewals", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    const { createPendingRenewal } = await import("./routes/renewals");
    authMiddleware(req, res, () => createPendingRenewal(req, res, () => {}));
  });

  app.get("/api/renewals", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    const { listPendingRenewals } = await import("./routes/renewals");
    authMiddleware(req, res, () => listPendingRenewals(req, res, () => {}));
  });

  app.post("/api/renewals/:id/activate", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    const { activatePendingRenewal } = await import("./routes/renewals");
    authMiddleware(req, res, () => activatePendingRenewal(req, res, () => {}));
  });

  app.delete("/api/renewals/:id", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    const { deletePendingRenewal } = await import("./routes/renewals");
    authMiddleware(req, res, () => deletePendingRenewal(req, res, () => {}));
  });

  // ============================================================================
  // AUDIT LOGS
  // ============================================================================

  app.get("/api/audit-logs", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    const { getAuditLogs_Handler } = await import("./routes/auditLog");
    authMiddleware(req, res, () => getAuditLogs_Handler(req, res, () => {}));
  });

  app.get("/api/audit-logs/export", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    const { exportAuditLogs_Handler } = await import("./routes/auditLog");
    authMiddleware(req, res, () => exportAuditLogs_Handler(req, res, () => {}));
  });

  app.get("/api/audit-logs/employee/:employeeId", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    const { getEmployeeAuditHistory_Handler } = await import("./routes/auditLog");
    authMiddleware(req, res, () => getEmployeeAuditHistory_Handler(req, res, () => {}));
  });

  app.get("/api/audit-logs/:id", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    const { getAuditLogEntry_Handler } = await import("./routes/auditLog");
    authMiddleware(req, res, () => getAuditLogEntry_Handler(req, res, () => {}));
  });

  app.post("/api/audit-logs/:id/revert", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    const { revertAuditLog_Handler } = await import("./routes/auditLog");
    authMiddleware(req, res, () => revertAuditLog_Handler(req, res, () => {}));
  });

  // ============================================================================
  // BACKUPS
  // ============================================================================

  app.post("/api/resync-names", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      try {
        const { resyncEmployeeNames } = await import("./seed-pg");
        const result = await resyncEmployeeNames();
        res.json({ success: true, data: result, error: null });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[resync-names]", msg);
        res.status(500).json({ success: false, data: null, error: msg });
      }
    });
  });

  app.post("/api/sync-new-employees", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      try {
        const { syncNewEmployeesFromExcel } = await import("./seed-pg");
        const result = await syncNewEmployeesFromExcel();
        res.json({ success: true, data: result, error: null });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[sync-new-employees]", msg);
        res.status(500).json({ success: false, data: null, error: msg });
      }
    });
  });

  app.post("/api/backups/create", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      const { createBackup_Handler } = await import("./routes/backup");
      createBackup_Handler(req, res, () => {});
    });
  });

  app.get("/api/backups/list", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      const { listBackups_Handler } = await import("./routes/backup");
      listBackups_Handler(req, res, () => {});
    });
  });

  app.get("/api/backups/download/:backupId", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      const { downloadBackup_Handler } = await import("./routes/backup");
      downloadBackup_Handler(req, res, () => {});
    });
  });

  app.post("/api/backups/:backupId/verify", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      const { verifyBackup_Handler } = await import("./routes/backup");
      verifyBackup_Handler(req, res, () => {});
    });
  });

  app.post("/api/backups/:backupId/restore", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      const { restoreBackup_Handler } = await import("./routes/backup");
      restoreBackup_Handler(req, res, () => {});
    });
  });

  app.get("/api/backups/statistics", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      const { getBackupStatistics_Handler } = await import("./routes/backup");
      getBackupStatistics_Handler(req, res, () => {});
    });
  });

  app.post("/api/backups/cleanup", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      const { cleanupBackups_Handler } = await import("./routes/backup");
      cleanupBackups_Handler(req, res, () => {});
    });
  });

  app.get("/api/backups/cloud/status", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      const { getCloudBackupStatus_Handler } = await import("./routes/backup");
      getCloudBackupStatus_Handler(req, res, () => {});
    });
  });

  app.get("/api/backups/cloud/list", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      const { listCloudBackups_Handler } = await import("./routes/backup");
      listCloudBackups_Handler(req, res, () => {});
    });
  });

  app.post("/api/backups/cloud/upload/:backupId", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      const { uploadToCloud_Handler } = await import("./routes/backup");
      uploadToCloud_Handler(req, res, () => {});
    });
  });

  app.get("/api/backups/cloud/download/:backupId", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      const { downloadFromCloud_Handler } = await import("./routes/backup");
      downloadFromCloud_Handler(req, res, () => {});
    });
  });

  app.delete("/api/backups/cloud/:backupId", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      const { deleteCloudBackup_Handler } = await import("./routes/backup");
      deleteCloudBackup_Handler(req, res, () => {});
    });
  });

  app.post("/api/backups/cloud/cleanup", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      const { cleanupCloudBackups_Handler } = await import("./routes/backup");
      cleanupCloudBackups_Handler(req, res, () => {});
    });
  });

  // ============================================================================
  // PDF GENERATION
  // ============================================================================

  app.delete("/api/employees/:employeeId/pdf", async (req, res) => {
    const { authMiddleware, deletePdf } = await import("./routes/employees-audit");
    authMiddleware(req, res, () => deletePdf(req, res, () => {}));
  });

  app.post("/api/employees/:employeeId/generate-pdf", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      try {
        const empId = parseInt(req.params.employeeId);
        const { db } = await import("./db-pg");
        const schema = await import("./schema");
        const { eq } = await import("drizzle-orm");
        const { generateHabilitationPdf } = await import("./services/pdfService");

        const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, empId));
        if (!emp || !emp.currentVersionId) {
          return res.status(404).json({ success: false, data: null, error: "Employé ou version introuvable" });
        }

        const [ver] = await db.select().from(schema.employeeVersions).where(eq(schema.employeeVersions.id, emp.currentVersionId));
        const [div] = await db.select({ name: schema.divisions.name }).from(schema.divisions).where(eq(schema.divisions.id, ver.divisionId));
        const [svc] = await db.select({ name: schema.services.name }).from(schema.services).where(eq(schema.services.id, ver.serviceId));
        const equipe = ver.equipeId
          ? (await db.select({ name: schema.equipes.name }).from(schema.equipes).where(eq(schema.equipes.id, ver.equipeId)))[0]
          : null;

        const result = await generateHabilitationPdf({
          matricule: emp.matricule,
          nom: emp.nom,
          prenom: emp.prenom,
          nDeTitre: ver.nDeTitre,
          fonction: ver.fonction,
          division: div?.name ?? "",
          service: svc?.name ?? null,
          equipe: equipe?.name ?? null,
          stCodes: ver.stCodes ?? [],
          htCodes: ver.htCodes ?? [],
          habRows: ver.habRows ?? null,
          dateValidation: ver.dateValidation,
          dateExpiration: ver.dateExpiration,
        }, ver.versionNumber);

        await db.update(schema.employeeVersions).set({ pdfPath: result.pdfPath }).where(eq(schema.employeeVersions.id, ver.id));

        const { logAuditActionSafe } = await import("./services/auditService");
        await logAuditActionSafe(null, "GENERATE_PDF", empId, null, { pdfPath: result.pdfPath, versionId: ver.id, versionNumber: ver.versionNumber });

        res.json({ success: true, data: result, error: null });
      } catch (err) {
        console.error("PDF generation error:", err);
        res.status(500).json({ success: false, data: null, error: (err as Error).message });
      }
    });
  });

  // Per-version PDF generation
  app.post("/api/employees/:employeeId/versions/:versionId/generate-pdf", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      try {
        const empId = parseInt(req.params.employeeId);
        const verId = parseInt(req.params.versionId);
        const { db } = await import("./db-pg");
        const schema = await import("./schema");
        const { eq } = await import("drizzle-orm");
        const { generateHabilitationPdf } = await import("./services/pdfService");

        const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, empId));
        if (!emp) return res.status(404).json({ success: false, data: null, error: "Employé introuvable" });

        const [ver] = await db.select().from(schema.employeeVersions).where(eq(schema.employeeVersions.id, verId));
        if (!ver || ver.employeeId !== empId) return res.status(404).json({ success: false, data: null, error: "Version introuvable" });

        const [div] = await db.select({ name: schema.divisions.name }).from(schema.divisions).where(eq(schema.divisions.id, ver.divisionId));
        const [svc] = await db.select({ name: schema.services.name }).from(schema.services).where(eq(schema.services.id, ver.serviceId));
        const equipe = ver.equipeId
          ? (await db.select({ name: schema.equipes.name }).from(schema.equipes).where(eq(schema.equipes.id, ver.equipeId)))[0]
          : null;

        const result = await generateHabilitationPdf({
          matricule: emp.matricule,
          nom: emp.nom,
          prenom: emp.prenom,
          nDeTitre: ver.nDeTitre,
          fonction: ver.fonction,
          division: div?.name ?? "",
          service: svc?.name ?? null,
          equipe: equipe?.name ?? null,
          stCodes: ver.stCodes ?? [],
          htCodes: ver.htCodes ?? [],
          habRows: ver.habRows ?? null,
          dateValidation: ver.dateValidation,
          dateExpiration: ver.dateExpiration,
        }, ver.versionNumber);

        await db.update(schema.employeeVersions).set({ pdfPath: result.pdfPath }).where(eq(schema.employeeVersions.id, verId));

        const { logAuditActionSafe } = await import("./services/auditService");
        await logAuditActionSafe(null, "GENERATE_PDF", empId, null, { pdfPath: result.pdfPath, versionId: verId, versionNumber: ver.versionNumber });

        res.json({ success: true, data: result, error: null });
      } catch (err) {
        console.error("Version PDF generation error:", err);
        res.status(500).json({ success: false, data: null, error: (err as Error).message });
      }
    });
  });

  // Per-version PDF delete
  app.delete("/api/employees/:employeeId/versions/:versionId/pdf", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      try {
        const empId = parseInt(req.params.employeeId);
        const verId = parseInt(req.params.versionId);
        const { db } = await import("./db-pg");
        const schema = await import("./schema");
        const { eq } = await import("drizzle-orm");
        const { deletePdf: deletePdfFile } = await import("./services/pdfService");

        const [ver] = await db.select().from(schema.employeeVersions).where(eq(schema.employeeVersions.id, verId));
        if (!ver || ver.employeeId !== empId) return res.status(404).json({ success: false, data: null, error: "Version introuvable" });
        if (!ver.pdfPath) return res.status(404).json({ success: false, data: null, error: "Aucun PDF pour cette version" });

        deletePdfFile(ver.pdfPath);
        await db.update(schema.employeeVersions).set({ pdfPath: null }).where(eq(schema.employeeVersions.id, verId));

        const [auditLog] = await db.insert(schema.auditLogs).values({
          action: "DELETE_PDF",
          entityId: empId,
          snapshotOld: { pdfPath: ver.pdfPath, versionId: verId } as any,
          snapshotNew: { pdfPath: null } as any,
        }).returning();

        res.json({ success: true, data: { auditLogId: auditLog.id }, error: null });
      } catch (err) {
        console.error("Version PDF delete error:", err);
        res.status(500).json({ success: false, data: null, error: (err as Error).message });
      }
    });
  });

  return app;
}
