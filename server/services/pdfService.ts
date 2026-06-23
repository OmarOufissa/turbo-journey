import { PDFDocument, StandardFonts, rgb, PDFPage } from 'pdf-lib';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { HabRows } from '../schema';
import { PDFS_DIR, buildPdfFilename, resolvePdfPath } from '../utils/pathUtils';
import { formatDateFrench } from '../utils/dateUtils';

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
  autorisationSpecialesVerso?: string | null;
  dateValidation: string;
  dateExpiration: string;
}

function resolveTemplatePath(): string {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  // Bundled build places this chunk in dist/server/, alongside seeds/data/.
  // In dev, this file lives in server/services/, with seeds/data/ one level up.
  const candidates = [
    path.join(dir, 'seeds', 'data', 'titre_HAE_vierge.pdf'),
    path.join(dir, '..', 'seeds', 'data', 'titre_HAE_vierge.pdf'),
  ];
  return candidates.find(p => fs.existsSync(p)) ?? candidates[1];
}

const TEMPLATE_PATH = process.env.PDF_TEMPLATE_PATH ?? resolveTemplatePath();
const UPLOAD_DIR = PDFS_DIR;

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
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

// ─── Header field coordinates ─────────────────────────────────────────────────

const P1 = {
  nDeTitre:       { x: 375.5,  y: 741.82 },
  nomPrenom:      { x: 134.45, y: 694.51 },
  matricule:      { x: 382.94, y: 694.51 },
  fonction:       { x: 134.45, y: 674.59 },
  entite:         { x: 134.45, y: 654.67 },
  dateDelivrance: { x: 128.21, y: 254.23 },
  valableJusquau: { x: 129.17, y: 243.19 },
};

// Page 2 has a different header layout — coordinates from stream 9
const P2 = {
  ...P1,
  nDeTitre:       { x: 372.38, y: 724.3  },
  autorisationY:  185,
};

// ─── Table geometry ───────────────────────────────────────────────────────────
// Column boundaries (x) and where the data rows start (y = dataTop)

const T = {
  left:    28.08,   // matches template's left outer border
  right:   566.86,  // matches template's right outer border
  dataTop: 577.37,  // exact bottom edge of column-header row (from template stream)
  cSym:    120,
  cDom:    198,
  cOuv:    269,
  cInd:    411,
} as const;

const CELL_PAD  = 3;           // padding inside cells (pt)
const SZ_CELL   = 7.5;         // font size for table data
const SZ_SYM    = 9;           // font size for active symbol codes
const CELL_LH   = SZ_CELL * 1.3; // line height
const MIN_ROW_H = 20;          // minimum row height (pt)

// Personnel column labels — use \n for forced line breaks
const PERSONNEL_LABELS = [
  'Non Électricien\nHabilité',
  'Électricien\nExécutant',
  'Chargé des\nInterventions',
  'Chargé de\nTravaux',
  'Chargé de\nConsignation',
  'Habilités\nSpéciaux',
];

interface TableRow {
  stKey: string | null;
  htKey: string | null;
  rowKey: keyof HabRows;
}

const TABLE_ROWS: TableRow[] = [
  { stKey: 'H0V', htKey: 'B0V', rowKey: 'H0V_B0V' },
  { stKey: 'H1V', htKey: 'B1V', rowKey: 'H1V_B1V' },
  { stKey: null,  htKey: 'BR',  rowKey: 'BR'       },
  { stKey: 'H2V', htKey: 'B2V', rowKey: 'H2V_B2V'  },
  { stKey: 'HC',  htKey: 'BC',  rowKey: 'HC_BC'    },
  { stKey: null,  htKey: 'SF6', rowKey: 'SF6'       },
];

// ─── Draw helpers ─────────────────────────────────────────────────────────────

function drawText(
  page: PDFPage, text: string,
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
  page: PDFPage, text: string,
  centerX: number, y: number,
  font: any, size: number,
  color = rgb(0, 0, 0),
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: centerX - w / 2, y, size, font, color });
}

function drawTextScaled(
  page: PDFPage, text: string,
  x: number, y: number, maxWidth: number,
  font: any, size: number,
) {
  if (!text) return;
  const w = font.widthOfTextAtSize(text, size);
  const sz = w > maxWidth ? size * (maxWidth / w) : size;
  page.drawText(text, { x, y, size: sz, font, color: rgb(0, 0, 0) });
}

function drawLine(page: PDFPage, x1: number, y1: number, x2: number, y2: number) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.5, color: rgb(0, 0, 0) });
}

// Count how many lines text needs when wrapped to maxWidth
function countLines(text: string, maxW: number, font: any, size: number): number {
  if (!text) return 1;
  let total = 0;
  for (const para of text.split('\n')) {
    const words = para.split(' ').filter(Boolean);
    if (words.length === 0) { total++; continue; }
    let line = '';
    let lines = 1;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxW && line) { lines++; line = w; }
      else line = test;
    }
    total += lines;
  }
  return Math.max(1, total);
}

// Draw text wrapped within a cell, starting from the top of the cell
function drawCellText(
  page: PDFPage, text: string,
  cellX: number, cellTopY: number, maxW: number,
  font: any, size: number,
) {
  const lh = size * 1.3;
  let y = cellTopY - CELL_PAD - size;
  for (const para of text.split('\n')) {
    const words = para.split(' ').filter(Boolean);
    if (words.length === 0) { y -= lh; continue; }
    let line = '';
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxW && line) {
        drawText(page, line, cellX + CELL_PAD, y, font, size);
        line = w; y -= lh;
      } else line = test;
    }
    if (line) { drawText(page, line, cellX + CELL_PAD, y, font, size); y -= lh; }
  }
}

// ─── Dynamic table drawing ────────────────────────────────────────────────────

function drawDynamicTable(
  page: PDFPage,
  snapshot: VersionSnapshot,
  fonts: { regular: any; bold: any },
  tableRows: TableRow[] = TABLE_ROWS,
  personnelLabels: string[] = PERSONNEL_LABELS,
) {
  const { regular, bold } = fonts;
  const allCodes = [...(snapshot.stCodes ?? []), ...(snapshot.htCodes ?? [])];

  // Inner text widths for each column (subtract padding on both sides)
  const wPer = T.cSym - T.left - 2 * CELL_PAD;
  const wSym = T.cDom - T.cSym - 2 * CELL_PAD;
  const wDom = T.cOuv - T.cDom - 2 * CELL_PAD;
  const wOuv = T.cInd - T.cOuv - 2 * CELL_PAD;
  const wInd = T.right - T.cInd - 2 * CELL_PAD;

  // Build row data + calculate heights
  const rows = tableRows.map((row, idx) => {
    const hasST = row.stKey != null && allCodes.includes(row.stKey);
    const hasHT = row.htKey != null && allCodes.includes(row.htKey);
    const isActive = hasST || hasHT;

    const symbolText = isActive
      ? (hasST && hasHT ? `${row.stKey} – ${row.htKey}` : hasST ? row.stKey! : row.htKey!)
      : '';

    const rd = isActive ? snapshot.habRows?.[row.rowKey] : null;
    const domaine    = isActive ? (rd?.domaine    || '') : '';
    const ouvrage    = isActive ? (rd?.ouvrage    || '') : '';
    const indication = isActive ? (rd?.indication || '') : '';

    const label = personnelLabels[idx] ?? '';
    const labelLines = countLines(label, wPer, regular, SZ_CELL);
    const symLines   = countLines(symbolText, wSym, isActive ? bold : regular, isActive ? SZ_SYM : SZ_CELL);
    const domLines   = countLines(domaine,    wDom, regular, SZ_CELL);
    const ouvLines   = countLines(ouvrage,    wOuv, regular, SZ_CELL);
    const indLines   = countLines(indication, wInd, regular, SZ_CELL);

    const maxLines = Math.max(labelLines, symLines, domLines, ouvLines, indLines);
    const height   = Math.max(MIN_ROW_H, maxLines * CELL_LH + 2 * CELL_PAD);

    return { row, label, isActive, hasST, hasHT, symbolText, domaine, ouvrage, indication, height };
  });

  const totalH    = rows.reduce((s, r) => s + r.height, 0);
  const tableBottom = T.dataTop - totalH;

  // Cover old data rows — top edge stops exactly at T.dataTop so header text is untouched
  clearRect(page, T.left, tableBottom - 2, T.right - T.left, T.dataTop - tableBottom + 2);

  // Top border of data area
  drawLine(page, T.left, T.dataTop, T.right, T.dataTop);

  // Draw rows top to bottom
  let curY: number = T.dataTop;
  for (const ri of rows) {
    const rowTop    = curY;
    const rowBottom = curY - ri.height;

    // Bottom border
    drawLine(page, T.left, rowBottom, T.right, rowBottom);

    // Personnel label (top-aligned, wrapped)
    drawCellText(page, ri.label, T.left, rowTop, wPer, regular, SZ_CELL);

    // Symbol: vertically centered in cell
    const symFont = ri.isActive ? bold : regular;
    const symSz   = ri.isActive ? SZ_SYM : SZ_CELL;
    const symCX   = (T.cSym + T.cDom) / 2;
    const symCY   = (rowTop + rowBottom) / 2 - symSz * 0.35;
    drawCentered(page, ri.symbolText, symCX, symCY, symFont, symSz);

    // Data columns — empty for inactive rows, wrapped text for active rows
    if (ri.isActive) {
      drawCellText(page, ri.domaine,    T.cDom, rowTop, wDom, regular, SZ_CELL);
      drawCellText(page, ri.ouvrage,    T.cOuv, rowTop, wOuv, regular, SZ_CELL);
      drawCellText(page, ri.indication, T.cInd, rowTop, wInd, regular, SZ_CELL);
    }

    curY = rowBottom;
  }

  // Vertical column separators spanning full data height
  for (const x of [T.left, T.cSym, T.cDom, T.cOuv, T.cInd, T.right]) {
    drawLine(page, x, tableBottom, x, T.dataTop);
  }
}

// ─── Fill page 1 (certificate with table) ────────────────────────────────────

function fillPage1(
  page: PDFPage,
  snapshot: VersionSnapshot,
  fonts: { regular: any; bold: any },
) {
  const { regular, bold } = fonts;
  const SZ = 9;

  drawText(page, snapshot.nDeTitre, P1.nDeTitre.x, P1.nDeTitre.y, bold, SZ);

  drawText(page, `${snapshot.prenom} ${snapshot.nom}`, P1.nomPrenom.x, P1.nomPrenom.y, bold, SZ);
  drawText(page, snapshot.matricule, P1.matricule.x,   P1.matricule.y, bold, SZ);
  drawText(page, snapshot.fonction,  P1.fonction.x,    P1.fonction.y,  bold, SZ);

  // Entité: clear the "/ /" placeholders and write hierarchical string
  clearRect(page, P1.entite.x, P1.entite.y - 2, 415, 12);
  const entiteParts = [snapshot.division, snapshot.service, snapshot.equipe].filter(Boolean) as string[];
  drawTextScaled(page, entiteParts.join(' / '), P1.entite.x, P1.entite.y, 410, bold, SZ);

  drawText(page, formatDateFrench(snapshot.dateValidation), P1.dateDelivrance.x, P1.dateDelivrance.y, regular, SZ);
  drawText(page, formatDateFrench(snapshot.dateExpiration), P1.valableJusquau.x,  P1.valableJusquau.y,  regular, SZ);

  // Dynamic table — variable-height rows based on content
  drawDynamicTable(page, snapshot, fonts);
}

// ─── Fill page 2 (AVIS page) ──────────────────────────────────────────────────

function fillPage2(
  page: PDFPage,
  snapshot: VersionSnapshot,
  fonts: { regular: any; bold: any },
) {
  const { regular, bold } = fonts;
  const SZ = 9;

  drawText(page, snapshot.nDeTitre, P2.nDeTitre.x, P2.nDeTitre.y, bold, SZ);

  // Write AUTORISATION SPECIALES VERSO below the "Autorisations (ou restrictions) spéciales :" label
  if (snapshot.autorisationSpecialesVerso) {
    const text = snapshot.autorisationSpecialesVerso;
    const margin = 35;
    const maxWidth = page.getWidth() - 2 * margin;
    const lineHeight = SZ * 1.4;
    let y = P2.autorisationY;

    // Bold header before the text
    const header = "AUTORISATION SPECIALES VERSO";
    const headerSize = SZ + 1;
    const headerW = bold.widthOfTextAtSize(header, headerSize);
    const headerX = (page.getWidth() - headerW) / 2;
    drawText(page, header, headerX, y, bold, headerSize);
    y -= lineHeight * 1.6;

    const words = text.split(/\s+/);
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (regular.widthOfTextAtSize(test, SZ) > maxWidth && line) {
        drawText(page, line, margin, y, regular, SZ);
        y -= lineHeight;
        line = word;
      } else {
        line = test;
      }
    }
    if (line) drawText(page, line, margin, y, regular, SZ);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateHabilitationPdf(
  snapshot: VersionSnapshot,
  versionNumber: number,
  pdfType?: 'ht' | 'st',
): Promise<{ pdfPath: string; pdfSize: number }> {
  const filteredSnapshot = pdfType ? filterSnapshotByType(snapshot, pdfType) : snapshot;
  validate(filteredSnapshot);

  const templateBytes = fs.readFileSync(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);

  const helvetica     = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular: helvetica, bold: helveticaBold };

  const pages = pdfDoc.getPages();
  if (pages[0]) fillPage1(pages[0], filteredSnapshot, fonts);
  if (pages[1]) fillPage2(pages[1], filteredSnapshot, fonts);

  const pdfBytes = await pdfDoc.save();
  const suffix = pdfType === 'st' ? '_ST' : pdfType === 'ht' ? '_HT' : '';
  const filename  = buildPdfFilename(snapshot.matricule, versionNumber, suffix);
  const fullPath  = resolvePdfPath(filename);
  fs.writeFileSync(fullPath, pdfBytes);

  const stats = fs.statSync(fullPath);
  if (stats.size === 0) throw new Error('Generated PDF is empty');

  return { pdfPath: filename, pdfSize: stats.size };
}

const TST_CODE_SET = new Set(['H1N', 'H1T', 'H2N', 'H2T']);

function filterSnapshotByType(snapshot: VersionSnapshot, pdfType: 'ht' | 'st'): VersionSnapshot {
  if (pdfType === 'ht') {
    return { ...snapshot, stCodes: [], htCodes: snapshot.htCodes };
  }
  return { ...snapshot, htCodes: [], stCodes: snapshot.stCodes };
}

export function getPdfPath(filename: string): string {
  return resolvePdfPath(filename);
}

export function pdfExists(filename: string): boolean {
  try {
    return fs.existsSync(resolvePdfPath(filename));
  } catch {
    return false;
  }
}

export function deletePdf(filename: string): void {
  try {
    const p = resolvePdfPath(filename);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch { /* invalid filename — nothing to delete */ }
}
