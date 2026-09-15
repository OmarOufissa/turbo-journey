import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { db } from "../db-pg";
import * as schema from "../schema";
import { eq, and, sql } from "drizzle-orm";

// ── Habilitation symbol taxonomy (module-specific — do NOT change the main app) ──
// Order matters for the legend table.
export const HT_SYMBOLS = ["BC", "BR", "B0V", "B1V", "B2V", "HC", "H0V", "H1V", "H2V", "SF6"];
export const ST_SYMBOLS = ["B1T", "B2T", "H1T", "H2T", "B1N", "B2N", "H1N", "H2N"];
export const DOMAINES = ["TBT", "BT", "HT", "HTA", "HTB"];

// Every symbol that may appear in a legend table (both templates, incl. the HT
// form's non-V variants). Used only to decide which legend cells to cross out.
const ALL_LEGEND_SYMBOLS = [
  "B0", "B0V", "B1", "B1V", "B2", "B2V", "BC", "BR", "H0", "H0V", "H1", "H1V", "H2", "H2V", "HC", "SF6",
  "B1T", "B2T", "H1T", "H2T", "B1N", "B2N", "H1N", "H2N",
];

export type DemandeType = "HT" | "ST";
export interface DemandeRow { symbole: string; domaine: string; ouvrages: string; }
export interface DemandeInput { employeeId: number; type: DemandeType; rows: DemandeRow[]; }

const CHEF_FONCTION = "chef de division";

function resolveTemplate(type: DemandeType): string | null {
  const dir = path.dirname(fileURLToPath(import.meta.url)); // server/services
  const file = type === "ST" ? "demande_hae_st.docx" : "demande_hae_ht.docx";
  const envKey = type === "ST" ? process.env.DEMANDE_HAE_ST_TEMPLATE : process.env.DEMANDE_HAE_HT_TEMPLATE;
  const candidates = [
    envKey,
    path.join(dir, "..", "templates", file),
    path.join(dir, "..", "..", "server", "templates", file),
    path.join(process.cwd(), "server", "templates", file),
  ].filter(Boolean) as string[];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export class DemandeError extends Error {}

// Add a top-left→bottom-right diagonal to every legend cell whose symbol is NOT
// requested. Post-processes the final XML; the symbol text stays readable.
function crossOutUnusedSymbols(xml: string, allSymbols: string[], requested: string[]): string {
  const reqd = new Set(requested);
  const tblRe = /<w:tbl>(?:(?!<\/w:tbl>)[\s\S])*?Habilitations[\s\S]*?<\/w:tbl>/;
  const m = xml.match(tblRe);
  if (!m) return xml;
  const tbl = m[0].replace(/<w:tc>([\s\S]*?)<\/w:tc>/g, (cell) => {
    const text = (cell.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || [])
      .map((t) => t.replace(/<[^>]+>/g, "")).join("").trim();
    if (allSymbols.includes(text) && !reqd.has(text) && /<\/w:tcPr>/.test(cell)) {
      const diag = '<w:tcBorders><w:tl2br w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tcBorders>';
      return cell.replace(/<\/w:tcPr>/, diag + "</w:tcPr>");
    }
    return cell;
  });
  return xml.replace(m[0], tbl);
}

export async function generateDemande(input: DemandeInput): Promise<{ buffer: Buffer; filename: string }> {
  const { employeeId, type, rows } = input;

  if (type !== "HT" && type !== "ST") throw new DemandeError("Type de demande invalide (HT ou ST).");
  if (!Array.isArray(rows) || rows.length === 0) throw new DemandeError("Au moins une ligne d'habilitation est requise.");

  const allowedSymbols = type === "HT" ? HT_SYMBOLS : ST_SYMBOLS;

  // Ouvrages reference (for existence check)
  const ouvrageRows = await db.select({ name: schema.ouvrages.name }).from(schema.ouvrages);
  const ouvrageSet = new Set(ouvrageRows.map((o) => o.name.trim().toLowerCase()));

  rows.forEach((r, i) => {
    const s = (r.symbole || "").trim();
    const d = (r.domaine || "").trim();
    const o = (r.ouvrages || "").trim();
    if (!allowedSymbols.includes(s)) throw new DemandeError(`Ligne ${i + 1} : symbole « ${s} » invalide pour une demande ${type}.`);
    if (!DOMAINES.includes(d)) throw new DemandeError(`Ligne ${i + 1} : domaine de tension « ${d} » invalide.`);
    if (!o) throw new DemandeError(`Ligne ${i + 1} : ouvrage concerné requis.`);
    if (!ouvrageSet.has(o.toLowerCase())) throw new DemandeError(`Ligne ${i + 1} : ouvrage « ${o} » introuvable dans le référentiel.`);
  });

  // Agent + current version + org names
  const [emp] = await db.select().from(schema.employees).where(and(eq(schema.employees.id, employeeId), eq(schema.employees.deleted, false)));
  if (!emp || !emp.currentVersionId) throw new DemandeError("Agent introuvable.");
  const [ver] = await db.select().from(schema.employeeVersions).where(eq(schema.employeeVersions.id, emp.currentVersionId));
  if (!ver) throw new DemandeError("Agent sans habilitation courante.");
  if (!ver.divisionId) throw new DemandeError("La division de l'agent n'est pas renseignée.");

  const [division] = await db.select().from(schema.divisions).where(eq(schema.divisions.id, ver.divisionId));
  const [service] = ver.serviceId ? await db.select().from(schema.services).where(eq(schema.services.id, ver.serviceId)) : [undefined as any];
  const [equipe] = ver.equipeId ? await db.select().from(schema.equipes).where(eq(schema.equipes.id, ver.equipeId)) : [undefined as any];

  // Entité: équipe → service → division
  const entite = equipe?.name || service?.name || division?.name || "";

  // Chef de Division: agent of the SAME division whose fonction is "Chef de Division"
  const chefRows = await db
    .select({ nom: schema.employees.nom, prenom: schema.employees.prenom, matricule: schema.employees.matricule, fonction: schema.employeeVersions.fonction })
    .from(schema.employees)
    .innerJoin(schema.employeeVersions, eq(schema.employeeVersions.id, schema.employees.currentVersionId))
    .where(and(
      eq(schema.employees.deleted, false),
      eq(schema.employeeVersions.divisionId, ver.divisionId),
      sql`lower(trim(${schema.employeeVersions.fonction})) = ${CHEF_FONCTION}`,
    ));
  if (chefRows.length === 0) throw new DemandeError(`Aucun Chef de Division n'est enregistré pour la division « ${division?.name ?? ""} ».`);
  const chef = chefRows[0];

  // Template
  const tplPath = resolveTemplate(type);
  if (!tplPath) {
    if (type === "HT") throw new DemandeError("Le modèle Word HT n'est pas encore fourni. Fournissez le fichier server/templates/demande_hae_ht.docx.");
    throw new DemandeError("Modèle Word de la demande introuvable.");
  }

  const zip = new PizZip(fs.readFileSync(tplPath));
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render({
    direction: process.env.DEMANDE_DIRECTION || "Direction Transport Région Centre Casa",
    division: division?.name || "",
    entite,
    chef_prenom: chef.prenom || "",
    chef_nom: chef.nom || "",
    chef_matricule: chef.matricule || "",
    chef_fonction: chef.fonction || "",
    agent_full: `${emp.nom} ${emp.prenom}`.trim(),
    agent_prenom: emp.prenom || "",
    agent_nom: emp.nom || "",
    agent_matricule: emp.matricule || "",
    agent_fonction: ver.fonction || "",
    rows: rows.map((r) => ({ symbole: r.symbole.trim(), domaine: r.domaine.trim(), ouvrages: r.ouvrages.trim() })),
  });

  // Post-process: diagonal on unused legend symbols
  const outZip = doc.getZip();
  let xml = outZip.file("word/document.xml")!.asText();
  xml = crossOutUnusedSymbols(xml, ALL_LEGEND_SYMBOLS, rows.map((r) => r.symbole.trim()));
  outZip.file("word/document.xml", xml);
  const buffer = outZip.generate({ type: "nodebuffer" }) as Buffer;

  return { buffer, filename: `demande_habilitation_${type}_${emp.matricule}.docx` };
}
