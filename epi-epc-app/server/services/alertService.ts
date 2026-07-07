import { db } from "../db";
import { alertes, articles, controlesPeriodiques, marches } from "../db/schema";
import { and, eq, inArray, lte } from "drizzle-orm";

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Recalcule les alertes actives à partir de l'état courant (fin de vie des matériels,
 * contrôles, marchés). Idempotent : supprime les alertes non traitées de type "dérivé"
 * puis les régénère, en conservant celles déjà marquées comme traitées (historique préservé).
 */
export async function regenerateAlertes() {
  const derivedTypes = ["controle_a_faire", "fin_de_vie", "livraison_attendue"];
  await db.delete(alertes).where(and(inArray(alertes.type, derivedTypes), eq(alertes.traitee, false)));

  const todayStr = today();
  const newAlerts: (typeof alertes.$inferInsert)[] = [];

  const allArticles = await db.select().from(articles).where(eq(articles.actif, true));
  for (const a of allArticles) {
    if (a.dateLimiteUtilisation && a.dateLimiteUtilisation < todayStr) {
      newAlerts.push({
        type: "fin_de_vie",
        entiteType: "article",
        entiteId: a.id,
        niveau: "warning",
        message: `Date limite d'utilisation dépassée : ${a.designation} (${a.dateLimiteUtilisation})`,
      });
    }
  }

  const overdue = await db
    .select()
    .from(controlesPeriodiques)
    .where(and(eq(controlesPeriodiques.statut, "planifie"), lte(controlesPeriodiques.datePlanifiee, todayStr)));
  for (const c of overdue) {
    newAlerts.push({
      type: "controle_a_faire",
      entiteType: "controle_periodique",
      entiteId: c.id,
      niveau: "critical",
      message: `Contrôle ${c.type} en retard — échéance du ${c.datePlanifiee}`,
    });
  }

  const upcomingMarches = await db.select().from(marches);
  for (const m of upcomingMarches) {
    if (m.dateLivraison && m.dateLivraison > todayStr) {
      newAlerts.push({
        type: "livraison_attendue",
        entiteType: "marche",
        entiteId: m.id,
        niveau: "info",
        message: `Livraison attendue le ${m.dateLivraison} — Marché ${m.numero} (${m.fournisseur})`,
      });
    }
  }

  if (newAlerts.length) await db.insert(alertes).values(newAlerts);
  return newAlerts.length;
}
