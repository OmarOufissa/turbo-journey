/**
 * Transformation non destructive d'une base déjà installée qui a l'ancien
 * equipement_hierarchie à 4 niveaux (Catégorie > Famille > Sous-famille > Type
 * d'équipement) mais pas encore articles_reference : promeut chaque feuille de l'arbre
 * (quel que soit son niveau) en article de référence, repointe articles/kit_template_lignes
 * dessus, puis retire ces feuilles de equipement_hierarchie (qui ne garde alors que les
 * niveaux Catégorie/Famille/Sous-famille). N'écrase et ne supprime aucune autre donnée —
 * affectations, stock_mouvements, historique, contrôles, réformes restent intacts.
 *
 * Cas couvert : une base qui a déjà tourné avec la version précédente de cette
 * restructuration (equipement_hierarchie peuplé, articles.hierarchie_id renseigné) mais pas
 * encore avec articles_reference. Pour une base plus ancienne encore (jamais passée par
 * equipement_hierarchie du tout), voir migrateHierarchieIfNeeded() dans migrateHierarchie.ts,
 * qui construit directement la forme finale via seedHierarchie() — ce module n'a alors rien
 * à faire (articles_reference sera déjà peuplé).
 */
import { eq } from "drizzle-orm";
import { db } from "./index";
import * as s from "../db/schema";
import { generateReferenceCode } from "../services/codificationService";

export async function migrateArticlesReferenceIfNeeded(): Promise<void> {
  const [hasReference] = await db.select({ id: s.articlesReference.id }).from(s.articlesReference).limit(1);
  if (hasReference) return; // déjà migré (ou déjà semé neuf par seedHierarchie) — idempotent à chaque démarrage

  const allNodes = await db.select().from(s.equipementHierarchie);
  if (allNodes.length === 0) return; // rien à transformer ici (base neuve ou traitée par migrateHierarchieIfNeeded)

  console.log("→ Migration vers les articles de référence (promotion des feuilles de la hiérarchie)…");

  const childCount = new Map<number, number>();
  for (const n of allNodes) {
    if (n.parentId != null) childCount.set(n.parentId, (childCount.get(n.parentId) ?? 0) + 1);
  }
  const leaves = allNodes.filter((n) => !childCount.has(n.id));

  const oldLeafIdToReferenceId = new Map<number, number>();
  for (const leaf of leaves) {
    if (leaf.parentId == null) {
      console.warn(`  ⚠ nœud racine sans enfants ignoré (id=${leaf.id}, "${leaf.nom}") — cas inattendu, laissé tel quel.`);
      continue;
    }
    const code = await generateReferenceCode(leaf.parentId);
    const [row] = await db
      .insert(s.articlesReference)
      .values({ code, hierarchieParentId: leaf.parentId, designation: leaf.nom })
      .returning({ id: s.articlesReference.id });
    oldLeafIdToReferenceId.set(leaf.id, row.id);
  }

  // Repointe les articles physiques sur leur nouvelle référence.
  const articleRows = await db.select().from(s.articles);
  let articlesMatched = 0;
  let articlesUnresolved = 0;
  for (const a of articleRows) {
    if (a.hierarchieId == null) continue; // déjà sans classement — laissé tel quel, rien à migrer
    const referenceId = oldLeafIdToReferenceId.get(a.hierarchieId);
    if (referenceId) {
      await db.update(s.articles).set({ articleReferenceId: referenceId }).where(eq(s.articles.id, a.id));
      articlesMatched++;
    } else {
      articlesUnresolved++;
      console.warn(`  ⚠ article ${a.codeArticle} (${a.designation}) : son nœud de classification n'est pas une feuille promue — à reclasser manuellement.`);
    }
  }

  // Repointe les lignes de gabarit de dotation via l'articleReferenceId désormais connu de leur article.
  const articleIdToReferenceId = new Map<number, number>();
  for (const a of await db.select({ id: s.articles.id, articleReferenceId: s.articles.articleReferenceId }).from(s.articles)) {
    if (a.articleReferenceId) articleIdToReferenceId.set(a.id, a.articleReferenceId);
  }
  const ligneRows = await db.select().from(s.kitTemplateLignes);
  let lignesMatched = 0;
  for (const l of ligneRows) {
    const referenceId = articleIdToReferenceId.get(l.articleId);
    if (referenceId) {
      await db.update(s.kitTemplateLignes).set({ articleReferenceId: referenceId }).where(eq(s.kitTemplateLignes.id, l.id));
      lignesMatched++;
    }
  }

  if (articlesUnresolved > 0) {
    await db.insert(s.historique).values({
      typeEvenement: "migration_articles_reference",
      entiteType: "systeme",
      details: {
        referencesPromues: oldLeafIdToReferenceId.size,
        articlesRattaches: articlesMatched,
        articlesNonResolus: articlesUnresolved,
        note: "Certains articles n'ont pas pu être rattachés automatiquement à un article de référence — à reclasser manuellement dans l'application.",
      },
    });
  }

  // Libère hierarchieId (colonne temporaire) des articles migrés avant de retirer les
  // feuilles promues — sinon la contrainte de clé étrangère bloquerait leur suppression.
  for (const leaf of leaves) {
    if (oldLeafIdToReferenceId.has(leaf.id)) {
      await db.update(s.articles).set({ hierarchieId: null }).where(eq(s.articles.hierarchieId, leaf.id));
    }
  }
  for (const leaf of leaves) {
    if (oldLeafIdToReferenceId.has(leaf.id)) {
      await db.delete(s.equipementHierarchie).where(eq(s.equipementHierarchie.id, leaf.id));
    }
  }

  console.log(
    `  ${oldLeafIdToReferenceId.size} articles de référence créés, ${articlesMatched} articles rattachés, ${lignesMatched} lignes de gabarit rattachées, ${articlesUnresolved} articles non résolus — sur ${articleRows.length} articles au total.`,
  );
}
