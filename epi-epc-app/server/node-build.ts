import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createServer } from "./index";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = createServer();
const port = process.env.PORT || 8080;

const distPath = path.join(__dirname, "../spa");
app.use(express.static(distPath));

app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api/") || req.path.startsWith("/uploads/")) return next();
  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, () => {
  console.log(`GEPI — Gestion EPI/EPC en écoute sur le port ${port}`);
  console.log(`Accès réseau interne : http://<adresse-ip-du-serveur>:${port}`);
});
