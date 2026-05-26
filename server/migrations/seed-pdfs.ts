import fs from "fs";
import path from "path";
import { db } from "../db-pg";
import * as schema from "../schema";
import { eq } from "drizzle-orm";
import { logger } from "../utils/logger";

// Seeded PDF entries extracted from batch 1 upload (May 2026)
const SEED_ENTRIES: { matricule: string; filename: string }[] = [
  { matricule: "E0049",  filename: "habE0049_seed.pdf" },
  { matricule: "84084",  filename: "hab84084_seed.pdf" },
  { matricule: "E2013",  filename: "habE2013_seed.pdf" },
  { matricule: "32276",  filename: "hab32276_seed.pdf" },
  { matricule: "01999",  filename: "hab01999_seed.pdf" },
  { matricule: "81989",  filename: "hab81989_seed.pdf" },
  { matricule: "03511",  filename: "hab03511_seed.pdf" },
  { matricule: "82743",  filename: "hab82743_seed.pdf" },
  { matricule: "82337",  filename: "hab82337_seed.pdf" },
  { matricule: "84741",  filename: "hab84741_seed.pdf" },
  { matricule: "64828",  filename: "hab64828_seed.pdf" },
  { matricule: "50072",  filename: "hab50072_seed.pdf" },
  { matricule: "83172",  filename: "hab83172_seed.pdf" },
  { matricule: "84066",  filename: "hab84066_seed.pdf" },
  { matricule: "81135",  filename: "hab81135_seed.pdf" },
  { matricule: "53527",  filename: "hab53527_seed.pdf" },
  { matricule: "80748E", filename: "hab80748E_seed.pdf" },
  { matricule: "94481",  filename: "hab94481_seed.pdf" },
  { matricule: "60045",  filename: "hab60045_seed.pdf" },
  { matricule: "03256",  filename: "hab03256_seed.pdf" },
  { matricule: "81122",  filename: "hab81122_seed.pdf" },
  { matricule: "81014",  filename: "hab81014_seed.pdf" },
  { matricule: "62052",  filename: "hab62052_seed.pdf" },
  // Batch 2 — XA division (Oct 2024, exp 2027/2028)
  { matricule: "81293",  filename: "hab81293_seed.pdf" },
  { matricule: "58941",  filename: "hab58941_seed.pdf" },
  { matricule: "85979U", filename: "hab85979U_seed.pdf" },
  { matricule: "45M7J",  filename: "hab45M7J_seed.pdf" },
  { matricule: "83628",  filename: "hab83628_seed.pdf" },
  { matricule: "82306",  filename: "hab82306_seed.pdf" },
  { matricule: "81155",  filename: "hab81155_seed.pdf" },
  { matricule: "85963",  filename: "hab85963_seed.pdf" },
  { matricule: "85887",  filename: "hab85887_seed.pdf" },
  { matricule: "B5665K", filename: "habB5665K_seed.pdf" },
  { matricule: "B5939M", filename: "habB5939M_seed.pdf" },
  // Batch 3
  { matricule: "81628",  filename: "hab81628_seed.pdf" },
  // Batch 4 — from full PDF archive (May 2026)
  { matricule: "84742",  filename: "hab84742_seed.pdf" },
  { matricule: "82019",  filename: "hab82019_seed.pdf" },
  { matricule: "83635",  filename: "hab83635_seed.pdf" },
  { matricule: "00958",  filename: "hab00958_seed.pdf" },
  { matricule: "01587",  filename: "hab01587_seed.pdf" },
  { matricule: "34172",  filename: "hab34172_seed.pdf" },
  { matricule: "31394",  filename: "hab31394_seed.pdf" },
  // HAE XJ Oct 2025 (exp Oct 2026)
  { matricule: "80922",  filename: "hab80922_seed.pdf" },
  { matricule: "81914",  filename: "hab81914_seed.pdf" },
  { matricule: "80045",  filename: "hab80045_seed.pdf" },
  { matricule: "80793",  filename: "hab80793_seed.pdf" },
  { matricule: "78953",  filename: "hab78953_seed.pdf" },
  { matricule: "84715",  filename: "hab84715_seed.pdf" },
  // TST Jan 2026 (exp Dec 2026)
  { matricule: "79195",  filename: "hab79195_seed.pdf" },
  { matricule: "81981",  filename: "hab81981_seed.pdf" },
  { matricule: "82316",  filename: "hab82316_seed.pdf" },
  { matricule: "82637",  filename: "hab82637_seed.pdf" },
  { matricule: "89938",  filename: "hab89938_seed.pdf" },
  { matricule: "84628",  filename: "hab84628_seed.pdf" },
  { matricule: "86034",  filename: "hab86034_seed.pdf" },
  { matricule: "82622",  filename: "hab82622_seed.pdf" },
  // XJ Apr 2026 (exp Aug 2027)
  { matricule: "78677",  filename: "hab78677_seed.pdf" },
  { matricule: "82452",  filename: "hab82452_seed.pdf" },
  { matricule: "84716",  filename: "hab84716_seed.pdf" },
  { matricule: "84801",  filename: "hab84801_seed.pdf" },
  { matricule: "83344",  filename: "hab83344_seed.pdf" },
  { matricule: "81018",  filename: "hab81018_seed.pdf" },
  { matricule: "85401",  filename: "hab85401_seed.pdf" },
  // XJ pratique Apr 2026 (exp Apr 2028)
  { matricule: "84759",  filename: "hab84759_seed.pdf" },
  { matricule: "80908",  filename: "hab80908_seed.pdf" },
  { matricule: "81206",  filename: "hab81206_seed.pdf" },
  { matricule: "80031",  filename: "hab80031_seed.pdf" },
  { matricule: "80000",  filename: "hab80000_seed.pdf" },
  { matricule: "84871",  filename: "hab84871_seed.pdf" },
  { matricule: "78853",  filename: "hab78853_seed.pdf" },
  // XJ Apr 2026 batch 2 (exp Apr 2028)
  { matricule: "76808",  filename: "hab76808_seed.pdf" },
  { matricule: "83980",  filename: "hab83980_seed.pdf" },
  { matricule: "83962",  filename: "hab83962_seed.pdf" },
  { matricule: "79223",  filename: "hab79223_seed.pdf" },
  { matricule: "84412",  filename: "hab84412_seed.pdf" },
  { matricule: "81807",  filename: "hab81807_seed.pdf" },
  { matricule: "82813",  filename: "hab82813_seed.pdf" },
  { matricule: "83399",  filename: "hab83399_seed.pdf" },
  // XA Mar 2026 (exp Mar 2027)
  { matricule: "71088",  filename: "hab71088_seed.pdf" },
  { matricule: "63475",  filename: "hab63475_seed.pdf" },
  { matricule: "63478",  filename: "hab63478_seed.pdf" },
  { matricule: "74411",  filename: "hab74411_seed.pdf" },
  // XC Aug 2024 partie 2 (exp Jul 2027)
  { matricule: "84891",  filename: "hab84891_seed.pdf" },
  { matricule: "85889",  filename: "hab85889_seed.pdf" },
  { matricule: "84033",  filename: "hab84033_seed.pdf" },
  { matricule: "80498",  filename: "hab80498_seed.pdf" },
  { matricule: "85488",  filename: "hab85488_seed.pdf" },
];

export async function runPdfSeedMigration(): Promise<void> {
  const uploadsDir = process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads", "pdfs");
  const seedDir = path.join(path.dirname(new URL(import.meta.url).pathname), "..", "seeds", "pdfs");

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
