/**
 * Electron main process.
 *
 * Runs the same Express server the web app uses (dist/server/node-build.mjs)
 * as an embedded local server, then points a BrowserWindow at it - so the
 * packaged app needs nothing installed on the machine (no Postgres, no
 * Node, no browser setup) beyond the installer itself.
 */
const { app, BrowserWindow } = require("electron");
const path = require("path");
const http = require("http");
const { pathToFileURL } = require("url");

const PORT = process.env.PORT || 47821;

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
  try {
    await startServer();
  } catch (err) {
    console.error("Failed to start the embedded server:", err);
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
