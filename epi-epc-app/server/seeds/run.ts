/**
 * Seed de la base de données avec les données réelles DTC :
 * organigramme (4 divisions, 9 services, 58 équipes), 311 agents nominatifs,
 * catalogue de ~126 articles EPI/EPC, et gabarits de dotation standard par
 * type d'équipe, extraits des fichiers Dotation_EPI_EPC_DTC.xlsx et
 * Affectation_Nominative_DTC.xlsx fournis par la Direction.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db, pool } from "../db";
import * as s from "../db/schema";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");

function loadJSON<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), "utf-8")) as T;
}

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------
interface ArticleFixture {
  designation: string;
  categorie: string;
  sous_famille: string;
  a_taille: boolean;
  a_pointure: boolean;
  unite_gestion: string;
  code: string;
}
interface KitTemplateFixture {
  label: string;
  lines: { article_code: string; qty: number }[];
}
interface AgentFixture {
  matricule: string;
  nom_prenom: string;
  division: string;
  service: string | null;
  equipe: string | null;
  role: string;
  fonction_rh: string | null;
  kit_keys: string[];
  note?: string;
}
type OrgTree = { divisions: Record<string, Record<string, Record<string, string | null>>> };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function slugify(str: string) {
  return str
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// PRNG déterministe (mulberry32) pour des données de démo reproductibles
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260702);

const TODAY = new Date("2026-07-02T09:00:00Z");
function daysAgo(n: number) {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - n);
  return d;
}
function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function chunkedInsert<T extends Record<string, unknown>>(
  table: any,
  rows: T[],
  chunkSize = 500,
): Promise<{ id: number }[]> {
  const out: { id: number }[] = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    if (chunk.length === 0) continue;
    const inserted = await db.insert(table).values(chunk).returning({ id: table.id });
    out.push(...inserted);
  }
  return out;
}

async function main() {
  console.log("→ Réinitialisation des tables…");
  await db.execute(sql`TRUNCATE TABLE
    historique, alertes, documents, reformes, controles_periodiques, reparations,
    affectations, stock_mouvements, kit_template_lignes, kit_templates,
    articles, sous_familles, familles, marches, users, agents, equipes, services, divisions
    RESTART IDENTITY CASCADE`);

  // -------------------------------------------------------------------------
  // 1. Familles / Sous-familles / Marchés / Articles
  // -------------------------------------------------------------------------
  console.log("→ Catalogue articles…");
  const articlesFixture = loadJSON<ArticleFixture[]>("articles.json");

  const FAMILLE_ORDER = [
    "EPI",
    "EPC",
    "Vêtement de travail",
    "Chaussure de sécurité",
    "Matériel de consignation",
    "Matériel isolant",
    "Matériel de lutte contre l'incendie",
    "Autre",
  ];
  const familleIdByName = new Map<string, number>();
  for (const [i, nom] of FAMILLE_ORDER.entries()) {
    const [row] = await db.insert(s.familles).values({ nom, ordre: i }).returning({ id: s.familles.id });
    familleIdByName.set(nom, row.id);
  }

  const sousFamillePairs = new Map<string, string>(); // "famille||sousfamille" -> famille
  for (const a of articlesFixture) sousFamillePairs.set(`${a.categorie}||${a.sous_famille}`, a.categorie);
  const sousFamilleIdByKey = new Map<string, number>();
  for (const [key, famille] of sousFamillePairs) {
    const nom = key.split("||")[1];
    const [row] = await db
      .insert(s.sousFamilles)
      .values({ nom, familleId: familleIdByName.get(famille)! })
      .returning({ id: s.sousFamilles.id });
    sousFamilleIdByKey.set(key, row.id);
  }

  const MARCHES = [
    { numero: "12/DTC/2023", annee: 2023, objet: "Acquisition EPI — casques, gants, chaussures de sécurité", fournisseur: "SECURIMA SARL", montant: "845000.00", dateNotification: "2023-03-14", dateLivraison: "2023-07-20", statut: "solde" },
    { numero: "07/DTC/2024", annee: 2024, objet: "Acquisition matériel de consignation et cadenassage", fournisseur: "PROTEC INDUSTRIE", montant: "312500.00", dateNotification: "2024-02-05", dateLivraison: "2024-05-15", statut: "solde" },
    { numero: "21/DTC/2024", annee: 2024, objet: "Matériel isolant HT/THT — perches, gants isolants, tabourets", fournisseur: "CATU MAROC", montant: "1180000.00", dateNotification: "2024-06-18", dateLivraison: "2024-11-30", statut: "solde" },
    { numero: "05/DTC/2025", annee: 2025, objet: "Dotation vestimentaire et EPC balisage de chantier", fournisseur: "SECURIMA SARL", montant: "560000.00", dateNotification: "2025-01-22", dateLivraison: "2025-05-10", statut: "solde" },
    { numero: "18/DTC/2025", annee: 2025, objet: "Renouvellement EPI anti-chute (harnais, longes)", fournisseur: "PETZL PRO DISTRIB", montant: "410000.00", dateNotification: "2025-09-03", dateLivraison: "2026-01-15", statut: "livre" },
    { numero: "03/DTC/2026", annee: 2026, objet: "Matériel de lutte contre l'incendie — extincteurs et RIA", fournisseur: "PROTEC INDUSTRIE", montant: "275000.00", dateNotification: "2026-05-04", dateLivraison: "2026-09-30", statut: "en_cours" },
  ];
  const marcheIds: number[] = [];
  for (const m of MARCHES) {
    const [row] = await db.insert(s.marches).values(m).returning({ id: s.marches.id });
    marcheIds.push(row.id);
  }

  // Prix indicatifs par sous-famille (MAD) — les fichiers source ne contiennent pas de prix réels ;
  // ces fourchettes sont fournies à titre d'exemple pour peupler les indicateurs de coût et
  // doivent être remplacées par les prix réels des marchés (voir README).
  const PRICE_RANGES: [RegExp, [number, number]][] = [
    [/anti-chute/i, [850, 2200]],
    [/gants isolants|mise à la terre et détection/i, [900, 4500]],
    [/protection isolante diverse/i, [1200, 6000]],
    [/chaussures et bottes/i, [380, 650]],
    [/tête/i, [120, 320]],
    [/yeux|visage|respiratoire/i, [60, 180]],
    [/mains/i, [70, 200]],
    [/consignation/i, [40, 350]],
    [/balisage/i, [50, 400]],
    [/extinction|détection incendie/i, [300, 2500]],
    [/soudure/i, [150, 500]],
    [/vêtements et signalisation/i, [180, 450]],
    [/outillage/i, [60, 300]],
  ];
  function priceFor(sousFamille: string, seedIdx: number) {
    const range = PRICE_RANGES.find(([re]) => re.test(sousFamille))?.[1] ?? [100, 400];
    const span = range[1] - range[0];
    const v = range[0] + (span * ((seedIdx * 37) % 100)) / 100;
    return v.toFixed(2);
  }

  const articleCodeToId = new Map<string, number>();
  const articleRows = articlesFixture.map((a, i) => {
    const extra: Record<string, unknown> = {};
    // Quelques articles illustratifs avec durée de vie / limite d'utilisation / garantie
    // pour peupler les alertes de démonstration (à ajuster avec les fiches techniques réelles)
    if (i % 14 === 0) {
      extra.dureeVieMois = 60;
      extra.dateFabrication = fmtDate(daysAgo(1700 + (i % 400)));
      extra.dateLimiteUtilisation = fmtDate(daysAgo(-(i % 60) + 20));
    }
    if (i % 20 === 5) {
      extra.garantieMois = 24;
    }
    return {
      codeArticle: a.code,
      familleId: familleIdByName.get(a.categorie)!,
      sousFamilleId: sousFamilleIdByKey.get(`${a.categorie}||${a.sous_famille}`)!,
      designation: a.designation,
      aTaille: a.a_taille,
      aPointure: a.a_pointure,
      unite: "pièce",
      marcheId: marcheIds[i % marcheIds.length],
      fournisseur: MARCHES[i % marcheIds.length].fournisseur,
      prixUnitaire: priceFor(a.sous_famille, i),
      stockMin: 0,
      stockMax: 0,
      stockDisponible: 0,
      ...extra,
    };
  });
  const insertedArticles = await chunkedInsert(s.articles, articleRows as any);
  articlesFixture.forEach((a, i) => articleCodeToId.set(a.code, insertedArticles[i].id));
  console.log(`  ${insertedArticles.length} articles insérés`);

  const articleFlagsById = new Map<number, { aTaille: boolean; aPointure: boolean }>();
  articlesFixture.forEach((a, i) => articleFlagsById.set(insertedArticles[i].id, { aTaille: a.a_taille, aPointure: a.a_pointure }));

  // Pointure/taille propres à chaque agent (cohérentes pour tous ses articles) — non fournies
  // par les fichiers source, dérivées ici de façon déterministe pour peupler la démo.
  const TAILLES = ["S", "M", "L", "XL", "XXL"];
  function hashString(s: string) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }
  function pointureForAgent(matricule: string) {
    return String(39 + (hashString(matricule) % 8)); // 39 à 46
  }
  function tailleForAgent(matricule: string) {
    return TAILLES[hashString(matricule + "t") % TAILLES.length];
  }

  // -------------------------------------------------------------------------
  // 2. Organisation — Divisions / Services / Équipes
  // -------------------------------------------------------------------------
  console.log("→ Organigramme…");
  const orgTree = loadJSON<OrgTree>("org_tree.json");
  const serviceAppui = loadJSON<Record<string, number>>("service_appui.json");

  const divisionIdByName = new Map<string, number>();
  const serviceIdByName = new Map<string, number>();
  const equipeIdByName = new Map<string, number>();
  const equipeTeamTypeByName = new Map<string, string>();

  for (const [divName, services] of Object.entries(orgTree.divisions)) {
    const [divRow] = await db
      .insert(s.divisions)
      .values({ code: slugify(divName).toUpperCase(), nom: divName })
      .returning({ id: s.divisions.id });
    divisionIdByName.set(divName, divRow.id);

    for (const [svcName, equipes] of Object.entries(services)) {
      const [svcRow] = await db
        .insert(s.services)
        .values({ code: slugify(svcName).toUpperCase(), nom: svcName, divisionId: divRow.id })
        .returning({ id: s.services.id });
      serviceIdByName.set(svcName, svcRow.id);

      for (const [eqName, teamType] of Object.entries(equipes)) {
        const [eqRow] = await db
          .insert(s.equipes)
          .values({ code: slugify(eqName).toUpperCase(), nom: eqName, serviceId: svcRow.id, teamType })
          .returning({ id: s.equipes.id });
        equipeIdByName.set(eqName, eqRow.id);
        if (teamType) equipeTeamTypeByName.set(eqName, teamType);
      }
    }
  }

  // Direction — Services d'Appui (AGS, RH, Sécurité) : structure réelle, sans dotation EPI/EPC
  const [appuiDiv] = await db
    .insert(s.divisions)
    .values({ code: "DIRECTION-APPUI", nom: "Direction — Services d'Appui" })
    .returning({ id: s.divisions.id });
  const APPUI_LABELS: Record<string, string> = {
    service_ags: "Service Affaires Générales et Sociales",
    service_rh: "Service Ressources Humaines",
    service_securite: "Service Sécurité",
  };
  for (const [slug, count] of Object.entries(serviceAppui)) {
    const nom = APPUI_LABELS[slug] ?? slug;
    await db.insert(s.services).values({ code: slug.toUpperCase(), nom, divisionId: appuiDiv.id });
    void count; // effectif théorique (5) — postes non nominatifs dans les sources fournies
  }
  console.log(`  ${divisionIdByName.size + 1} divisions, ${serviceIdByName.size + 3} services, ${equipeIdByName.size} équipes`);

  // -------------------------------------------------------------------------
  // 3. Kit templates (gabarits de dotation standard)
  // -------------------------------------------------------------------------
  console.log("→ Gabarits de dotation standard…");
  const kitTemplatesFixture = loadJSON<Record<string, KitTemplateFixture>>("kit_templates.json");
  const kitTemplateIdByKey = new Map<string, number>();
  const kitTemplateLinesByKey = new Map<string, { articleId: number; qty: number }[]>();

  for (const [key, tpl] of Object.entries(kitTemplatesFixture)) {
    const categorie = key.startsWith("epc_") ? "EPC" : "EPI";
    const appliesToType = key.startsWith("epi_") || key.startsWith("epc_") ? "team_type" : key === "hierarchie" ? "poste" : key.startsWith("svc_") ? "service" : "poste";
    const appliesToValue = key.replace(/^epi_|^epc_/, "");
    const [row] = await db
      .insert(s.kitTemplates)
      .values({ code: key, label: tpl.label, appliesToType, appliesToValue, categorie })
      .returning({ id: s.kitTemplates.id });
    kitTemplateIdByKey.set(key, row.id);

    const lines = tpl.lines
      .filter((l) => articleCodeToId.has(l.article_code))
      .map((l) => ({ articleId: articleCodeToId.get(l.article_code)!, qty: l.qty }));
    kitTemplateLinesByKey.set(key, lines);

    if (lines.length) {
      await chunkedInsert(
        s.kitTemplateLignes,
        lines.map((l) => ({ kitTemplateId: row.id, articleId: l.articleId, quantite: l.qty })) as any,
      );
    }
  }
  console.log(`  ${kitTemplateIdByKey.size} gabarits de dotation`);

  // -------------------------------------------------------------------------
  // 4. Agents (bénéficiaires nominatifs réels)
  // -------------------------------------------------------------------------
  console.log("→ Agents…");
  const agentsFixture = loadJSON<AgentFixture[]>("agents.json");
  const agentIdByMatricule = new Map<string, number>();

  const agentRows = agentsFixture.map((a) => ({
    matricule: a.matricule,
    nom: a.nom_prenom,
    divisionId: divisionIdByName.get(a.division) ?? null,
    serviceId: a.service ? (serviceIdByName.get(a.service) ?? null) : null,
    equipeId: a.equipe ? (equipeIdByName.get(a.equipe) ?? null) : null,
    fonction: a.fonction_rh,
    poste: a.role,
    statut: "actif",
    note: a.note ?? null,
  }));
  const insertedAgents = await chunkedInsert(s.agents, agentRows as any);
  agentsFixture.forEach((a, i) => agentIdByMatricule.set(a.matricule, insertedAgents[i].id));
  console.log(`  ${insertedAgents.length} agents insérés`);

  // -------------------------------------------------------------------------
  // 5. Affectations — dotation individuelle (EPI, par agent) et collective (EPC, par équipe)
  // -------------------------------------------------------------------------
  console.log("→ Génération des affectations à partir des gabarits…");
  const distributedQty = new Map<number, number>(); // articleId -> total quantité distribuée
  const affectationRows: any[] = [];
  const VALIDATEURS = insertedAgents.length ? [insertedAgents[0].id] : [];

  function randomAffectationDate() {
    // Étale les dotations sur les ~20 derniers mois pour des graphiques d'évolution réalistes
    const dayOffset = Math.floor(rand() * 620);
    return fmtDate(daysAgo(dayOffset));
  }

  for (const a of agentsFixture) {
    const agentId = agentIdByMatricule.get(a.matricule)!;
    for (const kitKey of a.kit_keys) {
      const lines = kitTemplateLinesByKey.get(kitKey) ?? [];
      const kitTemplateId = kitTemplateIdByKey.get(kitKey);
      for (const line of lines) {
        const date = randomAffectationDate();
        const flags = articleFlagsById.get(line.articleId);
        affectationRows.push({
          articleId: line.articleId,
          beneficiaireType: "agent",
          agentId,
          quantite: line.qty,
          taille: flags?.aTaille ? tailleForAgent(a.matricule) : null,
          pointure: flags?.aPointure ? pointureForAgent(a.matricule) : null,
          dateAffectation: date,
          motif: "Dotation initiale — gabarit standard",
          validateurAgentId: VALIDATEURS[0] ?? null,
          statut: "actif",
          kitTemplateId,
        });
        distributedQty.set(line.articleId, (distributedQty.get(line.articleId) ?? 0) + line.qty);
      }
    }
  }

  for (const [eqName, teamType] of equipeTeamTypeByName) {
    const equipeId = equipeIdByName.get(eqName)!;
    const lines = kitTemplateLinesByKey.get(`epc_${teamType}`) ?? [];
    const kitTemplateId = kitTemplateIdByKey.get(`epc_${teamType}`);
    for (const line of lines) {
      const date = randomAffectationDate();
      affectationRows.push({
        articleId: line.articleId,
        beneficiaireType: "equipe",
        equipeId,
        quantite: line.qty,
        dateAffectation: date,
        motif: "Dotation collective — gabarit standard",
        validateurAgentId: VALIDATEURS[0] ?? null,
        statut: "actif",
        kitTemplateId,
      });
      distributedQty.set(line.articleId, (distributedQty.get(line.articleId) ?? 0) + line.qty);
    }
  }

  const insertedAffectations = await chunkedInsert(s.affectations, affectationRows);
  console.log(`  ${insertedAffectations.length} affectations générées`);

  // -------------------------------------------------------------------------
  // 6. Stock — mouvements (ledger) + compteurs courants sur articles
  // -------------------------------------------------------------------------
  console.log("→ Mouvements de stock…");
  const stockMouvementRows: any[] = [];
  insertedAffectations.forEach((row, i) => {
    stockMouvementRows.push({
      articleId: affectationRows[i].articleId,
      type: "sortie_affectation",
      quantite: -affectationRows[i].quantite,
      referenceType: "affectation",
      referenceId: row.id,
      motif: affectationRows[i].motif,
      dateMouvement: new Date(affectationRows[i].dateAffectation),
    });
  });

  const articleUpdates: { id: number; stockMin: number; stockMax: number; stockDisponible: number; stockReserve: number; stockCommande: number }[] = [];
  insertedArticles.forEach((row, i) => {
    const distributed = distributedQty.get(row.id) ?? 0;
    const bucket = row.id % 7;
    const stockMin = Math.max(2, Math.round(distributed * 0.1));
    const stockMax = stockMin * 3 + 15;
    let stockDisponible: number;
    if (bucket === 0) stockDisponible = 0; // rupture
    else if (bucket === 1 || bucket === 2) stockDisponible = Math.max(0, stockMin - 1 - (row.id % 2)); // stock faible
    else stockDisponible = stockMin + ((row.id * 3) % (stockMax - stockMin + 1)); // stock sain
    const stockReserve = row.id % 11 === 0 ? Math.max(1, Math.round(stockMin * 0.3)) : 0;
    const stockCommande = row.id % 9 === 0 ? Math.max(1, Math.round(stockMin * 0.5)) : 0;

    articleUpdates.push({ id: row.id, stockMin, stockMax, stockDisponible, stockReserve, stockCommande });

    const totalProvisioned = distributed + stockDisponible;
    if (totalProvisioned > 0) {
      stockMouvementRows.push({
        articleId: row.id,
        type: "entree_achat",
        quantite: totalProvisioned,
        referenceType: "marche",
        referenceId: articleRows[i].marcheId,
        motif: "Approvisionnement initial",
        dateMouvement: daysAgo(650),
      });
    }
  });

  await chunkedInsert(s.stockMouvements, stockMouvementRows);
  for (const u of articleUpdates) {
    await db
      .update(s.articles)
      .set({
        stockMin: u.stockMin,
        stockMax: u.stockMax,
        stockDisponible: u.stockDisponible,
        stockReserve: u.stockReserve,
        stockCommande: u.stockCommande,
      })
      .where(sql`${s.articles.id} = ${u.id}`);
  }
  console.log(`  ${stockMouvementRows.length} mouvements de stock, compteurs mis à jour sur ${articleUpdates.length} articles`);

  // -------------------------------------------------------------------------
  // 7. Contrôles périodiques (matériel isolant + anti-chute)
  // -------------------------------------------------------------------------
  console.log("→ Contrôles périodiques…");
  const familleByArticleId = new Map<number, string>();
  articlesFixture.forEach((a, i) => familleByArticleId.set(insertedArticles[i].id, a.categorie));
  const sousFamilleByArticleId = new Map<number, string>();
  articlesFixture.forEach((a, i) => sousFamilleByArticleId.set(insertedArticles[i].id, a.sous_famille));

  const controlCandidates = insertedAffectations.filter((_, i) => {
    const fam = familleByArticleId.get(affectationRows[i].articleId);
    const sf = sousFamilleByArticleId.get(affectationRows[i].articleId);
    return fam === "Matériel isolant" || sf === "Protection anti-chute";
  });

  const controlRows: any[] = [];
  controlCandidates.forEach((row, idx) => {
    if (idx % 18 !== 0) return; // échantillon représentatif, pas tous les milliers de lignes
    const affectation = affectationRows[insertedAffectations.indexOf(row)];
    const cycle = idx % 3;
    const type = sousFamilleByArticleId.get(affectation.articleId) === "Protection anti-chute" ? "inspection" : "essai_dielectrique";
    if (cycle === 0) {
      // en retard
      controlRows.push({
        articleId: affectation.articleId,
        affectationId: row.id,
        type,
        datePlanifiee: fmtDate(daysAgo(20 + (idx % 40))),
        statut: "en_retard",
      });
    } else if (cycle === 1) {
      // à venir
      controlRows.push({
        articleId: affectation.articleId,
        affectationId: row.id,
        type,
        datePlanifiee: fmtDate(daysAgo(-(10 + (idx % 45)))),
        statut: "planifie",
      });
    } else {
      // déjà réalisé, prochaine échéance dans ~12 mois
      const realisee = daysAgo(200 + (idx % 120));
      const prochaine = new Date(realisee);
      prochaine.setMonth(prochaine.getMonth() + 12);
      controlRows.push({
        articleId: affectation.articleId,
        affectationId: row.id,
        type,
        datePlanifiee: fmtDate(realisee),
        dateRealisee: fmtDate(realisee),
        resultat: idx % 15 === 0 ? "a_revoir" : "conforme",
        prochaineEcheance: fmtDate(prochaine),
        statut: "realise",
      });
    }
  });
  await chunkedInsert(s.controlesPeriodiques, controlRows);
  console.log(`  ${controlRows.length} contrôles périodiques`);

  // -------------------------------------------------------------------------
  // 8. Alertes dérivées de l'état courant
  // -------------------------------------------------------------------------
  console.log("→ Alertes…");
  const alerteRows: any[] = [];
  for (const u of articleUpdates) {
    const code = insertedArticles.findIndex((r) => r.id === u.id);
    const designation = articlesFixture[code]?.designation ?? `Article #${u.id}`;
    if (u.stockDisponible === 0) {
      alerteRows.push({ type: "rupture", entiteType: "article", entiteId: u.id, niveau: "critical", message: `Rupture de stock : ${designation}` });
    } else if (u.stockDisponible <= u.stockMin) {
      alerteRows.push({ type: "stock_faible", entiteType: "article", entiteId: u.id, niveau: "warning", message: `Stock faible : ${designation} (${u.stockDisponible}/${u.stockMin} seuil mini)` });
    }
  }
  for (const row of controlRows) {
    if (row.statut === "en_retard") {
      alerteRows.push({ type: "controle_a_faire", entiteType: "controle_periodique", entiteId: undefined, niveau: "critical", message: `Contrôle en retard (${row.type}) — échéance dépassée depuis le ${row.datePlanifiee}` });
    }
  }
  articlesFixture.forEach((a, i) => {
    const extra = articleRows[i] as any;
    if (extra.dateLimiteUtilisation && extra.dateLimiteUtilisation < fmtDate(TODAY)) {
      alerteRows.push({ type: "fin_de_vie", entiteType: "article", entiteId: insertedArticles[i].id, niveau: "warning", message: `Date limite d'utilisation dépassée : ${a.designation}` });
    }
  });
  for (const m of MARCHES) {
    if (m.dateLivraison > fmtDate(TODAY)) {
      alerteRows.push({ type: "livraison_attendue", entiteType: "marche", entiteId: undefined, niveau: "info", message: `Livraison attendue le ${m.dateLivraison} — Marché ${m.numero} (${m.fournisseur})` });
    }
  }
  if (alerteRows.length) await chunkedInsert(s.alertes, alerteRows);
  console.log(`  ${alerteRows.length} alertes générées`);

  // -------------------------------------------------------------------------
  // 9. Utilisateurs applicatifs
  // -------------------------------------------------------------------------
  console.log("→ Comptes utilisateurs…");
  const demoUsers = [
    { username: "admin", nom: "Administrateur GEPI", role: "administrateur", password: "Admin@2026" },
    { username: "magasinier", nom: "Gestionnaire de Stock", role: "gestionnaire_stock", password: "Stock@2026" },
    { username: "hse", nom: "Responsable HSE", role: "responsable_hse", password: "Hse@2026" },
    { username: "consultation", nom: "Consultation", role: "consultation", password: "Lecture@2026" },
  ];
  for (const u of demoUsers) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await db.insert(s.users).values({ username: u.username, nom: u.nom, role: u.role, passwordHash });
  }
  console.log(`  ${demoUsers.length} comptes créés (voir README pour les identifiants de démonstration)`);

  // -------------------------------------------------------------------------
  // 10. Historique — entrée d'initialisation
  // -------------------------------------------------------------------------
  await db.insert(s.historique).values({
    typeEvenement: "initialisation_base",
    entiteType: "systeme",
    details: {
      agents: insertedAgents.length,
      articles: insertedArticles.length,
      affectations: insertedAffectations.length,
      equipes: equipeIdByName.size,
    },
  });

  console.log("\n✔ Seed terminé avec succès.");
  console.log(`  Divisions: ${divisionIdByName.size + 1} · Services: ${serviceIdByName.size + 3} · Équipes: ${equipeIdByName.size}`);
  console.log(`  Agents: ${insertedAgents.length} · Articles: ${insertedArticles.length} · Affectations: ${insertedAffectations.length}`);
  console.log(`  Gabarits: ${kitTemplateIdByKey.size} · Contrôles: ${controlRows.length} · Alertes: ${alerteRows.length}`);
}

main()
  .catch((err) => {
    console.error("Échec du seed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
