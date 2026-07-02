import PDFDocument from "pdfkit";
import type { Response } from "express";

const BRAND = "ONEE — Direction Transport Casablanca (DTC)";

export function startPdf(res: Response, filename: string, title: string) {
  const doc = new PDFDocument({ size: "A4", margin: 40 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  doc.pipe(res);

  doc.fontSize(9).fillColor("#666").text(BRAND, { align: "right" });
  doc.moveDown(0.5);
  doc.fontSize(16).fillColor("#0b0b0b").text(title, { align: "left" });
  doc.moveDown(0.2);
  doc.fontSize(9).fillColor("#666").text(`Généré le ${new Date().toLocaleDateString("fr-FR")}`, { align: "left" });
  doc.moveDown(1);
  doc.strokeColor("#e1e0d9").moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(0.8);
  doc.fillColor("#0b0b0b");
  return doc;
}

export function pdfTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: (string | number)[][],
  colWidths: number[],
) {
  const startX = 40;
  let y = doc.y;
  const rowHeight = 20;

  function drawRow(cells: (string | number)[], opts: { bold?: boolean; bg?: string } = {}) {
    if (y > 760) {
      doc.addPage();
      y = 40;
    }
    if (opts.bg) {
      doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill(opts.bg);
      doc.fillColor("#0b0b0b");
    }
    let x = startX;
    doc.fontSize(8).font(opts.bold ? "Helvetica-Bold" : "Helvetica");
    cells.forEach((cell, i) => {
      doc.text(String(cell ?? ""), x + 4, y + 6, { width: colWidths[i] - 8, ellipsis: true });
      x += colWidths[i];
    });
    y += rowHeight;
  }

  drawRow(headers, { bold: true, bg: "#e8f0fb" });
  rows.forEach((r) => drawRow(r));
  doc.y = y + 10;
}
