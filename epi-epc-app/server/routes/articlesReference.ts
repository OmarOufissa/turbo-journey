import { Router } from "express";
import { db } from "../db";
import { articlesReference, articles, equipementHierarchie, kitTemplateLignes, kitTemplates, documents } from "../db/schema";
import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import { logHistorique } from "../services/historiqueService";
import { resolveDescendantIds, getAncestorChain } from "../services/hierarchieService";
import { generateReferenceCode } from "../services/codificationService";
import type { AuthedRequest } from "../middleware/auth";

export const articlesReferenceRouter = Router();

articlesReferenceRouter.get("/", async (req, res) => {
  const { q, hierarchieParentId, ancestorId, actif, page = "1", pageSize = "50" } = req.query as Record<string, string>;
  const conditions = [];
  if (q) conditions.push(or(like(articlesReference.designation, `%${q}%`), like(articlesReference.code, `%${q}%`))!);
  if (hierarchieParentId) conditions.push(eq(articlesReference.hierarchieParentId, Number(hierarchieParentId)));
  if (ancestorId) conditions.push(inArray(articlesReference.hierarchieParentId, await resolveDescendantIds(Number(ancestorId))));
  if (actif === "true") conditions.push(eq(articlesReference.actif, true));
  if (actif === "false") conditions.push(eq(articlesReference.actif, false));

  const where = conditions.length ? and(...conditions) : undefined;
  const p = Math.max(1, Number(page));
  const ps = Math.min(500, Math.max(1, Number(pageSize)));

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: articlesReference.id,
        code: articlesReference.code,
        designation: articlesReference.designation,
        hierarchieParentId: articlesReference.hierarchieParentId,
        hierarchieParentNom: equipementHierarchie.nom,
        soumisControleReglementaire: equipementHierarchie.soumisControleReglementaire,
        dureeVieRecommandeeMois: articlesReference.dureeVieRecommandeeMois,
        quantiteReference: articlesReference.quantiteReference,
        typeDotation: articlesReference.typeDotation,
        actif: articlesReference.actif,
        nbArticles: sql<number>`(select count(*) from articles where articles.article_reference_id = articles_reference.id)`,
      })
      .from(articlesReference)
      .leftJoin(equipementHierarchie, eq(articlesReference.hierarchieParentId, equipementHierarchie.id))
      .where(where)
      .orderBy(articlesReference.designation)
      .limit(ps)
      .offset((p - 1) * ps),
    db.select({ total: sql<number>`count(*)` }).from(articlesReference).where(where),
  ]);

  res.json({ rows, total, page: p, pageSize: ps });
});

articlesReferenceRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [reference] = await db
    .select({
      id: articlesReference.id,
      code: articlesReference.code,
      designation: articlesReference.designation,
      hierarchieParentId: articlesReference.hierarchieParentId,
      soumisControleReglementaire: equipementHierarchie.soumisControleReglementaire,
      caracteristiquesTechniques: articlesReference.caracteristiquesTechniques,
      ficheTechniquePdfUrl: articlesReference.ficheTechniquePdfUrl,
      photoUrl: articlesReference.photoUrl,
      normes: articlesReference.normes,
      certifications: articlesReference.certifications,
      dureeVieRecommandeeMois: articlesReference.dureeVieRecommandeeMois,
      quantiteReference: articlesReference.quantiteReference,
      typeDotation: articlesReference.typeDotation,
      observations: articlesReference.observations,
      actif: articlesReference.actif,
    })
    .from(articlesReference)
    .leftJoin(equipementHierarchie, eq(articlesReference.hierarchieParentId, equipementHierarchie.id))
    .where(eq(articlesReference.id, id));
  if (!reference) return res.status(404).json({ error: "Article de référence introuvable" });

  const [hierarchie, liesArticles, liesLignes, docs] = await Promise.all([
    getAncestorChain(reference.hierarchieParentId),
    db
      .select({ id: articles.id, codeArticle: articles.codeArticle, designation: articles.designation, stockDisponible: articles.stockDisponible, actif: articles.actif })
      .from(articles)
      .where(eq(articles.articleReferenceId, id)),
    db
      .select({ kitTemplateId: kitTemplateLignes.kitTemplateId, kitLabel: kitTemplates.label, quantite: kitTemplateLignes.quantite })
      .from(kitTemplateLignes)
      .innerJoin(kitTemplates, eq(kitTemplateLignes.kitTemplateId, kitTemplates.id))
      .where(eq(kitTemplateLignes.articleReferenceId, id)),
    db.select().from(documents).where(and(eq(documents.entiteType, "article_reference"), eq(documents.entiteId, id))),
  ]);

  res.json({ ...reference, hierarchie, articles: liesArticles, kitLignes: liesLignes, documents: docs });
});

articlesReferenceRouter.post("/", async (req: AuthedRequest, res) => {
  const body = req.body as {
    hierarchieParentId: number;
    designation: string;
    caracteristiquesTechniques?: unknown;
    ficheTechniquePdfUrl?: string;
    photoUrl?: string;
    normes?: string[];
    certifications?: string[];
    dureeVieRecommandeeMois?: number;
    quantiteReference?: number;
    typeDotation?: string;
    observations?: string;
    code?: string;
  };
  if (!body.hierarchieParentId) return res.status(400).json({ error: "Classification requise" });
  if (!body.designation) return res.status(400).json({ error: "Désignation requise" });

  const code = body.code || (await generateReferenceCode(Number(body.hierarchieParentId)));
  const [row] = await db.insert(articlesReference).values({ ...body, code }).returning();
  await logHistorique({ typeEvenement: "creation_article_reference", entiteType: "article_reference", entiteId: row.id, utilisateurId: req.user?.id, details: { designation: row.designation } });
  res.status(201).json(row);
});

articlesReferenceRouter.put("/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const [before] = await db.select().from(articlesReference).where(eq(articlesReference.id, id));
  if (!before) return res.status(404).json({ error: "Article de référence introuvable" });
  const [row] = await db.update(articlesReference).set({ ...req.body, updatedAt: new Date().toISOString() }).where(eq(articlesReference.id, id)).returning();
  await logHistorique({ typeEvenement: "modification_article_reference", entiteType: "article_reference", entiteId: id, utilisateurId: req.user?.id, details: { avant: before, apres: row } });
  res.json(row);
});

articlesReferenceRouter.post("/:id/desactiver", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(articlesReference).set({ actif: false, updatedAt: new Date().toISOString() }).where(eq(articlesReference.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Article de référence introuvable" });
  await logHistorique({ typeEvenement: "desactivation_article_reference", entiteType: "article_reference", entiteId: id, utilisateurId: req.user?.id });
  res.json(row);
});

articlesReferenceRouter.post("/:id/reactiver", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(articlesReference).set({ actif: true, updatedAt: new Date().toISOString() }).where(eq(articlesReference.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Article de référence introuvable" });
  await logHistorique({ typeEvenement: "reactivation_article_reference", entiteType: "article_reference", entiteId: id, utilisateurId: req.user?.id });
  res.json(row);
});

articlesReferenceRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const [[{ n: nbArticles }], [{ n: nbLignes }]] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(articles).where(eq(articles.articleReferenceId, id)),
    db.select({ n: sql<number>`count(*)` }).from(kitTemplateLignes).where(eq(kitTemplateLignes.articleReferenceId, id)),
  ]);
  if (nbArticles > 0 || nbLignes > 0) {
    return res.status(409).json({
      error: "Impossible de supprimer : des articles ou gabarits de dotation y sont rattachés — désactivez-la plutôt",
      dependents: { articles: nbArticles, kitLignes: nbLignes },
    });
  }
  const [row] = await db.delete(articlesReference).where(eq(articlesReference.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Article de référence introuvable" });
  await logHistorique({ typeEvenement: "suppression_article_reference", entiteType: "article_reference", entiteId: id, utilisateurId: req.user?.id, details: { designation: row.designation } });
  res.status(204).end();
});
