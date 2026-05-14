import { PDFDocument, StandardFonts, rgb, PDFPage } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import type { HabRows } from '../schema';

export interface VersionSnapshot {
  matricule: string;
  nom: string;
  prenom: string;
  nDeTitre: string;
  fonction: string;
  division: string;
  service?: string | null;
  equipe?: string | null;
  stCodes: string[];
  htCodes: string[];
  habRows?: HabRows | null;
  dateValidation: string;
  dateExpiration: string;
}

const TEMPLATE_PATH = path.join(process.cwd(), 'server', 'seeds', 'data', 'titre_HAE_vierge.pdf');
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'pdfs');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const FRENCH_MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

function formatDateFrench(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getUTCDate()} ${FRENCH_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  } catch {
    return dateStr;
  }
}

export class PdfValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfValidationError';
  }
}

function validate(snapshot: VersionSnapshot): void {
  if (!snapshot.nDeTitre?.trim()) throw new PdfValidationError('n_de_titre is required');
  if (snapshot.stCodes.length === 0 && snapshot.htCodes.length === 0)
    throw new PdfValidationError('Employee must have at least one code');
  if (snapshot.dateExpiration <= snapshot.dateValidation)
    throw new PdfValidationError('date_expiration must be after date_validation');
}

// ─── Coordinate constants (PDF points, y=0 at bottom) ────────────────────────

// Page 1 main body fields
const P1 = {
  nDeTitre:  { x: 375.5,  y: 741.82 },
  nomPrenom: { x: 134.45, y: 694.51 },
  matricule: { x: 382.94, y: 694.51 },
  fonction:  { x: 134.45, y: 674.59 },
  entite:    { x: 134.45, y: 654.67 },
  // Footer date fields
  dateDelivrance: { x: 128.21, y: 254.23 },
  valableJusquau: { x: 129.17, y: 243.19 },
  // Footer repeated nom+prénom (has sample "BRAHIMI ALI" to clear)
  footerNom:    { x: 357.74, y: 224.23 },
  footerFonction: { x: 357.74, y: 209.81 },
};

// Page 2 — same main body positions, slightly shifted footer
const P2 = {
  ...P1,
  dateDelivrance: { x: 128.21, y: 261.43 },
  valableJusquau: { x: 129.17, y: 250.15 },
  footerNom:    { x: 357.74, y: 231.19 },
  footerFonction: { x: 357.74, y: 216.79 },
};

// Table — 6 rows in official order
// Symbole column: x=120.53–198.07 → split ST(left) / HT(right)
const COL_ST  = 122;   // left-align in ST sub-column
const COL_HT  = 161;   // left-align in HT sub-column
const COL_DOM = 200;   // left-align in Domaine column (starts 198.55)
const COL_OUV = 271;   // left-align in Ouvrages column (starts 269.38)
const COL_IND = 413;   // left-align in Indications column (starts 411.29)

interface TableRow {
  stKey: string | null;
  htKey: string | null;
  rowKey: keyof HabRows;
  ySym: number;   // y for Symbole text
  yData: number;  // y for Domaine/Ouvrages/Indications text
}

const TABLE_ROWS: TableRow[] = [
  { stKey: 'H0V', htKey: 'B0V', rowKey: 'H0V_B0V', ySym: 560.57, yData: 560.57 },
  { stKey: 'H1V', htKey: 'B1V', rowKey: 'H1V_B1V', ySym: 533.18, yData: 533.66 },
  { stKey: null,  htKey: 'BR',  rowKey: 'BR',       ySym: 508.22, yData: 508.70 },
  { stKey: 'H2V', htKey: 'B2V', rowKey: 'H2V_B2V', ySym: 485.66, yData: 485.66 },
  { stKey: 'HC',  htKey: 'BC',  rowKey: 'HC_BC',   ySym: 462.60, yData: 462.84 },
  { stKey: null,  htKey: 'SF6', rowKey: 'SF6',      ySym: 436.44, yData: 436.44 },
];

// ─── Draw helpers ─────────────────────────────────────────────────────────────

function drawText(
  page: PDFPage,
  text: string,
  x: number, y: number,
  font: any, size: number,
  color = rgb(0, 0, 0),
) {
  if (!text) return;
  page.drawText(text, { x, y, size, font, color });
}

function clearRect(page: PDFPage, x: number, y: number, w: number, h: number) {
  page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 1), borderWidth: 0 });
}

// ─── Fill page 1 (the certificate with the table) ────────────────────────────

function fillPage1(
  page: PDFPage,
  snapshot: VersionSnapshot,
  fonts: { regular: any; bold: any },
) {
  const { regular, bold } = fonts;
  const SZ = 9;
  const SZS = 8;

  drawText(page, snapshot.nDeTitre, P1.nDeTitre.x, P1.nDeTitre.y, bold, SZ);

  const fullName = `${snapshot.prenom} ${snapshot.nom}`;
  drawText(page, fullName, P1.nomPrenom.x, P1.nomPrenom.y, bold, SZ);
  drawText(page, snapshot.matricule, P1.matricule.x, P1.matricule.y, bold, SZ);
  drawText(page, snapshot.fonction, P1.fonction.x, P1.fonction.y, bold, SZ);

  // Clear "/ /" entité placeholder then write
  clearRect(page, P1.entite.x, P1.entite.y - 2, 415, 12);
  const entiteParts = [snapshot.division, snapshot.service, snapshot.equipe].filter(Boolean);
  drawText(page, entiteParts.join(' / '), P1.entite.x, P1.entite.y, bold, SZ);

  drawText(page, formatDateFrench(snapshot.dateValidation), P1.dateDelivrance.x, P1.dateDelivrance.y, regular, SZ);
  drawText(page, formatDateFrench(snapshot.dateExpiration), P1.valableJusquau.x, P1.valableJusquau.y, regular, SZ);

  // Footer repeated nom/fonction — clear "BRAHIMI ALI" sample
  clearRect(page, P1.footerNom.x, P1.footerNom.y - 2, 220, 12);
  drawText(page, fullName, P1.footerNom.x, P1.footerNom.y, bold, SZ);
  clearRect(page, P1.footerFonction.x, P1.footerFonction.y - 2, 220, 12);
  drawText(page, snapshot.fonction, P1.footerFonction.x, P1.footerFonction.y, regular, SZ);

  // Table
  for (const row of TABLE_ROWS) {
    const hasST = row.stKey && snapshot.stCodes.includes(row.stKey);
    const hasHT = row.htKey && snapshot.htCodes.includes(row.htKey);
    if (!hasST && !hasHT) continue;

    if (hasST && row.stKey) drawText(page, row.stKey, COL_ST, row.ySym, bold, SZS);
    if (hasHT && row.htKey) drawText(page, row.htKey, COL_HT, row.ySym, bold, SZS);

    const rowData = snapshot.habRows?.[row.rowKey];
    if (rowData) {
      if (rowData.domaine)    drawText(page, rowData.domaine,    COL_DOM, row.yData, regular, SZS);
      if (rowData.ouvrage)    drawText(page, rowData.ouvrage,    COL_OUV, row.yData, regular, SZS);
      if (rowData.indication) drawText(page, rowData.indication, COL_IND, row.yData, regular, SZS);
    }
  }
}

// ─── Fill page 2 (AVIS / back page — only title + footer) ────────────────────
// Page 2 body contains the legal AVIS text; only the n° de titre (top) and
// the footer date/signature area need to be filled.

function fillPage2(
  page: PDFPage,
  snapshot: VersionSnapshot,
  fonts: { regular: any; bold: any },
) {
  const { regular, bold } = fonts;
  const SZ = 9;
  const fullName = `${snapshot.prenom} ${snapshot.nom}`;

  // N° de titre in the title area (top right)
  drawText(page, snapshot.nDeTitre, P2.nDeTitre.x, P2.nDeTitre.y, bold, SZ);

  // "Autorisations (ou restrictions) spéciales :" label sits at y=251.83 (x=22–180)
  // which overlaps "Valable jusqu'au" fill at y=250.15. Clear the whole band.
  clearRect(page, 0, P2.valableJusquau.y - 4, 340, 14);
  drawText(page, formatDateFrench(snapshot.dateValidation), P2.dateDelivrance.x, P2.dateDelivrance.y, regular, SZ);
  drawText(page, formatDateFrench(snapshot.dateExpiration), P2.valableJusquau.x,  P2.valableJusquau.y,  regular, SZ);

  // Footer signature area — clear sample data and write actual values
  clearRect(page, P2.footerNom.x,     P2.footerNom.y - 2,     220, 12);
  drawText(page, fullName,             P2.footerNom.x,     P2.footerNom.y,     bold,    SZ);
  clearRect(page, P2.footerFonction.x, P2.footerFonction.y - 2, 220, 12);
  drawText(page, snapshot.fonction,    P2.footerFonction.x, P2.footerFonction.y, regular, SZ);
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateHabilitationPdf(
  snapshot: VersionSnapshot,
  versionNumber: number,
): Promise<{ pdfPath: string; pdfSize: number }> {
  validate(snapshot);

  const templateBytes = fs.readFileSync(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular: helvetica, bold: helveticaBold };

  const pages = pdfDoc.getPages();

  // Fill page 1 (front)
  if (pages[0]) fillPage1(pages[0], snapshot, fonts);
  // Fill page 2 (AVIS page — only title + footer)
  if (pages[1]) fillPage2(pages[1], snapshot, fonts);

  const pdfBytes = await pdfDoc.save();
  const filename = `hab${snapshot.matricule}_v${versionNumber}.pdf`;
  const fullPath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(fullPath, pdfBytes);

  const stats = fs.statSync(fullPath);
  if (stats.size === 0) throw new Error('Generated PDF is empty');

  return { pdfPath: filename, pdfSize: stats.size };
}

export function getPdfPath(filename: string): string {
  return path.join(UPLOAD_DIR, filename);
}

export function pdfExists(filename: string): boolean {
  return fs.existsSync(path.join(UPLOAD_DIR, filename));
}

export function deletePdf(filename: string): void {
  const p = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}
