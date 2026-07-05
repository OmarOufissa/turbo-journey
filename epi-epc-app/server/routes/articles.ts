import { Router } from "express";
import { db } from "../db";
import { articles, articlesReference, equipementHierarchie, marches, stockMouvements, documents } from "../db/schema";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { logHistorique } from "../services/historiqueService";
import { listChildren, resolveDescendantIds, getAncestorChain, recomputeReglementaireCascade } from "../services/hierarchieService";
import { generateCodeAbrege, generateArticleCode } from "../services/codificationService";
import type { AuthedRequest } from "../middleware/auth";

export const articlesRouter = Router();

// Un seul point d'entrée pour les listes déroulantes en cascade (catégorie générale
// > famille > sous-famille, profondeur variable) : le client rappelle cet
// endpoint à chaque niveau choisi, avec parentId = id du niveau précédent (omis
// pour charger les catégories générales, racines de l'arborescence).
articlesRouter.get("/hierarchie", async (req, res) => {
  const { parentId } = req.query as Record<string, string>;
  res.json(await listChildren(parentId ? Number(parentId) : null));
});

// Chaîne complète des ancêtres d'un nœud (racine → nœud) — utilisé pour
// réhydrater les listes déroulantes en cascade (filtre restauré depuis l'URL,
// article existant) sans que le client n'ait à retracer chaque niveau lui-même.
articlesRouter.get("/hierarchie/:id/ancetres", async (req, res) => {
  res.json(await getAncestorChain(Number(req.params.id)));
});

articlesRouter.post("/hierarchie", async (req: AuthedRequest, res) => {
  const { parentId, nom, ordre, soumisControleReglementaireExplicite, codeAbrege } = req.body as {
    parentId: number | null;
    nom: string;
    ordre?: number;
    soumisControleReglementaireExplicite?: boolean;
    codeAbrege?: string;
  };
  if (!nom) return res.status(400).json({ error: "Nom requis" });

  let niveau = 1;
  if (parentId != null) {
    const [parent] = await db.select().from(equipementHierarchie).where(eq(equipementHierarchie.id, parentId));
    if (!parent) return res.status(404).json({ error: "Nœud parent introuvable" });
    niveau = parent.niveau + 1;
  }
  const code = `${parentId ?? "racine"}-${nom}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const abrege = codeAbrege || (await generateCodeAbrege(nom, parentId ?? null));

  const [row] = await db
    .insert(equipementHierarchie)
    .values({
      parentId: parentId ?? null,
      code,
      codeAbrege: abrege,
      nom,
      niveau,
      ordre: ordre ?? 0,
      soumisControleReglementaireExplicite: soumisControleReglementaireExplicite ?? false,
      soumisControleReglementaire: false,
    })
    .returning();
  if (soumisControleReglementaireExplicite) await recomputeReglementaireCascade();
  await logHistorique({ typeEvenement: "creation_hierarchie", entiteType: "hierarchie", entiteId: row.id, utilisateurId: req.user?.id, details: { nom, parentId } });
  res.status(201).json(row);
});

articlesRouter.put("/hierarchie/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { nom, ordre, codeAbrege, soumisControleReglementaireExplicite } = req.body as {
    nom?: string;
    ordre?: number;
    codeAbrege?: string;
    soumisControleReglementaireExplicite?: boolean;
  };
  const [before] = await db.select().from(equipementHierarchie).where(eq(equipementHierarchie.id, id));
  if (!before) return res.status(404).json({ error: "Nœud introuvable" });

  const patch: Record<string, unknown> = {};
  if (nom !== undefined) patch.nom = nom;
  if (ordre !== undefined) patch.ordre = ordre;
  if (codeAbrege !== undefined) patch.codeAbrege = codeAbrege;
  if (soumisControleReglementaireExplicite !== undefined) patch.soumisControleReglementaireExplicite = soumisControleReglementaireExplicite;

  const [row] = await db.update(equipementHierarchie).set(patch).where(eq(equipementHierarchie.id, id)).returning();
  if (soumisControleReglementaireExplicite !== undefined) await recomputeReglementaireCascade();
  await logHistorique({ typeEvenement: "modification_hierarchie", entiteType: "hierarchie", entiteId: id, utilisateurId: req.user?.id, details: { avant: before, apres: row } });
  res.json(row);
});

articlesRouter.delete("/hierarchie/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const [enfants, refs] = await Promise.all([
    listChildren(id),
    db.select({ id: articlesReference.id }).from(articlesReference).where(eq(articlesReference.hierarchieParentId, id)),
  ]);
  if (enfants.length > 0 || refs.length > 0) {
    return res.status(409).json({
      error: "Impossible de supprimer : ce nœud a des éléments rattachés",
      dependents: { enfants: enfants.length, referencesArticle: refs.length },
    });
  }
  const [row] = await db.delete(equipementHierarchie).where(eq(equipementHierarchie.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Nœud introuvable" });
  await logHistorique({ typeEvenement: "suppression_hierarchie", entiteType: "hierarchie", entiteId: id, utilisateurId: req.user?.id, details: { nom: row.nom } });
  res.status(204).end();
});

articlesRouter.get("/", async (req, res) => {
  const { q, hierarchieId, ancestorId, stockStatut, page = "1", pageSize = "50" } = req.query as Record<string, string>;
  const conditions = [eq(articles.actif, true)];
  if (q) conditions.push(or(like(articles.designation, `%${q}%`), like(articles.codeArticle, `%${q}%`), like(articles.codeInterne, `%${q}%`))!);
  if (hierarchieId) conditions.push(eq(articlesReference.hierarchieParentId, Number(hierarchieId)));
  if (ancestorId) conditions.push(inArray(articlesReference.hierarchieParentId, await resolveDescendantIds(Number(ancestorId))));
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
        articleReferenceId: articles.articleReferenceId,
        articleReferenceCode: articlesReference.code,
        articleReferenceDesignation: articlesReference.designation,
        hierarchieId: articlesReference.hierarchieParentId,
        hierarchieNom: equipementHierarchie.nom,
        soumisControleReglementaire: equipementHierarchie.soumisControleReglementaire,
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
      .leftJoin(articlesReference, eq(articles.articleReferenceId, articlesReference.id))
      .leftJoin(equipementHierarchie, eq(articlesReference.hierarchieParentId, equipementHierarchie.id))
      .where(where)
      .orderBy(articles.designation)
      .limit(ps)
      .offset((p - 1) * ps),
    db
      .select({ total: sql<number>`count(*)` })
      .from(articles)
      .leftJoin(articlesReference, eq(articles.articleReferenceId, articlesReference.id))
      .where(where),
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
      articleReferenceId: articles.articleReferenceId,
      articleReferenceCode: articlesReference.code,
      articleReferenceDesignation: articlesReference.designation,
      designation: articles.designation,
      description: articles.description,
      photoUrl: articles.photoUrl,
      soumisControleReglementaire: equipementHierarchie.soumisControleReglementaire,
      referenceFabricant: articles.referenceFabricant,
      constructeur: articles.constructeur,
      marque: articles.marque,
      modele: articles.modele,
      normes: articles.normes,
      certification: articles.certification,
      dateFabrication: articles.dateFabrication,
      dateAcquisition: articles.dateAcquisition,
      numeroSerie: articles.numeroSerie,
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
    .leftJoin(articlesReference, eq(articles.articleReferenceId, articlesReference.id))
    .leftJoin(equipementHierarchie, eq(articlesReference.hierarchieParentId, equipementHierarchie.id))
    .leftJoin(marches, eq(articles.marcheId, marches.id))
    .where(eq(articles.id, id));
  if (!article) return res.status(404).json({ error: "Article introuvable" });

  const [mouvements, docs, hierarchie] = await Promise.all([
    db.select().from(stockMouvements).where(eq(stockMouvements.articleId, id)).orderBy(desc(stockMouvements.dateMouvement)).limit(50),
    db.select().from(documents).where(and(eq(documents.entiteType, "article"), eq(documents.entiteId, id))),
    article.articleReferenceId
      ? db.select().from(articlesReference).where(eq(articlesReference.id, article.articleReferenceId)).then(async ([ref]) => (ref ? getAncestorChain(ref.hierarchieParentId) : []))
      : Promise.resolve([]),
  ]);

  res.json({ ...article, mouvements, documents: docs, hierarchie });
});

articlesRouter.post("/", async (req: AuthedRequest, res) => {
  const body = req.body;
  if (!body.articleReferenceId) return res.status(400).json({ error: "Article de référence requis" });
  if (!body.designation) return res.status(400).json({ error: "Désignation requise" });
  const codeArticle = body.codeArticle || (await generateArticleCode(Number(body.articleReferenceId)));

  const [row] = await db.insert(articles).values({ ...body, codeArticle }).returning();
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

articlesRouter.post("/:id/reactiver", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const [row] = await db.update(articles).set({ actif: true, updatedAt: new Date().toISOString() }).where(eq(articles.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Article introuvable" });
  await logHistorique({ typeEvenement: "reactivation_article", entiteType: "article", entiteId: id, articleId: id, utilisateurId: req.user?.id });
  res.json(row);
});
