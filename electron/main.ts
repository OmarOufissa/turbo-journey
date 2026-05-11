import { app, BrowserWindow, shell } from "electron";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
const PORT = 4399;

// Set DB path to persistent user data dir before any server module loads
if (!isDev) {
  const userData = app.getPath("userData");
  process.env.DATABASE_URL = `file:${path.join(userData, "habilitations.db")}`;
}

let serverStarted = false;

async function startServer() {
  if (serverStarted || isDev) return;
  serverStarted = true;

  // Dynamic import ensures DATABASE_URL is set before db module initializes
  const { createServer } = await import("../server/index.js");
  const express = await import("express");
  const expressApp = createServer();

  // Serve the built SPA
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Gestion des Habilitations",
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const url = isDev ? "http://localhost:8080" : `http://localhost:${PORT}`;
  win.loadURL(url);

  win.once("ready-to-show", () => win.show());

  win.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl);
    return { action: "deny" };
  });

  return win;
}

app.whenReady().then(async () => {
  try {
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
