import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer } from "./index";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 8080;

const app = await createServer();

const distPath = path.join(__dirname, "../spa");
app.use(express.static(distPath));

app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/") || req.path.startsWith("/uploads/")) return next();
  res.sendFile(path.join(distPath, "index.html"));
});

await new Promise<void>((resolve) => {
  app.listen(port, () => {
    console.log(`GEPI — Gestion EPI/EPC en écoute sur le port ${port}`);
    console.log(`Accès réseau interne : http://<adresse-ip-du-serveur>:${port}`);
    resolve();
  });
});
