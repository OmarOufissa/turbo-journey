import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "../db";
import { agents, equipes, services, kitTemplates, kitTemplateLignes, articlesReference, articles, affectations } from "../db/schema";
import { resolveDescendantIds } from "./hierarchieService";

export interface BesoinFilters {
  divisionId?: number;
  serviceId?: number;
  equipeId?: number;
  agentId?: number;
  hierarchieAncestorId?: number;
  fournisseur?: string;
  dateDebut?: string;
  dateFin?: string;
}

export interface BesoinLine {
  beneficiaireType: "agent" | "equipe";
  agentId?: number;
  agentNom?: string;
  equipeId?: number;
  equipeNom?: string;
  divisionId: number | null;
  articleReferenceId: number;
  referenceDesignation: string;
  quantiteBesoin: number;
  quantiteDotee: number;
  ecart: number;
  tauxSatisfaction: number;
}

/**
 * Moteur unique de calcul besoin (gabarit type applicable au poste/type d'équipe, via
 * kit_templates/kit_template_lignes — déjà alimentés par les données réelles DTC) vs. doté
 * (affectations actives) par agent/équipe et par article de référence. Réutilisé par le
 * tableau de bord et tout futur rapport — jamais recalculé ad hoc par écran.
 */
export async function computeBesoins(filters: BesoinFilters): Promise<BesoinLine[]> {
  const [allAgents, allEquipes, allServices, allTemplates, allLignes, allReferences] = await Promise.all([
    db.select().from(agents),
    db.select().from(equipes),
    db.select().from(services),
    db.select().from(kitTemplates),
    db.select().from(kitTemplateLignes),
    db.select({ id: articlesReference.id, designation: articlesReference.designation, hierarchieParentId: articlesReference.hierarchieParentId }).from(articlesReference),
  ]);

  const referenceById = new Map(allReferences.map((r) => [r.id, r]));
  const equipeById = new Map(allEquipes.map((e) => [e.id, e]));
  const serviceById = new Map(allServices.map((s) => [s.id, s]));
  const lignesByTemplate = new Map<number, typeof allLignes>();
  for (const l of allLignes) {
    if (!l.articleReferenceId) continue;
    const list = lignesByTemplate.get(l.kitTemplateId) ?? [];
    list.push(l);
    lignesByTemplate.set(l.kitTemplateId, list);
  }

  const allowedReferenceIds = filters.hierarchieAncestorId ? new Set(await resolveDescendantIds(filters.hierarchieAncestorId)) : null;

  // Doté : somme des affectations actives par bénéficiaire × article de référence.
  const doteConditions = [eq(affectations.statut, "actif")];
  if (filters.dateDebut) doteConditions.push(gte(affectations.dateAffectation, filters.dateDebut));
  if (filters.dateFin) doteConditions.push(lte(affectations.dateAffectation, filters.dateFin));
  const doteRows = await db
    .select({
      agentId: affectations.agentId,
      equipeId: affectations.equipeId,
      articleReferenceId: articles.articleReferenceId,
      fournisseur: articles.fournisseur,
      quantite: affectations.quantite,
    })
    .from(affectations)
    .innerJoin(articles, eq(affectations.articleId, articles.id))
    .where(and(...doteConditions));

  const doteByKey = new Map<string, number>();
  for (const row of doteRows) {
    if (!row.articleReferenceId) continue;
    if (filters.fournisseur && row.fournisseur !== filters.fournisseur) continue;
    const key = row.agentId ? `agent:${row.agentId}:${row.articleReferenceId}` : `equipe:${row.equipeId}:${row.articleReferenceId}`;
    doteByKey.set(key, (doteByKey.get(key) ?? 0) + row.quantite);
  }

  function matchesTemplate(tpl: (typeof allTemplates)[number], poste: string | null, teamType: string | null, serviceNom: string | null) {
    if (tpl.appliesToType === "poste") return poste === tpl.appliesToValue;
    if (tpl.appliesToType === "team_type") return teamType === tpl.appliesToValue;
    if (tpl.appliesToType === "service") return serviceNom === tpl.appliesToValue;
    return false;
  }

  const lines: BesoinLine[] = [];

  // Agents — gabarits catégorie EPI
  const epiTemplates = allTemplates.filter((t) => t.categorie === "EPI");
  for (const agent of allAgents) {
    if (filters.agentId && agent.id !== filters.agentId) continue;
    if (filters.equipeId && agent.equipeId !== filters.equipeId) continue;
    if (filters.serviceId && agent.serviceId !== filters.serviceId) continue;
    if (filters.divisionId && agent.divisionId !== filters.divisionId) continue;

    const equipe = agent.equipeId ? equipeById.get(agent.equipeId) : undefined;
    const service = agent.serviceId ? serviceById.get(agent.serviceId) : undefined;
    const besoinByReference = new Map<number, number>();
    for (const tpl of epiTemplates) {
      if (!matchesTemplate(tpl, agent.poste, equipe?.teamType ?? null, service?.nom ?? null)) continue;
      for (const ligne of lignesByTemplate.get(tpl.id) ?? []) {
        if (allowedReferenceIds && !allowedReferenceIds.has(ligne.articleReferenceId!)) continue;
        besoinByReference.set(ligne.articleReferenceId!, (besoinByReference.get(ligne.articleReferenceId!) ?? 0) + ligne.quantite);
      }
    }
    for (const [articleReferenceId, quantiteBesoin] of besoinByReference) {
      const quantiteDotee = doteByKey.get(`agent:${agent.id}:${articleReferenceId}`) ?? 0;
      lines.push({
        beneficiaireType: "agent",
        agentId: agent.id,
        agentNom: agent.nom,
        divisionId: agent.divisionId,
        articleReferenceId,
        referenceDesignation: referenceById.get(articleReferenceId)?.designation ?? "?",
        quantiteBesoin,
        quantiteDotee,
        ecart: quantiteBesoin - quantiteDotee,
        tauxSatisfaction: quantiteBesoin > 0 ? Math.min(1, quantiteDotee / quantiteBesoin) : 1,
      });
    }
  }

  // Équipes — gabarits catégorie EPC
  const epcTemplates = allTemplates.filter((t) => t.categorie === "EPC");
  for (const equipe of allEquipes) {
    if (filters.equipeId && equipe.id !== filters.equipeId) continue;
    const service = serviceById.get(equipe.serviceId);
    if (filters.serviceId && equipe.serviceId !== filters.serviceId) continue;
    if (filters.divisionId && service?.divisionId !== filters.divisionId) continue;

    const besoinByReference = new Map<number, number>();
    for (const tpl of epcTemplates) {
      if (!matchesTemplate(tpl, null, equipe.teamType, service?.nom ?? null)) continue;
      for (const ligne of lignesByTemplate.get(tpl.id) ?? []) {
        if (allowedReferenceIds && !allowedReferenceIds.has(ligne.articleReferenceId!)) continue;
        besoinByReference.set(ligne.articleReferenceId!, (besoinByReference.get(ligne.articleReferenceId!) ?? 0) + ligne.quantite);
      }
    }
    for (const [articleReferenceId, quantiteBesoin] of besoinByReference) {
      const quantiteDotee = doteByKey.get(`equipe:${equipe.id}:${articleReferenceId}`) ?? 0;
      lines.push({
        beneficiaireType: "equipe",
        equipeId: equipe.id,
        equipeNom: equipe.nom,
        divisionId: service?.divisionId ?? null,
        articleReferenceId,
        referenceDesignation: referenceById.get(articleReferenceId)?.designation ?? "?",
        quantiteBesoin,
        quantiteDotee,
        ecart: quantiteBesoin - quantiteDotee,
        tauxSatisfaction: quantiteBesoin > 0 ? Math.min(1, quantiteDotee / quantiteBesoin) : 1,
      });
    }
  }

  return lines;
}

export function groupBesoinsByDivision(lines: BesoinLine[]) {
  const byDivision = new Map<string, { divisionId: number | null; besoin: number; dote: number }>();
  for (const l of lines) {
    const key = String(l.divisionId ?? "sans-division");
    const entry = byDivision.get(key) ?? { divisionId: l.divisionId, besoin: 0, dote: 0 };
    entry.besoin += l.quantiteBesoin;
    entry.dote += l.quantiteDotee;
    byDivision.set(key, entry);
  }
  return [...byDivision.values()];
}

export function groupBesoinsByEquipe(lines: BesoinLine[]) {
  const byEquipe = new Map<number, { equipeId: number; equipeNom: string; besoin: number; dote: number }>();
  for (const l of lines) {
    if (!l.equipeId) continue;
    const entry = byEquipe.get(l.equipeId) ?? { equipeId: l.equipeId, equipeNom: l.equipeNom ?? "?", besoin: 0, dote: 0 };
    entry.besoin += l.quantiteBesoin;
    entry.dote += l.quantiteDotee;
    byEquipe.set(l.equipeId, entry);
  }
  return [...byEquipe.values()];
}

export function groupBesoinsByAgent(lines: BesoinLine[]) {
  const byAgent = new Map<number, { agentId: number; agentNom: string; besoin: number; dote: number }>();
  for (const l of lines) {
    if (!l.agentId) continue;
    const entry = byAgent.get(l.agentId) ?? { agentId: l.agentId, agentNom: l.agentNom ?? "?", besoin: 0, dote: 0 };
    entry.besoin += l.quantiteBesoin;
    entry.dote += l.quantiteDotee;
    byAgent.set(l.agentId, entry);
  }
  return [...byAgent.values()];
}
