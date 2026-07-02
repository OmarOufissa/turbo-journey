import { db } from "../db";
import { articles, stockMouvements } from "../db/schema";
import { eq, sql } from "drizzle-orm";

export type MouvementType =
  | "entree_achat"
  | "entree_retour"
  | "sortie_affectation"
  | "sortie_reforme"
  | "sortie_perte"
  | "ajustement";

/**
 * Applique un mouvement de stock : insère la ligne de ledger (immuable) et met à jour
 * le compteur `stock_disponible` de l'article en une seule transaction.
 */
export async function applyStockMouvement(params: {
  articleId: number;
  type: MouvementType;
  quantite: number; // signé : positif = entrée, négatif = sortie
  referenceType?: string;
  referenceId?: number;
  motif?: string;
  creeParUserId?: number | null;
}) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(stockMouvements)
      .values({
        articleId: params.articleId,
        type: params.type,
        quantite: params.quantite,
        referenceType: params.referenceType,
        referenceId: params.referenceId,
        motif: params.motif,
        creeParUserId: params.creeParUserId ?? null,
      })
      .returning();

    await tx
      .update(articles)
      .set({ stockDisponible: sql`${articles.stockDisponible} + ${params.quantite}`, updatedAt: new Date() })
      .where(eq(articles.id, params.articleId));

    return row;
  });
}
