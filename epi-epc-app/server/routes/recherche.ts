import { Router } from "express";
import { db } from "../db";
import { agents, articles, equipes, marches } from "../db/schema";
import { ilike, or } from "drizzle-orm";

export const rechercheRouter = Router();

rechercheRouter.get("/", async (req, res) => {
  const q = (req.query.q as string)?.trim();
  if (!q || q.length < 2) return res.json({ agents: [], articles: [], equipes: [], marches: [] });
  const like = `%${q}%`;

  const [agentRows, articleRows, equipeRows, marcheRows] = await Promise.all([
    db
      .select({ id: agents.id, matricule: agents.matricule, nom: agents.nom, fonction: agents.fonction })
      .from(agents)
      .where(or(ilike(agents.nom, like), ilike(agents.matricule, like), ilike(agents.fonction, like)))
      .limit(15),
    db
      .select({ id: articles.id, codeArticle: articles.codeArticle, designation: articles.designation })
      .from(articles)
      .where(or(ilike(articles.designation, like), ilike(articles.codeArticle, like), ilike(articles.codeInterne, like)))
      .limit(15),
    db
      .select({ id: equipes.id, nom: equipes.nom, teamType: equipes.teamType })
      .from(equipes)
      .where(ilike(equipes.nom, like))
      .limit(10),
    db
      .select({ id: marches.id, numero: marches.numero, objet: marches.objet })
      .from(marches)
      .where(or(ilike(marches.numero, like), ilike(marches.objet, like), ilike(marches.fournisseur, like)))
      .limit(10),
  ]);

  res.json({ agents: agentRows, articles: articleRows, equipes: equipeRows, marches: marcheRows });
});
