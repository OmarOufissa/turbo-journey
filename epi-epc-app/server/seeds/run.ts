/**
 * Seed de la base de données avec les données réelles DTC :
 * organigramme (4 divisions, 9 services, 58 équipes), 311 agents nominatifs,
 * catalogue de 119 articles EPI/EPC, et gabarits de dotation standard par
 * type d'équipe, extraits des fichiers Dotation_EPI_EPC_DTC.xlsx et
 * Affectation_Nominative_DTC.xlsx fournis par la Direction.
 *
 * Principe : seules les données effectivement présentes dans les fichiers
 * sources sont chargées. Tout ce qui n'y figure pas (prix unitaires, dates de
 * fabrication/limite d'utilisation/garantie, tailles/pointures individuelles,
 * marchés, niveaux de stock, contrôles périodiques planifiés…) est laissé
 * vide plutôt qu'estimé — à compléter dans l'application au fur et à mesure
 * que ces informations réelles sont disponibles.
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
  // 1. Familles / Sous-familles / Articles
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

  // Champs volontairement absents (non fournis par les fichiers sources) :
  // prixUnitaire, marcheId, fournisseur, dateFabrication, dureeVieMois,
  // dateLimiteUtilisation, garantieMois, stockMin/Max/Disponible/Reserve/Commande
  // (tous restent à leurs valeurs par défaut — null ou 0 — jusqu'à saisie réelle).
  const articleCodeToId = new Map<string, number>();
  const articleRows = articlesFixture.map((a) => ({
    codeArticle: a.code,
    familleId: familleIdByName.get(a.categorie)!,
    sousFamilleId: sousFamilleIdByKey.get(`${a.categorie}||${a.sous_famille}`)!,
    designation: a.designation,
    aTaille: a.a_taille,
    aPointure: a.a_pointure,
    unite: "pièce",
  }));
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

  console.log("\n✔ Seed terminé avec succès.");
  console.log(`  Divisions: ${divisionIdByName.size + 1} · Services: ${serviceIdByName.size + 3} · Équipes: ${equipeIdByName.size}`);
  console.log(`  Agents: ${insertedAgents.length} · Articles: ${insertedArticles.length} · Affectations: ${insertedAffectations.length}`);
  console.log(`  Gabarits: ${kitTemplateIdByKey.size}`);
  console.log("\n⚠ Aucune donnée de stock, prix, marché ou contrôle périodique n'a été chargée :");
  console.log("  ces informations ne figuraient pas dans les fichiers sources. Saisissez les valeurs");
  console.log("  réelles dans l'application (fiches articles, marchés, contrôles) avant mise en service.");
}

main()
  .catch((err) => {
    console.error("Échec du seed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
