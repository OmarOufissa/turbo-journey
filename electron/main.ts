import { app, BrowserWindow, shell, ipcMain, session } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
const PORT = 4399;
const ALLOWED_ORIGIN = isDev ? "http://localhost:8080" : `http://localhost:${PORT}`;

// Set DB path to persistent user data dir before any server module loads
if (!isDev) {
  const userData = app.getPath("userData");
  process.env.DATABASE_URL = `file:${path.join(userData, "habilitations.db")}`;
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────

ipcMain.handle("app:get-version", () => app.getVersion());
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
  const express = await import("express");
  const expressApp = createServer();

  const spaPath = path.join(__dirname, "../spa");
  expressApp.use(express.default.static(spaPath));
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
  const preloadPath = path.join(__dirname, "preload.js");

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
          `frame-src 'none';` +
          `object-src 'none';`,
        ],
        "X-Content-Type-Options": ["nosniff"],
        "X-Frame-Options": ["DENY"],
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
    console.error("Startup failed:", err);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
