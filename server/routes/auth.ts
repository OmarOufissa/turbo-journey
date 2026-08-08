import { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { dbGet, dbRun } from "../db";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key-change-in-production";
const REFRESH_SECRET = process.env.REFRESH_SECRET || "your-refresh-secret-key";

interface LoginRequest {
  email: string;
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

    if (!email || !password) {
      return res.status(400).json({
        message: "Email et mot de passe requis",
      });
    }

    const user = await dbGet(
      `SELECT id, email, password FROM users WHERE email = ?`,
      [email]
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

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
    const refreshToken = jwt.sign(payload, REFRESH_SECRET, {
      expiresIn: "7d",
    });

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

export const handleLogout: RequestHandler = (_req, res) => {
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

    const payload = jwt.verify(refreshToken, REFRESH_SECRET) as AuthPayload;

    const newToken = jwt.sign(
      { id: payload.id, email: payload.email },
      JWT_SECRET,
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
    const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
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
