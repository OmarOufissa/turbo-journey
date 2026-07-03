import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";

import { authRouter } from "./routes/auth";
import { orgRouter } from "./routes/org";
import { agentsRouter } from "./routes/agents";
import { articlesRouter } from "./routes/articles";
import { marchesRouter } from "./routes/marches";
import { affectationsRouter } from "./routes/affectations";
import { kitTemplatesRouter } from "./routes/kitTemplates";
import { controlesRouter, reparationsRouter } from "./routes/controles";
import { documentsRouter } from "./routes/documents";
import { alertesRouter } from "./routes/alertes";
import { historiqueRouter } from "./routes/historique";
import { rechercheRouter } from "./routes/recherche";
import { dashboardRouter } from "./routes/dashboard";
import { rapportsRouter } from "./routes/rapports";
import { requireAuth } from "./middleware/auth";
import { ensureDatabaseReady } from "./db/bootstrap";

export async function createServer() {
  await ensureDatabaseReady();

  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true }));

  const uploadsDir = path.join(process.env.DATA_DIR || process.cwd(), "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });
  app.use("/uploads", express.static(uploadsDir));

  app.get("/api/ping", (_req, res) => res.json({ message: "pong" }));

  // Authentification — publique
  app.use("/api/auth", authRouter);

  // Tout le reste de l'API nécessite une session valide
  app.use("/api/dashboard", requireAuth, dashboardRouter);
  app.use("/api/org", requireAuth, orgRouter);
  app.use("/api/agents", requireAuth, agentsRouter);
  app.use("/api/articles", requireAuth, articlesRouter);
  app.use("/api/marches", requireAuth, marchesRouter);
  app.use("/api/affectations", requireAuth, affectationsRouter);
  app.use("/api/kit-templates", requireAuth, kitTemplatesRouter);
  app.use("/api/controles", requireAuth, controlesRouter);
  app.use("/api/reparations", requireAuth, reparationsRouter);
  app.use("/api/documents", requireAuth, documentsRouter);
  app.use("/api/alertes", requireAuth, alertesRouter);
  app.use("/api/historique", requireAuth, historiqueRouter);
  app.use("/api/recherche", requireAuth, rechercheRouter);
  app.use("/api/rapports", requireAuth, rapportsRouter);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(err.status ?? 500).json({ error: err.message ?? "Erreur serveur" });
  });

  return app;
}
