/**
 * HABILITATION REQUEST PDF GENERATION
 *
 * Renders the "Demande d'habilitation" forms following the layout of the
 * official ONEE annexes:
 *  - Annexe n°2: "Demande d'habilitation ... hors tension et BR"
 *  - Annexe n°3 / "Annexe demande HAE TST": "... sous tension" (with the
 *    Symbole / Domaine de tension / Ouvrages concernés table)
 *
 * Labels, section order and signature blocks mirror the official forms.
 * Only the data cells are filled in automatically; nothing regulatory is
 * reworded.
 */

import PDFDocument from "pdfkit";
import { HabilitationRequestType, getSymbolsForType } from "../../shared/habilitationSymbols";

export interface HabilitationRequestOuvrage {
  name: string;
  tensionDomain: string;
}

export interface HabilitationRequestPdfData {
  employee: {
    matricule: string;
    prenom: string;
    nom: string;
    fonction: string;
    division: string;
    service: string;
    equipe: string;
  };
  type: HabilitationRequestType;
  symbols: string[];
  ouvrages: HabilitationRequestOuvrage[];
}

const MARGIN = 40;
const PAGE_WIDTH = 595.28; // A4 pt

function drawHeader(doc: PDFKit.PDFDocument, title: string) {
  doc
    .fontSize(10)
    .font("Helvetica-Bold")
    .text("ONEE - Branche Électricité", MARGIN, MARGIN, { align: "left" });
  doc.fontSize(8).font("Helvetica").text("Direction du Personnel", MARGIN, doc.y);

  doc.moveDown(1);
  doc
    .fontSize(13)
    .font("Helvetica-Bold")
    .text(title, MARGIN, doc.y, { align: "center", width: PAGE_WIDTH - MARGIN * 2 });
  doc.moveDown(1);
  doc
    .moveTo(MARGIN, doc.y)
    .lineTo(PAGE_WIDTH - MARGIN, doc.y)
    .lineWidth(1)
    .strokeColor("#333333")
    .stroke();
  doc.moveDown(0.8);
}

function drawLabeledLine(doc: PDFKit.PDFDocument, label: string, value: string) {
  doc.font("Helvetica-Bold").fontSize(10).text(`${label} : `, MARGIN, doc.y, { continued: true });
  doc.font("Helvetica").text(value || "..............................");
}

function drawAgentBlock(doc: PDFKit.PDFDocument, employee: HabilitationRequestPdfData["employee"]) {
  doc.moveDown(0.5);
  doc.font("Helvetica").fontSize(10).text("Il est proposé l'agent :", MARGIN, doc.y);
  doc.moveDown(0.3);

  const rows: Array<[string, string]> = [
    ["Prénom", employee.prenom],
    ["Nom", employee.nom],
    ["Matricule", employee.matricule],
    ["Fonction", employee.fonction || "..............................."],
    ["Division", employee.division],
    ["Service", employee.service],
    ["Équipe", employee.equipe],
  ];

  const colWidth = (PAGE_WIDTH - MARGIN * 2) / 2;
  for (let i = 0; i < rows.length; i += 2) {
    const y = doc.y;
    drawLabeledLine(doc, rows[i][0], rows[i][1]);
    if (rows[i + 1]) {
      doc.font("Helvetica-Bold").fontSize(10).text(`${rows[i + 1][0]} : `, MARGIN + colWidth, y, {
        continued: true,
      });
      doc.font("Helvetica").text(rows[i + 1][1]);
    }
  }
  doc.moveDown(0.5);
}

function drawSymbolsTable(
  doc: PDFKit.PDFDocument,
  type: HabilitationRequestType,
  selected: string[],
) {
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .text(
      type === "HT"
        ? "Pour le former à l'habilitation suivante / aux habilitations suivantes :"
        : "Pour l'attribution de l'habilitation suivante :",
      MARGIN,
      doc.y,
    );
  doc.moveDown(0.4);

  const allSymbols = getSymbolsForType(type);
  const tableWidth = PAGE_WIDTH - MARGIN * 2;
  const perRow = 6;
  const cellWidth = tableWidth / perRow;
  const cellHeight = 26;

  let x = MARGIN;
  let y = doc.y;

  allSymbols.forEach((symbol, idx) => {
    if (idx > 0 && idx % perRow === 0) {
      x = MARGIN;
      y += cellHeight;
    }
    const isSelected = selected.includes(symbol.code);
    doc.rect(x, y, cellWidth, cellHeight).lineWidth(0.5).strokeColor("#000000").stroke();
    if (isSelected) {
      doc.rect(x, y, cellWidth, cellHeight).fill("#e8f0fe");
      doc.strokeColor("#000000").rect(x, y, cellWidth, cellHeight).stroke();
    }
    doc
      .fillColor("#000000")
      .font(isSelected ? "Helvetica-Bold" : "Helvetica")
      .fontSize(10)
      .text(symbol.code, x, y + 6, { width: cellWidth, align: "center" });
    if (isSelected) {
      doc.fontSize(8).text("(sélectionné)", x, y + 16, { width: cellWidth, align: "center" });
    }
    x += cellWidth;
  });

  doc.y = y + cellHeight + 8;
  doc.fillColor("#000000").font("Helvetica").fontSize(8).text(
    "Les symboles marqués correspondent aux habilitations demandées pour cet agent.",
    MARGIN,
    doc.y,
  );
  doc.moveDown(0.6);
}

function drawChampApplicationTable(
  doc: PDFKit.PDFDocument,
  type: HabilitationRequestType,
  symbols: string[],
  ouvrages: HabilitationRequestOuvrage[],
) {
  doc.font("Helvetica-Bold").fontSize(11).text("Le champ d'application est comme suit :", MARGIN, doc.y);
  doc.moveDown(0.3);

  const tableWidth = PAGE_WIDTH - MARGIN * 2;
  const col1 = tableWidth * 0.25;
  const col2 = tableWidth * 0.25;
  const col3 = tableWidth * 0.5;
  const headerHeight = 20;

  let y = doc.y;
  doc.font("Helvetica-Bold").fontSize(9);
  doc.rect(MARGIN, y, col1, headerHeight).stroke();
  doc.text("Symbole d'habilitation", MARGIN, y + 5, { width: col1, align: "center" });
  doc.rect(MARGIN + col1, y, col2, headerHeight).stroke();
  doc.text("Domaine de tension", MARGIN + col1, y + 5, { width: col2, align: "center" });
  doc.rect(MARGIN + col1 + col2, y, col3, headerHeight).stroke();
  doc.text("Ouvrages concernés", MARGIN + col1 + col2, y + 5, { width: col3, align: "center" });
  y += headerHeight;

  const ouvrageNames = ouvrages.map((o) => o.name).join(", ") || "...............................";
  const infos = getSymbolsForType(type).filter((s) => symbols.includes(s.code));

  doc.font("Helvetica").fontSize(9);
  for (const info of infos) {
    const rowHeight = 22;
    doc.rect(MARGIN, y, col1, rowHeight).stroke();
    doc.text(info.code, MARGIN, y + 6, { width: col1, align: "center" });
    doc.rect(MARGIN + col1, y, col2, rowHeight).stroke();
    doc.text(info.tensionDomain, MARGIN + col1, y + 6, { width: col2, align: "center" });
    doc.rect(MARGIN + col1 + col2, y, col3, rowHeight).stroke();
    doc.text(ouvrageNames, MARGIN + col1 + col2, y + 6, { width: col3 - 10, align: "left" });
    y += rowHeight;
  }

  doc.y = y + 8;
}

function drawOuvragesLine(doc: PDFKit.PDFDocument, ouvrages: HabilitationRequestOuvrage[]) {
  const names = ouvrages.map((o) => `${o.name} (${o.tensionDomain})`).join(", ");
  doc.font("Helvetica-Bold").fontSize(10).text("Ouvrages concernés : ", MARGIN, doc.y, { continued: true });
  doc.font("Helvetica").text(names || "...............................");
  doc.moveDown(0.6);
}

function drawSignatureBlock(doc: PDFKit.PDFDocument) {
  doc.moveDown(1.5);
  const colWidth = (PAGE_WIDTH - MARGIN * 2) / 2;
  const y = doc.y;
  doc.font("Helvetica-Bold").fontSize(10);
  doc.text("Le Chef de l'entité concernée :", MARGIN, y, { width: colWidth });
  doc.text("Le Directeur concerné :", MARGIN + colWidth, y, { width: colWidth });
  doc.moveDown(2.5);
  const y2 = doc.y;
  doc.font("Helvetica").fontSize(9);
  doc.text("Date, cachet et signature :", MARGIN, y2, { width: colWidth });
  doc.text("Date, cachet et signature :", MARGIN + colWidth, y2, { width: colWidth });
}

function drawFooter(doc: PDFKit.PDFDocument) {
  const bottom = doc.page.height - MARGIN + 10;
  const previousBottomMargin = doc.page.margins.bottom;
  // Temporarily zero out the bottom margin so writing inside it doesn't
  // trigger pdfkit's automatic page break.
  doc.page.margins.bottom = 0;
  doc
    .fontSize(7)
    .fillColor("#666666")
    .font("Helvetica")
    .text(
      `Document généré automatiquement par le module de demande d'habilitation - ${new Date().toLocaleDateString("fr-FR")}`,
      MARGIN,
      bottom,
      { align: "center", width: PAGE_WIDTH - MARGIN * 2, lineBreak: false },
    );
  doc.page.margins.bottom = previousBottomMargin;
}

export function generateHabilitationRequestPdf(data: HabilitationRequestPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true });
      const chunks: Buffer[] = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const title =
        data.type === "HT"
          ? "Demande d'habilitation pour manœuvres, travaux et interventions sur les ouvrages électriques hors tension et BR"
          : "Demande d'habilitation pour manœuvres, travaux et interventions sur les ouvrages électriques sous tension";

      drawHeader(doc, title);
      drawAgentBlock(doc, data.employee);
      drawSymbolsTable(doc, data.type, data.symbols);

      if (data.type === "ST") {
        drawChampApplicationTable(doc, data.type, data.symbols, data.ouvrages);
      } else {
        drawOuvragesLine(doc, data.ouvrages);
      }

      drawSignatureBlock(doc);
      drawFooter(doc);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
