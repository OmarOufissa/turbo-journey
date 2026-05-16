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

const P1 = {
  nDeTitre:       { x: 375.5,  y: 741.82 },
  nomPrenom:      { x: 134.45, y: 694.51 },
  matricule:      { x: 382.94, y: 694.51 },
  fonction:       { x: 134.45, y: 674.59 },
  entite:         { x: 134.45, y: 654.67 },
  dateDelivrance: { x: 128.21, y: 254.23 },
  valableJusquau: { x: 129.17, y: 243.19 },
};

const P2 = {
  ...P1,
  dateDelivrance: { x: 128.21, y: 261.43 },
  valableJusquau: { x: 129.17, y: 250.15 },
};

// Table — 6 rows in official order
// Symbol column spans x=120.53 to 198.07; center at 159
const SYMBOL_CENTER = 159;
const SYMBOL_LEFT   = 121;
const SYMBOL_WIDTH  = 77;
const SZ_SYM = 10;

// Text column left-edge positions
const COL_DOM = 200;  // Domaine de tension  (width ≈ 68pt to 268)
const COL_OUV = 271;  // Ouvrages Concernés  (width ≈ 140pt to 411)
const COL_IND = 413;  // Indications         (width ≈ 176pt to 589)

const DOM_W = 68;
const OUV_W = 140;
const IND_W = 176;

interface TableRow {
  stKey: string | null;
  htKey: string | null;
  rowKey: keyof HabRows;
  ySym: number;
  yData: number;
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

function drawCentered(
  page: PDFPage,
  text: string,
  centerX: number, y: number,
  font: any, size: number,
  color = rgb(0, 0, 0),
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: centerX - w / 2, y, size, font, color });
}

function drawTextScaled(
  page: PDFPage,
  text: string,
  x: number, y: number,
  maxWidth: number,
  font: any, size: number,
) {
  if (!text) return;
  const w = font.widthOfTextAtSize(text, size);
  const actualSize = w > maxWidth ? size * (maxWidth / w) : size;
  page.drawText(text, { x, y, size: actualSize, font, color: rgb(0, 0, 0) });
}

function drawWrapped(
  page: PDFPage,
  text: string,
  x: number, startY: number,
  maxWidth: number, maxLines: number,
  font: any, size: number,
) {
  if (!text) return;
  const lineHeight = size * 1.35;
  const words = text.split(' ');
  let line = '';
  let y = startY;
  let linesDrawn = 0;

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      if (linesDrawn >= maxLines) break;
      drawText(page, line, x, y, font, size);
      line = word;
      y -= lineHeight;
      linesDrawn++;
    } else {
      line = test;
    }
  }
  if (line && linesDrawn < maxLines) {
    drawText(page, line, x, y, font, size);
  }
}

// ─── Fill page 1 (certificate with table) ────────────────────────────────────

function fillPage1(
  page: PDFPage,
  snapshot: VersionSnapshot,
  fonts: { regular: any; bold: any },
) {
  const { regular, bold } = fonts;
  const SZ  = 9;
  const SZS = 8;

  // Title N°
  drawText(page, snapshot.nDeTitre, P1.nDeTitre.x, P1.nDeTitre.y, bold, SZ);

  // Header fields
  drawText(page, `${snapshot.prenom} ${snapshot.nom}`, P1.nomPrenom.x, P1.nomPrenom.y, bold, SZ);
  drawText(page, snapshot.matricule, P1.matricule.x, P1.matricule.y, bold, SZ);
  drawText(page, snapshot.fonction,  P1.fonction.x,  P1.fonction.y,  bold, SZ);

  // Entité d'affectation: clear "/ /" placeholders and write full hierarchy
  clearRect(page, P1.entite.x, P1.entite.y - 2, 415, 12);
  const entiteParts = [snapshot.division, snapshot.service, snapshot.equipe].filter(Boolean) as string[];
  drawTextScaled(page, entiteParts.join(' / '), P1.entite.x, P1.entite.y, 410, bold, SZ);

  // Dates
  drawText(page, formatDateFrench(snapshot.dateValidation), P1.dateDelivrance.x, P1.dateDelivrance.y, regular, SZ);
  drawText(page, formatDateFrench(snapshot.dateExpiration), P1.valableJusquau.x,  P1.valableJusquau.y,  regular, SZ);

  // Table rows — fill every row: active rows get codes + text, inactive rows get XXX
  const allCodes = [...(snapshot.stCodes ?? []), ...(snapshot.htCodes ?? [])];

  for (const row of TABLE_ROWS) {
    const hasST = row.stKey != null && allCodes.includes(row.stKey);
    const hasHT = row.htKey != null && allCodes.includes(row.htKey);

    if (hasST || hasHT) {
      // Build combined symbol text: "H2V – B2V", "BR", "HC – BC", etc.
      const symbolText = hasST && hasHT
        ? `${row.stKey} – ${row.htKey}`
        : hasST ? row.stKey! : row.htKey!;

      clearRect(page, SYMBOL_LEFT, row.ySym - 4, SYMBOL_WIDTH, 14);
      drawCentered(page, symbolText, SYMBOL_CENTER, row.ySym, bold, SZ_SYM);

      // Domaine / Ouvrages / Indications — use habRows data if available, else XXX
      const rowData = snapshot.habRows?.[row.rowKey];
      drawWrapped(page, rowData?.domaine    || 'XXX', COL_DOM, row.yData, DOM_W, 3, regular, SZS);
      drawWrapped(page, rowData?.ouvrage    || 'XXX', COL_OUV, row.yData, OUV_W, 3, regular, SZS);
      drawWrapped(page, rowData?.indication || 'XXX', COL_IND, row.yData, IND_W, 3, regular, SZS);
    } else {
      // Inactive row — fill all columns with XXX
      clearRect(page, SYMBOL_LEFT, row.ySym - 4, SYMBOL_WIDTH, 14);
      drawCentered(page, 'XXX', SYMBOL_CENTER, row.ySym, regular, SZS);
      drawText(page, 'XXX', COL_DOM, row.yData, regular, SZS);
      drawText(page, 'XXX', COL_OUV, row.yData, regular, SZS);
      drawText(page, 'XXX', COL_IND, row.yData, regular, SZS);
    }
  }
}

// ─── Fill page 2 (AVIS / back page) ──────────────────────────────────────────

function fillPage2(
  page: PDFPage,
  snapshot: VersionSnapshot,
  fonts: { regular: any; bold: any },
) {
  const { regular } = fonts;
  const SZ = 9;

  // N° de titre
  drawText(page, snapshot.nDeTitre, P2.nDeTitre.x, P2.nDeTitre.y, fonts.bold, SZ);

  // Dates — clear the "Autorisations" label band that overlaps valableJusquau
  clearRect(page, 0, P2.valableJusquau.y - 4, 340, 14);
  drawText(page, formatDateFrench(snapshot.dateValidation), P2.dateDelivrance.x, P2.dateDelivrance.y, regular, SZ);
  drawText(page, formatDateFrench(snapshot.dateExpiration), P2.valableJusquau.x,  P2.valableJusquau.y,  regular, SZ);

  // Footer (BRAHIMI ALI) is pre-printed in the template — do NOT overwrite
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateHabilitationPdf(
  snapshot: VersionSnapshot,
  versionNumber: number,
): Promise<{ pdfPath: string; pdfSize: number }> {
  validate(snapshot);

  const templateBytes = fs.readFileSync(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);

  const helvetica     = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular: helvetica, bold: helveticaBold };

  const pages = pdfDoc.getPages();
  if (pages[0]) fillPage1(pages[0], snapshot, fonts);
  if (pages[1]) fillPage2(pages[1], snapshot, fonts);

  const pdfBytes = await pdfDoc.save();
  const filename  = `hab${snapshot.matricule}_v${versionNumber}.pdf`;
  const fullPath  = path.join(UPLOAD_DIR, filename);
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
