/**
 * PHASE 1: PDF MANAGEMENT WITH AUDIT LOGGING
 * 
 * All PDF operations (upload, delete, batch) are wrapped in transactions
 * with mandatory audit logging. If audit logging fails, transaction rolls back.
 * 
 * Pattern: Validate → Transaction → Mutate → Audit → Commit/Rollback
 */

import { RequestHandler } from "express";
import { db, withAuditTransaction } from "../db-pg";
import * as schema from "../schema";
import { eq } from "drizzle-orm";
import { logAuditActionSafe } from "../services/auditService";
import { generateHabilitationPdf, batchGeneratePdfs } from "../services/pdfService";
import path from "path";
import fs from "fs";

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "pdfs");

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get habilitation with employee matricule for audit logging
 * CORRECTION 2: Uses stCodes/htCodes instead of legacy type field
 */
async function getHabilitationWithEmployee(habId: number, txDb = db) {
  const result = await txDb
    .select({
      habId: schema.habilitations.id,
      habStCodes: schema.habilitations.stCodes,
      habHtCodes: schema.habilitations.htCodes,
      habPdfPath: schema.habilitations.pdfPath,
      employeeId: schema.habilitations.employeeId,
      matricule: schema.employees.matricule,
    })
    .from(schema.habilitations)
    .leftJoin(schema.employees, eq(schema.employees.id, schema.habilitations.employeeId))
    .where(eq(schema.habilitations.id, habId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/**
 * Get employee with current version for PDF generation
 * CRITICAL: Fetches from employee_versions to get full snapshot data
 */
async function getEmployeeWithVersion(employeeId: number, txDb = db) {
  const result = await txDb
    .select({
      employeeId: schema.employees.id,
      matricule: schema.employees.matricule,
      currentVersionId: schema.employees.currentVersionId,
      versionData: schema.employeeVersions.snapshotData,
      versionNumber: schema.employeeVersions.versionNumber,
    })
    .from(schema.employees)
    .leftJoin(
      schema.employeeVersions,
      eq(schema.employeeVersions.id, schema.employees.currentVersionId)
    )
    .where(eq(schema.employees.id, employeeId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

// ============================================================================
// PDF UPLOAD ENDPOINT WITH AUDIT LOGGING
// ============================================================================

/**
 * POST /api/habilitations/upload-pdf
 * Upload PDF for habilitation with transaction-safe audit logging
 */
export const uploadPDF: RequestHandler = async (req, res) => {
  try {
    const file = (req as any).file;
    const { habilitationId } = req.body;

    // Validation
    if (!file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    if (!habilitationId) {
      return res.status(400).json({ message: "Habilitation ID required" });
    }

    const habId = parseInt(habilitationId);
    if (isNaN(habId)) {
      return res.status(400).json({ message: "Invalid habilitation ID" });
    }

    // Check if habilitation exists (pre-transaction)
    const habData = await db
      .select()
      .from(schema.habilitations)
      .where(eq(schema.habilitations.id, habId))
      .limit(1);

    if (!habData.length) {
      // Clean up uploaded file
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      return res.status(404).json({ message: "Habilitation not found" });
    }

    // Execute in transaction with mandatory audit logging
    const result = await withAuditTransaction(async (txDb) => {
      // Fetch habilitation with employee details
      const hab = await getHabilitationWithEmployee(habId, txDb);
      if (!hab) {
        throw new Error("Habilitation not found during transaction");
      }

      // Generate unique filename
      const timestamp = Date.now();
      const filename = `hab_${habId}_${timestamp}.pdf`;
      const filepath = path.join(UPLOAD_DIR, filename);

      // Move file to upload directory
      fs.renameSync(file.path, filepath);

      // Update database with PDF path
      const pdfPath = `/uploads/pdfs/${filename}`;
      const updateResult = await txDb
        .update(schema.habilitations)
        .set({
          pdfPath,
          updatedAt: new Date(),
        })
        .where(eq(schema.habilitations.id, habId))
        .returning({ id: schema.habilitations.id });

      if (!updateResult.length) {
        throw new Error("Failed to update habilitation with PDF path");
      }

      // Log audit action: UPLOAD_PDF
      // oldValues = previous state (may have had old PDF)
      // newValues = file metadata
      const oldValues = hab.habPdfPath
        ? {
            pdfPath: hab.habPdfPath,
          }
        : null;

      const newValues = {
        pdfPath,
        filename,
        size: file.size,
        mimetype: file.mimetype,
        uploadedAt: new Date().toISOString(),
      };

      await logAuditActionSafe(
        1, // hardcoded to single-user for now
        "UPLOAD_PDF",
        "habilitation",
        habId,
        hab.matricule || null,
        oldValues,
        newValues
      );

      return {
        pdfPath,
        filename,
      };
    });

    res.json({
      message: "PDF uploaded successfully",
      pdfPath: result.pdfPath,
      filename: result.filename,
    });
  } catch (err) {
    console.error("Error uploading PDF:", err);
    
    // Clean up file if it exists
    const file = (req as any).file;
    if (file && fs.existsSync(file.path)) {
      try {
        fs.unlinkSync(file.path);
      } catch (cleanupErr) {
        console.error("Error cleaning up file:", cleanupErr);
      }
    }

    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      message: "Error uploading PDF",
      error: errorMsg,
    });
  }
};

// ============================================================================
// PDF DELETE ENDPOINT WITH AUDIT LOGGING
// ============================================================================

/**
 * DELETE /api/habilitations/:habId/pdf
 * Delete PDF for habilitation with transaction-safe audit logging
 * CORRECTION 5: Soft delete (mark deleted, keep file for undo)
 */
export const deletePDF: RequestHandler = async (req, res) => {
  try {
    const { habId } = req.params;

    const habId_num = parseInt(habId);
    if (isNaN(habId_num)) {
      return res.status(400).json({ message: "Invalid habilitation ID" });
    }

    // Fetch habilitation data before transaction
    const habData = await getHabilitationWithEmployee(habId_num);
    if (!habData) {
      return res.status(404).json({ message: "Habilitation not found" });
    }

    if (!habData.habPdfPath) {
      return res.status(404).json({ message: "No PDF attached to this habilitation" });
    }

    // Execute in transaction with mandatory audit logging
    await withAuditTransaction(async (txDb) => {
      // Re-fetch within transaction to ensure consistency
      const hab = await getHabilitationWithEmployee(habId_num, txDb);
      if (!hab || !hab.habPdfPath) {
        throw new Error("PDF not found or already deleted");
      }

      // CORRECTION 5: Soft delete - mark PDF as deleted instead of removing file
      // This allows undo functionality by restoring the deleted flag
      const oldValues = {
        pdfPath: hab.habPdfPath,
        filename: path.basename(hab.habPdfPath),
        pdfUploadedAt: new Date().toISOString(),
      };

      // Update database - mark PDF as deleted (soft delete)
      // File remains on disk for potential recovery via undo
      await txDb
        .update(schema.habilitations)
        .set({
          deleted: true, // Soft delete flag
          updatedAt: new Date(),
        })
        .where(eq(schema.habilitations.id, habId_num));

      // Log audit action: DELETE_PDF
      await logAuditActionSafe(
        1, // hardcoded to single-user for now
        "DELETE_PDF",
        "habilitation",
        habId_num,
        hab.matricule || null,
        oldValues,
        { deleted: true, deletedAt: new Date().toISOString() }
      );
    });

    res.json({ message: "PDF deleted successfully" });
  } catch (err) {
    console.error("Error deleting PDF:", err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      message: "Error deleting PDF",
      error: errorMsg,
    });
  }
};

/**
 * POST /api/habilitations/:habId/pdf/restore
 * Restore a soft-deleted PDF (Undo delete)
 * CORRECTION 5: Undo for PDF deletion
 */
export const restorePDF: RequestHandler = async (req, res) => {
  try {
    const { habId } = req.params;

    const habId_num = parseInt(habId);
    if (isNaN(habId_num)) {
      return res.status(400).json({ message: "Invalid habilitation ID" });
    }

    // Fetch habilitation data before transaction
    const habData = await getHabilitationWithEmployee(habId_num);
    if (!habData) {
      return res.status(404).json({ message: "Habilitation not found" });
    }

    if (!habData.habPdfPath) {
      return res.status(404).json({ message: "No PDF to restore" });
    }

    // Execute in transaction with mandatory audit logging
    await withAuditTransaction(async (txDb) => {
      // Re-fetch within transaction
      const hab = await getHabilitationWithEmployee(habId_num, txDb);
      if (!hab || !hab.habPdfPath) {
        throw new Error("PDF not found");
      }

      // Verify file still exists on disk
      const filename = path.basename(hab.habPdfPath);
      const filepath = path.join(UPLOAD_DIR, filename);

      if (!fs.existsSync(filepath)) {
        throw new Error("PDF file not found on disk - cannot restore");
      }

      // Restore PDF by unmarking the deleted flag
      await txDb
        .update(schema.habilitations)
        .set({
          deleted: false, // Restore from soft delete
          updatedAt: new Date(),
        })
        .where(eq(schema.habilitations.id, habId_num));

      // Log audit action: UNDO_DELETE_PDF
      await logAuditActionSafe(
        1, // hardcoded to single-user for now
        "UNDO_DELETE_PDF",
        "habilitation",
        habId_num,
        hab.matricule || null,
        { deleted: true },
        { deleted: false, restoredAt: new Date().toISOString() }
      );
    });

    res.json({ message: "PDF restored successfully" });
  } catch (err) {
    console.error("Error restoring PDF:", err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      message: "Error restoring PDF",
      error: errorMsg,
    });
  }
};

// ============================================================================
// BATCH PDF UPLOAD WITH AUDIT LOGGING
// ============================================================================

/**
 * POST /api/habilitations/batch-upload-pdf
 * Upload PDFs for multiple habilitations with transaction-safe audit logging
 * All-or-nothing: if any upload fails, entire batch is rolled back
 */
export const batchUploadPDF: RequestHandler = async (req, res) => {
  try {
    const files = (req as any).files;
    const { habilitationIds } = req.body;

    // Validation
    if (!files || files.length === 0) {
      return res.status(400).json({ message: "No files uploaded" });
    }

    if (!habilitationIds || !Array.isArray(habilitationIds)) {
      return res.status(400).json({ message: "Habilitation IDs required" });
    }

    if (files.length !== habilitationIds.length) {
      return res.status(400).json({
        message: "Number of files must match number of habilitation IDs",
      });
    }

    // Parse habilitation IDs
    const habIds = habilitationIds.map((id: any) => {
      const parsed = parseInt(id);
      if (isNaN(parsed)) {
        throw new Error(`Invalid habilitation ID: ${id}`);
      }
      return parsed;
    });

    // Execute in transaction with mandatory audit logging (all-or-nothing)
    const results = await withAuditTransaction(async (txDb) => {
      const uploaded = [];
      const auditEntries = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const habId = habIds[i];

        // Fetch habilitation within transaction
        const hab = await getHabilitationWithEmployee(habId, txDb);
        if (!hab) {
          throw new Error(`Habilitation ${habId} not found`);
        }

        // Generate unique filename
        const timestamp = Date.now();
        const filename = `hab_${habId}_${timestamp}.pdf`;
        const filepath = path.join(UPLOAD_DIR, filename);

        // Move file to upload directory
        fs.renameSync(file.path, filepath);

        // Update database with PDF path
        const pdfPath = `/uploads/pdfs/${filename}`;
        await txDb
          .update(schema.habilitations)
          .set({
            pdfPath,
            updatedAt: new Date(),
          })
          .where(eq(schema.habilitations.id, habId));

        // Log audit action: UPLOAD_PDF for each file
        const newValues = {
          pdfPath,
          filename,
          size: file.size,
          mimetype: file.mimetype,
          uploadedAt: new Date().toISOString(),
        };

        const auditLogId = await logAuditActionSafe(
          1, // hardcoded to single-user for now
          "UPLOAD_PDF",
          "habilitation",
          habId,
          hab.matricule || null,
          null, // oldValues (assuming no previous PDF)
          newValues
        );

        uploaded.push({
          habilitationId: habId,
          filename,
          pdfPath,
          auditLogId,
        });

        auditEntries.push(auditLogId);
      }

      // If we get here, entire batch succeeded
      return {
        uploaded,
        auditEntries,
      };
    });

    res.json({
      message: "Batch PDF upload completed successfully",
      uploaded: results.uploaded.length,
      files: results.uploaded,
      auditEntries: results.auditEntries,
    });
  } catch (err) {
    console.error("Error in batch PDF upload:", err);

    // Clean up uploaded files on error
    const files = (req as any).files;
    if (files && Array.isArray(files)) {
      for (const file of files) {
        if (fs.existsSync(file.path)) {
          try {
            fs.unlinkSync(file.path);
          } catch (cleanupErr) {
            console.error("Error cleaning up file:", cleanupErr);
          }
        }
      }
    }

    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      message: "Error in batch PDF upload",
      error: errorMsg,
      note: "No files were processed due to validation error. Transaction rolled back.",
    });
  }
};

// ============================================================================
// PDF GENERATION ENDPOINT WITH AUDIT LOGGING
// ============================================================================

/**
 * POST /api/employees/:employeeId/generate-pdf
 * Generate PDF from employee version snapshot with audit logging
 * CRITICAL: Uses ONLY employee_versions data (never raw employee fields)
 */
export const generatePDF: RequestHandler = async (req, res) => {
  try {
    const { employeeId } = req.params;

    const empId = parseInt(employeeId);
    if (isNaN(empId)) {
      return res.status(400).json({ message: "Invalid employee ID" });
    }

    // Fetch employee with current version (pre-transaction)
    const empData = await getEmployeeWithVersion(empId);
    if (!empData) {
      return res.status(404).json({ message: "Employee not found" });
    }

    if (!empData.versionData || !empData.versionNumber) {
      return res.status(400).json({ message: "Employee has no version data" });
    }

    // Extract snapshot data
    const snapshot = empData.versionData as any;

    // Validate snapshot has required fields
    if (!snapshot.matricule || !snapshot.prenom || !snapshot.nom) {
      return res.status(400).json({ message: "Employee snapshot missing required fields" });
    }

    // Execute in transaction with mandatory audit logging
    const result = await withAuditTransaction(async (txDb) => {
      try {
        // Generate PDF from snapshot
        const { pdfPath, pdfSize } = await generateHabilitationPdf(
          snapshot,
          empData.versionNumber
        );

        // Update all habilitations for this employee with the generated PDF path
        const fullPdfPath = `/uploads/pdfs/${pdfPath}`;
        await txDb
          .update(schema.habilitations)
          .set({
            pdfPath: fullPdfPath,
            pdfUploadedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.habilitations.employeeId, empId));

        // Log audit action: PDF_GENERATE
        await logAuditActionSafe(
          1, // hardcoded to single-user for now
          "PDF_GENERATE",
          "employee",
          empId,
          empData.matricule,
          null,
          {
            pdfPath: fullPdfPath,
            filename: pdfPath,
            size: pdfSize,
            versionNumber: empData.versionNumber,
            generatedAt: new Date().toISOString(),
          }
        );

        return {
          pdfPath: fullPdfPath,
          filename: pdfPath,
          size: pdfSize,
        };
      } catch (genErr) {
        throw new Error(
          `PDF generation failed: ${genErr instanceof Error ? genErr.message : String(genErr)}`
        );
      }
    });

    res.json({
      message: "PDF generated successfully",
      pdfPath: result.pdfPath,
      filename: result.filename,
      size: result.size,
    });
  } catch (err) {
    console.error("Error generating PDF:", err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      message: "Error generating PDF",
      error: errorMsg,
    });
  }
};

/**
 * POST /api/employees/batch-generate-pdf
 * Generate PDFs for multiple employees or all missing PDFs
 */
export const batchGeneratePDFs: RequestHandler = async (req, res) => {
  try {
    const { employeeIds, generateMissingOnly } = req.body;

    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ message: "Employee IDs array required" });
    }

    // Fetch all employees with their versions
    const employees = await Promise.all(
      employeeIds.map((id: any) => getEmployeeWithVersion(parseInt(id)))
    );

    const validEmployees = employees.filter(
      (emp) => emp && emp.versionData && emp.versionNumber
    );

    if (validEmployees.length === 0) {
      return res.status(400).json({ message: "No valid employees found" });
    }

    // Generate PDFs
    const snapshots = validEmployees.map((emp) => ({
      snapshot: emp.versionData,
      versionNumber: emp.versionNumber,
    }));

    const { generated, errors } = await batchGeneratePdfs(snapshots);

    // Log batch operation
    if (generated > 0) {
      await withAuditTransaction(async (txDb) => {
        for (const emp of validEmployees.slice(0, generated)) {
          const empId = emp.employeeId;
          const pdfPath = `/uploads/pdfs/hab${emp.matricule}_v${emp.versionNumber}.pdf`;

          // Update employee habilitations with PDF path
          await txDb
            .update(schema.habilitations)
            .set({
              pdfPath,
              pdfUploadedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(schema.habilitations.employeeId, empId));

          // Log audit
          await logAuditActionSafe(
            1,
            "PDF_GENERATE",
            "employee",
            empId,
            emp.matricule,
            null,
            {
              pdfPath,
              versionNumber: emp.versionNumber,
              batchOperation: true,
              generatedAt: new Date().toISOString(),
            }
          );
        }
      });
    }

    res.json({
      message: "Batch PDF generation completed",
      generated,
      total: validEmployees.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error("Error in batch PDF generation:", err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({
      message: "Error in batch PDF generation",
      error: errorMsg,
    });
  }
};
