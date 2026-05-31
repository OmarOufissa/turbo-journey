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
  { matricule: "81999",  filename: "hab81999_seed.pdf" },
  { matricule: "81989",  filename: "hab81989_seed.pdf" },
  { matricule: "83511",  filename: "hab83511_seed.pdf" },
  { matricule: "82743",  filename: "hab82743_seed.pdf" },
  { matricule: "82337",  filename: "hab82337_seed.pdf" },
  { matricule: "84741",  filename: "hab84741_seed.pdf" },
  { matricule: "84828",  filename: "hab84828_seed.pdf" },
  { matricule: "85072",  filename: "hab85072_seed.pdf" },
  { matricule: "83172",  filename: "hab83172_seed.pdf" },
  { matricule: "84066",  filename: "hab84066_seed.pdf" },
  { matricule: "81135",  filename: "hab81135_seed.pdf" },
  { matricule: "83527",  filename: "hab83527_seed.pdf" },
  { matricule: "80748E", filename: "hab80748E_seed.pdf" },
  { matricule: "94481",  filename: "hab94481_seed.pdf" },
  { matricule: "03256",  filename: "hab03256_seed.pdf" },
  { matricule: "81122",  filename: "hab81122_seed.pdf" },
  { matricule: "81123",  filename: "hab81123_seed.pdf" },
  { matricule: "81014",  filename: "hab81014_seed.pdf" },
  { matricule: "62052",  filename: "hab62052_seed.pdf" },
  // Batch 2 — XA division (Oct 2024, exp 2027/2028)
  { matricule: "81293",  filename: "hab81293_seed.pdf" },
  { matricule: "85941",  filename: "hab85941_seed.pdf" },
  { matricule: "85978", filename: "hab85978_seed.pdf" },
  { matricule: "85872",  filename: "hab85872_seed.pdf" },
  { matricule: "83628",  filename: "hab83628_seed.pdf" },
  { matricule: "82306",  filename: "hab82306_seed.pdf" },
  { matricule: "81155",  filename: "hab81155_seed.pdf" },
  { matricule: "85863",  filename: "hab85863_seed.pdf" },
  { matricule: "85887",  filename: "hab85887_seed.pdf" },
  { matricule: "85865", filename: "hab85865_seed.pdf" },
  // Batch 3
  { matricule: "81628",  filename: "hab81628_seed.pdf" },
  // Batch 4 — from full PDF archive (May 2026)
  { matricule: "84742",  filename: "hab84742_seed.pdf" },
  { matricule: "82019",  filename: "hab82019_seed.pdf" },
  { matricule: "83635",  filename: "hab83635_seed.pdf" },
  { matricule: "00958",  filename: "hab00958_seed.pdf" },
  { matricule: "01587",  filename: "hab01587_seed.pdf" },
  { matricule: "84072",  filename: "hab84072_seed.pdf" },
  // HAE XJ Oct 2025 (exp Oct 2026)
  { matricule: "80922",  filename: "hab80922_seed.pdf" },
  { matricule: "81914",  filename: "hab81914_seed.pdf" },
  { matricule: "80045",  filename: "hab80045_seed.pdf" },
  { matricule: "80793",  filename: "hab80793_seed.pdf" },
  { matricule: "84715",  filename: "hab84715_seed.pdf" },
  // TST Jan 2026 (exp Dec 2026)
  { matricule: "81981",  filename: "hab81981_seed.pdf" },
  { matricule: "82316",  filename: "hab82316_seed.pdf" },
  { matricule: "82637",  filename: "hab82637_seed.pdf" },
  { matricule: "89938",  filename: "hab89938_seed.pdf" },
  { matricule: "85024",  filename: "hab85024_seed.pdf" },
  { matricule: "82622",  filename: "hab82622_seed.pdf" },
  // XJ Apr 2026 (exp Aug 2027)
  { matricule: "78677",  filename: "hab78677_seed.pdf" },
  { matricule: "83192",  filename: "hab83192_seed.pdf" },
  { matricule: "84716",  filename: "hab84716_seed.pdf" },
  { matricule: "83344",  filename: "hab83344_seed.pdf" },
  { matricule: "81915",  filename: "hab81915_seed.pdf" },
  { matricule: "80491",  filename: "hab80491_seed.pdf" },
  // XJ pratique Apr 2026 (exp Apr 2028)
  { matricule: "84705",  filename: "hab84705_seed.pdf" },
  { matricule: "85908",  filename: "hab85908_seed.pdf" },
  { matricule: "81208",  filename: "hab81208_seed.pdf" },
  { matricule: "85031",  filename: "hab85031_seed.pdf" },
  { matricule: "80000",  filename: "hab80000_seed.pdf" },
  // XJ Apr 2026 batch 2 (exp Apr 2028)
  { matricule: "76808",  filename: "hab76808_seed.pdf" },
  { matricule: "83980",  filename: "hab83980_seed.pdf" },
  { matricule: "83962",  filename: "hab83962_seed.pdf" },
  { matricule: "79920",  filename: "hab79920_seed.pdf" },
  { matricule: "84743",  filename: "hab84743_seed.pdf" },
  { matricule: "81807",  filename: "hab81807_seed.pdf" },
  { matricule: "82813",  filename: "hab82813_seed.pdf" },
  { matricule: "83300",  filename: "hab83300_seed.pdf" },
  // XA Mar 2026 (exp Mar 2027)
  { matricule: "79868",  filename: "hab79868_seed.pdf" },
  // XC Aug 2024 partie 2 (exp Jul 2027)
  { matricule: "84981",  filename: "hab84981_seed.pdf" },
  { matricule: "85888",  filename: "hab85888_seed.pdf" },
  { matricule: "84923",  filename: "hab84923_seed.pdf" },
  { matricule: "85495",  filename: "hab85495_seed.pdf" },
  { matricule: "85488",  filename: "hab85488_seed.pdf" },
  // Batch 5 — XA large archive (Oct 2024, exp Oct 2027)
  { matricule: "63025",  filename: "hab63025_seed.pdf" },
  { matricule: "88941",  filename: "hab88941_seed.pdf" },
  { matricule: "88965K", filename: "hab88965K_seed.pdf" },
  { matricule: "48897",  filename: "hab48897_seed.pdf" },
  // XA dossier complet Mar 2026
  { matricule: "84959",  filename: "hab84959_seed.pdf" },
  { matricule: "79876",  filename: "hab79876_seed.pdf" },
  { matricule: "84683",  filename: "hab84683_seed.pdf" },
  { matricule: "79411",  filename: "hab79411_seed.pdf" },
  { matricule: "81582",  filename: "hab81582_seed.pdf" },
  { matricule: "84073",  filename: "hab84073_seed.pdf" },
  { matricule: "83630",  filename: "hab83630_seed.pdf" },
  { matricule: "81632",  filename: "hab81632_seed.pdf" },
  // XC Aug 2024 full batch (exp Aug 2027)
  { matricule: "80237",  filename: "hab80237_seed.pdf" },
  { matricule: "19850",  filename: "hab19850_seed.pdf" },
  { matricule: "80925",  filename: "hab80925_seed.pdf" },
  { matricule: "83407",  filename: "hab83407_seed.pdf" },
  { matricule: "79117",  filename: "hab79117_seed.pdf" },
  { matricule: "78983",  filename: "hab78983_seed.pdf" },
  { matricule: "82323",  filename: "hab82323_seed.pdf" },
  { matricule: "84071",  filename: "hab84071_seed.pdf" },
  { matricule: "84063",  filename: "hab84063_seed.pdf" },
  { matricule: "80472",  filename: "hab80472_seed.pdf" },
  { matricule: "82262",  filename: "hab82262_seed.pdf" },
  { matricule: "76291",  filename: "hab76291_seed.pdf" },
  { matricule: "80537",  filename: "hab80537_seed.pdf" },
  { matricule: "81913",  filename: "hab81913_seed.pdf" },
  { matricule: "82288",  filename: "hab82288_seed.pdf" },
  { matricule: "81998",  filename: "hab81998_seed.pdf" },
  { matricule: "74984",  filename: "hab74984_seed.pdf" },
  { matricule: "77168",  filename: "hab77168_seed.pdf" },
  { matricule: "78234",  filename: "hab78234_seed.pdf" },
  { matricule: "82094",  filename: "hab82094_seed.pdf" },
  { matricule: "82302",  filename: "hab82302_seed.pdf" },
  { matricule: "70495",  filename: "hab70495_seed.pdf" },
  { matricule: "83601",  filename: "hab83601_seed.pdf" },
  { matricule: "78952",  filename: "hab78952_seed.pdf" },
  { matricule: "82450",  filename: "hab82450_seed.pdf" },
  { matricule: "32448",  filename: "hab32448_seed.pdf" },
  { matricule: "84004",  filename: "hab84004_seed.pdf" },
  { matricule: "84002",  filename: "hab84002_seed.pdf" },
  { matricule: "03009",  filename: "hab03009_seed.pdf" },
  { matricule: "83781",  filename: "hab83781_seed.pdf" },
  { matricule: "81107",  filename: "hab81107_seed.pdf" },
  { matricule: "81011",  filename: "hab81011_seed.pdf" },
  { matricule: "78750",  filename: "hab78750_seed.pdf" },
  { matricule: "81134",  filename: "hab81134_seed.pdf" },
  { matricule: "81980",  filename: "hab81980_seed.pdf" },
  { matricule: "80345",  filename: "hab80345_seed.pdf" },
  { matricule: "82304",  filename: "hab82304_seed.pdf" },
  { matricule: "83013",  filename: "hab83013_seed.pdf" },
  { matricule: "83419",  filename: "hab83419_seed.pdf" },
  { matricule: "81126",  filename: "hab81126_seed.pdf" },
  { matricule: "83008",  filename: "hab83008_seed.pdf" },
  { matricule: "79274",  filename: "hab79274_seed.pdf" },
  { matricule: "83629",  filename: "hab83629_seed.pdf" },
  { matricule: "80924",  filename: "hab80924_seed.pdf" },
  { matricule: "84003",  filename: "hab84003_seed.pdf" },
  { matricule: "83515",  filename: "hab83515_seed.pdf" },
  { matricule: "84005",  filename: "hab84005_seed.pdf" },
  { matricule: "82400",  filename: "hab82400_seed.pdf" },
  { matricule: "81130",  filename: "hab81130_seed.pdf" },
  { matricule: "83945",  filename: "hab83945_seed.pdf" },
  { matricule: "81136",  filename: "hab81136_seed.pdf" },
  { matricule: "82041",  filename: "hab82041_seed.pdf" },
  { matricule: "82817",  filename: "hab82817_seed.pdf" },
  { matricule: "80263",  filename: "hab80263_seed.pdf" },
  { matricule: "75952",  filename: "hab75952_seed.pdf" },
  { matricule: "80460",  filename: "hab80460_seed.pdf" },
  // Batch 6 — remaining archives (May 2026)
  { matricule: "E0649",  filename: "habE0649_seed.pdf" },
  { matricule: "01969",  filename: "hab01969_seed.pdf" },
  { matricule: "84881",  filename: "hab84881_seed.pdf" },
  { matricule: "85045",  filename: "hab85045_seed.pdf" },
  { matricule: "03026",  filename: "hab03026_seed.pdf" },
  { matricule: "82552",  filename: "hab82552_seed.pdf" },
  { matricule: "82311",  filename: "hab82311_seed.pdf" },
  { matricule: "51889",  filename: "hab51889_seed.pdf" },
  { matricule: "51389",  filename: "hab51389_seed.pdf" },
  { matricule: "83638",  filename: "hab83638_seed.pdf" },
  { matricule: "79919",  filename: "hab79919_seed.pdf" },
  { matricule: "85939",  filename: "hab85939_seed.pdf" },
  { matricule: "81581",  filename: "hab81581_seed.pdf" },
  { matricule: "85083",  filename: "hab85083_seed.pdf" },
  { matricule: "84081",  filename: "hab84081_seed.pdf" },
  { matricule: "81594",  filename: "hab81594_seed.pdf" },
  { matricule: "82925",  filename: "hab82925_seed.pdf" },
  { matricule: "80335",  filename: "hab80335_seed.pdf" },
  { matricule: "81371",  filename: "hab81371_seed.pdf" },
  { matricule: "03909",  filename: "hab03909_seed.pdf" },
  { matricule: "81657",  filename: "hab81657_seed.pdf" },
  { matricule: "82342",  filename: "hab82342_seed.pdf" },
  { matricule: "85748E", filename: "hab85748E_seed.pdf" },
  { matricule: "55873J", filename: "hab55873J_seed.pdf" },
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
