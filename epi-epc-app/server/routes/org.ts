import { Router } from "express";
import { db } from "../db";
import { divisions, services, equipes, agents } from "../db/schema";
import { eq, count } from "drizzle-orm";
import { logHistorique } from "../services/historiqueService";
import type { AuthedRequest } from "../middleware/auth";

export const orgRouter = Router();

// Arbre complet Direction > Division > Service > Équipe avec effectifs
orgRouter.get("/tree", async (_req, res) => {
  const [divs, svcs, eqs, agentCounts] = await Promise.all([
    db.select().from(divisions),
    db.select().from(services),
    db.select().from(equipes),
    db
      .select({ equipeId: agents.equipeId, serviceId: agents.serviceId, divisionId: agents.divisionId, n: count() })
      .from(agents)
      .groupBy(agents.equipeId, agents.serviceId, agents.divisionId),
  ]);

  const equipeCounts = new Map<number, number>();
  const serviceDirectCounts = new Map<number, number>();
  for (const row of agentCounts) {
    if (row.equipeId) equipeCounts.set(row.equipeId, (equipeCounts.get(row.equipeId) ?? 0) + Number(row.n));
    else if (row.serviceId) serviceDirectCounts.set(row.serviceId, (serviceDirectCounts.get(row.serviceId) ?? 0) + Number(row.n));
  }

  const tree = divs.map((d) => ({
    ...d,
    services: svcs
      .filter((s) => s.divisionId === d.id)
      .map((s) => ({
        ...s,
        effectifDirect: serviceDirectCounts.get(s.id) ?? 0,
        equipes: eqs
          .filter((e) => e.serviceId === s.id)
          .map((e) => ({ ...e, effectif: equipeCounts.get(e.id) ?? 0 })),
      })),
  }));
  res.json(tree);
});

orgRouter.get("/divisions", async (_req, res) => res.json(await db.select().from(divisions)));
orgRouter.get("/services", async (_req, res) => res.json(await db.select().from(services)));
orgRouter.get("/equipes", async (_req, res) => res.json(await db.select().from(equipes)));

orgRouter.post("/divisions", async (req: AuthedRequest, res) => {
  const { code, nom } = req.body;
  if (!code || !nom) return res.status(400).json({ error: "Code et nom requis" });
  const [row] = await db.insert(divisions).values({ code, nom }).returning();
  await logHistorique({ typeEvenement: "creation_division", entiteType: "division", entiteId: row.id, utilisateurId: req.user?.id, details: { nom } });
  res.status(201).json(row);
});

orgRouter.post("/services", async (req: AuthedRequest, res) => {
  const { code, nom, divisionId } = req.body;
  if (!code || !nom || !divisionId) return res.status(400).json({ error: "Code, nom et division requis" });
  const [row] = await db.insert(services).values({ code, nom, divisionId }).returning();
  await logHistorique({ typeEvenement: "creation_service", entiteType: "service", entiteId: row.id, utilisateurId: req.user?.id, details: { nom } });
  res.status(201).json(row);
});

orgRouter.post("/equipes", async (req: AuthedRequest, res) => {
  const { code, nom, serviceId, teamType } = req.body;
  if (!code || !nom || !serviceId) return res.status(400).json({ error: "Code, nom et service requis" });
  const [row] = await db.insert(equipes).values({ code, nom, serviceId, teamType }).returning();
  await logHistorique({ typeEvenement: "creation_equipe", entiteType: "equipe", entiteId: row.id, utilisateurId: req.user?.id, details: { nom } });
  res.status(201).json(row);
});

orgRouter.put("/divisions/:id", async (req, res) => {
  const [row] = await db.update(divisions).set(req.body).where(eq(divisions.id, Number(req.params.id))).returning();
  if (!row) return res.status(404).json({ error: "Division introuvable" });
  res.json(row);
});
orgRouter.put("/services/:id", async (req, res) => {
  const [row] = await db.update(services).set(req.body).where(eq(services.id, Number(req.params.id))).returning();
  if (!row) return res.status(404).json({ error: "Service introuvable" });
  res.json(row);
});
orgRouter.put("/equipes/:id", async (req, res) => {
  const [row] = await db.update(equipes).set(req.body).where(eq(equipes.id, Number(req.params.id))).returning();
  if (!row) return res.status(404).json({ error: "Équipe introuvable" });
  res.json(row);
});

orgRouter.delete("/divisions/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const [[{ n: nbServices }], [{ n: nbAgents }]] = await Promise.all([
    db.select({ n: count() }).from(services).where(eq(services.divisionId, id)),
    db.select({ n: count() }).from(agents).where(eq(agents.divisionId, id)),
  ]);
  if (nbServices > 0 || nbAgents > 0) {
    return res.status(409).json({ error: "Impossible de supprimer : des services ou agents y sont rattachés", dependents: { services: nbServices, agents: nbAgents } });
  }
  const [row] = await db.delete(divisions).where(eq(divisions.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Division introuvable" });
  await logHistorique({ typeEvenement: "suppression_division", entiteType: "division", entiteId: id, utilisateurId: req.user?.id, details: { nom: row.nom } });
  res.status(204).end();
});

orgRouter.delete("/services/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const [[{ n: nbEquipes }], [{ n: nbAgents }]] = await Promise.all([
    db.select({ n: count() }).from(equipes).where(eq(equipes.serviceId, id)),
    db.select({ n: count() }).from(agents).where(eq(agents.serviceId, id)),
  ]);
  if (nbEquipes > 0 || nbAgents > 0) {
    return res.status(409).json({ error: "Impossible de supprimer : des équipes ou agents y sont rattachés", dependents: { equipes: nbEquipes, agents: nbAgents } });
  }
  const [row] = await db.delete(services).where(eq(services.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Service introuvable" });
  await logHistorique({ typeEvenement: "suppression_service", entiteType: "service", entiteId: id, utilisateurId: req.user?.id, details: { nom: row.nom } });
  res.status(204).end();
});

orgRouter.delete("/equipes/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const [{ n: nbAgents }] = await db.select({ n: count() }).from(agents).where(eq(agents.equipeId, id));
  if (nbAgents > 0) {
    return res.status(409).json({ error: "Impossible de supprimer : des agents y sont rattachés", dependents: { agents: nbAgents } });
  }
  const [row] = await db.delete(equipes).where(eq(equipes.id, id)).returning();
  if (!row) return res.status(404).json({ error: "Équipe introuvable" });
  await logHistorique({ typeEvenement: "suppression_equipe", entiteType: "equipe", entiteId: id, utilisateurId: req.user?.id, details: { nom: row.nom } });
  res.status(204).end();
});
