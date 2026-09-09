/**
 * Electron main process.
 *
 * Runs the same Express server the web app uses (dist/server/node-build.mjs)
 * as an embedded local server, then points a BrowserWindow at it - so the
 * packaged app needs nothing installed on the machine (no Postgres, no
 * Node, no browser setup) beyond the installer itself.
 */
const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { pathToFileURL } = require("url");

const PORT = process.env.PORT || 47821;

/**
 * A packaged app launched by double-clicking has no visible console, so
 * anything logged (by this file or by the embedded server, which shares
 * this same process) would otherwise be lost. Mirror it to a log file next
 * to the database, and make startup failures visible instead of silent.
 */
let logFilePath = null;
function setupLogging() {
  const logDir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(logDir, { recursive: true });
  logFilePath = path.join(logDir, "app.log");

  const stream = fs.createWriteStream(logFilePath, { flags: "a" });
  const write = (level) => (...args) => {
    const line = `[${new Date().toISOString()}] [${level}] ${args
      .map((a) => (a instanceof Error ? a.stack || a.message : typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ")}\n`;
    stream.write(line);
  };
  const original = { log: console.log, error: console.error, warn: console.warn };
  console.log = (...a) => { original.log(...a); write("INFO")(...a); };
  console.error = (...a) => { original.error(...a); write("ERROR")(...a); };
  console.warn = (...a) => { original.warn(...a); write("WARN")(...a); };

  process.on("uncaughtException", (err) => {
    console.error("Uncaught exception:", err);
    showFatalError("Erreur inattendue", err);
  });
  process.on("unhandledRejection", (err) => {
    console.error("Unhandled rejection:", err);
  });
}

function showFatalError(title, err) {
  const message =
    (err && err.stack) || String(err) || "Erreur inconnue";
  dialog.showErrorBox(
    title,
    `${message}\n\nDétails enregistrés dans :\n${logFilePath}`
  );
}

function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    (function attempt() {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) {
          reject(new Error(`Embedded server did not respond at ${url} in time`));
        } else {
          setTimeout(attempt, 200);
        }
      });
    })();
  });
}

async function startServer() {
  // process.cwd()-relative paths used across the server (the default
  // SQLite file location, uploaded PDFs, local backups) need a writable,
  // persistent, per-user folder - not wherever Windows happens to launch
  // the .exe from, which is not guaranteed to be writable.
  const dataDir = app.getPath("userData");
  process.chdir(dataDir);

  process.env.PORT = String(PORT);
  process.env.SQLITE_DB_PATH =
    process.env.SQLITE_DB_PATH || path.join(dataDir, "habilitations.sqlite");

  const serverEntry = app.isPackaged
    ? path.join(process.resourcesPath, "app", "dist", "server", "node-build.mjs")
    : path.join(__dirname, "..", "dist", "server", "node-build.mjs");

  await import(pathToFileURL(serverEntry).href);
  await waitForServer(`http://127.0.0.1:${PORT}/api/ping`, 15000);
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  setupLogging();
  console.log(`Starting. userData=${app.getPath("userData")} port=${PORT}`);

  try {
    await startServer();
    console.log("Embedded server is up.");
  } catch (err) {
    console.error("Failed to start the embedded server:", err);
    showFatalError(
      "Le serveur intégré n'a pas démarré",
      err
    );
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
