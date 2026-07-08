import { Router } from "express";
import { db } from "../db";
import { divisions, services, equipes, postes, agents, affectations, articles } from "../db/schema";
import { eq, count, desc } from "drizzle-orm";
import { logHistorique } from "../services/historiqueService";
import { computeBesoins } from "../services/besoinService";
import type { AuthedRequest } from "../middleware/auth";

export const orgRouter = Router();

// Arbre complet Direction > Division > Service > Équipe/Poste avec effectifs
orgRouter.get("/tree", async (_req, res) => {
  const [divs, svcs, eqs, posts, agentCounts] = await Promise.all([
    db.select().from(divisions),
    db.select().from(services),
    db.select().from(equipes),
    db.select().from(postes),
    db
      .select({ equipeId: agents.equipeId, serviceId: agents.serviceId, divisionId: agents.divisionId, n: count() })
      .from(agents)
      .groupBy(agents.equipeId, agents.serviceId, agents.divisionId),
  ]);

  const equipeCounts = new Map<number, number>();
  const serviceDirectCounts = new Map<number, number>();
  for (const row of agentCounts) {
    if (row.equipeId) equipeCounts.set(row.equipeId, (equipeCounts.get(row.equipeId) ?? 0) + Number(row.n));
    else if (row.serviceId) serviceDirectCounts.set(row.serviceId, (serviceDirectCounts.get(row.serviceId) ?? 0) + Number(row.n));
  }

  const tree = divs.map((d) => ({
    ...d,
    services: svcs
      .filter((s) => s.divisionId === d.id)
      .map((s) => ({
        ...s,
        effectifDirect: serviceDirectCounts.get(s.id) ?? 0,
        equipes: eqs
          .filter((e) => e.serviceId === s.id)
          .map((e) => ({ ...e, effectif: equipeCounts.get(e.id) ?? 0 })),
        postes: posts.filter((p) => p.serviceId === s.id),
      })),
  }));
  res.json(tree);
});

orgRouter.get("/divisions", async (_req, res) => res.json(await db.select().from(divisions)));
orgRouter.get("/services", async (_req, res) => res.json(await db.select().from(services)));
orgRouter.get("/equipes", async (_req, res) => res.json(await db.select().from(equipes)));
orgRouter.get("/postes", async (_req, res) => res.json(await db.select().from(postes)));

// Fiche équipe : infos + service/division, agents membres, dotations collectives (EPC) et
// besoin — pendant de GET /agents/:id pour les bénéficiaires collectifs.
orgRouter.get("/equipes/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [equipe] = await db
    .select({
      id: equipes.id,
      code: equipes.code,
      nom: equipes.nom,
      teamType: equipes.teamType,
      serviceId: equipes.serviceId,
      serviceNom: services.nom,
      divisionId: services.divisionId,
      divisionNom: divisions.nom,
    })
    .from(equipes)
    .leftJoin(services, eq(equipes.serviceId, services.id))
    .leftJoin(divisions, eq(services.divisionId, divisions.id))
    .where(eq(equipes.id, id));
  if (!equipe) return res.status(404).json({ error: "Équipe introuvable" });

  const [membres, dotations, besoinLines] = await Promise.all([
    db
      .select({ id: agents.id, matricule: agents.matricule, nom: agents.nom, prenom: agents.prenom, poste: agents.poste, statut: agents.statut })
      .from(agents)
      .where(eq(agents.equipeId, id))
      .orderBy(agents.nom),
    db
      .select({
        id: affectations.id,
        articleId: affectations.articleId,
        designation: articles.designation,
        quantite: affectations.quantite,
        dateAffectation: affectations.dateAffectation,
        statut: affectations.statut,
        motif: affectations.motif,
      })
      .from(affectations)
      .innerJoin(articles, eq(affectations.articleId, articles.id))
      .where(eq(affectations.equipeId, id))
      .orderBy(desc(affectations.dateAffectation)),
    computeBesoins({ equipeId: id }),
  ]);

  res.json({ ...equipe, membres, dotations, besoins: besoinLines });
});

orgRouter.post("/divisions", async (req: AuthedRequest, res) => {
  const { code, nom } = req.body;
  if (!code || !nom) return res.status(400).json({ error: "Code et nom requis" });
  const [row] = await db.insert(divisions).values({ code, nom }).returning();
  await logHistorique({ typeEvenement: "creation_division", entiteType: "division", entiteId: row.id, utilisateurId: req.user?.id, details: { nom } });
  res.status(201).json(row);
});

orgRouter.post("/services", async (req: AuthedRequest, res) => {
  const { code, nom, divisionId } = req.body;
  if (!code || !nom || !divisionId) return res.status(400).json({ error: "Code, nom et division requis" });
  const [row] = await db.insert(services).values({ code, nom, divisionId }).returning();
  await logHistorique({ typeEvenement: "creation_service", entiteType: "service", entiteId: row.id, utilisateurId: req.user?.id, details: { nom } });
  res.status(201).json(row);
});

orgRouter.post("/equipes", async (req: AuthedRequest, res) => {
  const { code, nom, serviceId, teamType } = req.body;
  if (!code || !nom || !serviceId) return res.status(400).json({ error: "Code, nom et service requis" });
  const [row] = await db.insert(equipes).values({ code, nom, serviceId, teamType }).returning();
  await logHistorique({ typeEvenement: "creation_equipe", entiteType: "equipe", entiteId: row.id, utilisateurId: req.user?.id, details: { nom } });
  res.status(201).json(row);
});

orgRouter.post("/postes", async (req: AuthedRequest, res) => {
  const { code, nom, serviceId } = req.body;
  if (!code || !nom || !serviceId) return res.status(400).json({ error: "Code, nom et service requis" });
  const [row] = await db.insert(postes).values({ code, nom, serviceId }).returning();
  await logHistorique({ typeEvenement: "creation_poste", entiteType: "poste", entiteId: row.id, utilisateurId: req.user?.id, details: { nom } });
  res.status(201).json(row);
});

orgRouter.put("/divisions/:id", async (req, res) => {
  const [row] = await db.update(divisions).set(req.body).where(eq(divisions.id, Number(req.params.id))).returning();
  if (!row) return res.status(404).json({ error: "Division introuvable" });
  res.json(row);
});
orgRouter.put("/services/:id", async (req, res) => {
  const [row] = await db.update(services).set(req.body).where(eq(services.id, Number(req.params.id))).returning();
  if (!row) return res.status(404).json({ error: "Service introuvable" });
  res.json(row);
});
orgRouter.put("/equipes/:id", async (req, res) => {
  const [row] = await db.update(equipes).set(req.body).where(eq(equipes.id, Number(req.params.id))).returning();
  if (!row) return res.status(404).json({ error: "Équipe introuvable" });
  res.json(row);
});
orgRouter.put("/postes/:id", async (req, res) => {
  const [row] = await db.update(postes).set(req.body).where(eq(postes.id, Number(req.params.id))).returning();
  if (!row) return res.status(404).json({ error: "Poste introuvable" });
  res.json(row);
});

orgRouter.delete("/divisions/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const [[{ n: nbServices }], [{ n: nbAgents }]] = await Promise.all([
    db.select({ n: count() }).from(services).where(eq(services.divisionId, id)),
    db.select({ n: count() }).from(agents).where(eq(agents.divisionId, id)),
  ]);
  if (nbServices > 0 || nbAgents > 0) {
    return res.status(409).json({ error: "Impossible de supprimer : des services ou agents y sont rattachés", dependents: { services: nbServices, agents: nbAgents } });
  }
  const [row] = await db.delete(divisions).where(eq(divisions.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Division introuvable" });
  await logHistorique({ typeEvenement: "suppression_division", entiteType: "division", entiteId: id, utilisateurId: req.user?.id, details: { nom: row.nom } });
  res.status(204).end();
});

orgRouter.delete("/services/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const [[{ n: nbEquipes }], [{ n: nbAgents }]] = await Promise.all([
    db.select({ n: count() }).from(equipes).where(eq(equipes.serviceId, id)),
    db.select({ n: count() }).from(agents).where(eq(agents.serviceId, id)),
  ]);
  if (nbEquipes > 0 || nbAgents > 0) {
    return res.status(409).json({ error: "Impossible de supprimer : des équipes ou agents y sont rattachés", dependents: { equipes: nbEquipes, agents: nbAgents } });
  }
  const [row] = await db.delete(services).where(eq(services.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Service introuvable" });
  await logHistorique({ typeEvenement: "suppression_service", entiteType: "service", entiteId: id, utilisateurId: req.user?.id, details: { nom: row.nom } });
  res.status(204).end();
});

orgRouter.delete("/equipes/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const [{ n: nbAgents }] = await db.select({ n: count() }).from(agents).where(eq(agents.equipeId, id));
  if (nbAgents > 0) {
    return res.status(409).json({ error: "Impossible de supprimer : des agents y sont rattachés", dependents: { agents: nbAgents } });
  }
  const [row] = await db.delete(equipes).where(eq(equipes.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Équipe introuvable" });
  await logHistorique({ typeEvenement: "suppression_equipe", entiteType: "equipe", entiteId: id, utilisateurId: req.user?.id, details: { nom: row.nom } });
  res.status(204).end();
});

orgRouter.delete("/postes/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const [{ n: nbAffectations }] = await db.select({ n: count() }).from(affectations).where(eq(affectations.posteId, id));
  if (nbAffectations > 0) {
    return res.status(409).json({ error: "Impossible de supprimer : des affectations y sont rattachées", dependents: { affectations: nbAffectations } });
  }
  const [row] = await db.delete(postes).where(eq(postes.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Poste introuvable" });
  await logHistorique({ typeEvenement: "suppression_poste", entiteType: "poste", entiteId: id, utilisateurId: req.user?.id, details: { nom: row.nom } });
  res.status(204).end();
});
