import { Router } from "express";
import { db } from "../db";
import {
  articles,
  affectations,
  agents,
  equipes,
  services,
  divisions,
  familles,
  alertes,
  controlesPeriodiques,
  marches,
} from "../db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";

export const dashboardRouter = Router();

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function inDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

dashboardRouter.get("/kpis", async (_req, res) => {
  const today = todayStr();

  const [[articleAgg], [distribueAgg], [beneficiairesAgg], [equipesAgg], [alertesAgg], [controlesAgg], [renouvellerAgg]] = await Promise.all([
    db
      .select({
        totalReferences: sql<number>`count(*)`,
        stockDisponible: sql<number>`coalesce(sum(${articles.stockDisponible}), 0)`,
        stockReserve: sql<number>`coalesce(sum(${articles.stockReserve}), 0)`,
        stockCommande: sql<number>`coalesce(sum(${articles.stockCommande}), 0)`,
        rupture: sql<number>`sum(case when ${articles.stockDisponible} = 0 then 1 else 0 end)`,
        faible: sql<number>`sum(case when ${articles.stockDisponible} > 0 and ${articles.stockDisponible} <= ${articles.stockMin} then 1 else 0 end)`,
        valeur: sql<number>`coalesce(sum(${articles.stockDisponible} * ${articles.prixUnitaire}), 0)`,
      })
      .from(articles)
      .where(eq(articles.actif, true)),
    db
      .select({ total: sql<number>`coalesce(sum(${affectations.quantite}), 0)` })
      .from(affectations)
      .where(eq(affectations.statut, "actif")),
    db.select({ total: sql<number>`count(*)` }).from(agents).where(eq(agents.statut, "actif")),
    db.select({ total: sql<number>`count(*)` }).from(equipes),
    db.select({ total: sql<number>`count(*)` }).from(alertes).where(eq(alertes.lue, false)),
    db
      .select({ total: sql<number>`count(*)` })
      .from(controlesPeriodiques)
      .where(sql`${controlesPeriodiques.statut} = 'en_retard' or (${controlesPeriodiques.statut} = 'planifie' and ${controlesPeriodiques.datePlanifiee} < ${today})`),
    db
      .select({ total: sql<number>`count(*)` })
      .from(controlesPeriodiques)
      .where(and(eq(controlesPeriodiques.statut, "planifie"), gte(controlesPeriodiques.datePlanifiee, today), lte(controlesPeriodiques.datePlanifiee, inDays(60)))),
  ]);

  res.json({
    totalArticles: articleAgg.stockDisponible + distribueAgg.total,
    totalReferences: articleAgg.totalReferences,
    stockDisponible: articleAgg.stockDisponible,
    stockReserve: articleAgg.stockReserve,
    stockDistribue: distribueAgg.total,
    articlesRupture: articleAgg.rupture,
    articlesStockFaible: articleAgg.faible,
    articlesARenouveler: renouvellerAgg.total,
    totalBeneficiaires: beneficiairesAgg.total,
    totalEquipes: equipesAgg.total,
    alertesNonLues: alertesAgg.total,
    controlesEnRetard: controlesAgg.total,
    valeurStockDisponible: Number(articleAgg.valeur ?? 0),
  });
});

dashboardRouter.get("/charts", async (_req, res) => {
  const [repartitionFamille, repartitionDivision, repartitionService, evolutionDotationsRaw, evolutionAchatsRaw, coutParDivision, effectifParEquipe] =
    await Promise.all([
      db
        .select({ label: familles.nom, value: sql<number>`coalesce(sum(${affectations.quantite}), 0)` })
        .from(affectations)
        .innerJoin(articles, eq(affectations.articleId, articles.id))
        .innerJoin(familles, eq(articles.familleId, familles.id))
        .groupBy(familles.nom, familles.ordre)
        .orderBy(familles.ordre),
      db
        .select({ label: divisions.nom, value: sql<number>`count(distinct ${agents.id})` })
        .from(agents)
        .innerJoin(divisions, eq(agents.divisionId, divisions.id))
        .groupBy(divisions.nom),
      db
        .select({ label: services.nom, value: sql<number>`count(distinct ${agents.id})` })
        .from(agents)
        .innerJoin(services, eq(agents.serviceId, services.id))
        .groupBy(services.nom)
        .orderBy(sql`count(distinct ${agents.id}) desc`)
        .limit(12),
      db
        .select({
          mois: sql<string>`strftime('%Y-%m', ${affectations.dateAffectation})`,
          beneficiaireType: affectations.beneficiaireType,
          total: sql<number>`sum(${affectations.quantite})`,
        })
        .from(affectations)
        .where(sql`${affectations.dateAffectation} is not null`)
        .groupBy(sql`strftime('%Y-%m', ${affectations.dateAffectation})`, affectations.beneficiaireType)
        .orderBy(sql`strftime('%Y-%m', ${affectations.dateAffectation})`),
      db
        .select({ mois: sql<string>`strftime('%Y-%m', ${marches.dateNotification})`, montant: sql<number>`sum(${marches.montant})` })
        .from(marches)
        .groupBy(sql`strftime('%Y-%m', ${marches.dateNotification})`)
        .orderBy(sql`strftime('%Y-%m', ${marches.dateNotification})`),
      db
        .select({ label: divisions.nom, value: sql<number>`coalesce(sum(${affectations.quantite} * ${articles.prixUnitaire}), 0)` })
        .from(affectations)
        .innerJoin(articles, eq(affectations.articleId, articles.id))
        .innerJoin(agents, eq(affectations.agentId, agents.id))
        .innerJoin(divisions, eq(agents.divisionId, divisions.id))
        .groupBy(divisions.nom),
      db
        .select({
          equipe: equipes.nom,
          teamType: equipes.teamType,
          effectif: sql<number>`count(distinct ${agents.id})`,
        })
        .from(equipes)
        .leftJoin(agents, eq(agents.equipeId, equipes.id))
        .where(sql`${equipes.teamType} is not null`)
        .groupBy(equipes.id, equipes.nom, equipes.teamType),
    ]);

  const moisSet = new Set<string>();
  const dotationsByMois = new Map<string, { epi: number; epc: number }>();
  for (const row of evolutionDotationsRaw) {
    moisSet.add(row.mois);
    const entry = dotationsByMois.get(row.mois) ?? { epi: 0, epc: 0 };
    if (row.beneficiaireType === "agent") entry.epi += row.total;
    else entry.epc += row.total;
    dotationsByMois.set(row.mois, entry);
  }
  const evolutionDotations = [...moisSet].sort().map((mois) => ({ mois, ...dotationsByMois.get(mois)! }));
  const evolutionAchats = evolutionAchatsRaw.map((r) => ({ mois: r.mois, montant: Number(r.montant) }));

  const EFFECTIF_THEORIQUE = 7;
  const tauxCouverture = effectifParEquipe
    .map((e) => ({ equipe: e.equipe, taux: Math.round((e.effectif / EFFECTIF_THEORIQUE) * 100) }))
    .sort((a, b) => a.taux - b.taux);

  res.json({
    repartitionFamille,
    repartitionDivision,
    repartitionService,
    evolutionDotations,
    evolutionAchats,
    coutParDivision: coutParDivision.map((c) => ({ label: c.label, value: Number(c.value) })),
    tauxCouverture,
  });
});

// Suivi des équipements soumis à contrôle règlementaire (appareils de levage,
// extincteurs/LCI, appareils sous pression, perches isolantes) — chaque
// famille flagge soumisControleReglementaire, chaque unité physique est une
// affectation (voir docs/erd.md), son contrôle périodique via controlesPeriodiques.affectationId.
dashboardRouter.get("/reglementaire", async (_req, res) => {
  const today = todayStr();
  const in30 = inDays(30);

  const reglFamilles = await db
    .select({ id: familles.id, nom: familles.nom })
    .from(familles)
    .where(eq(familles.soumisControleReglementaire, true))
    .orderBy(familles.ordre);

  const parFamille = await Promise.all(
    reglFamilles.map(async (f) => {
      const familleMatch = sql`(${articles.familleId} = ${f.id} or ${articles.familleSecondaireId} = ${f.id})`;

      const [uniteAgg] = await db
        .select({ nbUnites: sql<number>`count(*)` })
        .from(affectations)
        .innerJoin(articles, eq(affectations.articleId, articles.id))
        .where(and(eq(affectations.statut, "actif"), familleMatch));

      const [controleAgg] = await db
        .select({
          enRetard: sql<number>`sum(case when ${controlesPeriodiques.statut} = 'en_retard' or (${controlesPeriodiques.statut} = 'planifie' and ${controlesPeriodiques.datePlanifiee} < ${today}) then 1 else 0 end)`,
          aVenir: sql<number>`sum(case when ${controlesPeriodiques.statut} = 'planifie' and ${controlesPeriodiques.datePlanifiee} >= ${today} and ${controlesPeriodiques.datePlanifiee} <= ${in30} then 1 else 0 end)`,
        })
        .from(controlesPeriodiques)
        .innerJoin(affectations, eq(controlesPeriodiques.affectationId, affectations.id))
        .innerJoin(articles, eq(affectations.articleId, articles.id))
        .where(familleMatch);

      const [sansControleAgg] = await db
        .select({ n: sql<number>`count(*)` })
        .from(affectations)
        .innerJoin(articles, eq(affectations.articleId, articles.id))
        .leftJoin(controlesPeriodiques, eq(controlesPeriodiques.affectationId, affectations.id))
        .where(and(eq(affectations.statut, "actif"), familleMatch, sql`${controlesPeriodiques.id} is null`));

      return {
        familleId: f.id,
        familleNom: f.nom,
        nbUnites: uniteAgg.nbUnites,
        nbControlesEnRetard: controleAgg.enRetard ?? 0,
        nbControlesAVenir30j: controleAgg.aVenir ?? 0,
        nbSansControlePlanifie: sansControleAgg.n,
      };
    }),
  );

  const echeanceSelect = {
    controleId: controlesPeriodiques.id,
    familleNom: familles.nom,
    designation: articles.designation,
    lieuEmplacement: affectations.lieuEmplacement,
    numeroSerie: affectations.numeroSerie,
    type: controlesPeriodiques.type,
    datePlanifiee: controlesPeriodiques.datePlanifiee,
    statut: controlesPeriodiques.statut,
  };

  const [expires, aVenir] = await Promise.all([
    db
      .select(echeanceSelect)
      .from(controlesPeriodiques)
      .innerJoin(affectations, eq(controlesPeriodiques.affectationId, affectations.id))
      .innerJoin(articles, eq(affectations.articleId, articles.id))
      .innerJoin(familles, eq(articles.familleId, familles.id))
      .where(
        and(
          eq(familles.soumisControleReglementaire, true),
          sql`${controlesPeriodiques.statut} = 'en_retard' or (${controlesPeriodiques.statut} = 'planifie' and ${controlesPeriodiques.datePlanifiee} < ${today})`,
        ),
      )
      .orderBy(controlesPeriodiques.datePlanifiee)
      .limit(20),
    db
      .select(echeanceSelect)
      .from(controlesPeriodiques)
      .innerJoin(affectations, eq(controlesPeriodiques.affectationId, affectations.id))
      .innerJoin(articles, eq(affectations.articleId, articles.id))
      .innerJoin(familles, eq(articles.familleId, familles.id))
      .where(
        and(
          eq(familles.soumisControleReglementaire, true),
          eq(controlesPeriodiques.statut, "planifie"),
          gte(controlesPeriodiques.datePlanifiee, today),
          lte(controlesPeriodiques.datePlanifiee, in30),
        ),
      )
      .orderBy(controlesPeriodiques.datePlanifiee)
      .limit(20),
  ]);

  res.json({ parFamille, expires, aVenir });
});
