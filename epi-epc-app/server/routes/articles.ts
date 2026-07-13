import { Router } from "express";
import { db } from "../db";
import { articles, articlesReference, equipementHierarchie, marches, documents, affectations, controlesPeriodiques, reformes, kitTemplateLignes } from "../db/schema";
import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import { logHistorique } from "../services/historiqueService";
import {
  listChildren,
  resolveDescendantIds,
  getAncestorChain,
  recomputeReglementaireCascade,
  getCategorieAncestorMap,
  getFamilleAncestorMap,
  getSousFamilleAncestorMap,
} from "../services/hierarchieService";
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

// Liste des fournisseurs distincts déjà utilisés au catalogue — alimente le filtre
// fournisseur d'Articles.tsx sans dupliquer une table de référence à part. Fournisseur
// dépend de l'article de référence choisi (articleReferenceId) — non filtré si omis.
articlesRouter.get("/fournisseurs", async (req, res) => {
  const { articleReferenceId } = req.query as Record<string, string>;
  const conditions = [sql`${articles.fournisseur} is not null and ${articles.fournisseur} != ''`];
  if (articleReferenceId) conditions.push(eq(articles.articleReferenceId, Number(articleReferenceId)));
  const rows = await db
    .selectDistinct({ fournisseur: articles.fournisseur })
    .from(articles)
    .where(and(...conditions))
    .orderBy(articles.fournisseur);
  res.json(rows.map((r) => r.fournisseur));
});

// Même principe que /fournisseurs, pour le filtre marque. Marque dépend de la catégorie
// choisie (ancestorId, tout nœud de classification) — non filtré si omis.
articlesRouter.get("/marques", async (req, res) => {
  const { ancestorId } = req.query as Record<string, string>;
  const conditions = [sql`${articles.marque} is not null and ${articles.marque} != ''`];
  if (ancestorId) conditions.push(inArray(articlesReference.hierarchieParentId, await resolveDescendantIds(Number(ancestorId))));
  const rows = await db
    .selectDistinct({ marque: articles.marque })
    .from(articles)
    .leftJoin(articlesReference, eq(articles.articleReferenceId, articlesReference.id))
    .where(and(...conditions))
    .orderBy(articles.marque);
  res.json(rows.map((r) => r.marque));
});

articlesRouter.get("/", async (req, res) => {
  const { q, hierarchieId, ancestorId, articleReferenceId, fournisseur, marque, page = "1", pageSize = "50" } = req.query as Record<string, string>;
  const conditions = [eq(articles.actif, true)];
  if (q) conditions.push(or(like(articles.designation, `%${q}%`), like(articles.codeArticle, `%${q}%`), like(articles.codeInterne, `%${q}%`))!);
  if (hierarchieId) conditions.push(eq(articlesReference.hierarchieParentId, Number(hierarchieId)));
  if (ancestorId) conditions.push(inArray(articlesReference.hierarchieParentId, await resolveDescendantIds(Number(ancestorId))));
  if (articleReferenceId) conditions.push(eq(articles.articleReferenceId, Number(articleReferenceId)));
  if (fournisseur) conditions.push(eq(articles.fournisseur, fournisseur));
  if (marque) conditions.push(eq(articles.marque, marque));

  const where = and(...conditions);
  const p = Math.max(1, Number(page));
  const ps = Math.min(500, Math.max(1, Number(pageSize)));

  const [rows, [{ total }], categorieMap, familleMap, sousFamilleMap] = await Promise.all([
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
        soumisControleReglementaire: equipementHierarchie.soumisControleReglementaire,
        // Bénéficiaire(s) actuel(s) : pas de compteur de stock, seulement la présence/absence
        // d'une affectation en cours — nom du bénéficiaire le plus récent + nombre total
        // d'affectations actives (plusieurs unités du même lot peuvent être affectées).
        beneficiaireActuel: sql<
          string | null
        >`(select coalesce(agents.nom, equipes.nom, postes.nom) from affectations left join agents on agents.id = affectations.agent_id left join equipes on equipes.id = affectations.equipe_id left join postes on postes.id = affectations.poste_id where affectations.article_id = articles.id and affectations.statut = 'actif' order by affectations.date_affectation desc limit 1)`,
        nbAffectationsActives: sql<number>`(select count(*) from affectations where affectations.article_id = articles.id and affectations.statut = 'actif')`,
        // "Total des articles" : nombre total d'unités physiques rattachées à la même
        // référence (même valeur répétée sur chaque ligne de cette référence).
        nbArticlesMemeReference: sql<number>`(select count(*) from articles a2 where a2.article_reference_id = articles.article_reference_id)`,
        prixUnitaire: articles.prixUnitaire,
        marque: articles.marque,
        modele: articles.modele,
        aTaille: articles.aTaille,
        aPointure: articles.aPointure,
        unite: articles.unite,
        fournisseur: articles.fournisseur,
      })
      .from(articles)
      .leftJoin(articlesReference, eq(articles.articleReferenceId, articlesReference.id))
      .leftJoin(equipementHierarchie, eq(articlesReference.hierarchieParentId, equipementHierarchie.id))
      .where(where)
      .orderBy(articles.codeArticle)
      .limit(ps)
      .offset((p - 1) * ps),
    db
      .select({ total: sql<number>`count(*)` })
      .from(articles)
      .leftJoin(articlesReference, eq(articles.articleReferenceId, articlesReference.id))
      .where(where),
    getCategorieAncestorMap(),
    getFamilleAncestorMap(),
    getSousFamilleAncestorMap(),
  ]);

  const enriched = rows.map((r) => {
    const categorie = r.hierarchieId != null ? categorieMap.get(r.hierarchieId) : undefined;
    const famille = r.hierarchieId != null ? familleMap.get(r.hierarchieId) : undefined;
    const sousFamille = r.hierarchieId != null ? sousFamilleMap.get(r.hierarchieId) : undefined;
    return {
      ...r,
      categorieNom: categorie?.nom ?? null,
      familleNom: famille && famille.id !== categorie?.id ? famille.nom : null,
      sousFamilleNom: sousFamille && sousFamille.id !== famille?.id ? sousFamille.nom : null,
    };
  });

  res.json({ rows: enriched, total, page: p, pageSize: ps });
});

articlesRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [article] = await db
    .select({
      id: articles.id,
      codeArticle: articles.codeArticle,
      codeInterne: articles.codeInterne,
      articleReferenceId: articles.articleReferenceId,
      articleReferenceCode: articlesReference.code,
      articleReferenceDesignation: articlesReference.designation,
      designation: articles.designation,
      description: articles.description,
      photoUrl: articles.photoUrl,
      soumisControleReglementaire: equipementHierarchie.soumisControleReglementaire,
      constructeur: articles.constructeur,
      marque: articles.marque,
      modele: articles.modele,
      normes: articles.normes,
      certification: articles.certification,
      dateFabrication: articles.dateFabrication,
      dateAcquisition: articles.dateAcquisition,
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
      unite: articles.unite,
      actif: articles.actif,
    })
    .from(articles)
    .leftJoin(articlesReference, eq(articles.articleReferenceId, articlesReference.id))
    .leftJoin(equipementHierarchie, eq(articlesReference.hierarchieParentId, equipementHierarchie.id))
    .leftJoin(marches, eq(articles.marcheId, marches.id))
    .where(eq(articles.id, id));
  if (!article) return res.status(404).json({ error: "Article introuvable" });

  const [docs, hierarchie] = await Promise.all([
    db.select().from(documents).where(and(eq(documents.entiteType, "article"), eq(documents.entiteId, id))),
    article.articleReferenceId
      ? db.select().from(articlesReference).where(eq(articlesReference.id, article.articleReferenceId)).then(async ([ref]) => (ref ? getAncestorChain(ref.hierarchieParentId) : []))
      : Promise.resolve([]),
  ]);

  // categorieNom (niveau 1 de la classification, ex. "EPI") pilote les règles de bénéficiaire
  // de l'affectation (agent/poste pour l'EPI, équipe/poste pour les autres catégories) — voir
  // client/components/shared/AffecterDialog.tsx.
  res.json({ ...article, documents: docs, hierarchie, categorieNom: hierarchie[0]?.nom ?? null });
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

// Suppression physique — seulement possible pour un article qui n'a jamais été affecté,
// contrôlé ou réformé (créé par erreur, jamais utilisé sur le terrain) : au premier
// événement réel, l'historique associé devient irremplaçable et seule la désactivation
// reste possible, conformément au principe général "aucune donnée ne doit être supprimée"
// une fois qu'un article a une vie opérationnelle.
articlesRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const [[{ n: nbAffectations }], [{ n: nbControles }], [{ n: nbReformes }], [{ n: nbLignes }]] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(affectations).where(eq(affectations.articleId, id)),
    db.select({ n: sql<number>`count(*)` }).from(controlesPeriodiques).where(eq(controlesPeriodiques.articleId, id)),
    db.select({ n: sql<number>`count(*)` }).from(reformes).where(eq(reformes.articleId, id)),
    db.select({ n: sql<number>`count(*)` }).from(kitTemplateLignes).where(eq(kitTemplateLignes.articleId, id)),
  ]);
  if (nbAffectations > 0 || nbControles > 0 || nbReformes > 0 || nbLignes > 0) {
    return res.status(409).json({
      error: "Impossible de supprimer : cet article a un historique (affectations, contrôles ou réformes) — désactivez-le plutôt",
      dependents: { affectations: nbAffectations, controles: nbControles, reformes: nbReformes, lignesGabarit: nbLignes },
    });
  }
  const [row] = await db.delete(articles).where(eq(articles.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Article introuvable" });
  await logHistorique({ typeEvenement: "suppression_article", entiteType: "article", entiteId: id, utilisateurId: req.user?.id, details: { designation: row.designation, codeArticle: row.codeArticle } });
  res.status(204).end();
});
