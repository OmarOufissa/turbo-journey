/**
 * HABILITATION REQUEST WORD (.docx) GENERATION
 *
 * Optional editable counterpart to habilitationRequestPdf.ts, built from the
 * same data and following the same section order / labels as the official
 * ONEE annexes (see habilitationRequestPdf.ts for details).
 */

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  AlignmentType,
  HeadingLevel,
} from "docx";
import { getSymbolsForType } from "../../shared/habilitationSymbols";
import { HabilitationRequestPdfData } from "./habilitationRequestPdf";

function cell(text: string, opts: { bold?: boolean; width?: number } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts.bold })] })],
  });
}

export async function generateHabilitationRequestDocx(
  data: HabilitationRequestPdfData,
): Promise<Buffer> {
  const title =
    data.type === "HT"
      ? "Demande d'habilitation pour manœuvres, travaux et interventions sur les ouvrages électriques hors tension et BR"
      : "Demande d'habilitation pour manœuvres, travaux et interventions sur les ouvrages électriques sous tension";

  const allSymbols = getSymbolsForType(data.type);
  const ouvrageNames =
    data.ouvrages.map((o) => `${o.name} (${o.tensionDomain})`).join(", ") || "...............................";

  const children: (Paragraph | Table)[] = [
    new Paragraph({
      children: [new TextRun({ text: "ONEE - Branche Électricité", bold: true, size: 20 })],
    }),
    new Paragraph({ children: [new TextRun({ text: "Direction du Personnel", size: 16 })] }),
    new Paragraph({ text: "" }),
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: title, bold: true })],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun({ text: "Prénom : ", bold: true }),
        new TextRun({ text: data.employee.prenom }),
        new TextRun({ text: "    Nom : ", bold: true }),
        new TextRun({ text: data.employee.nom }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Matricule : ", bold: true }),
        new TextRun({ text: data.employee.matricule }),
        new TextRun({ text: "    Fonction : ", bold: true }),
        new TextRun({ text: data.employee.fonction || "..............." }),
      ],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: "Division : ", bold: true }),
        new TextRun({ text: data.employee.division }),
        new TextRun({ text: "    Service : ", bold: true }),
        new TextRun({ text: data.employee.service }),
        new TextRun({ text: "    Équipe : ", bold: true }),
        new TextRun({ text: data.employee.equipe }),
      ],
    }),
    new Paragraph({ text: "" }),
    new Paragraph({
      children: [
        new TextRun({
          bold: true,
          text:
            data.type === "HT"
              ? "Pour le former à l'habilitation suivante / aux habilitations suivantes :"
              : "Pour l'attribution de l'habilitation suivante :",
        }),
      ],
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: allSymbols.map((s) => cell(s.code, { bold: true })),
        }),
        new TableRow({
          children: allSymbols.map((s) =>
            cell(data.symbols.includes(s.code) ? "X" : "", {}),
          ),
        }),
      ],
    }),
    new Paragraph({ text: "" }),
  ];

  if (data.type === "ST") {
    children.push(
      new Paragraph({
        children: [new TextRun({ bold: true, text: "Le champ d'application est comme suit :" })],
      }),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              cell("Symbole d'habilitation", { bold: true, width: 25 }),
              cell("Domaine de tension", { bold: true, width: 25 }),
              cell("Ouvrages concernés", { bold: true, width: 50 }),
            ],
          }),
          ...allSymbols
            .filter((s) => data.symbols.includes(s.code))
            .map(
              (s) =>
                new TableRow({
                  children: [
                    cell(s.code, { width: 25 }),
                    cell(s.tensionDomain, { width: 25 }),
                    cell(ouvrageNames, { width: 50 }),
                  ],
                }),
            ),
        ],
      }),
    );
  } else {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: "Ouvrages concernés : ", bold: true }),
          new TextRun({ text: ouvrageNames }),
        ],
      }),
    );
  }

  children.push(
    new Paragraph({ text: "" }),
    new Paragraph({ text: "" }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            cell("Le Chef de l'entité concernée :", { bold: true, width: 50 }),
            cell("Le Directeur concerné :", { bold: true, width: 50 }),
          ],
        }),
        new TableRow({
          children: [
            cell("Date, cachet et signature :", { width: 50 }),
            cell("Date, cachet et signature :", { width: 50 }),
          ],
        }),
      ],
    }),
  );

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}
