import { Router } from "express";
import { db } from "../db";
import { historique, agents, articles, equipes, users } from "../db/schema";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

export const historiqueRouter = Router();

historiqueRouter.get("/", async (req, res) => {
  const { entiteType, entiteId, typeEvenement, agentId, dateDebut, dateFin, page = "1", pageSize = "50" } = req.query as Record<string, string>;
  const conditions = [];
  if (entiteType) conditions.push(eq(historique.entiteType, entiteType));
  if (entiteId) conditions.push(eq(historique.entiteId, Number(entiteId)));
  if (typeEvenement) conditions.push(eq(historique.typeEvenement, typeEvenement));
  if (agentId) conditions.push(eq(historique.agentId, Number(agentId)));
  if (dateDebut) conditions.push(gte(historique.dateEvenement, new Date(dateDebut)));
  if (dateFin) conditions.push(lte(historique.dateEvenement, new Date(dateFin)));
  const where = conditions.length ? and(...conditions) : undefined;
  const p = Math.max(1, Number(page));
  const ps = Math.min(200, Math.max(1, Number(pageSize)));

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: historique.id,
        typeEvenement: historique.typeEvenement,
        entiteType: historique.entiteType,
        entiteId: historique.entiteId,
        agentNom: agents.nom,
        equipeNom: equipes.nom,
        articleDesignation: articles.designation,
        utilisateurNom: users.nom,
        details: historique.details,
        dateEvenement: historique.dateEvenement,
      })
      .from(historique)
      .leftJoin(agents, eq(historique.agentId, agents.id))
      .leftJoin(equipes, eq(historique.equipeId, equipes.id))
      .leftJoin(articles, eq(historique.articleId, articles.id))
      .leftJoin(users, eq(historique.utilisateurId, users.id))
      .where(where)
      .orderBy(desc(historique.dateEvenement))
      .limit(ps)
      .offset((p - 1) * ps),
    db.select({ total: sql<number>`count(*)::int` }).from(historique).where(where),
  ]);
  res.json({ rows, total, page: p, pageSize: ps });
});
