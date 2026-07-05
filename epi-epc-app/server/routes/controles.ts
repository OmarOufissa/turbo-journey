import { Router } from "express";
import { db } from "../db";
import { controlesPeriodiques, articles, articlesReference, agents, affectations, equipementHierarchie } from "../db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { logHistorique } from "../services/historiqueService";
import { resolveDescendantIds } from "../services/hierarchieService";
import type { AuthedRequest } from "../middleware/auth";

export const controlesRouter = Router();

controlesRouter.get("/", async (req, res) => {
  const { statut, type, articleId, hierarchieId, ancestorId, reglementaireOnly } = req.query as Record<string, string>;
  const conditions = [];
  if (statut) conditions.push(eq(controlesPeriodiques.statut, statut));
  if (type) conditions.push(eq(controlesPeriodiques.type, type));
  if (articleId) conditions.push(eq(controlesPeriodiques.articleId, Number(articleId)));
  if (hierarchieId) conditions.push(eq(articlesReference.hierarchieParentId, Number(hierarchieId)));
  if (ancestorId) conditions.push(inArray(articlesReference.hierarchieParentId, await resolveDescendantIds(Number(ancestorId))));
  if (reglementaireOnly === "true") conditions.push(eq(equipementHierarchie.soumisControleReglementaire, true));
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: controlesPeriodiques.id,
      articleId: controlesPeriodiques.articleId,
      designation: articles.designation,
      hierarchieNom: equipementHierarchie.nom,
      soumisControleReglementaire: equipementHierarchie.soumisControleReglementaire,
      affectationId: controlesPeriodiques.affectationId,
      numeroSerie: affectations.numeroSerie,
      lieuEmplacement: affectations.lieuEmplacement,
      type: controlesPeriodiques.type,
      datePlanifiee: controlesPeriodiques.datePlanifiee,
      dateRealisee: controlesPeriodiques.dateRealisee,
      resultat: controlesPeriodiques.resultat,
      prochaineEcheance: controlesPeriodiques.prochaineEcheance,
      statut: controlesPeriodiques.statut,
      realiseParAgentId: controlesPeriodiques.realiseParAgentId,
      realiseParNom: agents.nom,
    })
    .from(controlesPeriodiques)
    .leftJoin(articles, eq(controlesPeriodiques.articleId, articles.id))
    .leftJoin(articlesReference, eq(articles.articleReferenceId, articlesReference.id))
    .leftJoin(equipementHierarchie, eq(articlesReference.hierarchieParentId, equipementHierarchie.id))
    .leftJoin(affectations, eq(controlesPeriodiques.affectationId, affectations.id))
    .leftJoin(agents, eq(controlesPeriodiques.realiseParAgentId, agents.id))
    .where(where)
    .orderBy(controlesPeriodiques.datePlanifiee);
  res.json(rows);
});

controlesRouter.post("/", async (req: AuthedRequest, res) => {
  const body = req.body;
  if (!body.type || !body.datePlanifiee) return res.status(400).json({ error: "Type et date planifiée requis" });
  const [row] = await db.insert(controlesPeriodiques).values(body).returning();
  await logHistorique({ typeEvenement: "planification_controle", entiteType: "controle_periodique", entiteId: row.id, articleId: body.articleId, utilisateurId: req.user?.id, details: { type: body.type } });
  res.status(201).json(row);
});

controlesRouter.post("/:id/realiser", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { dateRealisee, resultat, observations, realiseParAgentId, prochaineEcheanceMois = 12 } = req.body;
  const [controle] = await db.select().from(controlesPeriodiques).where(eq(controlesPeriodiques.id, id));
  if (!controle) return res.status(404).json({ error: "Contrôle introuvable" });

  const prochaine = new Date(dateRealisee);
  prochaine.setMonth(prochaine.getMonth() + Number(prochaineEcheanceMois));

  const [row] = await db
    .update(controlesPeriodiques)
    .set({
      dateRealisee,
      resultat,
      observations,
      realiseParAgentId,
      prochaineEcheance: prochaine.toISOString().slice(0, 10),
      statut: "realise",
    })
    .where(eq(controlesPeriodiques.id, id))
    .returning();

  await logHistorique({
    typeEvenement: "controle_realise",
    entiteType: "controle_periodique",
    entiteId: id,
    articleId: controle.articleId,
    utilisateurId: req.user?.id,
    details: { resultat, observations },
  });
  res.json(row);
});
