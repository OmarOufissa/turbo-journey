import { Router } from "express";
import { db } from "../db";
import { affectations, articles, articlesReference, agents, equipes, kitTemplateLignes, reformes, equipementHierarchie } from "../db/schema";
import { and, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { logHistorique } from "../services/historiqueService";
import { resolveDescendantIds } from "../services/hierarchieService";
import type { AuthedRequest } from "../middleware/auth";

export const affectationsRouter = Router();

// Vue groupée : un article assigné à N bénéficiaires (agents ou équipes) apparaît comme
// une seule ligne récapitulative ici. Les lignes individuelles (avec leur propre statut,
// date de retour, etc.) restent consultables via GET /?articleId=&beneficiaireType= —
// aucune donnée n'est fusionnée en base, seul l'affichage est condensé.
affectationsRouter.get("/groupes", async (req, res) => {
  const { statut, beneficiaireType, q, ancestorId } = req.query as Record<string, string>;
  const conditions = [];
  if (statut) conditions.push(eq(affectations.statut, statut));
  if (beneficiaireType) conditions.push(eq(affectations.beneficiaireType, beneficiaireType));
  if (ancestorId) conditions.push(inArray(articlesReference.hierarchieParentId, await resolveDescendantIds(Number(ancestorId))));
  if (q) conditions.push(or(like(articles.designation, `%${q}%`), like(articles.codeArticle, `%${q}%`))!);
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
    .leftJoin(articlesReference, eq(articles.articleReferenceId, articlesReference.id))
    .where(where)
    .groupBy(affectations.articleId, articles.designation, articles.codeArticle, affectations.beneficiaireType)
    .orderBy(sql`count(*) desc`);

  res.json(rows);
});

affectationsRouter.get("/", async (req, res) => {
  const { agentId, equipeId, articleId, statut, beneficiaireType, q, ancestorId, page = "1", pageSize = "50" } = req.query as Record<string, string>;
  const conditions = [];
  if (agentId) conditions.push(eq(affectations.agentId, Number(agentId)));
  if (equipeId) conditions.push(eq(affectations.equipeId, Number(equipeId)));
  if (articleId) conditions.push(eq(affectations.articleId, Number(articleId)));
  if (statut) conditions.push(eq(affectations.statut, statut));
  if (beneficiaireType) conditions.push(eq(affectations.beneficiaireType, beneficiaireType));
  if (ancestorId) conditions.push(inArray(articlesReference.hierarchieParentId, await resolveDescendantIds(Number(ancestorId))));
  if (q) {
    conditions.push(
      or(
        like(articles.designation, `%${q}%`),
        like(articles.codeArticle, `%${q}%`),
        like(agents.nom, `%${q}%`),
        like(equipes.nom, `%${q}%`),
        like(affectations.numeroSerie, `%${q}%`),
      )!,
    );
  }
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
      .leftJoin(articlesReference, eq(articles.articleReferenceId, articlesReference.id))
      .leftJoin(equipementHierarchie, eq(articlesReference.hierarchieParentId, equipementHierarchie.id))
      .where(where)
      .orderBy(desc(affectations.dateAffectation))
      .limit(ps)
      .offset((p - 1) * ps),
    db
      .select({ total: sql<number>`count(*)` })
      .from(affectations)
      .innerJoin(articles, eq(affectations.articleId, articles.id))
      .leftJoin(agents, eq(affectations.agentId, agents.id))
      .leftJoin(equipes, eq(affectations.equipeId, equipes.id))
      .leftJoin(articlesReference, eq(articles.articleReferenceId, articlesReference.id))
      .where(where),
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

  const [row] = await db.insert(affectations).values({ ...body, statut: "actif" }).returning();
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

// Modifier une affectation — corrige la date, le motif ou les observations d'une dotation
// existante sans y toucher le statut, qui reste exclusivement géré par les transitions
// dédiées (retour/perdu/réforme), chacune avec sa propre confirmation et son propre
// historique. Toute modification est elle-même journalisée.
affectationsRouter.put("/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { dateAffectation, motif, observations } = req.body as {
    dateAffectation?: string;
    motif?: string;
    observations?: string | null;
  };
  const [before] = await db.select().from(affectations).where(eq(affectations.id, id));
  if (!before) return res.status(404).json({ error: "Affectation introuvable" });

  const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (dateAffectation !== undefined) patch.dateAffectation = dateAffectation;
  if (motif !== undefined) patch.motif = motif;
  if (observations !== undefined) patch.observations = observations;

  const [row] = await db.update(affectations).set(patch).where(eq(affectations.id, id)).returning();
  await logHistorique({
    typeEvenement: "modification_affectation",
    entiteType: "affectation",
    entiteId: id,
    agentId: before.agentId,
    equipeId: before.equipeId,
    articleId: before.articleId,
    utilisateurId: req.user?.id,
    details: { avant: { dateAffectation: before.dateAffectation, motif: before.motif, observations: before.observations }, apres: { dateAffectation, motif, observations } },
  });
  res.json(row);
});

// Mise à jour des informations d'une unité physique (équipements soumis à contrôle
// règlementaire : numéro de série, emplacement, marque, date de fabrication,
// observations, caractéristiques propres à la famille) — distincte des transitions
// retour/réforme et de la modification générale ci-dessus (motif/date/observations).
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
    .select({ articleId: kitTemplateLignes.articleId, quantite: kitTemplateLignes.quantite, designation: articles.designation })
    .from(kitTemplateLignes)
    .innerJoin(articles, eq(kitTemplateLignes.articleId, articles.id))
    .where(eq(kitTemplateLignes.kitTemplateId, kitTemplateId));

  const created = [];
  for (const ligne of lignes) {
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
    created.push(row);
  }
  await logHistorique({
    typeEvenement: "dotation_kit",
    entiteType: agentId ? "agent" : "equipe",
    entiteId: agentId ?? equipeId,
    agentId,
    equipeId,
    utilisateurId: req.user?.id,
    details: { kitTemplateId, nbLignes: created.length },
  });
  res.status(201).json({ created: created.length });
});

// "Retirer l'affectation" — l'unité redevient disponible pour une réaffectation (état bon/
// usage normal) ou sort définitivement de la rotation (endommagé/hors service, cf. réforme).
// Le motif du retrait et le commentaire éventuel de l'utilisateur sont conservés dans
// l'historique (jamais perdus ni écrasés) plutôt que dans affectations.motif, qui reste la
// raison de la dotation d'origine (Dotation initiale, Renouvellement…) — écraser cette
// colonne au retrait effacerait l'information "pourquoi cet équipement a été affecté".
affectationsRouter.post("/:id/retour", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { dateRetour, etatRetour, motif, commentaire } = req.body as {
    dateRetour: string;
    etatRetour: "bon" | "usage_normal" | "endommage" | "hors_service";
    motif?: string;
    commentaire?: string;
  };
  const [affectation] = await db.select().from(affectations).where(eq(affectations.id, id));
  if (!affectation) return res.status(404).json({ error: "Affectation introuvable" });

  const [row] = await db
    .update(affectations)
    .set({ statut: "retourne", dateRetour, dateClotureStatut: dateRetour, etatRetour, updatedAt: new Date().toISOString() })
    .where(eq(affectations.id, id))
    .returning();

  await logHistorique({
    typeEvenement: "retour",
    entiteType: "affectation",
    entiteId: id,
    agentId: affectation.agentId,
    equipeId: affectation.equipeId,
    articleId: affectation.articleId,
    utilisateurId: req.user?.id,
    details: { etatRetour, motif, commentaire },
  });
  res.json(row);
});

// Déclaration de perte — statut jusqu'ici inaccessible via l'API malgré son existence dans
// le schéma.
affectationsRouter.post("/:id/perdu", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { datePerte, motif } = req.body as { datePerte: string; motif?: string };
  if (!datePerte) return res.status(400).json({ error: "Date de perte requise" });
  const [affectation] = await db.select().from(affectations).where(eq(affectations.id, id));
  if (!affectation) return res.status(404).json({ error: "Affectation introuvable" });
  if (affectation.statut !== "actif") return res.status(409).json({ error: "Seule une affectation active peut être déclarée perdue" });

  const [row] = await db
    .update(affectations)
    .set({ statut: "perdu", dateClotureStatut: datePerte, updatedAt: new Date().toISOString() })
    .where(eq(affectations.id, id))
    .returning();
  await logHistorique({
    typeEvenement: "declaration_perte",
    entiteType: "affectation",
    entiteId: id,
    agentId: affectation.agentId,
    equipeId: affectation.equipeId,
    articleId: affectation.articleId,
    utilisateurId: req.user?.id,
    details: { motif },
  });
  res.json(row);
});

affectationsRouter.post("/:id/reforme", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { motif, decision } = req.body as { motif: string; decision?: string };
  const [affectation] = await db.select().from(affectations).where(eq(affectations.id, id));
  if (!affectation) return res.status(404).json({ error: "Affectation introuvable" });

  const dateReforme = new Date().toISOString().slice(0, 10);
  const [row] = await db
    .update(affectations)
    .set({ statut: "reforme", dateClotureStatut: dateReforme, updatedAt: new Date().toISOString() })
    .where(eq(affectations.id, id))
    .returning();
  const [reforme] = await db
    .insert(reformes)
    .values({ articleId: affectation.articleId, affectationId: id, dateReforme, quantite: affectation.quantite, motif, decision })
    .returning();

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
