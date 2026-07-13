/**
 * Initialisation automatique au démarrage — nécessaire car l'application
 * (Electron ou serveur web) n'offre aucun terminal à l'utilisateur final :
 * 1. Applique les migrations Drizzle (idempotent).
 * 2. Si la base est vide (premier lancement), charge les données réelles DTC.
 *    Ne touche JAMAIS à une base déjà initialisée : aucune donnée saisie par
 *    l'utilisateur n'est jamais écrasée ou supprimée par ce mécanisme.
 */
import { db } from "./index";
import { divisions } from "./schema";
import { runMigrations } from "./migrate";
import { seedDatabase } from "../seeds/seedData";
import { migrateHierarchieIfNeeded } from "./migrateHierarchie";
import { migrateArticlesReferenceIfNeeded } from "./migrateArticlesReference";
import { regenerateArticleCodesIfNeeded } from "./regenerateArticleCodes";

let ready: Promise<void> | null = null;

export function ensureDatabaseReady(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      runMigrations();
      const [existing] = await db.select({ id: divisions.id }).from(divisions).limit(1);
      if (!existing) {
        console.log("→ Base de données vide : chargement initial des données réelles DTC…");
        await seedDatabase();
      } else {
        // Base déjà installée (données utilisateur réelles) : ne rejoue jamais le seed
        // complet, ne transforme que la classification des articles si nécessaire.
        // L'ordre compte : migrateHierarchieIfNeeded() traite le cas d'une base très
        // ancienne (avant même equipement_hierarchie) et construit alors directement la
        // forme finale ; migrateArticlesReferenceIfNeeded() traite le cas intermédiaire
        // (equipement_hierarchie déjà peuplé à l'ancien format 4 niveaux, mais sans
        // articles_reference) — chacun se no-op si son cas ne s'applique pas.
        await migrateHierarchieIfNeeded();
        await migrateArticlesReferenceIfNeeded();
      }
      // Même le seed neuf assigne aux articles leurs codes d'origine (fichiers sources), pas
      // encore au format "<référence>-NNN" — toujours appelé, no-op si déjà à jour.
      await regenerateArticleCodesIfNeeded();
    })();
  }
  return ready;
}
