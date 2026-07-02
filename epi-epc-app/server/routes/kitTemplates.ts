import { Router } from "express";
import { db } from "../db";
import { kitTemplates, kitTemplateLignes, articles } from "../db/schema";
import { eq } from "drizzle-orm";

export const kitTemplatesRouter = Router();

kitTemplatesRouter.get("/", async (_req, res) => {
  res.json(await db.select().from(kitTemplates).orderBy(kitTemplates.appliesToType, kitTemplates.label));
});

kitTemplatesRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [tpl] = await db.select().from(kitTemplates).where(eq(kitTemplates.id, id));
  if (!tpl) return res.status(404).json({ error: "Gabarit introuvable" });
  const lignes = await db
    .select({ id: kitTemplateLignes.id, articleId: kitTemplateLignes.articleId, designation: articles.designation, quantite: kitTemplateLignes.quantite })
    .from(kitTemplateLignes)
    .innerJoin(articles, eq(kitTemplateLignes.articleId, articles.id))
    .where(eq(kitTemplateLignes.kitTemplateId, id));
  res.json({ ...tpl, lignes });
});
