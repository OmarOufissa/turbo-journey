import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "../db-pg";
import * as schema from "../schema";
import { eq } from "drizzle-orm";
import { logger } from "../utils/logger";

// Seeded PDF entries — OCR-extracted from 51 batch PDFs, June 2026.
// Matricule read ONLY from the "Matricule :" label line on each certificate.
// 114 unique habilitation certificates matched. Employees not in DB are skipped at runtime.
// 13 matricules not in official Excel (possibly other divisions): 72682, 76964, 77168,
//   78939, 80335, 81867, 82615, 82925, 84165, 84583, 84959, 85910, 81014 — kept, skipped if no match.
const SEED_ENTRIES: { matricule: string; filename: string }[] = [
  { matricule: "72682", filename: "hab72682_seed.pdf" },
  { matricule: "76759", filename: "hab76759_seed.pdf" },
  { matricule: "76964", filename: "hab76964_seed.pdf" },
  { matricule: "77168", filename: "hab77168_seed.pdf" },
  { matricule: "78939", filename: "hab78939_seed.pdf" },
  { matricule: "78953", filename: "hab78953_seed.pdf" },
  { matricule: "79411", filename: "hab79411_seed.pdf" },
  { matricule: "79677", filename: "hab79677_seed.pdf" },
  { matricule: "79868", filename: "hab79868_seed.pdf" },
  { matricule: "79876", filename: "hab79876_seed.pdf" },
  { matricule: "79917", filename: "hab79917_seed.pdf" },
  { matricule: "79919", filename: "hab79919_seed.pdf" },
  { matricule: "79920", filename: "hab79920_seed.pdf" },
  { matricule: "80045", filename: "hab80045_seed.pdf" },
  { matricule: "80335", filename: "hab80335_seed.pdf" },
  { matricule: "80491", filename: "hab80491_seed.pdf" },
  { matricule: "80559", filename: "hab80559_seed.pdf" },
  { matricule: "80793", filename: "hab80793_seed.pdf" },
  { matricule: "80922", filename: "hab80922_seed.pdf" },
  { matricule: "80924", filename: "hab80924_seed.pdf" },
  { matricule: "80925", filename: "hab80925_seed.pdf" },
  { matricule: "81014", filename: "hab81014_seed.pdf" },
  { matricule: "81107", filename: "hab81107_seed.pdf" },
  { matricule: "81123", filename: "hab81123_seed.pdf" },
  { matricule: "81130", filename: "hab81130_seed.pdf" },
  { matricule: "81134", filename: "hab81134_seed.pdf" },
  { matricule: "81135", filename: "hab81135_seed.pdf" },
  { matricule: "81155", filename: "hab81155_seed.pdf" },
  { matricule: "81208", filename: "hab81208_seed.pdf" },
  { matricule: "81293", filename: "hab81293_seed.pdf" },
  { matricule: "81371", filename: "hab81371_seed.pdf" },
  { matricule: "81581", filename: "hab81581_seed.pdf" },
  { matricule: "81582", filename: "hab81582_seed.pdf" },
  { matricule: "81594", filename: "hab81594_seed.pdf" },
  { matricule: "81632", filename: "hab81632_seed.pdf" },
  { matricule: "81657", filename: "hab81657_seed.pdf" },
  { matricule: "81867", filename: "hab81867_seed.pdf" },
  { matricule: "81913", filename: "hab81913_seed.pdf" },
  { matricule: "81914", filename: "hab81914_seed.pdf" },
  { matricule: "81920", filename: "hab81920_seed.pdf" },
  { matricule: "81999", filename: "hab81999_seed.pdf" },
  { matricule: "82019", filename: "hab82019_seed.pdf" },
  { matricule: "82094", filename: "hab82094_seed.pdf" },
  { matricule: "82302", filename: "hab82302_seed.pdf" },
  { matricule: "82304", filename: "hab82304_seed.pdf" },
  { matricule: "82306", filename: "hab82306_seed.pdf" },
  { matricule: "82316", filename: "hab82316_seed.pdf" },
  { matricule: "82342", filename: "hab82342_seed.pdf" },
  { matricule: "82376", filename: "hab82376_seed.pdf" },
  { matricule: "82386", filename: "hab82386_seed.pdf" },
  { matricule: "82446", filename: "hab82446_seed.pdf" },
  { matricule: "82472", filename: "hab82472_seed.pdf" },
  { matricule: "82513", filename: "hab82513_seed.pdf" },
  { matricule: "82552", filename: "hab82552_seed.pdf" },
  { matricule: "82615", filename: "hab82615_seed.pdf" },
  { matricule: "82622", filename: "hab82622_seed.pdf" },
  { matricule: "82637", filename: "hab82637_seed.pdf" },
  { matricule: "82641", filename: "hab82641_seed.pdf" },
  { matricule: "82649", filename: "hab82649_seed.pdf" },
  { matricule: "82743", filename: "hab82743_seed.pdf" },
  { matricule: "82790", filename: "hab82790_seed.pdf" },
  { matricule: "82925", filename: "hab82925_seed.pdf" },
  { matricule: "83172", filename: "hab83172_seed.pdf" },
  { matricule: "83192", filename: "hab83192_seed.pdf" },
  { matricule: "83300", filename: "hab83300_seed.pdf" },
  { matricule: "83513", filename: "hab83513_seed.pdf" },
  { matricule: "83526", filename: "hab83526_seed.pdf" },
  { matricule: "83527", filename: "hab83527_seed.pdf" },
  { matricule: "83559", filename: "hab83559_seed.pdf" },
  { matricule: "83601", filename: "hab83601_seed.pdf" },
  { matricule: "83628", filename: "hab83628_seed.pdf" },
  { matricule: "83630", filename: "hab83630_seed.pdf" },
  { matricule: "83635", filename: "hab83635_seed.pdf" },
  { matricule: "83781", filename: "hab83781_seed.pdf" },
  { matricule: "83878", filename: "hab83878_seed.pdf" },
  { matricule: "83945", filename: "hab83945_seed.pdf" },
  { matricule: "84002", filename: "hab84002_seed.pdf" },
  { matricule: "84004", filename: "hab84004_seed.pdf" },
  { matricule: "84005", filename: "hab84005_seed.pdf" },
  { matricule: "84063", filename: "hab84063_seed.pdf" },
  { matricule: "84066", filename: "hab84066_seed.pdf" },
  { matricule: "84071", filename: "hab84071_seed.pdf" },
  { matricule: "84073", filename: "hab84073_seed.pdf" },
  { matricule: "84084", filename: "hab84084_seed.pdf" },
  { matricule: "84165", filename: "hab84165_seed.pdf" },
  { matricule: "84583", filename: "hab84583_seed.pdf" },
  { matricule: "84683", filename: "hab84683_seed.pdf" },
  { matricule: "84705", filename: "hab84705_seed.pdf" },
  { matricule: "84715", filename: "hab84715_seed.pdf" },
  { matricule: "84716", filename: "hab84716_seed.pdf" },
  { matricule: "84741", filename: "hab84741_seed.pdf" },
  { matricule: "84742", filename: "hab84742_seed.pdf" },
  { matricule: "84743", filename: "hab84743_seed.pdf" },
  { matricule: "84828", filename: "hab84828_seed.pdf" },
  { matricule: "84851", filename: "hab84851_seed.pdf" },
  { matricule: "84881", filename: "hab84881_seed.pdf" },
  { matricule: "84949", filename: "hab84949_seed.pdf" },
  { matricule: "84959", filename: "hab84959_seed.pdf" },
  { matricule: "85024", filename: "hab85024_seed.pdf" },
  { matricule: "85031", filename: "hab85031_seed.pdf" },
  { matricule: "85045", filename: "hab85045_seed.pdf" },
  { matricule: "85072", filename: "hab85072_seed.pdf" },
  { matricule: "85083", filename: "hab85083_seed.pdf" },
  { matricule: "85495", filename: "hab85495_seed.pdf" },
  { matricule: "85496", filename: "hab85496_seed.pdf" },
  { matricule: "85860", filename: "hab85860_seed.pdf" },
  { matricule: "85862", filename: "hab85862_seed.pdf" },
  { matricule: "85863", filename: "hab85863_seed.pdf" },
  { matricule: "85887", filename: "hab85887_seed.pdf" },
  { matricule: "85888", filename: "hab85888_seed.pdf" },
  { matricule: "85908", filename: "hab85908_seed.pdf" },
  { matricule: "85910", filename: "hab85910_seed.pdf" },
  { matricule: "85939", filename: "hab85939_seed.pdf" },
  { matricule: "85941", filename: "hab85941_seed.pdf" },
];

export async function runPdfSeedMigration(): Promise<void> {
  const uploadsDir = process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads", "pdfs");
  const seedDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "seeds", "pdfs");

  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  let copied = 0;
  let linked = 0;
  let skipped = 0;

  for (const entry of SEED_ENTRIES) {
    const srcPath = path.join(seedDir, entry.filename);
    if (!fs.existsSync(srcPath)) {
      skipped++;
      continue;
    }

    const destPath = path.join(uploadsDir, entry.filename);

    // Copy file to uploads dir if not already there
    if (!fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
      copied++;
    }

    // Skip if a proper versioned file already exists for this employee in uploads
    const hasVersioned = fs.readdirSync(uploadsDir)
      .some(f => f.startsWith(`hab${entry.matricule}_v`) && f.endsWith(".pdf"));
    if (hasVersioned) { skipped++; continue; }

    // Find employee and update pdfPath on current version (only if no PDF already set)
    try {
      const emp = await db.query.employees.findFirst({
        where: eq(schema.employees.matricule, entry.matricule),
      });
      if (!emp || !emp.currentVersionId) { skipped++; continue; }

      const ver = await db.query.employeeVersions.findFirst({
        where: eq(schema.employeeVersions.id, emp.currentVersionId),
      });
      if (!ver) { skipped++; continue; }

      // Don't overwrite a manually uploaded PDF
      if (ver.pdfPath) { skipped++; continue; }

      await db.update(schema.employeeVersions)
        .set({ pdfPath: entry.filename })
        .where(eq(schema.employeeVersions.id, ver.id));
      linked++;
    } catch {
      skipped++;
    }
  }

  logger.info("app", `PDF seed migration: ${copied} copied, ${linked} linked, ${skipped} skipped`);
}
