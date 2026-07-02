import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { logHistorique } from "../services/historiqueService";
import type { AuthedRequest } from "../middleware/auth";

export const usersRouter = Router();

usersRouter.get("/", async (_req, res) => {
  const rows = await db
    .select({ id: users.id, username: users.username, nom: users.nom, role: users.role, actif: users.actif, derniereConnexion: users.derniereConnexion, agentId: users.agentId })
    .from(users)
    .orderBy(users.username);
  res.json(rows);
});

usersRouter.post("/", async (req: AuthedRequest, res) => {
  const { username, nom, role, password, agentId } = req.body;
  if (!username || !nom || !role || !password) return res.status(400).json({ error: "Identifiant, nom, rôle et mot de passe requis" });
  const passwordHash = await bcrypt.hash(password, 10);
  const [row] = await db.insert(users).values({ username, nom, role, passwordHash, agentId }).returning({ id: users.id, username: users.username, nom: users.nom, role: users.role });
  await logHistorique({ typeEvenement: "creation_utilisateur", entiteType: "utilisateur", entiteId: row.id, utilisateurId: req.user?.id, details: { username, role } });
  res.status(201).json(row);
});

usersRouter.put("/:id", async (req: AuthedRequest, res) => {
  const id = Number(req.params.id);
  const { nom, role, actif, password } = req.body;
  const patch: Record<string, unknown> = { nom, role, actif };
  if (password) patch.passwordHash = await bcrypt.hash(password, 10);
  const [row] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, id))
    .returning({ id: users.id, username: users.username, nom: users.nom, role: users.role, actif: users.actif });
  if (!row) return res.status(404).json({ error: "Utilisateur introuvable" });
  await logHistorique({ typeEvenement: "modification_utilisateur", entiteType: "utilisateur", entiteId: id, utilisateurId: req.user?.id });
  res.json(row);
});
