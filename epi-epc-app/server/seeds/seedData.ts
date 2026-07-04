/**
 * Chargement des données réelles DTC : organigramme (4 divisions, 9 services,
 * 58 équipes), 311 agents nominatifs, catalogue de 119 articles EPI/EPC, et
 * gabarits de dotation standard par type d'équipe, extraits des fichiers
 * Dotation_EPI_EPC_DTC.xlsx et Affectation_Nominative_DTC.xlsx fournis par la
 * Direction.
 *
 * Principe : seules les données effectivement présentes dans les fichiers
 * sources sont chargées. Tout ce qui n'y figure pas (prix unitaires, dates de
 * fabrication/limite d'utilisation/garantie, tailles/pointures individuelles,
 * marchés, niveaux de stock, contrôles périodiques planifiés…) est laissé
 * vide plutôt qu'estimé — à compléter dans l'application au fur et à mesure
 * que ces informations réelles sont disponibles.
 *
 * Cette fonction est appelée à la fois par le script CLI de développement
 * (`pnpm db:seed`, qui réinitialise les tables au préalable) et par le
 * démarrage automatique de l'application (uniquement si la base est vide —
 * voir server/db/bootstrap.ts), afin qu'un utilisateur final n'ait jamais à
 * exécuter de commande pour obtenir des données de départ.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { db } from "../db";
import * as s from "../db/schema";
import { HIERARCHIE_TREE, type HierarchieNodeDef } from "./hierarchie";

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
  // Chemin complet dans equipement_hierarchie, de la catégorie générale (racine)
  // jusqu'au nœud le plus précis auquel appartient l'article (voir seeds/hierarchie.ts).
  hierarchie_path: string[];
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

// Insère récursivement HIERARCHIE_TREE dans equipement_hierarchie, en propageant
// le flag soumisControleReglementaire d'un nœud à tous ses descendants (dénormalisé
// à l'insertion pour éviter toute requête récursive lors de la lecture), et retourne
// une table de correspondance "Cat > Famille > …" (chemin complet) -> id inséré.
export async function seedHierarchie(): Promise<Map<string, number>> {
  const idByPath = new Map<string, number>();

  async function insertLevel(
    nodes: HierarchieNodeDef[],
    parentId: number | null,
    parentPath: string[],
    parentReglementaire: boolean,
    niveau: number,
  ) {
    for (const [i, node] of nodes.entries()) {
      const nodePath = [...parentPath, node.nom];
      const reglementaire = parentReglementaire || node.reglementaire === true;
      const code = slugify(nodePath.join(" "));
      const [row] = await db
        .insert(s.equipementHierarchie)
        .values({ parentId, code, nom: node.nom, niveau, ordre: i, soumisControleReglementaire: reglementaire })
        .returning({ id: s.equipementHierarchie.id });
      idByPath.set(nodePath.join("||"), row.id);
      if (node.enfants?.length) {
        await insertLevel(node.enfants, row.id, nodePath, reglementaire, niveau + 1);
      }
    }
  }

  await insertLevel(HIERARCHIE_TREE, null, [], false, 1);
  return idByPath;
}

export async function seedDatabase() {
  // -------------------------------------------------------------------------
  // 1. Référentiel de classification (equipement_hierarchie) / Articles
  // -------------------------------------------------------------------------
  console.log("→ Référentiel de classification des équipements…");
  const hierarchieIdByPath = await seedHierarchie();
  console.log(`  ${hierarchieIdByPath.size} nœuds de classification insérés`);

  console.log("→ Catalogue articles…");
  const articlesFixture = loadJSON<ArticleFixture[]>("articles.json");

  // Champs volontairement absents (non fournis par les fichiers sources) :
  // prixUnitaire, marcheId, fournisseur, dateFabrication, dureeVieMois,
  // dateLimiteUtilisation, garantieMois, stockMin/Max/Disponible/Reserve/Commande
  // (tous restent à leurs valeurs par défaut — null ou 0 — jusqu'à saisie réelle).
  const articleCodeToId = new Map<string, number>();
  const articleRows = articlesFixture.map((a) => {
    const hierarchieId = hierarchieIdByPath.get(a.hierarchie_path.join("||"));
    if (!hierarchieId) throw new Error(`Nœud de hiérarchie introuvable pour l'article ${a.code} : ${a.hierarchie_path.join(" > ")}`);
    return {
      codeArticle: a.code,
      hierarchieId,
      designation: a.designation,
      aTaille: a.a_taille,
      aPointure: a.a_pointure,
      unite: "pièce",
    };
  });
  const insertedArticles = await chunkedInsert(s.articles, articleRows as any);
  articlesFixture.forEach((a, i) => articleCodeToId.set(a.code, insertedArticles[i].id));
  console.log(`  ${insertedArticles.length} articles insérés (catalogue réel — aucune donnée de prix/stock estimée)`);

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

  // Champs volontairement absents (non fournis par les fichiers sources) :
  // photoUrl, telephone, email, dateEmbauche.
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
  // Ces lignes reflètent un fait réel documenté dans Dotation_EPI_EPC_DTC.xlsx
  // (« cet agent/cette équipe reçoit ces articles selon le gabarit standard de
  // son type d'équipe/poste »). En revanche, la DATE réelle de remise n'est
  // pas documentée dans les fichiers sources : le champ reste donc vide
  // (dateAffectation = null) plutôt que d'inventer une date. De même, aucune
  // taille/pointure individuelle n'étant fournie, ces champs restent vides
  // même pour les articles gérés par taille/pointure.
  console.log("→ Génération des affectations à partir des gabarits…");
  const affectationRows: any[] = [];

  for (const a of agentsFixture) {
    const agentId = agentIdByMatricule.get(a.matricule)!;
    for (const kitKey of a.kit_keys) {
      const lines = kitTemplateLinesByKey.get(kitKey) ?? [];
      const kitTemplateId = kitTemplateIdByKey.get(kitKey);
      for (const line of lines) {
        affectationRows.push({
          articleId: line.articleId,
          beneficiaireType: "agent",
          agentId,
          quantite: line.qty,
          taille: null,
          pointure: null,
          dateAffectation: null,
          motif: "Dotation initiale — reprise du gabarit standard (date réelle non renseignée dans les fichiers sources)",
          statut: "actif",
          kitTemplateId,
        });
      }
    }
  }

  for (const [eqName, teamType] of equipeTeamTypeByName) {
    const equipeId = equipeIdByName.get(eqName)!;
    const lines = kitTemplateLinesByKey.get(`epc_${teamType}`) ?? [];
    const kitTemplateId = kitTemplateIdByKey.get(`epc_${teamType}`);
    for (const line of lines) {
      affectationRows.push({
        articleId: line.articleId,
        beneficiaireType: "equipe",
        equipeId,
        quantite: line.qty,
        dateAffectation: null,
        motif: "Dotation collective — reprise du gabarit standard (date réelle non renseignée dans les fichiers sources)",
        statut: "actif",
        kitTemplateId,
      });
    }
  }

  const insertedAffectations = await chunkedInsert(s.affectations, affectationRows);
  console.log(`  ${insertedAffectations.length} affectations générées (dates et tailles/pointures laissées vides — non fournies par les sources)`);

  // -------------------------------------------------------------------------
  // 6. Compte applicatif — un seul utilisateur, pas de gestion multi-comptes
  // -------------------------------------------------------------------------
  console.log("→ Compte utilisateur…");
  const passwordHash = await bcrypt.hash("Admin@2026", 10);
  await db.insert(s.users).values({ username: "admin", nom: "GEPI", passwordHash });
  console.log("  1 compte créé (voir README pour l'identifiant de démonstration — changez le mot de passe avant mise en service)");

  // -------------------------------------------------------------------------
  // 7. Historique — entrée d'initialisation
  // -------------------------------------------------------------------------
  await db.insert(s.historique).values({
    typeEvenement: "initialisation_base",
    entiteType: "systeme",
    details: {
      agents: insertedAgents.length,
      articles: insertedArticles.length,
      affectations: insertedAffectations.length,
      equipes: equipeIdByName.size,
      note: "Stock, prix, marchés et contrôles périodiques non repris (absents des fichiers sources) — à saisir réellement dans l'application.",
    },
  });

  console.log("\n✔ Chargement des données terminé.");
  console.log(`  Divisions: ${divisionIdByName.size + 1} · Services: ${serviceIdByName.size + 3} · Équipes: ${equipeIdByName.size}`);
  console.log(`  Agents: ${insertedAgents.length} · Articles: ${insertedArticles.length} · Affectations: ${insertedAffectations.length}`);
  console.log(`  Gabarits: ${kitTemplateIdByKey.size}`);
  console.log("\n⚠ Aucune donnée de stock, prix, marché ou contrôle périodique n'a été chargée :");
  console.log("  ces informations ne figuraient pas dans les fichiers sources. Saisissez les valeurs");
  console.log("  réelles dans l'application (fiches articles, marchés, contrôles) avant mise en service.");
}
