import { db } from "../db";
import { historique } from "../db/schema";

export interface HistoriqueEntry {
  typeEvenement: string;
  entiteType: string;
  entiteId?: number;
  agentId?: number | null;
  equipeId?: number | null;
  articleId?: number | null;
  utilisateurId?: number | null;
  details?: Record<string, unknown>;
}

/** Journal d'audit append-only : aucune ligne n'est jamais modifiée ni supprimée. */
export async function logHistorique(entry: HistoriqueEntry) {
  await db.insert(historique).values({
    typeEvenement: entry.typeEvenement,
    entiteType: entry.entiteType,
    entiteId: entry.entiteId ?? null,
    agentId: entry.agentId ?? null,
    equipeId: entry.equipeId ?? null,
    articleId: entry.articleId ?? null,
    utilisateurId: entry.utilisateurId ?? null,
    details: entry.details ?? null,
  });
}
