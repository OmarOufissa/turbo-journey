import { Router } from "express";
import { db } from "../db";
import { marches, articles } from "../db/schema";
import { count, eq } from "drizzle-orm";
import { logHistorique } from "../services/historiqueService";
import type { AuthedRequest } from "../middleware/auth";

export const marchesRouter = Router();

marchesRouter.get("/", async (_req, res) => {
  const rows = await db
    .select({
      id: marches.id,
      numero: marches.numero,
      annee: marches.annee,
      objet: marches.objet,
      fournisseur: marches.fournisseur,
      montant: marches.montant,
      dateNotification: marches.dateNotification,
      dateLivraison: marches.dateLivraison,
      statut: marches.statut,
      nbArticles: count(articles.id),
    })
    .from(marches)
    .leftJoin(articles, eq(articles.marcheId, marches.id))
    .groupBy(marches.id)
    .orderBy(marches.dateNotification);
  res.json(rows);
});

marchesRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [marche] = await db.select().from(marches).where(eq(marches.id, id));
  if (!marche) return res.status(404).json({ error: "Marché introuvable" });
  const linkedArticles = await db.select().from(articles).where(eq(articles.marcheId, id));
  res.json({ ...marche, articles: linkedArticles });
});

marchesRouter.post("/", async (req: AuthedRequest, res) => {
  const body = req.body;
  if (!body.numero || !body.annee || !body.objet || !body.fournisseur) {
    return res.status(400).json({ error: "Numéro, année, objet et fournisseur requis" });
  }
  const [row] = await db.insert(marches).values(body).returning();
  await logHistorique({ typeEvenement: "creation_marche", entiteType: "marche", entiteId: row.id, utilisateurId: req.user?.id, details: { numero: row.numero, objet: row.objet } });
  res.status(201).json(row);
});

marchesRouter.put("/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(marches).set(req.body).where(eq(marches.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Marché introuvable" });
  await logHistorique({ typeEvenement: "modification_marche", entiteType: "marche", entiteId: id, utilisateurId: req.user?.id });
  res.json(row);
});
