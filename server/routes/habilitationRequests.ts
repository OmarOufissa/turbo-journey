import { RequestHandler } from "express";
import { db } from "../db-pg";
import * as schema from "../schema";
import { eq, inArray } from "drizzle-orm";
import {
  HabilitationRequestType,
  getSymbolsForType,
  isSymbolValidForType,
} from "../../shared/habilitationSymbols";
import { generateHabilitationRequestPdf, HabilitationRequestPdfData } from "../services/habilitationRequestPdf";
import { generateHabilitationRequestDocx } from "../services/habilitationRequestDocx";

/**
 * GET /api/habilitation-symbols?type=HT|ST
 * Returns the valid symbols for a work type, with their tension domain and
 * champ d'application, derived from the official rules (see shared module).
 */
export const getHabilitationSymbols: RequestHandler = (req, res) => {
  const type = String(req.query.type || "").toUpperCase();
  if (type !== "HT" && type !== "ST") {
    return res.status(400).json({ message: "Le paramètre type doit être HT ou ST" });
  }
  res.json(getSymbolsForType(type as HabilitationRequestType));
};

interface GenerateRequestBody {
  employeeId: number;
  type: HabilitationRequestType;
  symbols: string[];
  ouvrageIds: number[];
}

async function buildRequestData(body: GenerateRequestBody): Promise<
  | { error: string; status: number }
  | { data: HabilitationRequestPdfData }
> {
  const { employeeId, type, symbols, ouvrageIds } = body;

  if (!employeeId) {
    return { error: "Veuillez sélectionner un agent.", status: 400 };
  }
  if (type !== "HT" && type !== "ST") {
    return { error: "Veuillez sélectionner le type de travaux (HT ou ST).", status: 400 };
  }
  if (!Array.isArray(symbols) || symbols.length === 0) {
    return { error: "Veuillez sélectionner le symbole d'habilitation.", status: 400 };
  }
  const invalidSymbol = symbols.find((s) => !isSymbolValidForType(s, type));
  if (invalidSymbol) {
    return {
      error: `Le symbole "${invalidSymbol}" n'est pas compatible avec ce type de travaux (${type}).`,
      status: 400,
    };
  }
  if (!Array.isArray(ouvrageIds) || ouvrageIds.length === 0) {
    return { error: "Veuillez sélectionner au moins un ouvrage concerné.", status: 400 };
  }

  const employeeRows = await db
    .select({
      id: schema.employees.id,
      matricule: schema.employees.matricule,
      prenom: schema.employees.prenom,
      nom: schema.employees.nom,
      fonction: schema.employees.fonction,
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

  const ouvrageRows = await db
    .select({
      id: schema.ouvrages.id,
      name: schema.ouvrages.name,
      tensionDomain: schema.ouvrages.tensionDomain,
    })
    .from(schema.ouvrages)
    .where(inArray(schema.ouvrages.id, ouvrageIds));

  if (ouvrageRows.length !== ouvrageIds.length) {
    return { error: "Un ou plusieurs ouvrages sélectionnés n'existent pas.", status: 404 };
  }

  const employee = employeeRows[0];

  return {
    data: {
      employee: {
        matricule: employee.matricule,
        prenom: employee.prenom,
        nom: employee.nom,
        fonction: employee.fonction || "",
        division: employee.division || "",
        service: employee.service || "",
        equipe: employee.equipe || "",
      },
      type,
      symbols,
      ouvrages: ouvrageRows.map((o) => ({ name: o.name, tensionDomain: o.tensionDomain })),
    },
  };
}

function fileBaseName(data: HabilitationRequestPdfData): string {
  return `demande_habilitation_${data.type}_${data.employee.matricule}`;
}

/**
 * POST /api/habilitation-requests/preview
 * Validates the request and returns the generated PDF inline for preview.
 */
export const previewHabilitationRequest: RequestHandler = async (req, res) => {
  try {
    const result = await buildRequestData(req.body);
    if ("error" in result) {
      return res.status(result.status).json({ message: result.error });
    }

    const pdf = await generateHabilitationRequestPdf(result.data);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileBaseName(result.data)}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error("Error previewing habilitation request:", err);
    res.status(500).json({ message: "Erreur lors de la génération de l'aperçu" });
  }
};

/**
 * POST /api/habilitation-requests/download.pdf
 */
export const downloadHabilitationRequestPdf: RequestHandler = async (req, res) => {
  try {
    const result = await buildRequestData(req.body);
    if ("error" in result) {
      return res.status(result.status).json({ message: result.error });
    }

    const pdf = await generateHabilitationRequestPdf(result.data);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileBaseName(result.data)}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error("Error generating habilitation request PDF:", err);
    res.status(500).json({ message: "Erreur lors de la génération du document" });
  }
};

/**
 * POST /api/habilitation-requests/download.docx
 */
export const downloadHabilitationRequestDocx: RequestHandler = async (req, res) => {
  try {
    const result = await buildRequestData(req.body);
    if ("error" in result) {
      return res.status(result.status).json({ message: result.error });
    }

    const docxBuffer = await generateHabilitationRequestDocx(result.data);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${fileBaseName(result.data)}.docx"`);
    res.send(docxBuffer);
  } catch (err) {
    console.error("Error generating habilitation request DOCX:", err);
    res.status(500).json({ message: "Erreur lors de la génération du document Word" });
  }
};
