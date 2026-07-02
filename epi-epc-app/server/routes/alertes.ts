import { Router } from "express";
import { db } from "../db";
import { alertes } from "../db/schema";
import { and, desc, eq } from "drizzle-orm";
import { regenerateAlertes } from "../services/alertService";
import type { AuthedRequest } from "../middleware/auth";

export const alertesRouter = Router();

alertesRouter.get("/", async (req, res) => {
  const { lue, niveau, type } = req.query as Record<string, string>;
  const conditions = [];
  if (lue !== undefined) conditions.push(eq(alertes.lue, lue === "true"));
  if (niveau) conditions.push(eq(alertes.niveau, niveau));
  if (type) conditions.push(eq(alertes.type, type));
  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db.select().from(alertes).where(where).orderBy(desc(alertes.createdAt)).limit(300);
  res.json(rows);
});

alertesRouter.post("/regenerer", async (_req: AuthedRequest, res) => {
  const nb = await regenerateAlertes();
  res.json({ generated: nb });
});

alertesRouter.post("/:id/lue", async (req, res) => {
  const [row] = await db.update(alertes).set({ lue: true }).where(eq(alertes.id, Number(req.params.id))).returning();
  if (!row) return res.status(404).json({ error: "Alerte introuvable" });
  res.json(row);
});

alertesRouter.post("/:id/traitee", async (req, res) => {
  const [row] = await db.update(alertes).set({ traitee: true, lue: true }).where(eq(alertes.id, Number(req.params.id))).returning();
  if (!row) return res.status(404).json({ error: "Alerte introuvable" });
  res.json(row);
});

alertesRouter.post("/tout-marquer-lu", async (_req, res) => {
  await db.update(alertes).set({ lue: true }).where(eq(alertes.lue, false));
  res.json({ ok: true });
});
