import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

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
  dateValidation: string;
  dateExpiration: string;
}

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
    const day = d.getUTCDate();
    const month = FRENCH_MONTHS[d.getUTCMonth()];
    const year = d.getUTCFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return dateStr;
  }
}

// Row definitions: label | stKey | htKey
const TABLE_ROWS: Array<{ label: string; stKey: string; htKey: string }> = [
  { label: 'H0V / B0V', stKey: 'H0V', htKey: 'B0V' },
  { label: 'H1V / B1V', stKey: 'H1V', htKey: 'B1V' },
  { label: 'BR',        stKey: 'BR',  htKey: 'BR'  },
  { label: 'H2V / B2V', stKey: 'H2V', htKey: 'B2V' },
  { label: 'HC / BC',   stKey: 'HC',  htKey: 'BC'  },
  { label: 'SF6',       stKey: 'SF6', htKey: 'SF6' },
];

// Pre-validation errors
export class PdfValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfValidationError';
  }
}

function validateSnapshot(snapshot: VersionSnapshot): void {
  if (!snapshot.nDeTitre || snapshot.nDeTitre.trim().length === 0) {
    throw new PdfValidationError('n_de_titre is required');
  }
  if (snapshot.stCodes.length === 0 && snapshot.htCodes.length === 0) {
    throw new PdfValidationError('Employee must have at least one ST or HT code');
  }
  if (snapshot.dateExpiration <= snapshot.dateValidation) {
    throw new PdfValidationError('date_expiration must be after date_validation');
  }
}

function cellValue(codes: string[], key: string, isEmpty: boolean): string {
  if (isEmpty) return 'XXX';
  return codes.includes(key) ? '✓' : '';
}

export async function generateHabilitationPdf(
  snapshot: VersionSnapshot,
  versionNumber: number
): Promise<{ pdfPath: string; pdfSize: number }> {
  validateSnapshot(snapshot);

  return new Promise((resolve, reject) => {
    try {
      const filename = `hab${snapshot.matricule}_v${versionNumber}.pdf`;
      const fullPath = path.join(UPLOAD_DIR, filename);
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(fullPath);
      doc.pipe(stream);

      const pageW = doc.page.width;   // 595
      const marginL = 50;
      const marginR = 50;
      const contentW = pageW - marginL - marginR;

      // ── Title ──────────────────────────────────────────────────────────────
      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .text(`Titre D'Habilitation N°${snapshot.nDeTitre}`, marginL, 50, {
          width: contentW,
          align: 'center',
        });

      doc.moveDown(1.2);

      // ── Info block ─────────────────────────────────────────────────────────
      const labelX = marginL;
      const valueX = marginL + 170;
      const lineH = 18;

      function infoLine(label: string, value: string) {
        const y = doc.y;
        doc.fontSize(10).font('Helvetica-Bold').text(label, labelX, y, { continued: false });
        doc.fontSize(10).font('Helvetica').text(value, valueX, y, { width: contentW - 170 });
        doc.y = y + lineH;
      }

      const entiteParts = [snapshot.division, snapshot.service, snapshot.equipe].filter(Boolean);
      const entite = entiteParts.join(' / ');

      infoLine('Nom et prénom :', `${snapshot.prenom} ${snapshot.nom}`);
      infoLine('Entité :', entite);
      infoLine('Fonction :', snapshot.fonction);
      infoLine('Direction :', 'Transport Région centre - Casablanca');
      infoLine('Date de délivrance :', formatDateFrench(snapshot.dateValidation));
      infoLine('Valable jusqu\'au :', formatDateFrench(snapshot.dateExpiration));

      doc.moveDown(1.5);

      // ── Table ──────────────────────────────────────────────────────────────
      const tableX = marginL;
      const tableW = contentW;
      const col0 = tableW * 0.45;   // Symbole
      const col1 = tableW * 0.275;  // ST
      const col2 = tableW * 0.275;  // HT
      const rowH = 24;
      const headerH = 28;

      const stEmpty = snapshot.stCodes.length === 0;
      const htEmpty = snapshot.htCodes.length === 0;

      // Header
      const hY = doc.y;
      doc.rect(tableX, hY, tableW, headerH).fillAndStroke('#1a1a2e', '#1a1a2e');
      doc.fillColor('white').fontSize(10).font('Helvetica-Bold');
      doc.text('Symbole d\'habilitation', tableX + 6, hY + 8, { width: col0 - 6 });
      doc.text('ST', tableX + col0 + 4, hY + 8, { width: col1 - 8, align: 'center' });
      doc.text('HT', tableX + col0 + col1 + 4, hY + 8, { width: col2 - 8, align: 'center' });

      let rowY = hY + headerH;

      TABLE_ROWS.forEach((row, i) => {
        const bg = i % 2 === 0 ? '#f4f6fb' : '#ffffff';
        doc.rect(tableX, rowY, tableW, rowH).fillAndStroke(bg, '#c0c8d8');

        const stVal = cellValue(snapshot.stCodes, row.stKey, stEmpty);
        const htVal = cellValue(snapshot.htCodes, row.htKey, htEmpty);

        doc.fillColor('#222222').fontSize(10).font('Helvetica');
        doc.text(row.label, tableX + 6, rowY + 6, { width: col0 - 6 });

        // ST cell
        const stColor = stVal === 'XXX' ? '#cc0000' : stVal === '✓' ? '#1a6b2e' : '#aaaaaa';
        doc.fillColor(stColor).font(stVal === '✓' ? 'Helvetica-Bold' : 'Helvetica');
        doc.text(stVal, tableX + col0 + 4, rowY + 6, { width: col1 - 8, align: 'center' });

        // HT cell
        const htColor = htVal === 'XXX' ? '#cc0000' : htVal === '✓' ? '#1a6b2e' : '#aaaaaa';
        doc.fillColor(htColor).font(htVal === '✓' ? 'Helvetica-Bold' : 'Helvetica');
        doc.text(htVal, tableX + col0 + col1 + 4, rowY + 6, { width: col2 - 8, align: 'center' });

        rowY += rowH;
      });

      // ── Footer ─────────────────────────────────────────────────────────────
      const pageH = doc.page.height;
      const footerY = pageH - 40;
      const generatedDate = formatDateFrench(new Date().toISOString().split('T')[0]);

      doc.fillColor('#888888').fontSize(7).font('Helvetica');
      doc.text(
        `Document généré le ${generatedDate}`,
        marginL,
        footerY,
        { width: contentW / 2, align: 'left' }
      );
      doc.text(
        `Version: v${versionNumber}`,
        marginL + contentW / 2,
        footerY,
        { width: contentW / 2, align: 'right' }
      );

      doc.end();

      stream.on('finish', () => {
        const stats = fs.statSync(fullPath);
        if (stats.size === 0) {
          reject(new Error('Generated PDF is empty'));
          return;
        }
        resolve({ pdfPath: filename, pdfSize: stats.size });
      });
      stream.on('error', reject);
      doc.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
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
