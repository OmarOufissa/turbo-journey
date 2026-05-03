/**
 * PDF GENERATION SERVICE
 * 
 * Generates habilitation PDFs from employee version snapshots only
 * CRITICAL: Uses ONLY employee_versions data (never raw employee fields)
 * File naming: hab{matricule}_v{version}.pdf
 * Duplicate handling: OVERWRITE (version number ensures uniqueness)
 */

import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';

// Types for employee snapshot data from employee_versions
interface EmployeeSnapshot {
  matricule: string;
  prenom: string;
  nom: string;
  fonction: string;
  division: string;
  service: string;
  equipe: string;
  stCodes: string[];
  htCodes: string[];
  numero?: string;
  dateValidation: string;
  dateExpiration: string;
}

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'pdfs');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Format date from DD/MM/YYYY to French locale format
 * Example: "14/02/2026" → "14 février 2026"
 */
function formatDateFrench(dateStr: string): string {
  try {
    const [day, month, year] = dateStr.split('/');
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    
    const formatter = new Intl.DateTimeFormat('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    
    return formatter.format(date);
  } catch (e) {
    return dateStr; // Fallback to original if parsing fails
  }
}

/**
 * Format habilitation codes for display
 * Rules:
 * - If array is empty: show "XXX"
 * - If one code: show code
 * - If multiple: show comma-separated
 */
function formatCodes(codes: string[]): string {
  if (!codes || codes.length === 0) {
    return 'XXX';
  }
  if (codes.length === 1) {
    return codes[0];
  }
  return codes.join(', ');
}

/**
 * Generate PDF from employee snapshot
 * 
 * @param snapshot - Employee snapshot from employee_versions table
 * @param versionNumber - Version number for file naming
 * @returns Promise with file path and size
 */
export async function generateHabilitationPdf(
  snapshot: EmployeeSnapshot,
  versionNumber: number
): Promise<{ pdfPath: string; pdfSize: number }> {
  return new Promise((resolve, reject) => {
    try {
      // Generate filename: hab{matricule}_v{version}.pdf
      const filename = `hab${snapshot.matricule}_v${versionNumber}.pdf`;
      const pdfPath = path.join(UPLOAD_DIR, filename);

      // Create PDF document
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
      });

      // Create write stream (overwrite if exists)
      const stream = fs.createWriteStream(pdfPath);

      // Pipe PDF to file
      doc.pipe(stream);

      // ======================================================================
      // PDF HEADER
      // ======================================================================

      // Title and employee info
      doc.fontSize(16).font('Helvetica-Bold').text('HABILITATION ELECTRIQUE', { align: 'center' });
      doc.moveDown(0.5);

      // Employee header info
      doc.fontSize(11).font('Helvetica');
      doc.text(`N° titre: ${snapshot.numero || 'N/A'}`, { align: 'left' });
      doc.fontSize(11).font('Helvetica-Bold');
      doc.text(`${snapshot.prenom} ${snapshot.nom}`, { align: 'left' });
      doc.fontSize(10).font('Helvetica');
      doc.text(`Matricule: ${snapshot.matricule}`, { align: 'left' });
      doc.moveDown(0.3);

      // Organization info
      doc.fontSize(9).font('Helvetica');
      doc.text(`Division: ${snapshot.division}`);
      doc.text(`Service: ${snapshot.service}`);
      doc.text(`Équipe: ${snapshot.equipe}`);
      doc.text(`Fonction: ${snapshot.fonction}`);
      doc.moveDown(0.5);

      // ======================================================================
      // DATES
      // ======================================================================

      doc.fontSize(10).font('Helvetica-Bold');
      doc.text('Dates de validité:');
      doc.fontSize(9).font('Helvetica');
      doc.text(`Date de validation: ${formatDateFrench(snapshot.dateValidation)}`);
      doc.text(`Date d'expiration: ${formatDateFrench(snapshot.dateExpiration)}`);
      doc.moveDown(0.5);

      // ======================================================================
      // HABILITATIONS TABLE
      // ======================================================================

      doc.fontSize(11).font('Helvetica-Bold');
      doc.text('Habilitations:');
      doc.moveDown(0.3);

      // Table-like structure with specific rows for electrical codes
      const tableStartY = doc.y;
      const tableWidth = 500;
      const cellHeight = 25;
      const col1Width = 200;
      const col2Width = 150;
      const col3Width = 150;

      // Function to draw a table row
      const drawTableRow = (label: string, stCode: string, htCode: string, y: number) => {
        doc.fontSize(9).font('Helvetica');
        
        // Draw row background alternately
        if (Math.floor((y - tableStartY) / cellHeight) % 2 === 0) {
          doc.rect(40, y, tableWidth, cellHeight).fill('#f5f5f5');
        }

        // Draw borders
        doc.strokeColor('black');
        doc.lineWidth(0.5);
        doc.rect(40, y, tableWidth, cellHeight).stroke();

        // Column separators
        doc.moveTo(240, y).lineTo(240, y + cellHeight).stroke();
        doc.moveTo(390, y).lineTo(390, y + cellHeight).stroke();

        // Text
        doc.fillColor('black');
        doc.text(label, 45, y + 5, { width: col1Width - 10, height: cellHeight - 10 });
        doc.text(stCode, 245, y + 5, { width: col2Width - 10, height: cellHeight - 10, align: 'center' });
        doc.text(htCode, 395, y + 5, { width: col3Width - 10, height: cellHeight - 10, align: 'center' });
      };

      // Header row
      const headerY = doc.y;
      doc.fontSize(9).font('Helvetica-Bold').fillColor('white');
      doc.rect(40, headerY, tableWidth, cellHeight).fill('#333333');
      doc.fillColor('white');
      doc.text('Code', 45, headerY + 5, { width: col1Width - 10 });
      doc.text('ST', 245, headerY + 5, { width: col2Width - 10, align: 'center' });
      doc.text('HT', 395, headerY + 5, { width: col3Width - 10, align: 'center' });

      // Data rows with specific electrical codes
      let currentY = headerY + cellHeight;
      const stCodesFormatted = formatCodes(snapshot.stCodes);
      const htCodesFormatted = formatCodes(snapshot.htCodes);

      const tableRows = [
        { label: 'H0V / B0V', st: 'ST' in snapshot && snapshot.stCodes.includes('H0V') ? '✓' : '', ht: 'HT' in snapshot && snapshot.htCodes.includes('B0V') ? '✓' : '' },
        { label: 'H1V / B1V', st: 'ST' in snapshot && snapshot.stCodes.includes('H1V') ? '✓' : '', ht: 'HT' in snapshot && snapshot.htCodes.includes('B1V') ? '✓' : '' },
        { label: 'H2V / B2V', st: 'ST' in snapshot && snapshot.stCodes.includes('H2V') ? '✓' : '', ht: 'HT' in snapshot && snapshot.htCodes.includes('B2V') ? '✓' : '' },
        { label: 'HC / BC', st: 'ST' in snapshot && snapshot.stCodes.includes('HC') ? '✓' : '', ht: 'HT' in snapshot && snapshot.htCodes.includes('BC') ? '✓' : '' },
        { label: 'SF6', st: 'ST' in snapshot && snapshot.stCodes.includes('SF6') ? '✓' : '', ht: 'HT' in snapshot && snapshot.htCodes.includes('SF6') ? '✓' : '' },
      ];

      tableRows.forEach((row) => {
        drawTableRow(row.label, row.st, row.ht, currentY);
        currentY += cellHeight;
      });

      doc.moveDown(3);

      // Summary line
      doc.fontSize(9).font('Helvetica');
      doc.text(`ST codes résumé: ${stCodesFormatted}`, { align: 'left' });
      doc.text(`HT codes résumé: ${htCodesFormatted}`, { align: 'left' });
      doc.moveDown(1);

      // Footer
      doc.fontSize(8).font('Helvetica').fillColor('#666666');
      doc.text('Ce document a été généré automatiquement par le système de gestion des habilitations.', { align: 'center' });
      doc.text(`Généré le: ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' });

      // Finish PDF
      doc.end();

      // Handle stream events
      stream.on('finish', () => {
        const stats = fs.statSync(pdfPath);
        resolve({
          pdfPath: filename,
          pdfSize: stats.size,
        });
      });

      stream.on('error', (err) => {
        reject(new Error(`Failed to write PDF file: ${err.message}`));
      });

      doc.on('error', (err) => {
        reject(new Error(`PDF generation error: ${err.message}`));
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Batch generate PDFs for multiple employees
 * Returns count of generated files and any errors
 */
export async function batchGeneratePdfs(
  snapshots: Array<{ snapshot: EmployeeSnapshot; versionNumber: number }>
): Promise<{ generated: number; errors: Array<{ matricule: string; error: string }> }> {
  const results = { generated: 0, errors: [] as Array<{ matricule: string; error: string }> };

  for (const item of snapshots) {
    try {
      await generateHabilitationPdf(item.snapshot, item.versionNumber);
      results.generated++;
    } catch (error) {
      results.errors.push({
        matricule: item.snapshot.matricule,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

/**
 * Get PDF file path for download
 */
export function getPdfPath(filename: string): string {
  return path.join(UPLOAD_DIR, filename);
}

/**
 * Check if PDF exists
 */
export function pdfExists(filename: string): boolean {
  return fs.existsSync(path.join(UPLOAD_DIR, filename));
}

/**
 * Delete PDF file
 */
export function deletePdf(filename: string): void {
  const filePath = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
