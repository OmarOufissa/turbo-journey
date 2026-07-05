import { Router } from "express";
import { db } from "../db";
import {
  articles,
  articlesReference,
  affectations,
  agents,
  equipes,
  services,
  divisions,
  equipementHierarchie,
  alertes,
  controlesPeriodiques,
  marches,
  reformes,
} from "../db/schema";
import { and, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { resolveDescendantIds, getFamilleAncestorMap } from "../services/hierarchieService";
import { computeBesoins, groupBesoinsByDivision, groupBesoinsByEquipe, groupBesoinsByAgent, type BesoinFilters } from "../services/besoinService";

export const dashboardRouter = Router();

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function inDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

interface DashboardFilters {
  divisionId?: number;
  serviceId?: number;
  equipeId?: number;
  agentId?: number;
  hierarchieAncestorId?: number;
  fournisseur?: string;
  dateDebut?: string;
  dateFin?: string;
}

function parseFilters(req: { query: Record<string, string> }): DashboardFilters {
  const q = req.query;
  return {
    divisionId: q.divisionId ? Number(q.divisionId) : undefined,
    serviceId: q.serviceId ? Number(q.serviceId) : undefined,
    equipeId: q.equipeId ? Number(q.equipeId) : undefined,
    agentId: q.agentId ? Number(q.agentId) : undefined,
    hierarchieAncestorId: q.hierarchieAncestorId ? Number(q.hierarchieAncestorId) : undefined,
    fournisseur: q.fournisseur || undefined,
    dateDebut: q.dateDebut || undefined,
    dateFin: q.dateFin || undefined,
  };
}

// Résout la portée bénéficiaire (agents/équipes concernés) d'un jeu de filtres
// division/service/équipe/agent — réutilisé partout où une agrégation doit couvrir à la
// fois les dotations individuelles (agent) et collectives (équipe). null = pas de restriction.
async function resolveBeneficiaireScope(filters: DashboardFilters): Promise<{ agentIds: number[] | null; equipeIds: number[] | null }> {
  if (!filters.divisionId && !filters.serviceId && !filters.equipeId && !filters.agentId) return { agentIds: null, equipeIds: null };

  if (filters.agentId) return { agentIds: [filters.agentId], equipeIds: [] };

  const agentConditions = [];
  if (filters.equipeId) agentConditions.push(eq(agents.equipeId, filters.equipeId));
  if (filters.serviceId) agentConditions.push(eq(agents.serviceId, filters.serviceId));
  if (filters.divisionId) agentConditions.push(eq(agents.divisionId, filters.divisionId));
  const matchingAgents = await db.select({ id: agents.id }).from(agents).where(and(...agentConditions));

  const equipeConditions = [];
  if (filters.equipeId) equipeConditions.push(eq(equipes.id, filters.equipeId));
  if (filters.serviceId) equipeConditions.push(eq(equipes.serviceId, filters.serviceId));
  if (filters.divisionId) equipeConditions.push(eq(services.divisionId, filters.divisionId));
  const matchingEquipes = await db
    .select({ id: equipes.id })
    .from(equipes)
    .innerJoin(services, eq(equipes.serviceId, services.id))
    .where(and(...equipeConditions));

  return { agentIds: matchingAgents.map((a) => a.id), equipeIds: matchingEquipes.map((e) => e.id) };
}

function scopeCondition(scope: { agentIds: number[] | null; equipeIds: number[] | null }) {
  if (scope.agentIds == null && scope.equipeIds == null) return undefined;
  const agentIds = scope.agentIds ?? [];
  const equipeIds = scope.equipeIds ?? [];
  if (agentIds.length === 0 && equipeIds.length === 0) return sql`0 = 1`; // portée vide (ex. agent isolé sans équipe) — aucune ligne ne doit correspondre
  const conds = [];
  if (agentIds.length) conds.push(inArray(affectations.agentId, agentIds));
  if (equipeIds.length) conds.push(inArray(affectations.equipeId, equipeIds));
  return or(...conds);
}

dashboardRouter.get("/kpis", async (req, res) => {
  const today = todayStr();
  const filters = parseFilters(req as any);
  const scope = await resolveBeneficiaireScope(filters);
  const scopeCond = scopeCondition(scope);

  const articleConditions = [eq(articles.actif, true)];
  if (filters.hierarchieAncestorId) {
    const allowed = await resolveDescendantIds(filters.hierarchieAncestorId);
    articleConditions.push(inArray(articlesReference.hierarchieParentId, allowed));
  }
  if (filters.fournisseur) articleConditions.push(eq(articles.fournisseur, filters.fournisseur));

  const affectationConditions = [eq(affectations.statut, "actif")];
  if (scopeCond) affectationConditions.push(scopeCond);
  if (filters.dateDebut) affectationConditions.push(gte(affectations.dateAffectation, filters.dateDebut));
  if (filters.dateFin) affectationConditions.push(lte(affectations.dateAffectation, filters.dateFin));

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
      .leftJoin(articlesReference, eq(articles.articleReferenceId, articlesReference.id))
      .where(and(...articleConditions)),
    db
      .select({ total: sql<number>`coalesce(sum(${affectations.quantite}), 0)` })
      .from(affectations)
      .where(and(...affectationConditions)),
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

dashboardRouter.get("/charts", async (req, res) => {
  const filters = parseFilters(req as any);
  const scope = await resolveBeneficiaireScope(filters);
  const scopeCond = scopeCondition(scope);
  const dotationWhere = scopeCond ? and(scopeCond) : undefined;

  const [repartitionParReferenceId, familleAncestorMap, repartitionDivision, repartitionService, evolutionDotationsRaw, evolutionAchatsRaw, coutParDivision, effectifParEquipe] =
    await Promise.all([
      db
        .select({ hierarchieParentId: articlesReference.hierarchieParentId, value: sql<number>`coalesce(sum(${affectations.quantite}), 0)` })
        .from(affectations)
        .innerJoin(articles, eq(affectations.articleId, articles.id))
        .leftJoin(articlesReference, eq(articles.articleReferenceId, articlesReference.id))
        .where(dotationWhere)
        .groupBy(articlesReference.hierarchieParentId),
      getFamilleAncestorMap(),
      db
        .select({ label: divisions.nom, value: sql<number>`count(distinct ${agents.id})` })
        .from(agents)
        .innerJoin(divisions, eq(agents.divisionId, divisions.id))
        .where(filters.divisionId ? eq(divisions.id, filters.divisionId) : undefined)
        .groupBy(divisions.nom),
      db
        .select({ label: services.nom, value: sql<number>`count(distinct ${agents.id})` })
        .from(agents)
        .innerJoin(services, eq(agents.serviceId, services.id))
        .where(filters.serviceId ? eq(services.id, filters.serviceId) : filters.divisionId ? eq(services.divisionId, filters.divisionId) : undefined)
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
        .where(and(sql`${affectations.dateAffectation} is not null`, dotationWhere))
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
        .where(filters.divisionId ? eq(divisions.id, filters.divisionId) : undefined)
        .groupBy(divisions.nom),
      db
        .select({
          equipe: equipes.nom,
          teamType: equipes.teamType,
          effectif: sql<number>`count(distinct ${agents.id})`,
        })
        .from(equipes)
        .leftJoin(agents, eq(agents.equipeId, equipes.id))
        .where(and(sql`${equipes.teamType} is not null`, filters.equipeId ? eq(equipes.id, filters.equipeId) : undefined))
        .groupBy(equipes.id, equipes.nom, equipes.teamType),
    ]);

  // Regroupe par famille (niveau 2 de equipement_hierarchie) même quand l'article
  // est classé plus finement (sous-famille/type) — id de la famille comme clé de tri
  // pour retrouver l'ordre naturel de l'arborescence (DFS à l'insertion).
  const familleTotals = new Map<number, { label: string; value: number }>();
  for (const row of repartitionParReferenceId) {
    if (!row.hierarchieParentId) continue;
    const famille = familleAncestorMap.get(row.hierarchieParentId);
    if (!famille) continue;
    const entry = familleTotals.get(famille.id) ?? { label: famille.nom, value: 0 };
    entry.value += row.value;
    familleTotals.set(famille.id, entry);
  }
  const repartitionFamille = [...familleTotals.entries()].sort(([a], [b]) => a - b).map(([, v]) => v);

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
// extincteurs/LCI, appareils sous pression, perches isolantes) — le flag
// soumisControleReglementaire est dénormalisé sur chaque nœud de
// equipement_hierarchie (y compris tous les descendants), chaque unité
// physique est une affectation (voir docs/erd.md), son contrôle périodique
// via controlesPeriodiques.affectationId.
dashboardRouter.get("/reglementaire", async (_req, res) => {
  const today = todayStr();
  const in30 = inDays(30);

  // Familles (niveau 2) marquées règlementaires — chacune peut désormais
  // recouvrir plusieurs sous-familles/types (ex. Perches isolantes) ou, pour
  // Appareils de levage / Appareils sous pression, plusieurs familles
  // distinctes héritant du flag posé sur leur catégorie générale.
  const reglFamilles = await db
    .select({ id: equipementHierarchie.id, nom: equipementHierarchie.nom })
    .from(equipementHierarchie)
    .where(and(eq(equipementHierarchie.niveau, 2), eq(equipementHierarchie.soumisControleReglementaire, true)))
    .orderBy(equipementHierarchie.id);

  const parFamille = await Promise.all(
    reglFamilles.map(async (f) => {
      const allowed = await resolveDescendantIds(f.id);
      const hierarchieMatch = inArray(articlesReference.hierarchieParentId, allowed);

      const [uniteAgg] = await db
        .select({ nbUnites: sql<number>`count(*)` })
        .from(affectations)
        .innerJoin(articles, eq(affectations.articleId, articles.id))
        .leftJoin(articlesReference, eq(articles.articleReferenceId, articlesReference.id))
        .where(and(eq(affectations.statut, "actif"), hierarchieMatch));

      const [controleAgg] = await db
        .select({
          enRetard: sql<number>`sum(case when ${controlesPeriodiques.statut} = 'en_retard' or (${controlesPeriodiques.statut} = 'planifie' and ${controlesPeriodiques.datePlanifiee} < ${today}) then 1 else 0 end)`,
          aVenir: sql<number>`sum(case when ${controlesPeriodiques.statut} = 'planifie' and ${controlesPeriodiques.datePlanifiee} >= ${today} and ${controlesPeriodiques.datePlanifiee} <= ${in30} then 1 else 0 end)`,
        })
        .from(controlesPeriodiques)
        .innerJoin(affectations, eq(controlesPeriodiques.affectationId, affectations.id))
        .innerJoin(articles, eq(affectations.articleId, articles.id))
        .leftJoin(articlesReference, eq(articles.articleReferenceId, articlesReference.id))
        .where(hierarchieMatch);

      const [sansControleAgg] = await db
        .select({ n: sql<number>`count(*)` })
        .from(affectations)
        .innerJoin(articles, eq(affectations.articleId, articles.id))
        .leftJoin(articlesReference, eq(articles.articleReferenceId, articlesReference.id))
        .leftJoin(controlesPeriodiques, eq(controlesPeriodiques.affectationId, affectations.id))
        .where(and(eq(affectations.statut, "actif"), hierarchieMatch, sql`${controlesPeriodiques.id} is null`));

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

  // Le flag étant dénormalisé sur chaque nœud, un simple filtre sur
  // equipementHierarchie.soumisControleReglementaire couvre directement tous
  // les articles règlementaires, sans recalcul de descendants ni jointure "OR".
  const echeanceSelect = {
    controleId: controlesPeriodiques.id,
    hierarchieParentId: articlesReference.hierarchieParentId,
    designation: articles.designation,
    lieuEmplacement: affectations.lieuEmplacement,
    numeroSerie: affectations.numeroSerie,
    type: controlesPeriodiques.type,
    datePlanifiee: controlesPeriodiques.datePlanifiee,
    statut: controlesPeriodiques.statut,
  };

  const [expiresRaw, aVenirRaw, familleAncestorMap] = await Promise.all([
    db
      .select(echeanceSelect)
      .from(controlesPeriodiques)
      .innerJoin(affectations, eq(controlesPeriodiques.affectationId, affectations.id))
      .innerJoin(articles, eq(affectations.articleId, articles.id))
      .innerJoin(articlesReference, eq(articles.articleReferenceId, articlesReference.id))
      .innerJoin(equipementHierarchie, eq(articlesReference.hierarchieParentId, equipementHierarchie.id))
      .where(
        and(
          eq(equipementHierarchie.soumisControleReglementaire, true),
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
      .innerJoin(articlesReference, eq(articles.articleReferenceId, articlesReference.id))
      .innerJoin(equipementHierarchie, eq(articlesReference.hierarchieParentId, equipementHierarchie.id))
      .where(
        and(
          eq(equipementHierarchie.soumisControleReglementaire, true),
          eq(controlesPeriodiques.statut, "planifie"),
          gte(controlesPeriodiques.datePlanifiee, today),
          lte(controlesPeriodiques.datePlanifiee, in30),
        ),
      )
      .orderBy(controlesPeriodiques.datePlanifiee)
      .limit(20),
    getFamilleAncestorMap(),
  ]);

  const withFamilleNom = <T extends { hierarchieParentId: number | null }>(rows: T[]) =>
    rows.map(({ hierarchieParentId, ...rest }) => ({
      ...rest,
      familleNom: hierarchieParentId ? (familleAncestorMap.get(hierarchieParentId)?.nom ?? null) : null,
    }));

  res.json({ parFamille, expires: withFamilleNom(expiresRaw), aVenir: withFamilleNom(aVenirRaw) });
});

// Moteur besoin (gabarit type via kit_templates) vs. doté (affectations actives) — section
// 14 du cahier des charges : besoins par division/équipe/agent, en un seul appel groupé sur
// les trois niveaux pour permettre le drill-down côté client.
dashboardRouter.get("/besoins", async (req, res) => {
  const filters = parseFilters(req as any) as BesoinFilters;
  const lines = await computeBesoins(filters);
  res.json({
    parDivision: groupBesoinsByDivision(lines),
    parEquipe: groupBesoinsByEquipe(lines),
    parAgent: groupBesoinsByAgent(lines),
  });
});

// Répartition des articles par statut d'usabilité — expiré / arrivant à expiration / durée
// de vie atteinte / réformé / disponible / indisponible (section 14).
dashboardRouter.get("/articles-statut", async (req, res) => {
  const filters = parseFilters(req as any);
  const today = todayStr();
  const in30 = inDays(30);

  const conditions = [eq(articles.actif, true)];
  if (filters.hierarchieAncestorId) {
    const allowed = await resolveDescendantIds(filters.hierarchieAncestorId);
    conditions.push(inArray(articlesReference.hierarchieParentId, allowed));
  }
  if (filters.fournisseur) conditions.push(eq(articles.fournisseur, filters.fournisseur));

  const [[expireAgg], [reformesAgg]] = await Promise.all([
    db
      .select({
        expires: sql<number>`sum(case when ${articles.dateLimiteUtilisation} is not null and ${articles.dateLimiteUtilisation} < ${today} then 1 else 0 end)`,
        aEcheance: sql<number>`sum(case when ${articles.dateLimiteUtilisation} is not null and ${articles.dateLimiteUtilisation} >= ${today} and ${articles.dateLimiteUtilisation} <= ${in30} then 1 else 0 end)`,
        dureeVieAtteinte: sql<number>`sum(case when ${articles.dateFabrication} is not null and ${articles.dureeVieMois} is not null and date(${articles.dateFabrication}, '+' || ${articles.dureeVieMois} || ' months') < ${today} then 1 else 0 end)`,
        disponibles: sql<number>`sum(case when ${articles.stockDisponible} > 0 then 1 else 0 end)`,
        indisponibles: sql<number>`sum(case when ${articles.stockDisponible} = 0 then 1 else 0 end)`,
      })
      .from(articles)
      .leftJoin(articlesReference, eq(articles.articleReferenceId, articlesReference.id))
      .where(and(...conditions)),
    db.select({ n: sql<number>`count(*)` }).from(reformes),
  ]);

  res.json({
    expires: expireAgg.expires ?? 0,
    arrivantAEcheance: expireAgg.aEcheance ?? 0,
    dureeVieAtteinte: expireAgg.dureeVieAtteinte ?? 0,
    reformes: reformesAgg.n ?? 0,
    disponibles: expireAgg.disponibles ?? 0,
    indisponibles: expireAgg.indisponibles ?? 0,
  });
});
