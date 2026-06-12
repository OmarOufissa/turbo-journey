import { Request } from "express";
import { verifyToken } from "../routes/auth";

// Best-effort extraction of the authenticated user's id from the JWT Bearer
// token, for routes that don't run behind auth.ts's authMiddleware (and thus
// don't have req.user set). Returns null if absent/invalid.
export function getUserIdFromRequest(req: Request): number | null {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : undefined;
  if (!token) return null;
  const payload = verifyToken(token);
  return payload?.id ?? null;
}
