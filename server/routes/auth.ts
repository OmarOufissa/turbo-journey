import { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { dbGet, dbRun } from "../db";
import { logAuditActionSafe } from "../services/auditService";

// Read lazily so a secret generated/persisted at startup (set into process.env
// by ensureAuthSecrets in db-pg) is always picked up, regardless of import order.
const JWT_FALLBACK = "your-secret-key-change-in-production";
const REFRESH_FALLBACK = "your-refresh-secret-key";
function getJwtSecret(): string {
  return process.env.JWT_SECRET || JWT_FALLBACK;
}
function getRefreshSecret(): string {
  return process.env.REFRESH_SECRET || REFRESH_FALLBACK;
}

interface LoginRequest {
  email?: string;
  password: string;
}

interface AuthUser {
  id: number;
  email: string;
}

interface AuthPayload {
  id: number;
  email: string;
}

export const handleLogin: RequestHandler = async (req, res) => {
  try {
    const { email, password } = req.body as LoginRequest;

    if (!password) {
      return res.status(400).json({
        message: "Mot de passe requis",
      });
    }

    // Password-only login: without an email, authenticate against the single
    // admin account (this is a single-user desktop app). If an email is given,
    // look that user up specifically.
    const user = await dbGet(
      email
        ? `SELECT id, email, password FROM users WHERE email = ?`
        : `SELECT id, email, password FROM users ORDER BY id ASC LIMIT 1`,
      email ? [email] : []
    ) as (AuthUser & { password: string }) | undefined;

    if (!user || !user.password) {
      return res.status(401).json({
        message: "Identifiants invalides",
      });
    }

    const isPasswordValid = bcrypt.compareSync(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        message: "Identifiants invalides",
      });
    }

    const payload: AuthPayload = {
      id: user.id,
      email: user.email,
    };

    const token = jwt.sign(payload, getJwtSecret(), { expiresIn: "24h" });
    const refreshToken = jwt.sign(payload, getRefreshSecret(), {
      expiresIn: "7d",
    });

    await logAuditActionSafe(user.id, "LOGIN", user.id);

    res.json({
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({
      message: "Erreur serveur",
    });
  }
};

export const handleLogout: RequestHandler = async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;
  if (token) {
    const user = verifyToken(token);
    if (user) {
      await logAuditActionSafe(user.id, "LOGOUT", user.id);
    }
  }

  res.json({
    message: "Déconnecté",
  });
};

export const handleRefresh: RequestHandler = (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        message: "Token de rafraîchissement requis",
      });
    }

    const payload = jwt.verify(refreshToken, getRefreshSecret()) as AuthPayload;

    const newToken = jwt.sign(
      { id: payload.id, email: payload.email },
      getJwtSecret(),
      { expiresIn: "24h" }
    );

    res.json({
      token: newToken,
    });
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(401).json({
      message: "Token invalide",
    });
  }
};

export function verifyToken(token: string): AuthPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as AuthPayload;
    return decoded;
  } catch (err) {
    return null;
  }
}

export const authMiddleware: RequestHandler = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;

  if (!token) {
    return res.status(401).json({
      message: "Token manquant",
    });
  }

  const user = verifyToken(token);
  if (!user) {
    return res.status(401).json({
      message: "Token invalide",
    });
  }

  (req as any).user = user;
  next();
};
