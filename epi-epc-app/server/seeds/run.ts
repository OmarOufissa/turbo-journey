/**
 * Script CLI de développement : réinitialise complètement la base (⚠️ supprime
 * toutes les données existantes) puis recharge les données réelles DTC via
 * seedData.ts. Utilisé pendant le développement (`pnpm db:seed`) — l'usage en
 * production/Electron passe par server/db/bootstrap.ts, qui ne réinitialise
 * jamais une base contenant déjà des données.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, sqlite } from "../db";
import { runMigrations } from "../db/migrate";
import { seedDatabase } from "./seedData";

const TABLES_IN_DEPENDENCY_ORDER = [
  "historique",
  "alertes",
  "documents",
  "reformes",
  "controles_periodiques",
  "reparations",
  "affectations",
  "stock_mouvements",
  "kit_template_lignes",
  "kit_templates",
  "articles",
  "sous_familles",
  "familles",
  "marches",
  "users",
  "agents",
  "equipes",
  "services",
  "divisions",
];

async function resetDatabase() {
  console.log("→ Réinitialisation des tables…");
  for (const table of TABLES_IN_DEPENDENCY_ORDER) {
    db.run(sql.raw(`DELETE FROM "${table}"`));
  }
  db.run(sql.raw(`DELETE FROM sqlite_sequence WHERE name IN (${TABLES_IN_DEPENDENCY_ORDER.map((t) => `'${t}'`).join(",")})`));
}

async function main() {
  runMigrations();
  await resetDatabase();
  await seedDatabase();
}

main()
  .catch((err) => {
    console.error("Échec du seed:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    sqlite.close();
  });
