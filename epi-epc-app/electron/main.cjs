// Processus principal Electron : démarre le serveur Express (API + fichiers
// statiques du build client) en mémoire du même processus, puis ouvre une
// fenêtre pointant dessus. Aucune installation ni configuration séparée
// n'est requise par l'utilisateur final : base de données SQLite et
// documents uploadés vivent dans le dossier de données de l'application
// (app.getPath('userData')), créé et initialisé automatiquement au premier
// lancement.
const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");

const PORT = process.env.PORT || 8080;
let serverReady = null;

function startServer() {
  if (!serverReady) {
    process.env.DATA_DIR = app.getPath("userData");
    process.env.NODE_ENV = "production";
    process.env.PORT = String(PORT);
    // node-build.js est un module ESM (build Vite) ; l'import dynamique
    // fonctionne depuis ce point d'entrée CommonJS et n'est résolu qu'une
    // fois le serveur effectivement en écoute (top-level await côté serveur).
    serverReady = import(path.join(__dirname, "..", "dist", "server", "node-build.js"));
  }
  return serverReady;
}

async function createWindow() {
  await startServer();

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Les liens externes (ouverts via target=_blank, ex. téléchargement de
  // rapports dans un nouvel onglet) s'ouvrent dans le navigateur système
  // plutôt que dans une nouvelle fenêtre Electron.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  await win.loadURL(`http://localhost:${PORT}`);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
