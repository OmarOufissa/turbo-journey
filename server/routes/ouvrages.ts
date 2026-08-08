import { RequestHandler } from "express";
import { db } from "../db-pg";
import * as schema from "../schema";
import { and, eq, ilike, or } from "drizzle-orm";

/**
 * GET /api/ouvrages
 * Search ouvrages (electrical installations), optionally filtered by the
 * Division -> Service -> Equipe hierarchy and/or tension domain.
 * Query params: search, divisionId, serviceId, equipeId, tensionDomain
 */
export const getOuvrages: RequestHandler = async (req, res) => {
  try {
    const { search, divisionId, serviceId, equipeId, tensionDomain } = req.query;

    const conditions = [eq(schema.ouvrages.deleted, false)];

    if (typeof search === "string" && search.trim()) {
      conditions.push(ilike(schema.ouvrages.name, `%${search.trim()}%`));
    }
    if (typeof divisionId === "string" && divisionId) {
      conditions.push(eq(schema.ouvrages.divisionId, parseInt(divisionId)));
    }
    if (typeof serviceId === "string" && serviceId) {
      conditions.push(eq(schema.ouvrages.serviceId, parseInt(serviceId)));
    }
    if (typeof equipeId === "string" && equipeId) {
      conditions.push(eq(schema.ouvrages.equipeId, parseInt(equipeId)));
    }
    if (typeof tensionDomain === "string" && tensionDomain) {
      const domains = tensionDomain.split(",").filter(Boolean);
      if (domains.length === 1) {
        conditions.push(eq(schema.ouvrages.tensionDomain, domains[0]));
      } else if (domains.length > 1) {
        conditions.push(or(...domains.map((d) => eq(schema.ouvrages.tensionDomain, d)))!);
      }
    }

    const result = await db
      .select({
        id: schema.ouvrages.id,
        name: schema.ouvrages.name,
        type: schema.ouvrages.type,
        tensionDomain: schema.ouvrages.tensionDomain,
        divisionId: schema.ouvrages.divisionId,
        serviceId: schema.ouvrages.serviceId,
        equipeId: schema.ouvrages.equipeId,
        division: schema.divisions.name,
        service: schema.services.name,
        equipe: schema.equipes.name,
      })
      .from(schema.ouvrages)
      .leftJoin(schema.divisions, eq(schema.ouvrages.divisionId, schema.divisions.id))
      .leftJoin(schema.services, eq(schema.ouvrages.serviceId, schema.services.id))
      .leftJoin(schema.equipes, eq(schema.ouvrages.equipeId, schema.equipes.id))
      .where(and(...conditions))
      .orderBy(schema.ouvrages.name)
      .limit(200);

    res.json(result);
  } catch (err) {
    console.error("Error fetching ouvrages:", err);
    res.status(500).json({ message: "Erreur lors de la récupération des ouvrages" });
  }
};

/**
 * POST /api/ouvrages
 * Create a new ouvrage (admin data management, mirrors employee creation)
 */
export const createOuvrage: RequestHandler = async (req, res) => {
  try {
    const { name, type, tensionDomain, divisionId, serviceId, equipeId } = req.body;

    if (!name || !type || !tensionDomain || !divisionId || !serviceId) {
      return res.status(400).json({ message: "Champs requis manquants" });
    }

    if (!["BT", "HTA", "HTB"].includes(tensionDomain)) {
      return res.status(400).json({ message: "Domaine de tension invalide" });
    }

    const [created] = await db
      .insert(schema.ouvrages)
      .values({
        name,
        type,
        tensionDomain,
        divisionId: parseInt(divisionId),
        serviceId: parseInt(serviceId),
        equipeId: equipeId ? parseInt(equipeId) : null,
      })
      .returning();

    res.status(201).json(created);
  } catch (err) {
    console.error("Error creating ouvrage:", err);
    res.status(500).json({ message: "Erreur lors de la création de l'ouvrage" });
  }
};
