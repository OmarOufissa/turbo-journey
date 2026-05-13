import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
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
    const { initializeOrgStructureOnce } = await import("./seeds/organizationStructure");
    await initializeOrgStructureOnce();
  } catch (err) {
    logger.error("app", "Error initializing seeds", { error: String(err) });
  }
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
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

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

  const uploadExcel = multer({
    dest: path.join(process.cwd(), "uploads", "temp"),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      if (file.originalname.endsWith('.xlsx') || file.mimetype.includes('spreadsheet')) {
        cb(null, true);
      } else {
        cb(new Error("Only .xlsx files are allowed"));
      }
    },
  });

  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  app.get("/api/ping", (_req, res) => {
    res.json({ message: process.env.PING_MESSAGE ?? "ping" });
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
    handleLogin(req, res);
  });

  app.post("/api/auth/logout", async (req, res) => {
    const { handleLogout } = await import("./routes/auth");
    handleLogout(req, res);
  });

  app.post("/api/auth/refresh", async (req, res) => {
    const { handleRefresh } = await import("./routes/auth");
    handleRefresh(req, res);
  });

  // ============================================================================
  // STATS
  // ============================================================================

  app.get("/api/stats", async (req, res) => {
    const { authMiddleware, getStats } = await import("./routes/employees-audit");
    authMiddleware(req, res, () => getStats(req, res));
  });

  app.get("/api/employees/export", async (req, res) => {
    const { authMiddleware, exportEmployees } = await import("./routes/employees-audit");
    authMiddleware(req, res, () => exportEmployees(req, res));
  });

  app.post("/api/employees/bulk-generate-pdf", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      try {
        const { db } = await import("./db-pg");
        const schema = await import("./schema");
        const { eq, isNull } = await import("drizzle-orm");
        const { generateHabilitationPdf } = await import("./services/pdfService");

        const rows = await db
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
            dateValidation: schema.employeeVersions.dateValidation,
            dateExpiration: schema.employeeVersions.dateExpiration,
          })
          .from(schema.employees)
          .innerJoin(schema.employeeVersions, eq(schema.employees.currentVersionId, schema.employeeVersions.id))
          .where(eq(schema.employees.deleted, false) as any);

        const missing = rows.filter(r => !r.verId);
        // Also include those with no PDF on the version
        const allRows = rows;

        let generated = 0;
        let failed = 0;
        const errors: string[] = [];

        for (const row of allRows) {
          try {
            const [div] = await db.select({ name: schema.divisions.name }).from(schema.divisions).where(eq(schema.divisions.id, row.divisionId));
            const [svc] = await db.select({ name: schema.services.name }).from(schema.services).where(eq(schema.services.id, row.serviceId));
            const equipe = row.equipeId
              ? (await db.select({ name: schema.equipes.name }).from(schema.equipes).where(eq(schema.equipes.id, row.equipeId)))[0]
              : null;

            const result = await generateHabilitationPdf({
              matricule: row.matricule,
              nom: row.nom,
              prenom: row.prenom,
              nDeTitre: row.nDeTitre,
              fonction: row.fonction,
              division: div?.name ?? "",
              service: svc?.name ?? "",
              equipe: equipe?.name ?? null,
              stCodes: (row.stCodes as string[]) ?? [],
              htCodes: (row.htCodes as string[]) ?? [],
              dateValidation: row.dateValidation,
              dateExpiration: row.dateExpiration,
            }, row.versionNumber);

            await db.update(schema.employeeVersions).set({ pdfPath: result.pdfPath }).where(eq(schema.employeeVersions.id, row.verId));
            generated++;
          } catch (err) {
            failed++;
            errors.push(`${row.matricule}: ${(err as Error).message}`);
          }
        }

        res.json({ success: true, data: { generated, failed, errors }, error: null });
      } catch (err) {
        console.error("bulk-generate-pdf error:", err);
        res.status(500).json({ success: false, data: null, error: (err as Error).message });
      }
    });
  });

  // ============================================================================
  // EMPLOYEES (V4)
  // ============================================================================

  app.get("/api/employees", async (req, res) => {
    const { authMiddleware, getEmployees } = await import("./routes/employees-audit");
    authMiddleware(req, res, () => getEmployees(req, res));
  });

  app.post("/api/employees", async (req, res) => {
    const { authMiddleware, createEmployee } = await import("./routes/employees-audit");
    authMiddleware(req, res, () => createEmployee(req, res));
  });

  app.get("/api/employees/:id", async (req, res) => {
    const { authMiddleware, getEmployee } = await import("./routes/employees-audit");
    authMiddleware(req, res, () => getEmployee(req, res));
  });

  app.put("/api/employees/:id", async (req, res) => {
    const { authMiddleware, updateEmployee } = await import("./routes/employees-audit");
    authMiddleware(req, res, () => updateEmployee(req, res));
  });

  app.delete("/api/employees/:id", async (req, res) => {
    const { authMiddleware, deleteEmployee } = await import("./routes/employees-audit");
    authMiddleware(req, res, () => deleteEmployee(req, res));
  });

  app.post("/api/employees/:id/restore", async (req, res) => {
    const { authMiddleware, restoreEmployee } = await import("./routes/employees-audit");
    authMiddleware(req, res, () => restoreEmployee(req, res));
  });

  app.delete("/api/employees/:id/permanent", async (req, res) => {
    const { authMiddleware, permanentDeleteEmployee } = await import("./routes/employees-audit");
    authMiddleware(req, res, () => permanentDeleteEmployee(req, res));
  });

  app.post("/api/employees/:id/revert/:versionId", async (req, res) => {
    const { authMiddleware, revertToVersion } = await import("./routes/employees-audit");
    authMiddleware(req, res, () => revertToVersion(req, res));
  });

  // ============================================================================
  // ORG STRUCTURE
  // ============================================================================

  app.get("/api/divisions", async (req, res) => {
    const { getDivisions } = await import("./routes/employees-audit");
    getDivisions(req, res);
  });

  app.get("/api/divisions/:divisionId/services", async (req, res) => {
    const { getServicesByDivision } = await import("./routes/employees-audit");
    getServicesByDivision(req, res);
  });

  app.get("/api/services/:serviceId/equipes", async (req, res) => {
    const { getEquipesByService } = await import("./routes/employees-audit");
    getEquipesByService(req, res);
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
        await db.delete(schema.divisions).where(eq(schema.divisions.id, divId));
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
        await db.delete(schema.services).where(eq(schema.services.id, svcId));
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
        await db.delete(schema.equipes).where(eq(schema.equipes.id, equipeId));
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
    authMiddleware(req, res, () => createPendingRenewal(req, res));
  });

  app.get("/api/renewals", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    const { listPendingRenewals } = await import("./routes/renewals");
    authMiddleware(req, res, () => listPendingRenewals(req, res));
  });

  app.post("/api/renewals/:id/activate", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    const { activatePendingRenewal } = await import("./routes/renewals");
    authMiddleware(req, res, () => activatePendingRenewal(req, res));
  });

  app.delete("/api/renewals/:id", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    const { deletePendingRenewal } = await import("./routes/renewals");
    authMiddleware(req, res, () => deletePendingRenewal(req, res));
  });

  // ============================================================================
  // AUDIT LOGS
  // ============================================================================

  app.get("/api/audit-logs", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    const { getAuditLogs_Handler } = await import("./routes/auditLog");
    authMiddleware(req, res, () => getAuditLogs_Handler(req, res));
  });

  app.get("/api/audit-logs/export", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    const { exportAuditLogs_Handler } = await import("./routes/auditLog");
    authMiddleware(req, res, () => exportAuditLogs_Handler(req, res));
  });

  app.get("/api/audit-logs/employee/:employeeId", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    const { getEmployeeAuditHistory_Handler } = await import("./routes/auditLog");
    authMiddleware(req, res, () => getEmployeeAuditHistory_Handler(req, res));
  });

  app.get("/api/audit-logs/:id", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    const { getAuditLogEntry_Handler } = await import("./routes/auditLog");
    authMiddleware(req, res, () => getAuditLogEntry_Handler(req, res));
  });

  app.post("/api/audit-logs/:id/revert", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    const { revertAuditLog_Handler } = await import("./routes/auditLog");
    authMiddleware(req, res, () => revertAuditLog_Handler(req, res));
  });

  // ============================================================================
  // IMPORT (Excel .xlsx)
  // ============================================================================

  app.post("/api/import-employees/preview", uploadExcel.single("file"), async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      try {
        if (!req.file) {
          return res.status(400).json({ success: false, data: null, error: "Fichier .xlsx requis" });
        }
        const fs = await import("fs");
        const buffer = fs.readFileSync(req.file.path);
        const { previewImportFromBuffer } = await import("./import-employees");
        const result = await previewImportFromBuffer(buffer);
        fs.unlinkSync(req.file.path);
        res.json({ success: true, data: result, error: null });
      } catch (err) {
        console.error("Preview import error:", err);
        res.status(500).json({ success: false, data: null, error: (err as Error).message });
      }
    });
  });

  app.post("/api/import-employees", uploadExcel.single("file"), async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      try {
        if (!req.file) {
          return res.status(400).json({ success: false, data: null, error: "Fichier .xlsx requis" });
        }
        const fs = await import("fs");
        const buffer = fs.readFileSync(req.file.path);
        const mode = (req.query.mode as string ?? 'A').toUpperCase() as 'A' | 'B';
        const { importEmployeesFromBuffer } = await import("./import-employees");
        const result = await importEmployeesFromBuffer(buffer, mode);
        fs.unlinkSync(req.file.path);
        res.json({ success: true, data: result, error: null });
      } catch (err) {
        console.error("Import error:", err);
        res.status(500).json({ success: false, data: null, error: (err as Error).message });
      }
    });
  });

  // ============================================================================
  // BACKUPS
  // ============================================================================

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

  app.post("/api/backups/verify", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees-audit");
    authMiddleware(req, res, async () => {
      const { verifyBackup_Handler } = await import("./routes/backup");
      verifyBackup_Handler(req, res, () => {});
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

  // ============================================================================
  // PDF GENERATION
  // ============================================================================

  app.delete("/api/employees/:employeeId/pdf", async (req, res) => {
    const { authMiddleware, deletePdf } = await import("./routes/employees-audit");
    authMiddleware(req, res, () => deletePdf(req, res));
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
          service: svc?.name ?? "",
          equipe: equipe?.name ?? null,
          stCodes: ver.stCodes ?? [],
          htCodes: ver.htCodes ?? [],
          dateValidation: ver.dateValidation,
          dateExpiration: ver.dateExpiration,
        }, ver.versionNumber);

        await db.update(schema.employeeVersions).set({ pdfPath: result.pdfPath }).where(eq(schema.employeeVersions.id, ver.id));
        res.json({ success: true, data: result, error: null });
      } catch (err) {
        console.error("PDF generation error:", err);
        res.status(500).json({ success: false, data: null, error: (err as Error).message });
      }
    });
  });

  return app;
}
