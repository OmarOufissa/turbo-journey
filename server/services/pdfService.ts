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
  service: string;
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

const FRENCH_MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

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

// Table rows: label + which ST and HT codes map to this row
const TABLE_ROWS: Array<{ label: string; stKey: string; htKey: string }> = [
  { label: 'H0V - B0V', stKey: 'H0V', htKey: 'B0V' },
  { label: 'H1V - B1V', stKey: 'H1V', htKey: 'B1V' },
  { label: 'BR',        stKey: 'BR',  htKey: 'BR'  },
  { label: 'H2V - B2V', stKey: 'H2V', htKey: 'B2V' },
  { label: 'HC - BC',   stKey: 'HC',  htKey: 'BC'  },
  { label: 'SF6',       stKey: 'SF6', htKey: 'SF6' },
];

function cellCode(codes: string[], key: string): string {
  if (!codes || codes.length === 0) return 'XXX';
  if (codes.length === 1) return codes[0];
  return codes.includes(key) ? key : '';
}

export async function generateHabilitationPdf(
  snapshot: VersionSnapshot,
  versionNumber: number
): Promise<{ pdfPath: string; pdfSize: number }> {
  return new Promise((resolve, reject) => {
    try {
      const filename = `hab${snapshot.matricule}_v${versionNumber}.pdf`;
      const fullPath = path.join(UPLOAD_DIR, filename);
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(fullPath);
      doc.pipe(stream);

      // Header
      doc.fontSize(14).font('Helvetica-Bold').text('HABILITATION ÉLECTRIQUE', { align: 'center' });
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica-Bold').text(`${snapshot.prenom} ${snapshot.nom}`, { align: 'center' });
      doc.fontSize(9).font('Helvetica').text(`Matricule: ${snapshot.matricule}`, { align: 'center' });
      doc.moveDown(0.5);

      // Org info
      const entite = [snapshot.division, snapshot.service, snapshot.equipe].filter(Boolean).join(' / ');
      doc.fontSize(9).text(`Entité: ${entite}`);
      doc.text(`Fonction: ${snapshot.fonction}`);
      doc.text(`Direction: Transport Région centre - Casablanca`);
      doc.text(`N° de titre: ${snapshot.nDeTitre}`);
      doc.text(`Date de validation: ${formatDateFrench(snapshot.dateValidation)}`);
      doc.text(`Date d'expiration: ${formatDateFrench(snapshot.dateExpiration)}`);
      doc.moveDown(0.5);

      // Table
      const tableX = 50;
      const tableW = doc.page.width - 100;
      const col1 = tableW * 0.4;
      const col2 = tableW * 0.3;
      const col3 = tableW * 0.3;
      const rowH = 22;

      // Header row
      doc.fontSize(8).font('Helvetica-Bold');
      const hY = doc.y;
      doc.rect(tableX, hY, tableW, rowH).fillAndStroke('#333333', '#333333');
      doc.fillColor('white');
      doc.text('Code', tableX + 4, hY + 6, { width: col1 - 4 });
      doc.text('ST', tableX + col1 + 4, hY + 6, { width: col2 - 8, align: 'center' });
      doc.text('HT', tableX + col1 + col2 + 4, hY + 6, { width: col3 - 8, align: 'center' });
      doc.fillColor('black');

      let rowY = hY + rowH;
      TABLE_ROWS.forEach((row, i) => {
        const bg = i % 2 === 0 ? '#f9f9f9' : '#ffffff';
        doc.rect(tableX, rowY, tableW, rowH).fillAndStroke(bg, '#cccccc');

        const stVal = cellCode(snapshot.stCodes, row.stKey);
        const htVal = cellCode(snapshot.htCodes, row.htKey);

        doc.fontSize(8).font('Helvetica').fillColor('black');
        doc.text(row.label, tableX + 4, rowY + 6, { width: col1 - 4 });
        doc.text(stVal, tableX + col1 + 4, rowY + 6, { width: col2 - 8, align: 'center' });
        doc.text(htVal, tableX + col1 + col2 + 4, rowY + 6, { width: col3 - 8, align: 'center' });

        rowY += rowH;
      });

      // Footer
      doc.moveDown(2);
      doc.fontSize(7).fillColor('#888888').text(
        `Document généré automatiquement le ${formatDateFrench(new Date().toISOString().split('T')[0])}`,
        { align: 'center' }
      );

      doc.end();
      stream.on('finish', () => {
        const stats = fs.statSync(fullPath);
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
