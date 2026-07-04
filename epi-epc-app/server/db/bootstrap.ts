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
        await migrateHierarchieIfNeeded();
      }
    })();
  }
  return ready;
}
