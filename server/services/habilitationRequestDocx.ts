/**
 * HABILITATION REQUEST DOCUMENT GENERATION
 *
 * Fills the official ONEE request forms with the agent's data. Nothing
 * regulatory is reworded:
 *  - ST: fills `server/templates/annexe_ST.docx`, the real "Annexe demande
 *    HAE TST" file, in place (via docxtemplater). Only the blanks are filled.
 *  - HT: no editable original file was available (only a legacy .doc), so
 *    the HT form is (re)built from scratch to match Annexe n°2's wording,
 *    reusing the same real ONEE letterhead image.
 *
 * Font is Arial 10pt throughout (set once via the document's default run
 * style); filled-in data is bold so it stands out from the static labels.
 */

import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  ImageRun,
  WidthType,
  AlignmentType,
} from "docx";
import { getTensionDomainLabel, HT_SYMBOLS, ST_SYMBOLS } from "../../shared/habilitationSymbols";

export interface HabilitationRequestRow {
  symbole: string;
  domaine: string;
  ouvrages: string;
}

export interface HabilitationRequestPerson {
  prenom: string;
  nom: string;
  matricule: string;
  fonction: string;
}

export interface HabilitationRequestData {
  direction: string;
  division: string;
  entite: string;
  chef: HabilitationRequestPerson;
  agent: HabilitationRequestPerson;
  type: "HT" | "ST";
  rows: HabilitationRequestRow[];
}

const ST_TEMPLATE_PATH = path.join(process.cwd(), "server", "templates", "annexe_ST.docx");
const LOGO_PATH = path.join(process.cwd(), "server", "assets", "onee-logo.png");

/** "Nom Prénom" - surname first, per the preferred display order. */
function fullName(person: HabilitationRequestPerson): string {
  return `${person.nom} ${person.prenom}`.trim();
}

/**
 * Marks unused symbols in a "Habilitations(1)" legend table by drawing a
 * diagonal line across the whole cell (a table cell border), not a
 * character on top of the symbol - the symbol itself stays untouched and
 * legible. Works as a post-processing pass on the finished document, so
 * the same code applies identically whether the legend table came from the
 * real ST template (docxtemplater) or was built from scratch for HT (the
 * `docx` library has no diagonal-border option, hence doing it here).
 *
 * The legend table is found by its "Habilitations" label cell; each
 * subsequent row is assumed to be [label cell, 8 symbol cells] in
 * `allSymbols` order (true for both documents - see legendTable() below and
 * the ST template's own row layout).
 */
async function markUnusedSymbolsWithDiagonal(
  buffer: Buffer,
  allSymbols: readonly string[],
  usedSymbols: string[],
): Promise<Buffer> {
  const DIAGONAL_BORDER =
    '<w:tcBorders><w:tl2br w:val="single" w:sz="8" w:space="0" w:color="000000"/></w:tcBorders>';
  const CELLS_PER_ROW = 9; // 1 label cell + 8 symbol cells

  function withDiagonalBorder(cellXml: string): string {
    const tcW = cellXml.match(/<w:tcW\b[^>]*\/>/);
    if (tcW) {
      const at = cellXml.indexOf(tcW[0]) + tcW[0].length;
      return cellXml.slice(0, at) + DIAGONAL_BORDER + cellXml.slice(at);
    }
    const tcPrOpen = cellXml.indexOf("<w:tcPr>");
    if (tcPrOpen !== -1) {
      const at = tcPrOpen + "<w:tcPr>".length;
      return cellXml.slice(0, at) + DIAGONAL_BORDER + cellXml.slice(at);
    }
    const openTag = cellXml.match(/^<w:tc\b[^>]*>/);
    const tag = openTag ? openTag[0] : "<w:tc>";
    return tag + `<w:tcPr>${DIAGONAL_BORDER}</w:tcPr>` + cellXml.slice(tag.length);
  }

  const zip = new PizZip(buffer);
  const file = zip.file("word/document.xml");
  if (!file) return buffer;
  const xml = file.asText();

  const labelIdx = xml.indexOf(">Habilitations");
  const tblStart = labelIdx === -1 ? -1 : xml.lastIndexOf("<w:tbl>", labelIdx);
  const tblEnd = labelIdx === -1 ? -1 : xml.indexOf("</w:tbl>", labelIdx) + "</w:tbl>".length;
  if (tblStart === -1 || tblEnd === -1) return buffer;

  let cellIndex = -1;
  let symbolIndex = 0;
  const patchedTable = xml.slice(tblStart, tblEnd).replace(/<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g, (cellXml) => {
    cellIndex++;
    if (cellIndex % CELLS_PER_ROW === 0) return cellXml; // label cell
    const symbol = allSymbols[symbolIndex];
    symbolIndex++;
    return symbol && !usedSymbols.includes(symbol) ? withDiagonalBorder(cellXml) : cellXml;
  });

  zip.file("word/document.xml", xml.slice(0, tblStart) + patchedTable + xml.slice(tblEnd));
  return zip.generate({ type: "nodebuffer" });
}

export async function generateSTRequestDocx(data: HabilitationRequestData): Promise<Buffer> {
  const content = fs.readFileSync(ST_TEMPLATE_PATH, "binary");
  const zip = new PizZip(content);
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

  doc.render({
    direction: data.direction,
    division: data.division,
    entite: data.entite,
    chef_prenom: data.chef.prenom,
    chef_nom: data.chef.nom,
    chef_matricule: data.chef.matricule,
    chef_fonction: data.chef.fonction,
    agent_full_name: fullName(data.agent),
    agent_prenom: data.agent.prenom,
    agent_nom: data.agent.nom,
    agent_matricule: data.agent.matricule,
    agent_fonction: data.agent.fonction,
    rows: data.rows.map((r) => ({
      symbole: r.symbole,
      domaine: getTensionDomainLabel(r.domaine),
      ouvrages: r.ouvrages,
    })),
  });

  const buffer = doc.getZip().generate({ type: "nodebuffer" });
  return markUnusedSymbolsWithDiagonal(buffer, ST_SYMBOLS, data.rows.map((r) => r.symbole));
}

/** Label (normal weight) followed by a filled-in value (bold, so it stands out). */
function labeledLine(label: string, value: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `${label} : ` }), new TextRun({ text: value, bold: true })],
  });
}

function personLine(person: HabilitationRequestPerson): Paragraph {
  return new Paragraph({
    children: [
      new TextRun({ text: "Nom : " }),
      new TextRun({ text: person.nom, bold: true }),
      new TextRun({ text: "   Prénom : " }),
      new TextRun({ text: person.prenom, bold: true }),
      new TextRun({ text: "   Mle : " }),
      new TextRun({ text: person.matricule, bold: true }),
    ],
  });
}

/**
 * Legend row of every valid symbol for the type. Symbols stay plain here;
 * unused ones get a diagonal line across their cell afterwards, via
 * markUnusedSymbolsWithDiagonal() (the docx library has no diagonal-border
 * option, so that step works directly on the rendered XML).
 */
function legendTable(allSymbols: readonly string[]): Table {
  const cell = (text: string, bold = false) =>
    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold })] })] });
  const symbolCell = (symbol: string) =>
    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: symbol, bold: true })] })] });

  const perRow = 8;
  const rows: TableRow[] = [];
  for (let i = 0; i < allSymbols.length; i += perRow) {
    const chunk = allSymbols.slice(i, i + perRow);
    rows.push(
      new TableRow({
        children: [i === 0 ? cell("Habilitations (1)", true) : cell(""), ...chunk.map(symbolCell)],
      }),
    );
  }

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function habilitationTable(rows: HabilitationRequestRow[]): Table {
  const cell = (text: string, bold = false) =>
    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold })] })] });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          cell("Symbole d'habilitation", true),
          cell("Domaine de tension", true),
          cell("Ouvrages concernés", true),
        ],
      }),
      ...rows.map(
        (r) =>
          new TableRow({
            children: [
              cell(r.symbole, true),
              cell(getTensionDomainLabel(r.domaine), true),
              cell(r.ouvrages, true),
            ],
          }),
      ),
    ],
  });
}

function signatureBlock(): Table {
  const headerCell = (text: string) =>
    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })] });
  const signatureCell = () =>
    new TableCell({
      children: [
        new Paragraph({ text: "" }),
        new Paragraph({ text: "" }),
        new Paragraph({ children: [new TextRun({ text: "Date, cachet et signature :" })] }),
      ],
    });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [headerCell("Le Chef de l'entité concernée :"), headerCell("Le Directeur concerné :")],
      }),
      new TableRow({ children: [signatureCell(), signatureCell()] }),
    ],
  });
}

export async function generateHTRequestDocx(data: HabilitationRequestData): Promise<Buffer> {
  const logo = fs.readFileSync(LOGO_PATH);

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 20 },
        },
      },
    },
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new ImageRun({
                data: logo,
                transformation: { width: 420, height: 55 },
                type: "png",
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                bold: true,
                size: 24,
                text:
                  "Demande d'habilitation pour manœuvres, travaux et interventions sur les ouvrages électriques hors tension et BR",
              }),
            ],
          }),
          new Paragraph({ text: "" }),
          labeledLine("Direction", data.direction),
          labeledLine("Division", data.division),
          labeledLine("Entité", data.entite),
          new Paragraph({ text: "" }),
          new Paragraph({ children: [new TextRun({ text: "Je soussigné :" })] }),
          personLine(data.chef),
          new Paragraph({
            children: [
              new TextRun({ text: "Fonction : " }),
              new TextRun({ text: data.chef.fonction, bold: true }),
              new TextRun({ text: "   propose l'agent : " }),
              new TextRun({ text: fullName(data.agent), bold: true }),
            ],
          }),
          new Paragraph({ text: "" }),
          personLine(data.agent),
          labeledLine("Fonction", data.agent.fonction),
          new Paragraph({ text: "" }),
          new Paragraph({
            children: [
              new TextRun({
                bold: true,
                text: "Pour le former à l'habilitation suivante / aux habilitations suivantes :",
              }),
            ],
          }),
          legendTable(HT_SYMBOLS),
          new Paragraph({ children: [new TextRun({ text: "(1) : Barrer la mention inutile." })] }),
          new Paragraph({ text: "" }),
          new Paragraph({
            children: [new TextRun({ bold: true, text: "Le champ d'application est comme suit :" })],
          }),
          habilitationTable(data.rows),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "" }),
          signatureBlock(),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  return markUnusedSymbolsWithDiagonal(buffer, HT_SYMBOLS, data.rows.map((r) => r.symbole));
}

export async function generateHabilitationRequestDocx(data: HabilitationRequestData): Promise<Buffer> {
  return data.type === "ST" ? generateSTRequestDocx(data) : generateHTRequestDocx(data);
}
