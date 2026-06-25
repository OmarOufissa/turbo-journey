import { app, BrowserWindow, shell, ipcMain, session, dialog } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
const PORT = 4399;
const ALLOWED_ORIGIN = isDev ? "http://localhost:8080" : `http://localhost:${PORT}`;

// Decide where the app keeps its data (database, PDFs, backups).
//
// Portable build (run from a USB stick): electron-builder sets
// PORTABLE_EXECUTABLE_DIR to the folder the .exe runs from. We put the data in
// a "GestionHabilitations-Data" folder right next to the .exe, so everything
// travels with the USB — plug it into any PC and all your data is already there.
//
// Installed build (normal install): fall back to the per-user AppData folder.
function resolveDataDir(): string {
  const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (portableDir) {
    const dir = path.join(portableDir, "GestionHabilitations-Data");
    try {
      fs.mkdirSync(dir, { recursive: true });
      // Verify we can actually write here (USB may be read-only/locked).
      fs.accessSync(dir, fs.constants.W_OK);
      return dir;
    } catch {
      // USB not writable — fall through to AppData so the app still works.
    }
  }
  return app.getPath("userData");
}

// Set DB path to persistent data dir before any server module loads
if (!isDev) {
  const dataDir = resolveDataDir();
  process.env.DATABASE_URL = `file:${path.join(dataDir, "habilitations.db")}`;
  process.env.UPLOADS_BASE_DIR = path.join(dataDir, "uploads");
  process.env.UPLOADS_DIR = path.join(dataDir, "uploads", "pdfs");
  process.env.PDF_TEMPLATE_PATH = path.join(__dirname, "../server/seeds/data/titre_HAE_vierge.pdf");
  process.env.HABILITATIONS_EXCEL_URL = path.join(__dirname, "../server/seeds/data/employees.xlsx");
  process.env.HABILITATIONS_TST_EXCEL_URL = path.join(__dirname, "../server/seeds/data/employees_tst.xlsx");
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────

ipcMain.handle("app:get-version", () => app.getVersion());

// Export the current page as a PDF file. The renderer's "Télécharger PDF"
// button calls this so we save a real PDF instead of opening the OS print
// dialog (which shows "this app doesn't support print preview" in Electron).
ipcMain.handle("app:export-pdf", async (_event, defaultName?: string) => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return { ok: false };
  const data = await win.webContents.printToPDF({
    printBackground: true,
    pageSize: "A4",
    margins: { marginType: "default" },
  });
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: "Enregistrer le rapport",
    defaultPath: defaultName || "rapport.pdf",
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, data);
  return { ok: true, filePath };
});
ipcMain.handle("app:quit", () => app.quit());
ipcMain.handle("app:minimize", () => BrowserWindow.getFocusedWindow()?.minimize());
ipcMain.handle("app:maximize", () => {
  const win = BrowserWindow.getFocusedWindow();
  if (win?.isMaximized()) win.unmaximize();
  else win?.maximize();
});

// ─── Server ───────────────────────────────────────────────────────────────

let serverStarted = false;

async function startServer() {
  if (serverStarted || isDev) return;
  serverStarted = true;

  const { createServer } = await import("../server/index.js");
  const expressModule = await import("express");
  const expressApp = createServer();

  const spaPath = path.join(__dirname, "../spa");
  const expressRef = (expressModule.default ?? expressModule) as any;
  expressApp.use(expressRef.static(spaPath));
  expressApp.use((req: any, res: any) => {
    if (!req.path.startsWith("/api/")) {
      res.sendFile(path.join(spaPath, "index.html"));
    }
  });

  await new Promise<void>((resolve, reject) => {
    expressApp.listen(PORT, "127.0.0.1", (err?: Error) => {
      if (err) reject(err);
      else resolve();
    });
  });

  console.log(`Server started on port ${PORT}`);
}

// ─── Window ───────────────────────────────────────────────────────────────

function createWindow() {
  const preloadPath = path.join(__dirname, "preload.cjs");

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Gestion des Habilitations",
    show: false,
    webPreferences: {
      // Security: disable Node.js in renderer
      nodeIntegration: false,
      contextIsolation: true,
      // Security: use preload for controlled IPC only
      preload: preloadPath,
      // Security: disable eval
      enableBlinkFeatures: "",
      // Security: sandbox the renderer
      sandbox: true,
      // Security: disable web security only in dev (never in prod)
      webSecurity: !isDev,
      // Enable Chromium's built-in PDF viewer so PDFs render inside iframes
      plugins: true,
    },
  });

  // Block navigation to any URL other than the local app
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(ALLOWED_ORIGIN)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Block new windows — open external links in system browser
  win.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (!targetUrl.startsWith(ALLOWED_ORIGIN)) {
      shell.openExternal(targetUrl);
    }
    return { action: "deny" };
  });

  // Block remote module
  win.webContents.on("remote-require" as any, (event: any) => event.preventDefault());
  win.webContents.on("remote-get-global" as any, (event: any) => event.preventDefault());

  win.loadURL(ALLOWED_ORIGIN);
  win.once("ready-to-show", () => win.show());

  if (isDev) {
    win.webContents.openDevTools({ mode: "detach" });
  }

  return win;
}

// ─── CSP via session ──────────────────────────────────────────────────────

function applySecurityHeaders() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          `default-src 'self' http://localhost:${PORT};` +
          `script-src 'self';` +
          `style-src 'self' 'unsafe-inline';` +
          `img-src 'self' data: blob: http://localhost:${PORT};` +
          `font-src 'self';` +
          `connect-src 'self' http://localhost:${PORT};` +
          `frame-src 'self' http://localhost:${PORT};` +
          `object-src 'self' http://localhost:${PORT};`,
        ],
        "X-Content-Type-Options": ["nosniff"],
        // SAMEORIGIN (not DENY) so the app can show its own PDFs in an iframe
        "X-Frame-Options": ["SAMEORIGIN"],
        "X-XSS-Protection": ["1; mode=block"],
      },
    });
  });
}

// ─── App lifecycle ────────────────────────────────────────────────────────

// Disable Chromium GPU process crash dialog in production
if (!isDev) {
  app.commandLine.appendSwitch("disable-gpu");
}

app.whenReady().then(async () => {
  try {
    applySecurityHeaders();
    await startServer();
    createWindow();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    dialog.showErrorBox("Startup Failed", message);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
