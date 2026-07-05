// En Electron, main.cjs positionne DATA_DIR sur app.getPath('userData') avant d'importer
// le serveur, pour que la base et les fichiers uploadés vivent dans un répertoire
// inscriptible propre à l'utilisateur plutôt que dans le dossier d'installation (souvent en
// lecture seule). En dev/CLI, on reste sur le répertoire courant. Point d'entrée unique pour
// cette expression — évite que db/index.ts, server/index.ts et routes/documents.ts en
// gardent chacun une copie indépendante, source d'incohérence (voir le bug de service des
// documents uploadés que cela a provoqué).
export function getDataDir(): string {
  return process.env.DATA_DIR || process.cwd();
}
