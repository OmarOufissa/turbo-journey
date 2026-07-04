import { Router } from "express";
import { db } from "../db";
import { affectations, articles, agents, equipes, kitTemplateLignes, reformes, equipementHierarchie } from "../db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { applyStockMouvement } from "../services/stockService";
import { logHistorique } from "../services/historiqueService";
import type { AuthedRequest } from "../middleware/auth";

export const affectationsRouter = Router();

// Vue groupée : un article assigné à N bénéficiaires (agents ou équipes) apparaît comme
// une seule ligne récapitulative ici. Les lignes individuelles (avec leur propre statut,
// date de retour, etc.) restent consultables via GET /?articleId=&beneficiaireType= —
// aucune donnée n'est fusionnée en base, seul l'affichage est condensé.
affectationsRouter.get("/groupes", async (req, res) => {
  const { statut, beneficiaireType } = req.query as Record<string, string>;
  const conditions = [];
  if (statut) conditions.push(eq(affectations.statut, statut));
  if (beneficiaireType) conditions.push(eq(affectations.beneficiaireType, beneficiaireType));
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      articleId: affectations.articleId,
      designation: articles.designation,
      codeArticle: articles.codeArticle,
      beneficiaireType: affectations.beneficiaireType,
      nbBeneficiaires: sql<number>`count(*)`,
      totalQuantite: sql<number>`sum(${affectations.quantite})`,
      nbActif: sql<number>`sum(case when ${affectations.statut} = 'actif' then 1 else 0 end)`,
      nbRetourne: sql<number>`sum(case when ${affectations.statut} = 'retourne' then 1 else 0 end)`,
      nbPerdu: sql<number>`sum(case when ${affectations.statut} = 'perdu' then 1 else 0 end)`,
      nbReforme: sql<number>`sum(case when ${affectations.statut} = 'reforme' then 1 else 0 end)`,
    })
    .from(affectations)
    .innerJoin(articles, eq(affectations.articleId, articles.id))
    .where(where)
    .groupBy(affectations.articleId, articles.designation, articles.codeArticle, affectations.beneficiaireType)
    .orderBy(sql`count(*) desc`);

  res.json(rows);
});

affectationsRouter.get("/", async (req, res) => {
  const { agentId, equipeId, articleId, statut, beneficiaireType, page = "1", pageSize = "50" } = req.query as Record<string, string>;
  const conditions = [];
  if (agentId) conditions.push(eq(affectations.agentId, Number(agentId)));
  if (equipeId) conditions.push(eq(affectations.equipeId, Number(equipeId)));
  if (articleId) conditions.push(eq(affectations.articleId, Number(articleId)));
  if (statut) conditions.push(eq(affectations.statut, statut));
  if (beneficiaireType) conditions.push(eq(affectations.beneficiaireType, beneficiaireType));
  const where = conditions.length ? and(...conditions) : undefined;
  const p = Math.max(1, Number(page));
  const ps = Math.min(500, Math.max(1, Number(pageSize)));

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: affectations.id,
        articleId: affectations.articleId,
        designation: articles.designation,
        codeArticle: articles.codeArticle,
        beneficiaireType: affectations.beneficiaireType,
        agentId: affectations.agentId,
        agentNom: agents.nom,
        equipeId: affectations.equipeId,
        equipeNom: equipes.nom,
        quantite: affectations.quantite,
        taille: affectations.taille,
        pointure: affectations.pointure,
        dateAffectation: affectations.dateAffectation,
        motif: affectations.motif,
        statut: affectations.statut,
        dateRetour: affectations.dateRetour,
        numeroSerie: affectations.numeroSerie,
        lieuEmplacement: affectations.lieuEmplacement,
        marque: affectations.marque,
        dateFabricationUnite: affectations.dateFabricationUnite,
        observations: affectations.observations,
        caracteristiques: affectations.caracteristiques,
        soumisControleReglementaire: equipementHierarchie.soumisControleReglementaire,
      })
      .from(affectations)
      .innerJoin(articles, eq(affectations.articleId, articles.id))
      .leftJoin(agents, eq(affectations.agentId, agents.id))
      .leftJoin(equipes, eq(affectations.equipeId, equipes.id))
      .leftJoin(equipementHierarchie, eq(articles.hierarchieId, equipementHierarchie.id))
      .where(where)
      .orderBy(desc(affectations.dateAffectation))
      .limit(ps)
      .offset((p - 1) * ps),
    db.select({ total: sql<number>`count(*)` }).from(affectations).where(where),
  ]);

  res.json({ rows, total, page: p, pageSize: ps });
});

affectationsRouter.post("/", async (req: AuthedRequest, res) => {
  const body = req.body as {
    articleId: number;
    beneficiaireType: "agent" | "equipe";
    agentId?: number;
    equipeId?: number;
    quantite: number;
    taille?: string;
    pointure?: string;
    dateAffectation: string;
    motif?: string;
    validateurAgentId?: number;
    // Suivi par unité physique (équipements soumis à contrôle règlementaire)
    numeroSerie?: string;
    lieuEmplacement?: string;
    marque?: string;
    dateFabricationUnite?: string;
    observations?: string;
    caracteristiques?: Record<string, unknown>;
  };
  if (!body.articleId || !body.quantite || !body.dateAffectation) {
    return res.status(400).json({ error: "Article, quantité et date requis" });
  }
  if (body.beneficiaireType === "agent" && !body.agentId) return res.status(400).json({ error: "Agent requis" });
  if (body.beneficiaireType === "equipe" && !body.equipeId) return res.status(400).json({ error: "Équipe requise" });

  const [article] = await db.select().from(articles).where(eq(articles.id, body.articleId));
  if (!article) return res.status(404).json({ error: "Article introuvable" });
  if (article.stockDisponible < body.quantite) {
    return res.status(409).json({ error: `Stock disponible insuffisant (${article.stockDisponible} disponible(s))` });
  }

  const [row] = await db.insert(affectations).values({ ...body, statut: "actif" }).returning();
  await applyStockMouvement({
    articleId: body.articleId,
    type: "sortie_affectation",
    quantite: -body.quantite,
    referenceType: "affectation",
    referenceId: row.id,
    motif: body.motif,
    creeParUserId: req.user?.id,
  });
  await logHistorique({
    typeEvenement: "dotation",
    entiteType: "affectation",
    entiteId: row.id,
    agentId: body.agentId,
    equipeId: body.equipeId,
    articleId: body.articleId,
    utilisateurId: req.user?.id,
    details: { quantite: body.quantite, motif: body.motif },
  });
  res.status(201).json(row);
});

// Mise à jour des informations d'une unité physique (équipements soumis à contrôle
// règlementaire : numéro de série, emplacement, marque, date de fabrication,
// observations, caractéristiques propres à la famille). Sans effet sur le stock
// ni le statut — distinct des transitions retour/réforme.
affectationsRouter.put("/:id/unite", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { numeroSerie, lieuEmplacement, marque, dateFabricationUnite, observations, caracteristiques } = req.body as {
    numeroSerie?: string | null;
    lieuEmplacement?: string | null;
    marque?: string | null;
    dateFabricationUnite?: string | null;
    observations?: string | null;
    caracteristiques?: Record<string, unknown> | null;
  };
  const [before] = await db.select().from(affectations).where(eq(affectations.id, id));
  if (!before) return res.status(404).json({ error: "Affectation introuvable" });

  const [row] = await db
    .update(affectations)
    .set({ numeroSerie, lieuEmplacement, marque, dateFabricationUnite, observations, caracteristiques, updatedAt: new Date().toISOString() })
    .where(eq(affectations.id, id))
    .returning();
  await logHistorique({
    typeEvenement: "maj_unite_equipement",
    entiteType: "affectation",
    entiteId: id,
    agentId: before.agentId,
    equipeId: before.equipeId,
    articleId: before.articleId,
    utilisateurId: req.user?.id,
    details: { numeroSerie, lieuEmplacement },
  });
  res.json(row);
});

// Application en masse d'un gabarit de dotation standard à un agent ou une équipe
affectationsRouter.post("/kit/appliquer", async (req: AuthedRequest, res) => {
  const { kitTemplateId, agentId, equipeId, dateAffectation, motif, validateurAgentId } = req.body as {
    kitTemplateId: number;
    agentId?: number;
    equipeId?: number;
    dateAffectation: string;
    motif?: string;
    validateurAgentId?: number;
  };
  if (!kitTemplateId || !dateAffectation || (!agentId && !equipeId)) {
    return res.status(400).json({ error: "Gabarit, date et bénéficiaire (agent ou équipe) requis" });
  }
  const lignes = await db
    .select({ articleId: kitTemplateLignes.articleId, quantite: kitTemplateLignes.quantite, stockDisponible: articles.stockDisponible, designation: articles.designation })
    .from(kitTemplateLignes)
    .innerJoin(articles, eq(kitTemplateLignes.articleId, articles.id))
    .where(eq(kitTemplateLignes.kitTemplateId, kitTemplateId));

  const insufficient = lignes.filter((l) => l.stockDisponible < l.quantite);
  const created = [];
  for (const ligne of lignes) {
    if (ligne.stockDisponible < ligne.quantite) continue; // ignoré, signalé dans la réponse
    const [row] = await db
      .insert(affectations)
      .values({
        articleId: ligne.articleId,
        beneficiaireType: agentId ? "agent" : "equipe",
        agentId: agentId ?? null,
        equipeId: equipeId ?? null,
        quantite: ligne.quantite,
        dateAffectation,
        motif: motif ?? "Application du gabarit de dotation standard",
        validateurAgentId,
        statut: "actif",
        kitTemplateId,
      })
      .returning();
    await applyStockMouvement({
      articleId: ligne.articleId,
      type: "sortie_affectation",
      quantite: -ligne.quantite,
      referenceType: "affectation",
      referenceId: row.id,
      creeParUserId: req.user?.id,
    });
    created.push(row);
  }
  await logHistorique({
    typeEvenement: "dotation_kit",
    entiteType: agentId ? "agent" : "equipe",
    entiteId: agentId ?? equipeId,
    agentId,
    equipeId,
    utilisateurId: req.user?.id,
    details: { kitTemplateId, nbLignes: created.length, ignorees: insufficient.map((i) => i.designation) },
  });
  res.status(201).json({ created: created.length, ignoredForStock: insufficient.map((i) => i.designation) });
});

affectationsRouter.post("/:id/retour", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { dateRetour, etatRetour } = req.body as { dateRetour: string; etatRetour: "bon" | "usage_normal" | "endommage" | "hors_service" };
  const [affectation] = await db.select().from(affectations).where(eq(affectations.id, id));
  if (!affectation) return res.status(404).json({ error: "Affectation introuvable" });

  const [row] = await db
    .update(affectations)
    .set({ statut: "retourne", dateRetour, etatRetour, updatedAt: new Date().toISOString() })
    .where(eq(affectations.id, id))
    .returning();

  if (etatRetour === "bon" || etatRetour === "usage_normal") {
    await applyStockMouvement({
      articleId: affectation.articleId,
      type: "entree_retour",
      quantite: affectation.quantite,
      referenceType: "affectation",
      referenceId: id,
      motif: "Retour équipement",
      creeParUserId: req.user?.id,
    });
  }
  await logHistorique({
    typeEvenement: "retour",
    entiteType: "affectation",
    entiteId: id,
    agentId: affectation.agentId,
    equipeId: affectation.equipeId,
    articleId: affectation.articleId,
    utilisateurId: req.user?.id,
    details: { etatRetour },
  });
  res.json(row);
});

affectationsRouter.post("/:id/reforme", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { motif, decision } = req.body as { motif: string; decision?: string };
  const [affectation] = await db.select().from(affectations).where(eq(affectations.id, id));
  if (!affectation) return res.status(404).json({ error: "Affectation introuvable" });

  const [row] = await db.update(affectations).set({ statut: "reforme", updatedAt: new Date().toISOString() }).where(eq(affectations.id, id)).returning();
  const [reforme] = await db
    .insert(reformes)
    .values({ articleId: affectation.articleId, affectationId: id, dateReforme: new Date().toISOString().slice(0, 10), quantite: affectation.quantite, motif, decision })
    .returning();

  await applyStockMouvement({
    articleId: affectation.articleId,
    type: "sortie_reforme",
    quantite: 0, // l'unité était déjà sortie du disponible lors de la dotation ; la réforme documente sa fin de vie
    referenceType: "reforme",
    referenceId: reforme.id,
    motif,
    creeParUserId: req.user?.id,
  });
  await logHistorique({
    typeEvenement: "reforme",
    entiteType: "affectation",
    entiteId: id,
    agentId: affectation.agentId,
    equipeId: affectation.equipeId,
    articleId: affectation.articleId,
    utilisateurId: req.user?.id,
    details: { motif, decision },
  });
  res.json({ affectation: row, reforme });
});
