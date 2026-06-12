import fs from "fs";
import path from "path";
import { db } from "../db-pg";
import * as schema from "../schema";
import { eq } from "drizzle-orm";
import { logger } from "../utils/logger";
import { buildPdfFilename } from "../utils/pathUtils";

interface CertEntry {
  matricule: string;
  output_file: string;
  version: number;
  page_count: number;
}

interface ProcessReport {
  generated_at: string;
  stats: Record<string, number>;
  certificates: CertEntry[];
  review_queue: Array<{ type: string; pdf_file: string; page_num: number; reason: string; matricule?: string }>;
}

export async function runPdfImportMigration(): Promise<void> {
  const uploadsDir = process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads", "pdfs");
  const reportPath = path.join(uploadsDir, "process-report.json");

  if (!fs.existsSync(reportPath)) return;

  let report: ProcessReport;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  } catch {
    logger.error("app", "import-pdfs: failed to parse process-report.json");
    return;
  }

  let linked = 0;
  let skipped = 0;
  let notFound = 0;

  for (const cert of report.certificates) {
    const filePath = path.join(uploadsDir, cert.output_file);
    if (!fs.existsSync(filePath)) {
      skipped++;
      continue;
    }

    try {
      // Try exact match first
      let emp = await db.query.employees.findFirst({
        where: eq(schema.employees.matricule, cert.matricule),
      });

      // Fuzzy: try without trailing letter if e.g. "83192A"
      if (!emp && /\D$/.test(cert.matricule)) {
        const base = cert.matricule.replace(/[A-Z]$/, "");
        emp = await db.query.employees.findFirst({
          where: eq(schema.employees.matricule, base),
        });
      }

      if (!emp?.currentVersionId) {
        notFound++;
        continue;
      }

      const ver = await db.query.employeeVersions.findFirst({
        where: eq(schema.employeeVersions.id, emp.currentVersionId),
      });
      if (!ver) { notFound++; continue; }

      // Don't overwrite manually uploaded PDFs; do replace old seed files
      if (ver.pdfPath && !ver.pdfPath.endsWith("_seed.pdf")) { skipped++; continue; }

      // Rename the linked file to match the DB's actual version number,
      // so the on-disk `_vN` suffix never desyncs from `version_number`.
      const targetFilename = buildPdfFilename(emp.matricule, ver.versionNumber);
      if (targetFilename !== cert.output_file) {
        const targetPath = path.join(uploadsDir, targetFilename);
        fs.renameSync(filePath, targetPath);
      }

      await db.update(schema.employeeVersions)
        .set({ pdfPath: targetFilename })
        .where(eq(schema.employeeVersions.id, ver.id));

      linked++;
    } catch (err) {
      logger.error("app", `import-pdfs: error linking ${cert.matricule}`, { error: String(err) });
      skipped++;
    }
  }

  const reviewCount = report.review_queue?.length ?? 0;
  logger.info("app", `import-pdfs: ${linked} linked, ${notFound} no match, ${skipped} skipped, ${reviewCount} in review queue`);

  if (reviewCount > 0) {
    logger.warn("app", `import-pdfs: ${reviewCount} items need manual review — see uploads/pdfs/review-queue.json`);
  }
}
