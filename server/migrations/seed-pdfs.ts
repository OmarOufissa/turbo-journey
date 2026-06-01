import fs from "fs";
import path from "path";
import { db } from "../db-pg";
import * as schema from "../schema";
import { eq } from "drizzle-orm";
import { logger } from "../utils/logger";

// Seeded PDF entries — OCR-extracted from 51 batch PDFs (445 pages total), June 2026.
// 153 unique valid matricules matched. 47 pages unmatched (blanks, cover sheets, eval forms).
// UNMATCHED (skipped — not in valid matricule list or unreadable OCR):
//   06 HABILITATIONS ELECTRIQUES XJ.pdf p3 — corrupt/blank
//   12 TITRES HABILITATIONs XA.pdf p4 — phone camera watermark page
//   20250212162352.pdf p4, 20250212162450.pdf p4 — blank separator pages
//   20250901100316.pdf p3, 20250901100618.pdf p6, 20250901100714.pdf p4,p7 — non-cert pages
//   HABILITATION EDDOUH.pdf p1 — OCR upside-down/unreadable
//   HAE XJ 10 2025.pdf p21 — blank separator
//   Habilitatioins éléctriques XA.pdf p1,p2,p4 — corrupted/blank
//   TITRES TST 2026.pdf p2,p4,p6,p8,p10,p12,p14,p16,p18,p20,p22 — back-sides/blank
//   Titres d_habilitation électrique délivrées.pdf p1,p2,p5 — cover sheets
//   Titres d_habilitations DTC-XC AOUT 2024 partie 2.pdf p9 — blank
//   Titres d_habilitations DTC-XC AOUT 2024.pdf p5,p13,p18,p19,p28,p41,p61,p66 — blanks/covers
//   titres HAE XA 120326.pdf p11 — blank
//   titres HAE XA 130326 dossier complet.pdf p2,p5,p6,p19,p22,p61 — blanks/covers
//   titres HAE XJ 060426.pdf p5, titres HAE XJ 130426.pdf p1,p6,p7 — blanks/covers
const SEED_ENTRIES: { matricule: string; filename: string }[] = [
  { matricule: "76759", filename: "hab76759_seed.pdf" },  // LAARISSI ABDESLAM
  { matricule: "76888", filename: "hab76888_seed.pdf" },  // QHILA KHALID
  { matricule: "77889", filename: "hab77889_seed.pdf" },  // HASSOUNE ABDERRAZAK
  { matricule: "78234", filename: "hab78234_seed.pdf" },  // BAMARJANE
  { matricule: "78286", filename: "hab78286_seed.pdf" },  // EL ALAMI SABIR
  { matricule: "78849", filename: "hab78849_seed.pdf" },  // NABILI MOUBARIK
  { matricule: "78952", filename: "hab78952_seed.pdf" },  // ASSALI KHALID
  { matricule: "78953", filename: "hab78953_seed.pdf" },  // SADIK ABDERRAHMAN
  { matricule: "78955", filename: "hab78955_seed.pdf" },  // MONSIF RAHAL
  { matricule: "78983", filename: "hab78983_seed.pdf" },  // KEROUICH KHALID
  { matricule: "79274", filename: "hab79274_seed.pdf" },  // BOUJMAI NABIL
  { matricule: "79411", filename: "hab79411_seed.pdf" },  // AIT OULAID BRAHIM
  { matricule: "79677", filename: "hab79677_seed.pdf" },  // EL BOUYAHYAOUI MUSTAPHA
  { matricule: "79868", filename: "hab79868_seed.pdf" },  // TALIB HICHAM
  { matricule: "79876", filename: "hab79876_seed.pdf" },  // CHEGDALI MOHAMED
  { matricule: "79917", filename: "hab79917_seed.pdf" },  // JAHA MOHAMED
  { matricule: "79919", filename: "hab79919_seed.pdf" },  // CHAOUKI YASSINE
  { matricule: "79920", filename: "hab79920_seed.pdf" },  // ALAMI QGAMMOURI ABDELLAH
  { matricule: "80045", filename: "hab80045_seed.pdf" },  // HAMADA ABDELHAQ
  { matricule: "80227", filename: "hab80227_seed.pdf" },  // HAJ BRAHIM
  { matricule: "80345", filename: "hab80345_seed.pdf" },  // FARICHOUCH HICHAM
  { matricule: "80409", filename: "hab80409_seed.pdf" },  // LACH-HEB YOUNESS
  { matricule: "80460", filename: "hab80460_seed.pdf" },  // NAJIDI AHMED
  { matricule: "80489", filename: "hab80489_seed.pdf" },  // ABDELLAOUI ABDELATI
  { matricule: "80491", filename: "hab80491_seed.pdf" },  // LAKMAS M'HAMMED
  { matricule: "80537", filename: "hab80537_seed.pdf" },  // LOUDY HAMID
  { matricule: "80559", filename: "hab80559_seed.pdf" },  // RAKI BRAHIM
  { matricule: "80793", filename: "hab80793_seed.pdf" },  // BOULGHAIT MOHAMED
  { matricule: "80922", filename: "hab80922_seed.pdf" },  // CHIBANE ZAKARIA
  { matricule: "80924", filename: "hab80924_seed.pdf" },  // EL MOUKH SAID
  { matricule: "80925", filename: "hab80925_seed.pdf" },  // ZOUITA NAJIB
  { matricule: "81011", filename: "hab81011_seed.pdf" },  // ED-DOUH MOURAD
  { matricule: "81014", filename: "hab81014_seed.pdf" },  // SAID NOUREDDINE
  { matricule: "81107", filename: "hab81107_seed.pdf" },  // HIFDI AZZEDDINE
  { matricule: "81122", filename: "hab81122_seed.pdf" },  // BOUALI YASSINE
  { matricule: "81123", filename: "hab81123_seed.pdf" },  // BIGOURRAMEN HICHAM
  { matricule: "81124", filename: "hab81124_seed.pdf" },  // ALMOU AZIZ
  { matricule: "81126", filename: "hab81126_seed.pdf" },  // MOUIMI NOUREDDINE
  { matricule: "81130", filename: "hab81130_seed.pdf" },  // LARHZAOUI LAHCEN
  { matricule: "81132", filename: "hab81132_seed.pdf" },  // KAHLAOUI MOUSSA
  { matricule: "81134", filename: "hab81134_seed.pdf" },  // BOUHAFS EL MOSTAFA
  { matricule: "81135", filename: "hab81135_seed.pdf" },  // BOUZOUGAGH MOHAMED
  { matricule: "81155", filename: "hab81155_seed.pdf" },  // KACIMI NAWFEL
  { matricule: "81208", filename: "hab81208_seed.pdf" },  // ERRABBAA YOUSSEF
  { matricule: "81293", filename: "hab81293_seed.pdf" },  // DAHAOUI YOUNESS
  { matricule: "81371", filename: "hab81371_seed.pdf" },  // BOURAKBA ISSAM
  { matricule: "81523", filename: "hab81523_seed.pdf" },  // ECHAKRAOUI YASSINE
  { matricule: "81581", filename: "hab81581_seed.pdf" },  // KEBDANI CHARAF
  { matricule: "81582", filename: "hab81582_seed.pdf" },  // ELMEKAOUI MOHAMED
  { matricule: "81594", filename: "hab81594_seed.pdf" },  // BOUKHRISS MOHAMED
  { matricule: "81595", filename: "hab81595_seed.pdf" },  // GHARIB ABDELALI
  { matricule: "81628", filename: "hab81628_seed.pdf" },  // ZRAYGUE MUSTAPHA
  { matricule: "81632", filename: "hab81632_seed.pdf" },  // OBBIBA OUADYAE
  { matricule: "81657", filename: "hab81657_seed.pdf" },  // GOUAL YASSINE
  { matricule: "81913", filename: "hab81913_seed.pdf" },  // LACHKAR ILYAS
  { matricule: "81914", filename: "hab81914_seed.pdf" },  // AKRIM AMINE
  { matricule: "81915", filename: "hab81915_seed.pdf" },  // SADOUQ YASSINE
  { matricule: "81920", filename: "hab81920_seed.pdf" },  // LAAROUSSI SALAH
  { matricule: "81999", filename: "hab81999_seed.pdf" },  // EL AOUJA ABDESSAMAD
  { matricule: "82019", filename: "hab82019_seed.pdf" },  // ETTALBY RACHID
  { matricule: "82094", filename: "hab82094_seed.pdf" },  // BOUSSIF LAKBIR
  { matricule: "82262", filename: "hab82262_seed.pdf" },  // ACHLOUJ SALAH-EDDINE
  { matricule: "82302", filename: "hab82302_seed.pdf" },  // HALLOUMI ABDELALI
  { matricule: "82304", filename: "hab82304_seed.pdf" },  // YOUSFI ABDELHAK
  { matricule: "82305", filename: "hab82305_seed.pdf" },  // (XA — see OCR log)
  { matricule: "82306", filename: "hab82306_seed.pdf" },  // ERRADI OTHMANE
  { matricule: "82316", filename: "hab82316_seed.pdf" },  // GHAZI HASSAN
  { matricule: "82323", filename: "hab82323_seed.pdf" },  // MISBAH AMAL
  { matricule: "82337", filename: "hab82337_seed.pdf" },  // OUNIR ABDELATIF
  { matricule: "82342", filename: "hab82342_seed.pdf" },  // MOUSTAKIM YOUSSEF
  { matricule: "82363", filename: "hab82363_seed.pdf" },  // MAWHOUB YOUNES
  { matricule: "82376", filename: "hab82376_seed.pdf" },  // MOURADI YASSINE
  { matricule: "82386", filename: "hab82386_seed.pdf" },  // LAFROUDI MOHAMMED
  { matricule: "82400", filename: "hab82400_seed.pdf" },  // NAJID HAMZA
  { matricule: "82446", filename: "hab82446_seed.pdf" },  // ERROUISSI MOHAMMED
  { matricule: "82450", filename: "hab82450_seed.pdf" },  // CHAMSI ABDESSLAM
  { matricule: "82472", filename: "hab82472_seed.pdf" },  // GHASSIR NABILA
  { matricule: "82513", filename: "hab82513_seed.pdf" },  // EL HAJJI OUTMANE
  { matricule: "82552", filename: "hab82552_seed.pdf" },  // MOUCHTAKI YOUSSEF
  { matricule: "82617", filename: "hab82617_seed.pdf" },  // ER-RACHED IMAD
  { matricule: "82622", filename: "hab82622_seed.pdf" },  // JARANE ZOUHAIR
  { matricule: "82637", filename: "hab82637_seed.pdf" },  // SAIDI KHALID
  { matricule: "82641", filename: "hab82641_seed.pdf" },  // ET-TALAOUI MOHAMED
  { matricule: "82649", filename: "hab82649_seed.pdf" },  // BENZAZAA YASSINE
  { matricule: "82733", filename: "hab82733_seed.pdf" },  // BOUMAJA YOUSSEF
  { matricule: "82743", filename: "hab82743_seed.pdf" },  // ITBANE ABDELQOUDOUSS
  { matricule: "82790", filename: "hab82790_seed.pdf" },  // ELMAAKOUL ABDELGHANI
  { matricule: "83172", filename: "hab83172_seed.pdf" },  // LAOUAJ MOHAMED
  { matricule: "83192", filename: "hab83192_seed.pdf" },  // JAMIL BOUTAINA
  { matricule: "83300", filename: "hab83300_seed.pdf" },  // EL HRYCHY OUSSAMA
  { matricule: "83407", filename: "hab83407_seed.pdf" },  // EL FAIZ CHERKI
  { matricule: "83506", filename: "hab83506_seed.pdf" },  // OUBOUROU IDER
  { matricule: "83509", filename: "hab83509_seed.pdf" },  // LAROUI OMAR
  { matricule: "83511", filename: "hab83511_seed.pdf" },  // AIT ALLA MOHAMED
  { matricule: "83513", filename: "hab83513_seed.pdf" },  // SIHAM JABIR
  { matricule: "83515", filename: "hab83515_seed.pdf" },  // FALAKI ABDELLILAH
  { matricule: "83519", filename: "hab83519_seed.pdf" },  // ZOUAGHI MOHAMED
  { matricule: "83526", filename: "hab83526_seed.pdf" },  // AASSAOUI ABDELHALIM
  { matricule: "83527", filename: "hab83527_seed.pdf" },  // TOUITI LAHCEN
  { matricule: "83559", filename: "hab83559_seed.pdf" },  // ZOUINE SAID
  { matricule: "83601", filename: "hab83601_seed.pdf" },  // MADDA TARIK
  { matricule: "83625", filename: "hab83625_seed.pdf" },  // MADANI ABDELKABIR
  { matricule: "83628", filename: "hab83628_seed.pdf" },  // OUAZZA DRISS
  { matricule: "83630", filename: "hab83630_seed.pdf" },  // AHTTAB BRAHIM
  { matricule: "83635", filename: "hab83635_seed.pdf" },  // AMZIL KAMAL
  { matricule: "83756", filename: "hab83756_seed.pdf" },  // JEDDI MONCEF
  { matricule: "83781", filename: "hab83781_seed.pdf" },  // EL JAAFARI RACHID
  { matricule: "83878", filename: "hab83878_seed.pdf" },  // JNAIKH AMINE
  { matricule: "83945", filename: "hab83945_seed.pdf" },  // IDRISSI AMINE
  { matricule: "84002", filename: "hab84002_seed.pdf" },  // QRAITICH MOHAMED
  { matricule: "84003", filename: "hab84003_seed.pdf" },  // ATTI HAMZA
  { matricule: "84004", filename: "hab84004_seed.pdf" },  // ELWARDI ZOUHEIR
  { matricule: "84005", filename: "hab84005_seed.pdf" },  // BOUCHLAGHEM BADRE
  { matricule: "84063", filename: "hab84063_seed.pdf" },  // SAABANE HANANE
  { matricule: "84066", filename: "hab84066_seed.pdf" },  // ELBIR MEHDI
  { matricule: "84071", filename: "hab84071_seed.pdf" },  // HAFFAR EL MOSTAFA
  { matricule: "84072", filename: "hab84072_seed.pdf" },  // ELMAKHLOUFY ABDELJALIL
  { matricule: "84073", filename: "hab84073_seed.pdf" },  // RACHIDI SAID
  { matricule: "84084", filename: "hab84084_seed.pdf" },  // BABA AYOUB
  { matricule: "84683", filename: "hab84683_seed.pdf" },  // BAKHOUYA MOHAMED
  { matricule: "84705", filename: "hab84705_seed.pdf" },  // FANDOUL MOHAMMED
  { matricule: "84714", filename: "hab84714_seed.pdf" },  // TIDAF (84714)
  { matricule: "84715", filename: "hab84715_seed.pdf" },  // TIDAF YOUNES
  { matricule: "84716", filename: "hab84716_seed.pdf" },  // MIRHLAMI MOHAMMED
  { matricule: "84741", filename: "hab84741_seed.pdf" },  // JAMALI MOUNIR
  { matricule: "84742", filename: "hab84742_seed.pdf" },  // CHAHBOUN M'BAREK
  { matricule: "84743", filename: "hab84743_seed.pdf" },  // AIT LABSIR AYMAN
  { matricule: "84828", filename: "hab84828_seed.pdf" },  // GAMIL YOUSSEF
  { matricule: "84851", filename: "hab84851_seed.pdf" },  // ZAKARIA MAZANE
  { matricule: "84881", filename: "hab84881_seed.pdf" },  // NAAMY SAID
  { matricule: "84923", filename: "hab84923_seed.pdf" },  // AOUAD MOUAD
  { matricule: "84949", filename: "hab84949_seed.pdf" },  // CHAIF NOUR-EDDINE
  { matricule: "84981", filename: "hab84981_seed.pdf" },  // ECH-CHAOUKI ABDESSAMAD
  { matricule: "85024", filename: "hab85024_seed.pdf" },  // FALOUSS BASSAM
  { matricule: "85031", filename: "hab85031_seed.pdf" },  // ESSAIF HAMZA
  { matricule: "85045", filename: "hab85045_seed.pdf" },  // ERRAMI NOUREDDIN
  { matricule: "85072", filename: "hab85072_seed.pdf" },  // MOUNTAHI AMINE
  { matricule: "85083", filename: "hab85083_seed.pdf" },  // OUASSIRI SAID
  { matricule: "85495", filename: "hab85495_seed.pdf" },  // ZEROUAL MOHAMED AMINE
  { matricule: "85496", filename: "hab85496_seed.pdf" },  // ZAHIR HAMZA
  { matricule: "85749", filename: "hab85749_seed.pdf" },  // FARSAOUI JAOUAD
  { matricule: "85860", filename: "hab85860_seed.pdf" },  // DNAYA ABDELGHAFOUR
  { matricule: "85862", filename: "hab85862_seed.pdf" },  // (XJ Apr 2026)
  { matricule: "85863", filename: "hab85863_seed.pdf" },  // AHMICHE ABDELLATIF
  { matricule: "85865", filename: "hab85865_seed.pdf" },  // ERITALI AHMED
  { matricule: "85872", filename: "hab85872_seed.pdf" },  // BENELMEKROUD HICHAM
  { matricule: "85886", filename: "hab85886_seed.pdf" },  // KARA JIHAD
  { matricule: "85887", filename: "hab85887_seed.pdf" },  // LATRACHE MOHAMED
  { matricule: "85888", filename: "hab85888_seed.pdf" },  // EL HARRAK YASSINE
  { matricule: "85908", filename: "hab85908_seed.pdf" },  // KOUNINE RIDA
  { matricule: "85939", filename: "hab85939_seed.pdf" },  // OUALLAL AMINE
  { matricule: "85941", filename: "hab85941_seed.pdf" },  // OURCHID MOHAMMED
  { matricule: "85978", filename: "hab85978_seed.pdf" },  // HAMOUCH HAMZA
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
