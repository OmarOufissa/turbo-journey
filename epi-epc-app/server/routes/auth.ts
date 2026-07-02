import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { signToken, requireAuth, type AuthedRequest } from "../middleware/auth";
import type { LoginRequest, LoginResponse, AuthUser } from "@shared/api";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { username, password } = req.body as LoginRequest;
  if (!username || !password) return res.status(400).json({ error: "Identifiant et mot de passe requis" });

  const [user] = await db.select().from(users).where(eq(users.username, username));
  if (!user || !user.actif) return res.status(401).json({ error: "Identifiants incorrects" });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: "Identifiants incorrects" });

  await db.update(users).set({ derniereConnexion: new Date() }).where(eq(users.id, user.id));

  const authUser: AuthUser = {
    id: user.id,
    username: user.username,
    nom: user.nom,
    role: user.role as AuthUser["role"],
    agentId: user.agentId,
  };
  const response: LoginResponse = { token: signToken(authUser), user: authUser };
  res.json(response);
});

authRouter.get("/me", requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});
