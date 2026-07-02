import { Router } from "express";
import { db } from "../db";
import { agents, divisions, services, equipes, affectations, articles } from "../db/schema";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { logHistorique } from "../services/historiqueService";
import type { AuthedRequest } from "../middleware/auth";

export const agentsRouter = Router();

agentsRouter.get("/", async (req, res) => {
  const { q, divisionId, serviceId, equipeId, statut, page = "1", pageSize = "50" } = req.query as Record<string, string>;
  const conditions = [];
  if (q) conditions.push(or(ilike(agents.nom, `%${q}%`), ilike(agents.matricule, `%${q}%`), ilike(agents.fonction, `%${q}%`)));
  if (divisionId) conditions.push(eq(agents.divisionId, Number(divisionId)));
  if (serviceId) conditions.push(eq(agents.serviceId, Number(serviceId)));
  if (equipeId) conditions.push(eq(agents.equipeId, Number(equipeId)));
  if (statut) conditions.push(eq(agents.statut, statut));

  const where = conditions.length ? and(...conditions) : undefined;
  const p = Math.max(1, Number(page));
  const ps = Math.min(200, Math.max(1, Number(pageSize)));

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: agents.id,
        matricule: agents.matricule,
        nom: agents.nom,
        prenom: agents.prenom,
        photoUrl: agents.photoUrl,
        fonction: agents.fonction,
        poste: agents.poste,
        statut: agents.statut,
        telephone: agents.telephone,
        dateEmbauche: agents.dateEmbauche,
        divisionId: agents.divisionId,
        serviceId: agents.serviceId,
        equipeId: agents.equipeId,
        divisionNom: divisions.nom,
        serviceNom: services.nom,
        equipeNom: equipes.nom,
      })
      .from(agents)
      .leftJoin(divisions, eq(agents.divisionId, divisions.id))
      .leftJoin(services, eq(agents.serviceId, services.id))
      .leftJoin(equipes, eq(agents.equipeId, equipes.id))
      .where(where)
      .orderBy(agents.nom)
      .limit(ps)
      .offset((p - 1) * ps),
    db.select({ total: sql<number>`count(*)::int` }).from(agents).where(where),
  ]);

  res.json({ rows, total, page: p, pageSize: ps });
});

agentsRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [agent] = await db
    .select({
      id: agents.id,
      matricule: agents.matricule,
      nom: agents.nom,
      prenom: agents.prenom,
      photoUrl: agents.photoUrl,
      fonction: agents.fonction,
      poste: agents.poste,
      statut: agents.statut,
      telephone: agents.telephone,
      email: agents.email,
      dateEmbauche: agents.dateEmbauche,
      note: agents.note,
      divisionId: agents.divisionId,
      serviceId: agents.serviceId,
      equipeId: agents.equipeId,
      divisionNom: divisions.nom,
      serviceNom: services.nom,
      equipeNom: equipes.nom,
    })
    .from(agents)
    .leftJoin(divisions, eq(agents.divisionId, divisions.id))
    .leftJoin(services, eq(agents.serviceId, services.id))
    .leftJoin(equipes, eq(agents.equipeId, equipes.id))
    .where(eq(agents.id, id));
  if (!agent) return res.status(404).json({ error: "Agent introuvable" });

  const dotations = await db
    .select({
      id: affectations.id,
      articleId: affectations.articleId,
      designation: articles.designation,
      quantite: affectations.quantite,
      taille: affectations.taille,
      pointure: affectations.pointure,
      dateAffectation: affectations.dateAffectation,
      statut: affectations.statut,
      motif: affectations.motif,
    })
    .from(affectations)
    .innerJoin(articles, eq(affectations.articleId, articles.id))
    .where(eq(affectations.agentId, id))
    .orderBy(desc(affectations.dateAffectation));

  res.json({ ...agent, dotations });
});

agentsRouter.post("/", async (req: AuthedRequest, res) => {
  const body = req.body;
  if (!body.matricule || !body.nom) return res.status(400).json({ error: "Matricule et nom requis" });
  const [row] = await db.insert(agents).values(body).returning();
  await logHistorique({ typeEvenement: "creation_agent", entiteType: "agent", entiteId: row.id, agentId: row.id, utilisateurId: req.user?.id, details: { matricule: row.matricule, nom: row.nom } });
  res.status(201).json(row);
});

agentsRouter.put("/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const [before] = await db.select().from(agents).where(eq(agents.id, id));
  if (!before) return res.status(404).json({ error: "Agent introuvable" });
  const [row] = await db.update(agents).set({ ...req.body, updatedAt: new Date() }).where(eq(agents.id, id)).returning();
  await logHistorique({ typeEvenement: "modification_agent", entiteType: "agent", entiteId: id, agentId: id, utilisateurId: req.user?.id, details: { avant: before, apres: row } });
  res.json(row);
});

// Archivage (jamais de suppression physique — conforme à l'exigence "aucune donnée supprimée")
agentsRouter.post("/:id/archiver", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(agents).set({ statut: "archive", updatedAt: new Date() }).where(eq(agents.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Agent introuvable" });
  await logHistorique({ typeEvenement: "archivage_agent", entiteType: "agent", entiteId: id, agentId: id, utilisateurId: req.user?.id });
  res.json(row);
});
