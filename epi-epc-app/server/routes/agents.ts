import { Router } from "express";
import { db } from "../db";
import { agents, divisions, services, equipes, affectations, articles, agentMensurations } from "../db/schema";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { logHistorique } from "../services/historiqueService";
import type { AuthedRequest } from "../middleware/auth";

export const agentsRouter = Router();

agentsRouter.get("/", async (req, res) => {
  const { q, divisionId, serviceId, equipeId, statut, page = "1", pageSize = "50" } = req.query as Record<string, string>;
  const conditions = [];
  if (q) conditions.push(or(like(agents.nom, `%${q}%`), like(agents.matricule, `%${q}%`), like(agents.fonction, `%${q}%`)));
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
    db.select({ total: sql<number>`count(*)` }).from(agents).where(where),
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

  const [dotations, mensurations] = await Promise.all([
    db
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
      .orderBy(desc(affectations.dateAffectation)),
    db.select({ cle: agentMensurations.cle, valeur: agentMensurations.valeur }).from(agentMensurations).where(eq(agentMensurations.agentId, id)),
  ]);

  res.json({ ...agent, dotations, mensurations });
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
  const [row] = await db.update(agents).set({ ...req.body, updatedAt: new Date().toISOString() }).where(eq(agents.id, id)).returning();
  await logHistorique({ typeEvenement: "modification_agent", entiteType: "agent", entiteId: id, agentId: id, utilisateurId: req.user?.id, details: { avant: before, apres: row } });
  res.json(row);
});

// Archivage (jamais de suppression physique — conforme à l'exigence "aucune donnée supprimée")
agentsRouter.post("/:id/archiver", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(agents).set({ statut: "archive", updatedAt: new Date().toISOString() }).where(eq(agents.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Agent introuvable" });
  await logHistorique({ typeEvenement: "archivage_agent", entiteType: "agent", entiteId: id, agentId: id, utilisateurId: req.user?.id });
  res.json(row);
});

// Remplace l'intégralité du profil de mensurations de l'agent (sémantique "tout ou rien" —
// plus simple qu'un diff ligne à ligne pour un formulaire qui soumet toujours l'ensemble).
agentsRouter.put("/:id/mensurations", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { mensurations } = req.body as { mensurations: { cle: string; valeur: string }[] };
  const [agent] = await db.select({ id: agents.id }).from(agents).where(eq(agents.id, id));
  if (!agent) return res.status(404).json({ error: "Agent introuvable" });

  await db.delete(agentMensurations).where(eq(agentMensurations.agentId, id));
  const rows = (mensurations ?? []).filter((m) => m.valeur?.trim());
  if (rows.length) {
    await db.insert(agentMensurations).values(rows.map((m) => ({ agentId: id, cle: m.cle, valeur: m.valeur })));
  }
  await logHistorique({ typeEvenement: "maj_mensurations", entiteType: "agent", entiteId: id, agentId: id, utilisateurId: req.user?.id, details: { cles: rows.map((m) => m.cle) } });
  res.json({ mensurations: rows });
});
