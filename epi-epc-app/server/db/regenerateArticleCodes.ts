/**
 * Régénère systématiquement codeArticle pour tous les articles au format
 * "<code de l'article de référence>-<numéro séquentiel sur 3 chiffres>" (même convention
 * que codificationService.generateArticleCode, utilisée à la création). Nécessaire car
 * seedData.ts assigne aux articles repris des fichiers sources leurs codes d'origine
 * (ex. "EPI-001"), qui ne suivent pas ce format — donc même une installation neuve en a
 * besoin, pas seulement une base existante. Idempotent et non destructif : ne touche que
 * la colonne codeArticle, ne modifie ni ne supprime aucune autre donnée ; sans effet sur
 * un article déjà à jour.
 *
 * Ordre stable au sein d'une même référence : par id (ordre de création), pour que des
 * exécutions répétées produisent toujours le même résultat. Mise à jour en deux passes
 * (valeurs temporaires puis finales) pour ne jamais violer la contrainte unique sur
 * codeArticle pendant la réaffectation (le même jeu de codes cibles est redistribué entre
 * les articles d'une même référence).
 */
import { eq } from "drizzle-orm";
import { db } from "./index";
import { articles, articlesReference } from "./schema";

function pad(n: number, width: number) {
  return String(n).padStart(width, "0");
}

export async function regenerateArticleCodesIfNeeded(): Promise<void> {
  const allArticles = await db.select({ id: articles.id, codeArticle: articles.codeArticle, articleReferenceId: articles.articleReferenceId }).from(articles);
  const references = await db.select({ id: articlesReference.id, code: articlesReference.code }).from(articlesReference);
  const refCodeById = new Map(references.map((r) => [r.id, r.code]));

  const byReference = new Map<number, typeof allArticles>();
  for (const a of allArticles) {
    if (a.articleReferenceId == null) continue; // rattachement obligatoire à la création — cas inattendu, laissé tel quel
    const list = byReference.get(a.articleReferenceId) ?? [];
    list.push(a);
    byReference.set(a.articleReferenceId, list);
  }

  const targets: { id: number; codeActuel: string; codeCible: string }[] = [];
  for (const [refId, group] of byReference) {
    const refCode = refCodeById.get(refId);
    if (!refCode) continue;
    group.sort((a, b) => a.id - b.id);
    group.forEach((a, i) => {
      const codeCible = `${refCode}-${pad(i + 1, 3)}`;
      if (codeCible !== a.codeArticle) targets.push({ id: a.id, codeActuel: a.codeArticle, codeCible });
    });
  }
  if (targets.length === 0) return; // déjà au bon format — idempotent à chaque démarrage

  console.log(`→ Régénération des codes articles (${targets.length} à mettre à jour)…`);

  // Passe 1 : valeurs temporaires garanties uniques (préfixées par l'id, jamais en collision
  // avec un code cible "<réf>-NNN" ni avec un autre code temporaire).
  for (const t of targets) {
    await db.update(articles).set({ codeArticle: `__REGEN_${t.id}__` }).where(eq(articles.id, t.id));
  }
  // Passe 2 : valeurs finales.
  for (const t of targets) {
    await db.update(articles).set({ codeArticle: t.codeCible }).where(eq(articles.id, t.id));
  }

  console.log(`  ${targets.length} code(s) régénéré(s).`);
}
