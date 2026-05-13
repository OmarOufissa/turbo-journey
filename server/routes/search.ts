/**
 * Global search endpoint — accent-insensitive, multi-token, multi-field.
 * Searches: matricule, nom, prenom, fonction, division, service, equipe, n_de_titre, ST/HT codes.
 * Debouncing is handled client-side; this endpoint is stateless.
 */

import { Request, Response } from "express";
import { db } from "../db-pg";
import * as schema from "../schema";
import { eq, and, or, like, ilike, sql } from "drizzle-orm";

/** Normalize text: lowercase + strip diacritics (accent-insensitive). */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Split a query string into tokens (whitespace-separated, min 1 char). */
function tokenize(query: string): string[] {
  return normalize(query)
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/** True if ALL tokens appear somewhere in the haystack string. */
function matchesAllTokens(haystack: string, tokens: string[]): boolean {
  const h = normalize(haystack);
  return tokens.every((t) => h.includes(t));
}

interface SearchResult {
  type: "employee";
  id: number;
  matricule: string;
  nom: string;
  prenom: string;
  fonction: string | null;
  division: string | null;
  service: string | null;
  equipe: string | null;
  nDeTitre: string | null;
  stCodes: string[];
  htCodes: string[];
  dateExpiration: string | null;
  deleted: boolean;
  score: number;
}

export async function globalSearch(req: Request, res: Response): Promise<void> {
  try {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const limitParam = parseInt(req.query.limit as string ?? "20", 10);
    const limit = Math.min(Math.max(1, limitParam), 100);
    const includeDeleted = req.query.includeDeleted === "true";

    if (!q || q.length < 1) {
      res.json({ success: true, message: "Requête vide", data: [] });
      return;
    }

    const tokens = tokenize(q);
    if (tokens.length === 0) {
      res.json({ success: true, message: "Aucun terme de recherche valide", data: [] });
      return;
    }

    // Fetch all active employees with their current version + org names in one JOIN
    const rows = await db
      .select({
        id: schema.employees.id,
        matricule: schema.employees.matricule,
        nom: schema.employees.nom,
        prenom: schema.employees.prenom,
        deleted: schema.employees.deleted,
        versionNumber: schema.employeeVersions.versionNumber,
        fonction: schema.employeeVersions.fonction,
        nDeTitre: schema.employeeVersions.nDeTitre,
        stCodes: schema.employeeVersions.stCodes,
        htCodes: schema.employeeVersions.htCodes,
        dateExpiration: schema.employeeVersions.dateExpiration,
        divisionName: schema.divisions.name,
        serviceName: schema.services.name,
        equipeName: schema.equipes.name,
      })
      .from(schema.employees)
      .leftJoin(schema.employeeVersions, eq(schema.employees.currentVersionId, schema.employeeVersions.id))
      .leftJoin(schema.divisions, eq(schema.employeeVersions.divisionId, schema.divisions.id))
      .leftJoin(schema.services, eq(schema.employeeVersions.serviceId, schema.services.id))
      .leftJoin(schema.equipes, eq(schema.employeeVersions.equipeId, schema.equipes.id));

    const results: SearchResult[] = [];

    for (const row of rows) {
      if (!includeDeleted && row.deleted) continue;

      // Build a combined haystack of all searchable fields
      const stCodesArr: string[] = Array.isArray(row.stCodes) ? (row.stCodes as string[]) : [];
      const htCodesArr: string[] = Array.isArray(row.htCodes) ? (row.htCodes as string[]) : [];

      const fields = [
        row.matricule,
        row.nom,
        row.prenom,
        row.fonction ?? "",
        row.nDeTitre ?? "",
        row.divisionName ?? "",
        row.serviceName ?? "",
        row.equipeName ?? "",
        stCodesArr.join(" "),
        htCodesArr.join(" "),
      ];

      const combinedHaystack = fields.join(" ");

      if (!matchesAllTokens(combinedHaystack, tokens)) continue;

      // Score: prefer matches in key identity fields
      let score = 0;
      const normalizedQ = normalize(q);
      if (normalize(row.matricule).includes(normalizedQ)) score += 10;
      if (normalize(`${row.nom} ${row.prenom}`).includes(normalizedQ)) score += 8;
      if (normalize(`${row.prenom} ${row.nom}`).includes(normalizedQ)) score += 8;
      if (normalize(row.nom).startsWith(tokenize(q)[0])) score += 5;
      // Each token match in a field adds score
      for (const token of tokens) {
        for (const field of fields) {
          if (normalize(field).includes(token)) score += 1;
        }
      }

      results.push({
        type: "employee",
        id: row.id,
        matricule: row.matricule,
        nom: row.nom,
        prenom: row.prenom,
        fonction: row.fonction ?? null,
        division: row.divisionName ?? null,
        service: row.serviceName ?? null,
        equipe: row.equipeName ?? null,
        nDeTitre: row.nDeTitre ?? null,
        stCodes: stCodesArr,
        htCodes: htCodesArr,
        dateExpiration: row.dateExpiration ?? null,
        deleted: row.deleted ?? false,
        score,
      });
    }

    // Sort by descending score, then alphabetically
    results.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, "fr");
    });

    res.json({
      success: true,
      message: `${results.length} résultat(s) pour "${q}"`,
      data: results.slice(0, limit),
    });
  } catch (err) {
    console.error("Global search error:", err);
    res.status(500).json({
      success: false,
      message: "Erreur lors de la recherche",
      data: null,
      errors: [(err as Error).message],
    });
  }
}
