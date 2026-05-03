import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { initializeDatabase } from "./db-pg";

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
    console.error("Error initializing seeds:", err);
  }
}

export function createServer() {
  const app = express();

  initializeDbOnce();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

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
  // PDF GENERATION
  // ============================================================================

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
