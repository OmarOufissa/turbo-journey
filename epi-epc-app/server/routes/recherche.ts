import { Router } from "express";
import { db } from "../db";
import { agents, articles, equipes, marches } from "../db/schema";
import { like, or } from "drizzle-orm";

export const rechercheRouter = Router();

rechercheRouter.get("/", async (req, res) => {
  const q = (req.query.q as string)?.trim();
  if (!q || q.length < 2) return res.json({ agents: [], articles: [], equipes: [], marches: [] });
  const pattern = `%${q}%`;

  const [agentRows, articleRows, equipeRows, marcheRows] = await Promise.all([
    db
      .select({ id: agents.id, matricule: agents.matricule, nom: agents.nom, fonction: agents.fonction })
      .from(agents)
      .where(or(like(agents.nom, pattern), like(agents.matricule, pattern), like(agents.fonction, pattern)))
      .limit(15),
    db
      .select({ id: articles.id, codeArticle: articles.codeArticle, designation: articles.designation })
      .from(articles)
      .where(or(like(articles.designation, pattern), like(articles.codeArticle, pattern), like(articles.codeInterne, pattern)))
      .limit(15),
    db
      .select({ id: equipes.id, nom: equipes.nom, teamType: equipes.teamType })
      .from(equipes)
      .where(like(equipes.nom, pattern))
      .limit(10),
    db
      .select({ id: marches.id, numero: marches.numero, objet: marches.objet })
      .from(marches)
      .where(or(like(marches.numero, pattern), like(marches.objet, pattern), like(marches.fournisseur, pattern)))
      .limit(10),
  ]);

  res.json({ agents: agentRows, articles: articleRows, equipes: equipeRows, marches: marcheRows });
});
