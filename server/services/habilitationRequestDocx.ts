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
import { getTensionDomainLabel } from "../../shared/habilitationSymbols";

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

  return doc.getZip().generate({ type: "nodebuffer" });
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
          habilitationTable(data.rows),
          new Paragraph({ text: "" }),
          new Paragraph({ text: "" }),
          signatureBlock(),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

export async function generateHabilitationRequestDocx(data: HabilitationRequestData): Promise<Buffer> {
  return data.type === "ST" ? generateSTRequestDocx(data) : generateHTRequestDocx(data);
}
