import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import type { AuthUser, Role } from "@shared/api";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-production";

export interface AuthedRequest extends Request {
  user?: AuthUser;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "12h" });
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentification requise" });
  try {
    req.user = jwt.verify(token, JWT_SECRET) as AuthUser;
    next();
  } catch {
    return res.status(401).json({ error: "Session invalide ou expirée" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Authentification requise" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Action non autorisée pour ce profil" });
    }
    next();
  };
}
