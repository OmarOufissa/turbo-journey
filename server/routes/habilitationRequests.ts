import { RequestHandler } from "express";
import { db } from "../db-pg";
import * as schema from "../schema";
import { eq, inArray } from "drizzle-orm";
import {
  HabilitationRequestType,
  getSymbolsForType,
  isSymbolValidForType,
  TENSION_DOMAINS,
} from "../../shared/habilitationSymbols";
import { getChefDeDivision } from "../seeds/organigrammeSeed";
import { generateHabilitationRequestDocx, HabilitationRequestData } from "../services/habilitationRequestDocx";

/** Direction is fixed: this module only serves Direction Transport Centre Casa. */
const DIRECTION = "Direction Transport Centre Casa";

/**
 * GET /api/habilitation-symbols?type=HT|ST
 */
export const getHabilitationSymbols: RequestHandler = (req, res) => {
  const type = String(req.query.type || "").toUpperCase();
  if (type !== "HT" && type !== "ST") {
    return res.status(400).json({ message: "Le paramètre type doit être HT ou ST" });
  }
  res.json(getSymbolsForType(type as HabilitationRequestType));
};

interface RequestRowInput {
  symbole: string;
  domaine: string;
  ouvrageId: number;
}

interface GenerateRequestBody {
  employeeId: number;
  type: HabilitationRequestType;
  rows: RequestRowInput[];
}

async function buildRequestData(
  body: GenerateRequestBody,
): Promise<{ error: string; status: number } | { data: HabilitationRequestData }> {
  const { employeeId, type, rows } = body;

  if (!employeeId) {
    return { error: "Veuillez sélectionner un agent.", status: 400 };
  }
  if (type !== "HT" && type !== "ST") {
    return { error: "Veuillez sélectionner le type de travaux (HT ou ST).", status: 400 };
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    return { error: "Veuillez ajouter au moins une ligne d'habilitation.", status: 400 };
  }
  for (const row of rows) {
    if (!row.symbole || !isSymbolValidForType(row.symbole, type)) {
      return {
        error: `Le symbole "${row.symbole}" n'est pas compatible avec ce type de travaux (${type}).`,
        status: 400,
      };
    }
    if (!row.domaine || !(TENSION_DOMAINS as readonly string[]).includes(row.domaine)) {
      return { error: "Veuillez sélectionner un domaine de tension valide pour chaque ligne.", status: 400 };
    }
    if (!row.ouvrageId) {
      return { error: "Veuillez sélectionner un ouvrage concerné pour chaque ligne.", status: 400 };
    }
  }

  const employeeRows = await db
    .select({
      id: schema.employees.id,
      matricule: schema.employees.matricule,
      prenom: schema.employees.prenom,
      nom: schema.employees.nom,
      fonction: schema.employees.fonction,
      divisionId: schema.employees.divisionId,
      division: schema.divisions.name,
      service: schema.services.name,
      equipe: schema.equipes.name,
    })
    .from(schema.employees)
    .leftJoin(schema.divisions, eq(schema.employees.divisionId, schema.divisions.id))
    .leftJoin(schema.services, eq(schema.employees.serviceId, schema.services.id))
    .leftJoin(schema.equipes, eq(schema.employees.equipeId, schema.equipes.id))
    .where(eq(schema.employees.id, employeeId))
    .limit(1);

  if (!employeeRows.length) {
    return { error: "L'agent sélectionné n'existe pas.", status: 404 };
  }
  const employee = employeeRows[0];

  const ouvrageIds = rows.map((r) => r.ouvrageId);
  const ouvrageRows = await db
    .select({ id: schema.ouvrages.id, name: schema.ouvrages.name })
    .from(schema.ouvrages)
    .where(inArray(schema.ouvrages.id, ouvrageIds));
  const ouvrageById = new Map(ouvrageRows.map((o) => [o.id, o.name]));
  if (ouvrageRows.length !== new Set(ouvrageIds).size) {
    return { error: "Un ou plusieurs ouvrages sélectionnés n'existent pas.", status: 404 };
  }

  const chef = await getChefDeDivision(employee.divisionId);
  if (!chef) {
    return {
      error: `Aucun Chef de Division n'est enregistré pour "${employee.division}".`,
      status: 404,
    };
  }

  return {
    data: {
      direction: DIRECTION,
      division: employee.division || "",
      entite: employee.equipe || employee.service || employee.division || "",
      chef: {
        prenom: chef.prenom,
        nom: chef.nom,
        matricule: chef.matricule,
        fonction: chef.fonction,
      },
      agent: {
        prenom: employee.prenom,
        nom: employee.nom,
        matricule: employee.matricule,
        fonction: employee.fonction,
      },
      type,
      rows: rows.map((r) => ({
        symbole: r.symbole,
        domaine: r.domaine,
        ouvrages: ouvrageById.get(r.ouvrageId) || "",
      })),
    },
  };
}

/**
 * POST /api/habilitation-requests/download
 * Validates the request and returns the filled request form as a .docx file.
 */
export const downloadHabilitationRequest: RequestHandler = async (req, res) => {
  try {
    const result = await buildRequestData(req.body);
    if ("error" in result) {
      return res.status(result.status).json({ message: result.error });
    }

    const docxBuffer = await generateHabilitationRequestDocx(result.data);
    const filename = `demande_habilitation_${result.data.type}_${result.data.agent.matricule}.docx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(docxBuffer);
  } catch (err) {
    console.error("Error generating habilitation request:", err);
    res.status(500).json({ message: "Erreur lors de la génération du document" });
  }
};
