/**
 * Point d'entrée CLI pour rejouer manuellement server/db/regenerateArticleCodes.ts
 * (déjà appelée automatiquement à chaque démarrage via bootstrap.ts — ce script sert
 * uniquement à la vérifier/rejouer hors du serveur, ex. en développement).
 */
import "dotenv/config";
import { sqlite } from "../db";
import { regenerateArticleCodesIfNeeded } from "../db/regenerateArticleCodes";

regenerateArticleCodesIfNeeded()
  .catch((err) => {
    console.error("Échec de la régénération des codes articles:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    sqlite.close();
  });
