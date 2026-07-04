/**
 * Transformation non destructive d'une base déjà installée (données réelles
 * d'un utilisateur) de l'ancien modèle de classification (familles /
 * sous_familles / articles.famille_id) vers le nouveau référentiel arborescent
 * equipement_hierarchie (Catégorie générale > Famille > Sous-famille > Type,
 * profondeur libre — voir server/seeds/hierarchie.ts).
 *
 * Ne s'exécute que si equipement_hierarchie est vide ET que des données
 * "familles" existent déjà (signe d'une base installée avant cette
 * restructuration) — une base neuve est initialisée directement par
 * seedDatabase(), qui peuple equipement_hierarchie sans jamais passer ici.
 * N'écrase et ne supprime aucune ligne existante : seule articles.hierarchie_id
 * est renseigné, tout le reste (stocks, affectations, contrôles, historique)
 * reste intact.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { db } from "./index";
import * as s from "../db/schema";
import { seedHierarchie } from "../seeds/seedData";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface ArticleFixture {
  code: string;
  hierarchie_path: string[];
}

function loadFixturePathByCode(): Map<string, string[]> {
  const file = path.join(__dirname, "..", "seeds", "data", "articles.json");
  const fixture = JSON.parse(fs.readFileSync(file, "utf-8")) as ArticleFixture[];
  return new Map(fixture.map((a) => [a.code, a.hierarchie_path]));
}

export async function migrateHierarchieIfNeeded(): Promise<void> {
  const [hasHierarchie] = await db.select({ id: s.equipementHierarchie.id }).from(s.equipementHierarchie).limit(1);
  if (hasHierarchie) return; // déjà migré (ou déjà semé neuf) — idempotent à chaque démarrage

  const [hasOldFamilles] = await db.select({ id: s.familles.id }).from(s.familles).limit(1);
  if (!hasOldFamilles) return; // rien à transformer

  console.log("→ Migration du catalogue vers la nouvelle hiérarchie (Catégorie > Famille > Sous-famille > Type)…");

  const idByPath = await seedHierarchie();
  const pathByCode = loadFixturePathByCode();

  // Repli par correspondance de nom pour les articles ajoutés depuis l'installation
  // (absents du catalogue fixture d'origine) : associe au premier nœud de la nouvelle
  // arborescence dont le nom correspond exactement à l'ancienne sous-famille, puis
  // à l'ancienne famille — au pire, classé dans un panier générique "Autres".
  const nameIndex = new Map<string, number>();
  for (const [pathKey, id] of idByPath) {
    const segs = pathKey.split("||");
    const leaf = segs[segs.length - 1].toLowerCase();
    if (!nameIndex.has(leaf)) nameIndex.set(leaf, id);
  }

  const oldFamilles = await db.select().from(s.familles);
  const oldSousFamilles = await db.select().from(s.sousFamilles);
  const familleNomById = new Map(oldFamilles.map((f) => [f.id, f.nom]));
  const sousFamilleById = new Map(oldSousFamilles.map((sf) => [sf.id, sf]));
  const fallbackId = idByPath.get(["EPI", "Autres équipements", "Autre équipement EPI"].join("||")) ?? null;

  const articleRows = await db.select().from(s.articles);
  let matched = 0;
  let fallback = 0;
  let unresolved = 0;
  for (const a of articleRows) {
    let hierarchieId: number | null = null;

    const fixturePath = pathByCode.get(a.codeArticle);
    if (fixturePath) {
      hierarchieId = idByPath.get(fixturePath.join("||")) ?? null;
      if (hierarchieId) matched++;
    }

    if (!hierarchieId) {
      const sousFamilleNom = a.sousFamilleId ? sousFamilleById.get(a.sousFamilleId)?.nom : undefined;
      const familleNom = a.familleId ? familleNomById.get(a.familleId) : undefined;
      hierarchieId =
        (sousFamilleNom ? (nameIndex.get(sousFamilleNom.toLowerCase()) ?? null) : null) ??
        (familleNom ? (nameIndex.get(familleNom.toLowerCase()) ?? null) : null) ??
        null;
      if (hierarchieId) fallback++;
    }

    if (!hierarchieId) {
      unresolved++;
      console.warn(`  ⚠ article ${a.codeArticle} (${a.designation}) : aucune correspondance trouvée, classé par défaut dans "Autres équipements" — à reclasser manuellement.`);
      hierarchieId = fallbackId;
    }

    await db.update(s.articles).set({ hierarchieId }).where(eq(s.articles.id, a.id));
  }

  console.log(
    `  ${matched} articles reconnus du catalogue d'origine, ${fallback} rattachés par correspondance de nom, ${unresolved} non résolus (classés par défaut) — sur ${articleRows.length} au total.`,
  );
}
