import { eq } from "drizzle-orm";
import { db } from "../db";
import { equipementHierarchie } from "../db/schema";

export interface HierarchieNode {
  id: number;
  parentId: number | null;
  code: string;
  codeAbrege: string | null;
  nom: string;
  niveau: number;
  ordre: number;
  soumisControleReglementaire: boolean;
  soumisControleReglementaireExplicite: boolean;
}

// L'arborescence (≈230 nœuds, alimentée uniquement par la migration/le seed, jamais
// par les utilisateurs) tient entièrement en mémoire — inutile d'introduire des
// requêtes récursives (CTE), absentes du reste du code, pour la parcourir.
async function loadAllNodes(): Promise<HierarchieNode[]> {
  return db.select().from(equipementHierarchie);
}

/** Nœuds enfants directs d'un nœud donné (racine = catégories générales si parentId omis). */
export async function listChildren(parentId: number | null): Promise<HierarchieNode[]> {
  const all = await loadAllNodes();
  return all.filter((n) => n.parentId === parentId).sort((a, b) => a.ordre - b.ordre);
}

/** Le nœud lui-même + tous ses descendants (pour un filtre "tout ce qui est sous X"). */
export async function resolveDescendantIds(nodeId: number): Promise<number[]> {
  const all = await loadAllNodes();
  const byParent = new Map<number | null, HierarchieNode[]>();
  for (const n of all) {
    const list = byParent.get(n.parentId) ?? [];
    list.push(n);
    byParent.set(n.parentId, list);
  }
  const ids: number[] = [nodeId];
  const stack = [nodeId];
  while (stack.length) {
    const current = stack.pop()!;
    for (const child of byParent.get(current) ?? []) {
      ids.push(child.id);
      stack.push(child.id);
    }
  }
  return ids;
}

// Pour un regroupement de type "par famille" (ex. graphiques, tableau de bord
// règlementaire) : ramène tout nœud (souvent un type d'équipement, niveau 4) à
// son ancêtre "famille" (niveau 2) — ou au nœud lui-même s'il est déjà à ce
// niveau ou plus haut, pour rester robuste aux branches moins profondes.
export async function getFamilleAncestorMap(): Promise<Map<number, HierarchieNode>> {
  const all = await loadAllNodes();
  const byId = new Map(all.map((n) => [n.id, n]));
  const result = new Map<number, HierarchieNode>();
  for (const n of all) {
    let current = n;
    while (current.niveau > 2 && current.parentId != null) {
      current = byId.get(current.parentId)!;
    }
    result.set(n.id, current);
  }
  return result;
}

/** Chaîne complète des ancêtres, de la catégorie générale (racine) jusqu'au nœud lui-même. */
export async function getAncestorChain(nodeId: number): Promise<HierarchieNode[]> {
  const all = await loadAllNodes();
  const byId = new Map(all.map((n) => [n.id, n]));
  const chain: HierarchieNode[] = [];
  let current = byId.get(nodeId);
  while (current) {
    chain.unshift(current);
    current = current.parentId != null ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

// Recalcule soumisControleReglementaire (dénormalisé) pour tout l'arbre à partir de
// soumisControleReglementaireExplicite (posé nœud par nœud) : effective = explicite ||
// effective(parent). Un parcours top-down (racines d'abord) suffit car chaque nœud n'a
// besoin que de la valeur déjà calculée de son parent. À appeler après toute création/
// modification qui touche soumisControleReglementaireExplicite ou le rattachement d'un nœud.
export async function recomputeReglementaireCascade(): Promise<void> {
  const all = await loadAllNodes();
  const byParent = new Map<number | null, HierarchieNode[]>();
  for (const n of all) {
    const list = byParent.get(n.parentId) ?? [];
    list.push(n);
    byParent.set(n.parentId, list);
  }
  const effectiveById = new Map<number, boolean>();
  const queue = [...(byParent.get(null) ?? [])];
  while (queue.length) {
    const node = queue.shift()!;
    const parentEffective = node.parentId != null ? (effectiveById.get(node.parentId) ?? false) : false;
    const effective = node.soumisControleReglementaireExplicite || parentEffective;
    effectiveById.set(node.id, effective);
    queue.push(...(byParent.get(node.id) ?? []));
  }
  for (const n of all) {
    const effective = effectiveById.get(n.id) ?? false;
    if (effective !== n.soumisControleReglementaire) {
      await db.update(equipementHierarchie).set({ soumisControleReglementaire: effective }).where(eq(equipementHierarchie.id, n.id));
    }
  }
}
