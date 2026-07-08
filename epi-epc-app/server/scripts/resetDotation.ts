/**
 * Script CLI à usage unique : réinitialise l'état des dotations à zéro (aucun agent, équipe ou
 * poste doté, aucune affectation) sans toucher aux données de référence — articles, articles de
 * référence, classification, organisation (divisions/services/équipes/postes), agents, marchés
 * et utilisateurs restent intacts. À exécuter une seule fois par l'administrateur ONEE avant la
 * mise en service réelle, une fois les données de démonstration/test plus nécessaires
 * (`pnpm reset:dotation`) — jamais rejoué automatiquement au démarrage de l'application
 * (voir server/db/bootstrap.ts, qui ne réinitialise jamais une base déjà initialisée).
 */
import "dotenv/config";
import { sql, inArray } from "drizzle-orm";
import { db, sqlite } from "../db";
import { historique } from "../db/schema";
import { regenerateAlertes } from "../services/alertService";

function count(table: string) {
  return (db.get(sql.raw(`SELECT count(*) as n FROM "${table}"`)) as { n: number }).n;
}

const DOTATION_TABLES_IN_DEPENDENCY_ORDER = ["reformes", "controles_periodiques", "affectations"];

const DOTATION_HISTORIQUE_EVENEMENTS = [
  "dotation",
  "dotation_kit",
  "retour",
  "declaration_perte",
  "reforme",
  "modification_affectation",
  "maj_unite_equipement",
  "planification_controle",
  "controle_realise",
];

async function main() {
  console.log("→ Réinitialisation de la dotation (affectations, réformes, contrôles périodiques)…");

  for (const table of DOTATION_TABLES_IN_DEPENDENCY_ORDER) {
    const before = count(table);
    db.run(sql.raw(`DELETE FROM "${table}"`));
    console.log(`  ${table}: ${before} ligne(s) supprimée(s)`);
  }
  db.run(sql.raw(`DELETE FROM sqlite_sequence WHERE name IN (${DOTATION_TABLES_IN_DEPENDENCY_ORDER.map((t) => `'${t}'`).join(",")})`));

  const nbHistoriqueAvant = count("historique");
  await db.delete(historique).where(inArray(historique.typeEvenement, DOTATION_HISTORIQUE_EVENEMENTS));
  console.log(`  historique (événements de dotation): ${nbHistoriqueAvant - count("historique")} ligne(s) supprimée(s)`);

  const nbAlertes = await regenerateAlertes();
  console.log(`  alertes régénérées: ${nbAlertes}`);

  console.log("\n✔ Dotation réinitialisée — articles, articles de référence, classification, organisation et agents inchangés.");
}

main()
  .catch((err) => {
    console.error("Échec de la réinitialisation:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    sqlite.close();
  });
