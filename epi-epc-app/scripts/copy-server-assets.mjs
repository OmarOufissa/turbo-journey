// Le build serveur (Vite/Rollup) regroupe tout server/*.ts dans un seul
// fichier dist/server/node-build.js ; import.meta.url y pointe donc vers ce
// fichier pour tous les modules d'origine confondus. Les migrations SQL et
// les fixtures JSON de seed sont lues au runtime via fs (pas des imports) et
// ne sont donc jamais embarquées automatiquement par Rollup — on les copie
// ici à côté du bundle, aux mêmes chemins relatifs qu'en développement
// (server/db/migrate.ts et server/seeds/seedData.ts utilisent tous deux
// path.join(__dirname, ...) depuis leur propre dossier).
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

copyDir(path.join(root, "server", "db", "migrations"), path.join(root, "dist", "server", "migrations"));
copyDir(path.join(root, "server", "seeds", "data"), path.join(root, "dist", "server", "data"));

console.log("→ Migrations et fixtures de seed copiées dans dist/server/");
