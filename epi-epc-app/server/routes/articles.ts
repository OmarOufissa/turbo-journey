import { Router } from "express";
import { db } from "../db";
import { articles, familles, sousFamilles, marches, stockMouvements, documents } from "../db/schema";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { logHistorique } from "../services/historiqueService";
import type { AuthedRequest } from "../middleware/auth";

export const articlesRouter = Router();

articlesRouter.get("/familles", async (_req, res) => {
  const rows = await db.select().from(familles).orderBy(familles.ordre);
  res.json(rows);
});
articlesRouter.get("/sous-familles", async (req, res) => {
  const { familleId } = req.query as Record<string, string>;
  const where = familleId ? eq(sousFamilles.familleId, Number(familleId)) : undefined;
  res.json(await db.select().from(sousFamilles).where(where));
});

articlesRouter.get("/", async (req, res) => {
  const { q, familleId, sousFamilleId, stockStatut, page = "1", pageSize = "50" } = req.query as Record<string, string>;
  const conditions = [eq(articles.actif, true)];
  if (q) conditions.push(or(like(articles.designation, `%${q}%`), like(articles.codeArticle, `%${q}%`), like(articles.codeInterne, `%${q}%`))!);
  if (familleId) conditions.push(eq(articles.familleId, Number(familleId)));
  if (sousFamilleId) conditions.push(eq(articles.sousFamilleId, Number(sousFamilleId)));
  if (stockStatut === "rupture") conditions.push(sql`${articles.stockDisponible} = 0`);
  if (stockStatut === "faible") conditions.push(sql`${articles.stockDisponible} > 0 AND ${articles.stockDisponible} <= ${articles.stockMin}`);

  const where = and(...conditions);
  const p = Math.max(1, Number(page));
  const ps = Math.min(500, Math.max(1, Number(pageSize)));

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: articles.id,
        codeArticle: articles.codeArticle,
        designation: articles.designation,
        photoUrl: articles.photoUrl,
        familleId: articles.familleId,
        familleNom: familles.nom,
        sousFamilleNom: sousFamilles.nom,
        stockDisponible: articles.stockDisponible,
        stockReserve: articles.stockReserve,
        stockCommande: articles.stockCommande,
        stockMin: articles.stockMin,
        stockMax: articles.stockMax,
        prixUnitaire: articles.prixUnitaire,
        aTaille: articles.aTaille,
        aPointure: articles.aPointure,
        unite: articles.unite,
      })
      .from(articles)
      .leftJoin(familles, eq(articles.familleId, familles.id))
      .leftJoin(sousFamilles, eq(articles.sousFamilleId, sousFamilles.id))
      .where(where)
      .orderBy(articles.designation)
      .limit(ps)
      .offset((p - 1) * ps),
    db.select({ total: sql<number>`count(*)` }).from(articles).where(where),
  ]);

  res.json({ rows, total, page: p, pageSize: ps });
});

articlesRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [article] = await db
    .select({
      id: articles.id,
      codeArticle: articles.codeArticle,
      codeInterne: articles.codeInterne,
      codeFournisseur: articles.codeFournisseur,
      designation: articles.designation,
      description: articles.description,
      photoUrl: articles.photoUrl,
      familleId: articles.familleId,
      familleNom: familles.nom,
      sousFamilleId: articles.sousFamilleId,
      sousFamilleNom: sousFamilles.nom,
      referenceFabricant: articles.referenceFabricant,
      constructeur: articles.constructeur,
      normes: articles.normes,
      certification: articles.certification,
      dateFabrication: articles.dateFabrication,
      dureeVieMois: articles.dureeVieMois,
      dateLimiteUtilisation: articles.dateLimiteUtilisation,
      noticePdfUrl: articles.noticePdfUrl,
      ficheTechniquePdfUrl: articles.ficheTechniquePdfUrl,
      poidsKg: articles.poidsKg,
      dimensions: articles.dimensions,
      couleur: articles.couleur,
      aTaille: articles.aTaille,
      aPointure: articles.aPointure,
      dateMiseEnService: articles.dateMiseEnService,
      observations: articles.observations,
      prixUnitaire: articles.prixUnitaire,
      marcheId: articles.marcheId,
      marcheNumero: marches.numero,
      fournisseur: articles.fournisseur,
      garantieMois: articles.garantieMois,
      stockMin: articles.stockMin,
      stockMax: articles.stockMax,
      stockDisponible: articles.stockDisponible,
      stockReserve: articles.stockReserve,
      stockCommande: articles.stockCommande,
      unite: articles.unite,
      actif: articles.actif,
    })
    .from(articles)
    .leftJoin(familles, eq(articles.familleId, familles.id))
    .leftJoin(sousFamilles, eq(articles.sousFamilleId, sousFamilles.id))
    .leftJoin(marches, eq(articles.marcheId, marches.id))
    .where(eq(articles.id, id));
  if (!article) return res.status(404).json({ error: "Article introuvable" });

  const [mouvements, docs] = await Promise.all([
    db.select().from(stockMouvements).where(eq(stockMouvements.articleId, id)).orderBy(desc(stockMouvements.dateMouvement)).limit(50),
    db.select().from(documents).where(and(eq(documents.entiteType, "article"), eq(documents.entiteId, id))),
  ]);

  res.json({ ...article, mouvements, documents: docs });
});

articlesRouter.post("/", async (req: AuthedRequest, res) => {
  const body = req.body;
  if (!body.codeArticle || !body.designation) return res.status(400).json({ error: "Code article et désignation requis" });
  const [row] = await db.insert(articles).values(body).returning();
  await logHistorique({ typeEvenement: "creation_article", entiteType: "article", entiteId: row.id, articleId: row.id, utilisateurId: req.user?.id, details: { designation: row.designation } });
  res.status(201).json(row);
});

articlesRouter.put("/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const [before] = await db.select().from(articles).where(eq(articles.id, id));
  if (!before) return res.status(404).json({ error: "Article introuvable" });
  const [row] = await db.update(articles).set({ ...req.body, updatedAt: new Date().toISOString() }).where(eq(articles.id, id)).returning();
  await logHistorique({ typeEvenement: "modification_article", entiteType: "article", entiteId: id, articleId: id, utilisateurId: req.user?.id, details: { avant: before, apres: row } });
  res.json(row);
});

articlesRouter.post("/:id/desactiver", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(articles).set({ actif: false, updatedAt: new Date().toISOString() }).where(eq(articles.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Article introuvable" });
  await logHistorique({ typeEvenement: "desactivation_article", entiteType: "article", entiteId: id, articleId: id, utilisateurId: req.user?.id });
  res.json(row);
});
