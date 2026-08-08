import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { handleDemo } from "./routes/demo";
import { initializeDatabase } from "./db-pg";

// Initialize database on server creation
let dbInitialized = false;

async function initializeDbOnce() {
  if (!dbInitialized) {
    try {
      await initializeDatabase();
      dbInitialized = true;

      // PHASE 1: Check for legacy ST data on startup
      await checkLegacySTDataOnStartup();

      // CORRECTION 7: Initialize employee seed data
      await initializeSeedOnStartup();

      // PHASE 3: Initialize scheduled notification jobs
      await initializeJobsOnStartup();

      // PHASE 4: Initialize scheduled backup jobs
      await initializeBackupJobsOnStartup();
    } catch (err) {
      console.error("Failed to initialize database:", err);
    }
  }
}

/**
 * Check for legacy ST data on server startup
 * Logs a system audit entry if legacy data is found
 */
async function checkLegacySTDataOnStartup() {
  try {
    const { checkForLegacySTData } = await import("./services/auditService");
    const { logAuditActionSafe } = await import("./services/auditService");

    const legacyData = await checkForLegacySTData();

    if (legacyData.hasLegacyST) {
      console.warn(
        `⚠️  LEGACY DATA DETECTED: Found ${legacyData.count} ST habilitations in database. ` +
        `ST habilitations are obsolete. Please migrate data to HT habilitations.`
      );

      // Log to audit trail for admin awareness
      try {
        await logAuditActionSafe(
          null, // system action (no user)
          "SYSTEM_LEGACY_ST_DETECTED",
          "system",
          null,
          null,
          null,
          {
            legacySTCount: legacyData.count,
            detectedAt: new Date().toISOString(),
            message: "Legacy ST habilitations detected on server startup",
            action: "Please migrate data to HT habilitations",
          }
        );
      } catch (auditErr) {
        console.error("Failed to log legacy ST detection:", auditErr);
      }
    }
  } catch (err) {
    console.error("Error checking for legacy ST data:", err);
    // Don't fail startup if check fails
  }
}

/**
 * Initialize scheduled notification jobs on server startup
 */
async function initializeJobsOnStartup() {
  try {
    const { initializeNotificationJobs } = await import("./jobs/notificationJobs");

    const result = await initializeNotificationJobs();

    if (result.initialized) {
      console.log(`✓ Notification jobs initialized (${result.jobsCount} jobs scheduled)`);
    } else {
      console.warn("⚠️  Notification jobs not initialized:", result.errors);
    }
  } catch (err) {
    console.error("Error initializing notification jobs:", err);
    // Don't fail startup if jobs fail to initialize
  }
}

/**
 * Initialize scheduled backup jobs on server startup
 */
async function initializeBackupJobsOnStartup() {
  try {
    const { initializeBackupJobs } = await import("./jobs/backupJobs");

    const result = await initializeBackupJobs();

    if (result.initialized) {
      console.log(`✓ Backup jobs initialized (${result.jobsCount} jobs scheduled)`);
    } else {
      console.warn("⚠️  Backup jobs not initialized:", result.errors);
    }
  } catch (err) {
    console.error("Error initializing backup jobs:", err);
    // Don't fail startup if jobs fail to initialize
  }
}

/**
 * CORRECTION 7: Initialize seeds on server startup
 * 1. Organization structure (divisions, services, equipes)
 * 2. Legacy seed data (if any)
 *
 * Note: Demo employees are NOT automatically seeded.
 * Users can import employees manually via the import feature.
 */
async function initializeSeedOnStartup() {
  try {
    // Initialize organization structure first (required for employee forms)
    const { initializeOrgStructureOnce } = await import("./seeds/organizationStructure");
    await initializeOrgStructureOnce();

    // Initialize legacy seed data (if any)
    const { initializeSeedOnce } = await import("./seeds/employees-seed");
    await initializeSeedOnce();

    // Initialize ouvrages (electrical installations) - requires services to exist
    const { initializeOuvragesOnce } = await import("./seeds/ouvragesSeed");
    await initializeOuvragesOnce();
  } catch (err) {
    console.error("Error initializing seeds:", err);
    // Don't fail startup if seed fails
  }
}

export function createServer() {
  const app = express();

  // Initialize database
  initializeDbOnce();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // PHASE 1: Data validation middleware
  const { validationMiddleware } = require("./middleware/validationMiddleware");
  app.use(validationMiddleware);

  // Database ready middleware
  app.use(async (_req, _res, next) => {
    try {
      await initializeDbOnce();
      next();
    } catch (err) {
      console.error("Database not ready:", err);
      next();
    }
  });

  // Multer configuration for file uploads
  const upload = multer({
    dest: path.join(process.cwd(), "uploads", "temp"),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === "application/pdf") {
        cb(null, true);
      } else {
        cb(new Error("Only PDF files are allowed"));
      }
    },
  });

  // Serve uploaded files
  app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

  // Health check
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // Seed database (development only)
  app.post("/api/seed", async (_req, res) => {
    try {
      await initializeDbOnce(); // Ensure DB is initialized
      const { seedDatabasePG } = await import("./seed-pg");
      await seedDatabasePG();
      res.json({ message: "Database seeded successfully" });
    } catch (err) {
      console.error("Seeding error:", err);
      res.status(500).json({ message: "Error seeding database" });
    }
  });

  // Import employees from TSV/Excel data
  app.post("/api/import-employees", async (req, res) => {
    try {
      const { tsvData } = req.body;
      if (!tsvData) {
        return res.status(400).json({ message: "TSV data required" });
      }

      await initializeDbOnce();
      const { parseEmployeesFromTSV, importEmployees } = await import(
        "./import-employees"
      );

      const employees = parseEmployeesFromTSV(tsvData);
      const result = await importEmployees(employees);

      res.json({
        message: "Import completed",
        ...result,
      });
    } catch (err) {
      console.error("Import error:", err);
      res.status(500).json({ message: "Error importing employees" });
    }
  });

  // Auth routes (lazy load)
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

  // Protected employee routes - PHASE 1: Using audit-integrated routes
  app.get("/api/employees", async (req, res, next) => {
    const { authMiddleware, getEmployees } = await import(
      "./routes/employees-audit"
    );
    authMiddleware(req, res, () => getEmployees(req, res));
  });

  app.post("/api/employees", async (req, res, next) => {
    const { authMiddleware, createEmployee } = await import(
      "./routes/employees-audit"
    );
    authMiddleware(req, res, () => createEmployee(req, res));
  });

  app.get("/api/employees/:id", async (req, res) => {
    const { authMiddleware, getEmployee } = await import(
      "./routes/employees-audit"
    );
    authMiddleware(req, res, () => getEmployee(req, res));
  });

  app.put("/api/employees/:id", async (req, res) => {
    const { authMiddleware, updateEmployee } = await import(
      "./routes/employees-audit"
    );
    authMiddleware(req, res, () => updateEmployee(req, res));
  });

  app.delete("/api/employees/:id", async (req, res) => {
    const { authMiddleware, deleteEmployee } = await import(
      "./routes/employees-audit"
    );
    authMiddleware(req, res, () => deleteEmployee(req, res));
  });

  // Ouvrages (electrical installations) routes
  app.get("/api/ouvrages", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { getOuvrages } = await import("./routes/ouvrages");
    authMiddleware(req, res, () => getOuvrages(req, res));
  });

  app.post("/api/ouvrages", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { createOuvrage } = await import("./routes/ouvrages");
    authMiddleware(req, res, () => createOuvrage(req, res));
  });

  // Habilitation request generation routes ("Demande d'habilitation" module)
  app.get("/api/habilitation-symbols", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { getHabilitationSymbols } = await import("./routes/habilitationRequests");
    authMiddleware(req, res, () => getHabilitationSymbols(req, res));
  });

  app.post("/api/habilitation-requests/preview", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { previewHabilitationRequest } = await import("./routes/habilitationRequests");
    authMiddleware(req, res, () => previewHabilitationRequest(req, res));
  });

  app.post("/api/habilitation-requests/download.pdf", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { downloadHabilitationRequestPdf } = await import("./routes/habilitationRequests");
    authMiddleware(req, res, () => downloadHabilitationRequestPdf(req, res));
  });

  app.post("/api/habilitation-requests/download.docx", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { downloadHabilitationRequestDocx } = await import("./routes/habilitationRequests");
    authMiddleware(req, res, () => downloadHabilitationRequestDocx(req, res));
  });

  // Organizational structure routes - PHASE 1: Using audit-integrated routes
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

  // Habilitation management routes - PHASE 1: Using audit-integrated routes
  app.post("/api/habilitations", async (req, res) => {
    const { authMiddleware, createHabilitation } = await import(
      "./routes/employees-audit"
    );
    authMiddleware(req, res, () => createHabilitation(req, res));
  });

  app.put("/api/habilitations/:habId", async (req, res) => {
    const { authMiddleware, updateHabilitation } = await import(
      "./routes/employees-audit"
    );
    authMiddleware(req, res, () => updateHabilitation(req, res));
  });

  app.delete("/api/habilitations/:habId", async (req, res) => {
    const { authMiddleware, deleteHabilitation } = await import(
      "./routes/employees-audit"
    );
    authMiddleware(req, res, () => deleteHabilitation(req, res));
  });

  app.post("/api/habilitations/:habId/renew", async (req, res) => {
    const { authMiddleware, renewHabilitation } = await import(
      "./routes/employees-audit"
    );
    authMiddleware(req, res, () => renewHabilitation(req, res));
  });

  // Batch operations routes
  app.post("/api/habilitations/batch-delete", async (req, res) => {
    const { authMiddleware, batchDeleteHabilitations } = await import(
      "./routes/employees-audit"
    );
    authMiddleware(req, res, () => batchDeleteHabilitations(req, res));
  });

  app.put("/api/habilitations/batch-update", async (req, res) => {
    const { authMiddleware, batchUpdateHabilitations } = await import(
      "./routes/employees-audit"
    );
    authMiddleware(req, res, () => batchUpdateHabilitations(req, res));
  });

  // PDF upload routes
  app.post("/api/habilitations/upload-pdf", upload.single("pdf"), async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { uploadPDF } = await import("./routes/pdf");
    authMiddleware(req, res, () => uploadPDF(req, res));
  });

  app.delete("/api/habilitations/:habId/pdf", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { deletePDF } = await import("./routes/pdf");
    authMiddleware(req, res, () => deletePDF(req, res));
  });

  // CORRECTION 5: Restore soft-deleted PDF (Undo)
  app.post("/api/habilitations/:habId/pdf/restore", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { restorePDF } = await import("./routes/pdf");
    authMiddleware(req, res, () => restorePDF(req, res));
  });

  // ============================================================================
  // CORRECTION 6: BATCH OPERATIONS ROUTES
  // ============================================================================

  // Validate batch upload mode
  app.post("/api/batch/upload-mode", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { validateBatchUploadMode } = await import("./routes/batch-operations");
    authMiddleware(req, res, () => validateBatchUploadMode(req, res));
  });

  // Execute batch PDF upload
  app.post("/api/batch/pdf-upload", upload.array("files", 100), async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { executeBatchPDFUpload } = await import("./routes/batch-operations");
    authMiddleware(req, res, () => executeBatchPDFUpload(req, res));
  });

  // Batch delete (employees or habilitations)
  app.post("/api/batch/delete", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { batchDelete } = await import("./routes/batch-operations");
    authMiddleware(req, res, () => batchDelete(req, res));
  });

  app.post("/api/habilitations/batch-upload-pdf", upload.array("pdfs", 50), async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { batchUploadPDF } = await import("./routes/pdf");
    authMiddleware(req, res, () => batchUploadPDF(req, res));
  });

  // PHASE 5: PDF GENERATION ROUTES
  app.post("/api/employees/:employeeId/generate-pdf", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { generatePDF } = await import("./routes/pdf");
    authMiddleware(req, res, () => generatePDF(req, res));
  });

  app.post("/api/employees/batch-generate-pdf", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { batchGeneratePDFs } = await import("./routes/pdf");
    authMiddleware(req, res, () => batchGeneratePDFs(req, res));
  });

  // ============================================================================
  // PHASE 4: BACKUP ROUTES
  // ============================================================================

  // Create backup
  app.post("/api/backups/create", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { createBackup_Handler } = await import("./routes/backup");
    authMiddleware(req, res, () => createBackup_Handler(req, res));
  });

  // List backups
  app.get("/api/backups/list", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { listBackups_Handler } = await import("./routes/backup");
    authMiddleware(req, res, () => listBackups_Handler(req, res));
  });

  // Download backup
  app.get("/api/backups/:backupId", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { downloadBackup_Handler } = await import("./routes/backup");
    authMiddleware(req, res, () => downloadBackup_Handler(req, res));
  });

  // Verify backup
  app.post("/api/backups/:backupId/verify", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { verifyBackup_Handler } = await import("./routes/backup");
    authMiddleware(req, res, () => verifyBackup_Handler(req, res));
  });

  // Get backup statistics
  app.get("/api/backups/statistics", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { getBackupStatistics_Handler } = await import("./routes/backup");
    authMiddleware(req, res, () => getBackupStatistics_Handler(req, res));
  });

  // Cleanup backups
  app.post("/api/backups/cleanup", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { cleanupBackups_Handler } = await import("./routes/backup");
    authMiddleware(req, res, () => cleanupBackups_Handler(req, res));
  });

  // ============================================================================
  // CORRECTION 1: RENEWAL ACTIVATION ROUTES (MANUAL)
  // ============================================================================

  // Create pending renewal
  app.post("/api/renewals/create", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { createPendingRenewal } = await import("./routes/renewals");
    authMiddleware(req, res, () => createPendingRenewal(req, res));
  });

  // Activate pending renewal (manual)
  app.post("/api/renewals/:renewalId/activate", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { activatePendingRenewal } = await import("./routes/renewals");
    authMiddleware(req, res, () => activatePendingRenewal(req, res));
  });

  // List pending renewals
  app.get("/api/renewals/pending", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { listPendingRenewals } = await import("./routes/renewals");
    authMiddleware(req, res, () => listPendingRenewals(req, res));
  });

  // Delete pending renewal
  app.delete("/api/renewals/:renewalId", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { deletePendingRenewal } = await import("./routes/renewals");
    authMiddleware(req, res, () => deletePendingRenewal(req, res));
  });

  // ============================================================================
  // PHASE 4: AWS S3 CLOUD BACKUP ROUTES
  // ============================================================================

  // Get cloud backup status
  app.get("/api/backups/cloud/status", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { getCloudBackupStatus_Handler } = await import("./routes/backup");
    authMiddleware(req, res, () => getCloudBackupStatus_Handler(req, res));
  });

  // Upload backup to S3
  app.post("/api/backups/cloud/upload/:backupId", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { uploadToCloud_Handler } = await import("./routes/backup");
    authMiddleware(req, res, () => uploadToCloud_Handler(req, res));
  });

  // List cloud backups
  app.get("/api/backups/cloud/list", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { listCloudBackups_Handler } = await import("./routes/backup");
    authMiddleware(req, res, () => listCloudBackups_Handler(req, res));
  });

  // Download backup from S3
  app.get("/api/backups/cloud/download/:backupId", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { downloadFromCloud_Handler } = await import("./routes/backup");
    authMiddleware(req, res, () => downloadFromCloud_Handler(req, res));
  });

  // Delete backup from S3
  app.delete("/api/backups/cloud/:backupId", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { deleteCloudBackup_Handler } = await import("./routes/backup");
    authMiddleware(req, res, () => deleteCloudBackup_Handler(req, res));
  });

  // Cleanup cloud backups
  app.post("/api/backups/cloud/cleanup", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { cleanupCloudBackups_Handler } = await import("./routes/backup");
    authMiddleware(req, res, () => cleanupCloudBackups_Handler(req, res));
  });

  // ============================================================================
  // PHASE 3: ALERT ROUTES
  // ============================================================================

  // Get alert statistics
  app.get("/api/alerts/statistics", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { getAlertStatistics_Handler } = await import("./routes/alerts");
    authMiddleware(req, res, () => getAlertStatistics_Handler(req, res));
  });

  // Get expiring habilitations
  app.get("/api/alerts/expiring", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { getExpiringHabilitations_Handler } = await import("./routes/alerts");
    authMiddleware(req, res, () => getExpiringHabilitations_Handler(req, res));
  });

  // Get expiration report
  app.get("/api/alerts/report", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { getExpirationReport_Handler } = await import("./routes/alerts");
    authMiddleware(req, res, () => getExpirationReport_Handler(req, res));
  });

  // Get employee alert status
  app.get("/api/alerts/employee/:empId", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { getEmployeeAlertStatus_Handler } = await import("./routes/alerts");
    authMiddleware(req, res, () => getEmployeeAlertStatus_Handler(req, res));
  });

  // Get critical alerts
  app.get("/api/alerts/critical", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { getCriticalAlerts_Handler } = await import("./routes/alerts");
    authMiddleware(req, res, () => getCriticalAlerts_Handler(req, res));
  });

  // ============================================================================
  // PHASE 2: EMPLOYEE HISTORY ROUTES
  // ============================================================================

  // Get complete history of employee changes
  app.get("/api/employees/:empId/history", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { getEmployeeHistory } = await import("./routes/employeeHistory");
    authMiddleware(req, res, () => getEmployeeHistory(req, res));
  });

  // Get employee state at specific version
  app.get("/api/employees/:empId/history/:version", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { getEmployeeHistoryVersion } = await import("./routes/employeeHistory");
    authMiddleware(req, res, () => getEmployeeHistoryVersion(req, res));
  });

  // Get employee history timeline (simplified for UI)
  app.get("/api/employees/:empId/history/timeline", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { getEmployeeHistoryTimeline } = await import("./routes/employeeHistory");
    authMiddleware(req, res, () => getEmployeeHistoryTimeline(req, res));
  });

  // ============================================================================
  // PHASE 1: AUDIT LOG ROUTES
  // ============================================================================

  // Get all audit logs with filters and pagination
  app.get("/api/audit-logs", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { getAuditLogs_Handler } = await import("./routes/auditLog");
    authMiddleware(req, res, () => getAuditLogs_Handler(req, res));
  });

  // Get single audit log entry
  app.get("/api/audit-logs/:id", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { getAuditLogEntry_Handler } = await import("./routes/auditLog");
    authMiddleware(req, res, () => getAuditLogEntry_Handler(req, res));
  });

  // Export audit logs as JSON
  app.get("/api/audit-logs/export", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { exportAuditLogs_Handler } = await import("./routes/auditLog");
    authMiddleware(req, res, () => exportAuditLogs_Handler(req, res));
  });

  // Get audit history for specific employee
  app.get("/api/audit-logs/employee/:employeeId", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { getEmployeeAuditHistory_Handler } = await import("./routes/auditLog");
    authMiddleware(req, res, () => getEmployeeAuditHistory_Handler(req, res));
  });

  // Get audit history for specific habilitation
  app.get("/api/audit-logs/habilitation/:habilitationId", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { getHabilitationAuditHistory_Handler } = await import("./routes/auditLog");
    authMiddleware(req, res, () => getHabilitationAuditHistory_Handler(req, res));
  });

  // Revert entity to previous state from audit log (CRITICAL FEATURE)
  app.post("/api/audit-logs/:logId/revert", async (req, res) => {
    const { authMiddleware } = await import("./routes/employees");
    const { revertAuditLog_Handler } = await import("./routes/auditLog");
    authMiddleware(req, res, () => revertAuditLog_Handler(req, res));
  });

  return app;
}
